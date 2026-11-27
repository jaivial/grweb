package athletes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Envíos programados (FORMULARIOS.md §4): el backoffice elige fecha y hora; a esa hora el programador crea el envío
// normal con creaEnvio, así que cada invitación entra en la misma cola de messaging (con su ritmo anti-spam). Nada sale
// directamente desde aquí. La clave de idempotencia del envío es «programado:<id>»: si el proceso cae a mitad, el
// reintento devuelve el envío ya creado en lugar de duplicarlo.

const (
	// margenProgramado: la fecha programada tiene que estar al menos a un minuto vista.
	margenProgramado = time.Minute
	// maxAntelacionProgramado: como mucho, un año vista.
	maxAntelacionProgramado = 366 * 24 * time.Hour
	// reintentoEnviando: un programado que lleva este tiempo «enviando» (el proceso cayó) se vuelve a intentar.
	reintentoEnviando = 10 * time.Minute
	// maxProgramadosPendientes por formulario.
	maxProgramadosPendientes = 50
)

// Programado es un envío programado de un formulario.
type Programado struct {
	ID           uuid.UUID   `json:"id"`
	Canales      []string    `json:"canales"`
	Filtro       FiltroEnvio `json:"filtro"`
	ProgramadoAt time.Time   `json:"programadoAt"`
	Estado       string      `json:"estado" enum:"pendiente,enviando,enviado,fallido,cancelado"`
	EnvioID      *uuid.UUID  `json:"envioId"`
	Error        string      `json:"error"`
	CreadoPor    string      `json:"creadoPor"`
	CreatedAt    time.Time   `json:"createdAt"`
}

const columnasProgramado = `id, canales, filtro, programado_at, estado, envio_id, error, creado_por, created_at`

func escaneaProgramado(row pgx.Row) (Programado, error) {
	var p Programado
	var filtro []byte
	if err := row.Scan(&p.ID, &p.Canales, &filtro, &p.ProgramadoAt, &p.Estado, &p.EnvioID, &p.Error, &p.CreadoPor, &p.CreatedAt); err != nil {
		return p, err
	}
	return p, json.Unmarshal(filtro, &p.Filtro)
}

func (s *Svc) registerFormulariosProgramados() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/formularios/{id}/programados"

	type rutaIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type listaOut struct {
		Body []Programado
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-programados", Method: http.MethodGet, Path: base,
		Summary: "Envíos programados del formulario", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *rutaIn) (*listaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if _, err := s.formularioDe(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT `+columnasProgramado+` FROM formulario_programados
				WHERE formulario_id = $1 AND competition_id = $2 ORDER BY programado_at DESC LIMIT 200`, in.ID, in.CID)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			out := &listaOut{Body: []Programado{}}
			for rows.Next() {
				p, err := escaneaProgramado(rows)
				if err != nil {
					return nil, err
				}
				out.Body = append(out.Body, p)
			}
			return out, rows.Err()
		})

	type creaIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Canales      []string    `json:"canales" maxItems:"2" doc:"email y/o whatsapp"`
			Filtro       FiltroEnvio `json:"filtro"`
			ProgramadoAt time.Time   `json:"programadoAt" doc:"Fecha y hora del envío (RFC 3339)"`
		}
	}
	type unoOut struct {
		Body Programado
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-programar", Method: http.MethodPost, Path: base,
		Summary: "Programar el envío de la invitación a una fecha y hora", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *creaIn) (*unoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			canales, err := canalesValidos(in.Body.Canales)
			if err != nil {
				return nil, err
			}
			if err := validaFiltro(&in.Body.Filtro); err != nil {
				return nil, err
			}
			cuando := in.Body.ProgramadoAt.UTC()
			ahora := time.Now()
			if cuando.Before(ahora.Add(margenProgramado)) {
				return nil, problem.Unprocessable("FECHA_PASADA", "Elige una fecha y hora futuras (al menos dentro de un minuto).")
			}
			if cuando.After(ahora.Add(maxAntelacionProgramado)) {
				return nil, problem.Unprocessable("FECHA_LEJANA", "Solo se puede programar hasta un año vista.")
			}
			f, err := s.formularioDe(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			if f.Estado == "cerrado" {
				return nil, envioCerrado()
			}
			if slices.Contains(canales, "whatsapp") {
				if err := s.exigeWhatsapp(ctx, in.CID); err != nil {
					return nil, err
				}
			}
			var pendientes int
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM formulario_programados WHERE formulario_id = $1 AND estado = 'pendiente'`, in.ID).Scan(&pendientes); err != nil {
				return nil, err
			}
			if pendientes >= maxProgramadosPendientes {
				return nil, problem.Unprocessable("DEMASIADOS_PROGRAMADOS", "Este formulario ya tiene demasiados envíos programados pendientes.")
			}
			filtro, err := json.Marshal(canonicoFiltro(in.Body.Filtro))
			if err != nil {
				return nil, err
			}
			p, err := escaneaProgramado(s.a.DB.QueryRow(ctx, `INSERT INTO formulario_programados (id, formulario_id, competition_id, canales, filtro, programado_at, creado_por)
				VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING `+columnasProgramado, newID(), in.ID, in.CID, canales, filtro, cuando, actor(ctx)))
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("formulario: envío programado", "formulario", in.ID, "programado", p.ID, "cuando", cuando, "canales", canales)
			return &unoOut{Body: p}, nil
		})

	type cancelaIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
		PID uuid.UUID `path:"pid"`
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-programado-cancelar", Method: http.MethodDelete, Path: base + "/{pid}",
		Summary: "Cancelar un envío programado pendiente", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cancelaIn) (*unoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			p, err := escaneaProgramado(s.a.DB.QueryRow(ctx, `UPDATE formulario_programados SET estado = 'cancelado', updated_at = now()
				WHERE id = $1 AND formulario_id = $2 AND competition_id = $3 AND estado = 'pendiente' RETURNING `+columnasProgramado, in.PID, in.ID, in.CID))
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, problem.Conflict("PROGRAMADO_NO_PENDIENTE", "Este envío ya no está pendiente: no se puede cancelar.")
			}
			if err != nil {
				return nil, err
			}
			s.a.Log.Info("formulario: envío programado cancelado", "formulario", in.ID, "programado", p.ID)
			return &unoOut{Body: p}, nil
		})
}

// programador lanza, cada 30 s, los envíos programados que ya han llegado a su hora.
func (s *Svc) programador(ctx context.Context) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		for i := 0; i < 20 && ctx.Err() == nil; i++ {
			hecho, err := s.lanzaProgramado(ctx)
			if err != nil && ctx.Err() == nil {
				s.a.Log.Warn("formulario: envío programado", "err", err)
			}
			if !hecho {
				break
			}
		}
	}
}

// lanzaProgramado toma un programado vencido (SKIP LOCKED: varias réplicas no se lo pisan) y crea su envío. Devuelve
// false si no había ninguno.
func (s *Svc) lanzaProgramado(ctx context.Context) (bool, error) {
	var (
		id, fid, cid uuid.UUID
		canales      []string
		filtroRaw    []byte
		creadoPor    string
	)
	err := s.a.DB.QueryRow(ctx, `UPDATE formulario_programados SET estado = 'enviando', updated_at = now()
		WHERE id = (SELECT id FROM formulario_programados
			WHERE programado_at <= now() AND (estado = 'pendiente' OR (estado = 'enviando' AND updated_at < now() - make_interval(secs => $1)))
			ORDER BY programado_at LIMIT 1 FOR UPDATE SKIP LOCKED)
		RETURNING id, formulario_id, competition_id, canales, filtro, creado_por`, reintentoEnviando.Seconds()).Scan(&id, &fid, &cid, &canales, &filtroRaw, &creadoPor)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var f FiltroEnvio
	envioID, err := uuid.Nil, json.Unmarshal(filtroRaw, &f)
	if err == nil {
		envioID, err = s.ejecutaProgramado(ctx, id, fid, cid, canales, f)
	}
	if err != nil {
		msg := "No se pudo crear el envío."
		var pe *problem.Error
		if errors.As(err, &pe) {
			if pe.Code == "ENVIO_EN_CURSO" {
				// Otro envío del mismo formulario se está preparando: se reintenta en la próxima vuelta.
				_, uerr := s.a.DB.Exec(ctx, `UPDATE formulario_programados SET estado = 'pendiente', updated_at = now() WHERE id = $1`, id)
				return false, uerr
			}
			if pe.Detail != "" {
				msg = pe.Detail
			}
		}
		s.a.Log.Warn("formulario: envío programado fallido", "programado", id, "formulario", fid, "err", err)
		_, uerr := s.a.DB.Exec(ctx, `UPDATE formulario_programados SET estado = 'fallido', error = $2, updated_at = now() WHERE id = $1`, id, msg)
		return true, uerr
	}
	// El envío lo crea el sistema: queda a nombre de quien lo programó.
	if _, err := s.a.DB.Exec(ctx, `UPDATE formulario_envios SET creado_por = $2 WHERE id = $1`, envioID, creadoPor); err != nil {
		s.a.Log.Warn("formulario: autor del envío programado", "envio", envioID, "err", err)
	}
	_, err = s.a.DB.Exec(ctx, `UPDATE formulario_programados SET estado = 'enviado', envio_id = $2, error = '', updated_at = now() WHERE id = $1`, id, envioID)
	s.a.Log.Info("formulario: envío programado lanzado", "programado", id, "formulario", fid, "envio", envioID)
	return true, err
}

func (s *Svc) ejecutaProgramado(ctx context.Context, id, fid, cid uuid.UUID, canales []string, f FiltroEnvio) (uuid.UUID, error) {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return uuid.Nil, err
	}
	if slices.Contains(canales, "whatsapp") {
		if err := s.exigeWhatsapp(ctx, cid); err != nil {
			return uuid.Nil, err
		}
	}
	envioID, _, err := s.creaEnvio(ctx, cid, fid, c.Nombre, canales, f, "programado:"+id.String(), true)
	return envioID, err
}

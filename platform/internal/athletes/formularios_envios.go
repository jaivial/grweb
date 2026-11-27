package athletes

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Envíos de la invitación a un formulario (FORMULARIOS.md §4): quién la recibe por cada canal. Nada sale desde aquí:
// cada destinatario y canal queda como un evento (athletes.email_solicitado o athletes.whatsapp_solicitado) que
// messaging recoge y deja salir a su ritmo (la cola anti-spam). La entrega guarda el id de ese evento para seguir su
// estado, que es el evento_id del mensaje en messaging.

// maxDestinatariosEnvio acota un envío: como mucho, 5000 atletas por envío.
const maxDestinatariosEnvio = 5000

// antiguedadOmitido: una entrega encolada que messaging ya no conoce, pasado este tiempo, cuenta como omitida (messaging
// la descartó, p. ej. con la automatización apagada). Antes de eso sigue «en cola» (en el outbox de athletes).
const antiguedadOmitido = 10 * time.Minute

// consulta es lo que necesitan las lecturas: el pool o una transacción.
type consulta interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

// AudienciaFormulario es a cuántos atletas llega la invitación, por canal.
type AudienciaFormulario struct {
	Total    int `json:"total"`
	Email    int `json:"email"`
	WhatsApp int `json:"whatsapp"`
}

// FiltroEnvio es a quién va un envío.
type FiltroEnvio struct {
	Estados          []string    `json:"estados,omitempty" doc:"confirmado · reserva (por defecto, confirmado)"`
	Atletas          []uuid.UUID `json:"atletas,omitempty" doc:"Solo estos atletas"`
	SoloSinResponder bool        `json:"soloSinResponder" doc:"Omite a quien ya tiene la respuesta completa"`
}

// CanalEstado es el estado de un canal de un envío.
type CanalEstado struct {
	Total    int `json:"total"`
	EnCola   int `json:"enCola"`
	Enviados int `json:"enviados"`
	Fallidos int `json:"fallidos"`
	Omitidos int `json:"omitidos"`
}

// Envio es un envío de la invitación, con el estado de cada canal.
type Envio struct {
	ID        uuid.UUID   `json:"id"`
	Canales   []string    `json:"canales"`
	Filtro    FiltroEnvio `json:"filtro"`
	Total     int         `json:"total"`
	Omitidos  int         `json:"omitidos"`
	CreadoPor string      `json:"creadoPor"`
	CreatedAt time.Time   `json:"createdAt"`
	Email     CanalEstado `json:"email"`
	WhatsApp  CanalEstado `json:"whatsapp"`
}

// atletaEnvio es un atleta candidato a la invitación, con lo que decide qué canal le toca.
type atletaEnvio struct {
	ID        uuid.UUID
	Nombre    string
	Email     string
	Telefono  string
	Consiente bool // consentimiento de WhatsApp (la ficha o la casilla del alta)
	Completa  bool // ya tiene la respuesta completa a este formulario
}

// entregaFila es una entrega tal como está en la base; el estado lo pone messaging.
type entregaFila struct {
	envio  uuid.UUID
	canal  string
	estado string
	evento *uuid.UUID
	creada time.Time
}

// registerFormulariosEnvios registra la audiencia, los envíos y su lista.
func (s *Svc) registerFormulariosEnvios() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/formularios"

	type audienciaIn struct {
		CID              uuid.UUID `path:"cid"`
		ID               uuid.UUID `path:"id"`
		Estados          string    `query:"estados" doc:"confirmado,reserva (por defecto, confirmado)"`
		SoloSinResponder bool      `query:"soloSinResponder"`
	}
	type audienciaOut struct {
		Body AudienciaFormulario
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-audiencia", Method: http.MethodGet, Path: base + "/{id}/audiencia",
		Summary: "A cuántos atletas llega la invitación, por canal", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *audienciaIn) (*audienciaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			f := FiltroEnvio{Estados: listaCSV(in.Estados), SoloSinResponder: in.SoloSinResponder}
			if err := validaFiltro(&f); err != nil {
				return nil, err
			}
			if _, err := s.formularioDe(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			lista, err := s.audiencia(ctx, s.a.DB, in.CID, in.ID, f)
			if err != nil {
				return nil, err
			}
			return &audienciaOut{Body: contaAudiencia(lista, f)}, nil
		})

	type envioIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Canales []string    `json:"canales" maxItems:"2" doc:"email y/o whatsapp"`
			Filtro  FiltroEnvio `json:"filtro"`
		}
	}
	type envioOut struct {
		Body Envio
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-envio", Method: http.MethodPost, Path: base + "/{id}/envios",
		Summary: "Enviar la invitación: queda en la cola de messaging, con su ritmo anti-spam", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *envioIn) (*envioOut, error) {
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
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			id, err := s.creaEnvio(ctx, in.CID, in.ID, c.Nombre, canales, in.Body.Filtro)
			if err != nil {
				return nil, err
			}
			// Recién encolado: todo está «en cola» y no hace falta preguntar a messaging.
			envs, entregas, err := cargaEnvios(ctx, s.a.DB, in.ID)
			if err != nil {
				return nil, err
			}
			aplicaEstados(envs, entregas, nil, time.Now(), false)
			for _, e := range envs {
				if e.ID == id {
					return &envioOut{Body: e}, nil
				}
			}
			return nil, problem.NotFound("Envío no encontrado.")
		})

	type envioRutaIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type listaEnviosOut struct {
		Body []Envio
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-envios", Method: http.MethodGet, Path: base + "/{id}/envios",
		Summary: "Envíos del formulario con el estado de cada canal", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *envioRutaIn) (*listaEnviosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if _, err := s.formularioDe(ctx, in.CID, in.ID); err != nil {
				return nil, err
			}
			envs, err := s.estadoEnvios(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &listaEnviosOut{Body: envs}, nil
		})
}

// audiencia lista los atletas de la competición que cumplen el filtro (nunca «baja»). Con q una transacción, la lectura
// va dentro de ella. El consentimiento de WhatsApp sigue la misma regla que el resto de la app (waAceptado).
func (s *Svc) audiencia(ctx context.Context, q consulta, cid, fid uuid.UUID, f FiltroEnvio) ([]atletaEnvio, error) {
	atletas := f.Atletas
	if atletas == nil {
		atletas = []uuid.UUID{}
	}
	rows, err := q.Query(ctx, `SELECT a.id, a.nombre, COALESCE(a.email::text, ''), a.telefono, a.whatsapp_at IS NOT NULL, a.whatsapp_origen = 'retirado',
		EXISTS (SELECT 1 FROM formulario_respuestas r WHERE r.formulario_id = $2 AND r.atleta_id = a.id AND r.estado = 'completa')
		FROM atletas a
		WHERE a.competition_id = $1 AND a.estado = ANY($3) AND a.estado <> 'baja' AND (cardinality($4::uuid[]) = 0 OR a.id = ANY($4::uuid[]))
		ORDER BY a.apellidos, a.nombre, a.id`, cid, fid, f.Estados, atletas)
	if err != nil {
		return nil, err
	}
	type fila struct {
		atletaEnvio
		retirado bool
	}
	var filas []fila
	for rows.Next() {
		var x fila
		if err := rows.Scan(&x.ID, &x.Nombre, &x.Email, &x.Telefono, &x.Consiente, &x.retirado, &x.Completa); err != nil {
			rows.Close()
			return nil, err
		}
		filas = append(filas, x)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]atletaEnvio, 0, len(filas))
	for _, x := range filas {
		// Sin consentimiento en la ficha: se mira la casilla del alta aprobada (salvo que la ficha lo retire).
		if !x.Consiente && !x.retirado && normTel(x.Telefono) != "" {
			x.Consiente = waAceptado(ctx, q, cid, x.ID)
		}
		out = append(out, x.atletaEnvio)
	}
	return out, nil
}

// motivoOmision dice por qué un atleta no recibe la invitación por un canal («» = sí la recibe).
func motivoOmision(a atletaEnvio, canal string, soloSinResponder bool) string {
	switch {
	case soloSinResponder && a.Completa:
		return "ya_completo"
	case canal == "email" && a.Email == "":
		return "sin_email"
	case canal == "whatsapp" && normTel(a.Telefono) == "":
		return "sin_telefono"
	case canal == "whatsapp" && !a.Consiente:
		return "sin_consentimiento"
	}
	return ""
}

// contaAudiencia cuenta los atletas de la lista que recibirían la invitación por cada canal.
func contaAudiencia(lista []atletaEnvio, f FiltroEnvio) AudienciaFormulario {
	out := AudienciaFormulario{Total: len(lista)}
	for _, a := range lista {
		if motivoOmision(a, "email", f.SoloSinResponder) == "" {
			out.Email++
		}
		if motivoOmision(a, "whatsapp", f.SoloSinResponder) == "" {
			out.WhatsApp++
		}
	}
	return out
}

// creaEnvio registra un envío en una sola transacción: el formulario pasa a activo, cada atleta del filtro queda como
// destinatario y cada canal como entrega, encolada (con el evento que messaging recibe) u omitida (con su motivo).
// Un formulario cerrado no admite envíos.
func (s *Svc) creaEnvio(ctx context.Context, cid, fid uuid.UUID, competicion string, canales []string, f FiltroEnvio) (uuid.UUID, error) {
	envioID := newID()
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		fm, err := leeFormulario(ctx, tx, cid, fid, true)
		if err != nil {
			return err
		}
		if fm.Estado == "cerrado" {
			return problem.Conflict("FORMULARIO_CERRADO", "Este formulario está cerrado: ábrelo antes de enviarlo.")
		}
		atletas, err := s.audiencia(ctx, tx, cid, fid, f)
		if err != nil {
			return err
		}
		if len(atletas) == 0 {
			return problem.Unprocessable("SIN_DESTINATARIOS", "Ningún atleta cumple el filtro.")
		}
		if len(atletas) > maxDestinatariosEnvio {
			return problem.Unprocessable("DEMASIADOS_DESTINATARIOS", fmt.Sprintf("Un envío llega como máximo a %d atletas: acota el filtro.", maxDestinatariosEnvio))
		}
		filtro, err := json.Marshal(f)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO formulario_envios (id, formulario_id, competition_id, canales, filtro, total, creado_por)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`, envioID, fid, cid, canales, filtro, len(atletas), actor(ctx)); err != nil {
			return err
		}
		omitidos := 0
		for _, a := range atletas {
			did, err := destinatarioDe(ctx, tx, cid, fid, a.ID)
			if err != nil {
				return err
			}
			encolado := false
			for _, canal := range canales {
				if motivo := motivoOmision(a, canal, f.SoloSinResponder); motivo != "" {
					if err := insertaEntrega(ctx, tx, envioID, did, canal, nil, motivo); err != nil {
						return err
					}
					continue
				}
				evento, err := s.solicitaCanal(ctx, tx, cid, fm, competicion, a, did, canal)
				if err != nil {
					return err
				}
				if err := insertaEntrega(ctx, tx, envioID, did, canal, &evento, ""); err != nil {
					return err
				}
				encolado = true
			}
			if !encolado {
				omitidos++
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE formulario_envios SET omitidos = $2 WHERE id = $1`, envioID, omitidos); err != nil {
			return err
		}
		if fm.Estado == "borrador" {
			if _, err := tx.Exec(ctx, `UPDATE formularios SET estado = 'activo', updated_at = now() WHERE id = $1`, fid); err != nil {
				return err
			}
		}
		return auditaFormulario(ctx, tx, cid, fid, "athletes.formulario_enviado",
			map[string]any{"envio": envioID, "canales": canales, "total": len(atletas), "omitidos": omitidos})
	})
	return envioID, err
}

// solicitaCanal encola para messaging la invitación de un destinatario por un canal y devuelve el id del evento.
func (s *Svc) solicitaCanal(ctx context.Context, tx pgx.Tx, cid uuid.UUID, fm Formulario, competicion string, a atletaEnvio, did uuid.UUID, canal string) (uuid.UUID, error) {
	enlace, accion := s.enlacesFormulario(did)
	vars, texto := varsInvitacion(fm, competicion, a.Nombre, enlace)
	if canal == "email" {
		vars["formulario_html"] = formularioEmail(fm, accion, enlace)
		return encolaMensaje(ctx, tx, cid, "athletes.email_solicitado", map[string]any{"para": a.Email, "plantilla": plantillaInvitacion, "vars": vars})
	}
	return encolaMensaje(ctx, tx, cid, "athletes.whatsapp_solicitado", map[string]any{"para": normTel(a.Telefono), "organizadores": false,
		"plantilla": plantillaInvitacion, "vars": map[string]string{"texto": texto}, "imagen": ""})
}

// destinatarioDe da de alta (o reutiliza) el destinatario de un atleta en el formulario: uno por par.
func destinatarioDe(ctx context.Context, tx pgx.Tx, cid, fid, atleta uuid.UUID) (uuid.UUID, error) {
	var did uuid.UUID
	err := tx.QueryRow(ctx, `INSERT INTO formulario_destinatarios (id, formulario_id, competition_id, atleta_id) VALUES ($1, $2, $3, $4)
		ON CONFLICT (formulario_id, atleta_id) DO UPDATE SET competition_id = EXCLUDED.competition_id RETURNING id`,
		newID(), fid, cid, atleta).Scan(&did)
	return did, err
}

// insertaEntrega guarda una entrega: encolada si tiene evento, omitida si no.
func insertaEntrega(ctx context.Context, tx pgx.Tx, envio, did uuid.UUID, canal string, evento *uuid.UUID, motivo string) error {
	estado := "encolado"
	if evento == nil {
		estado = "omitido"
	}
	_, err := tx.Exec(ctx, `INSERT INTO formulario_entregas (id, envio_id, destinatario_id, canal, evento_id, estado, motivo)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`, newID(), envio, did, canal, evento, estado, motivo)
	return err
}

// estadoEnvios devuelve los envíos del formulario con el estado de cada canal, según messaging.
func (s *Svc) estadoEnvios(ctx context.Context, cid, fid uuid.UUID) ([]Envio, error) {
	envs, entregas, err := cargaEnvios(ctx, s.a.DB, fid)
	if err != nil {
		return nil, err
	}
	var eventos []uuid.UUID
	for _, e := range entregas {
		if e.evento != nil {
			eventos = append(eventos, *e.evento)
		}
	}
	var estados map[uuid.UUID]string
	consultada := true
	if len(eventos) > 0 {
		if estados, err = s.pideEstados(ctx, cid, eventos); err != nil {
			// Sin messaging el estado sale solo de athletes: se degrada en vez de responder 503.
			s.a.Log.Warn("formularios: messaging no responde; estado de envíos solo desde athletes", "err", err)
			estados, consultada = nil, false
		}
	}
	aplicaEstados(envs, entregas, estados, time.Now(), consultada)
	return envs, nil
}

// cargaEnvios lee los envíos del formulario y sus entregas de la base (sin estado de messaging).
func cargaEnvios(ctx context.Context, q consulta, fid uuid.UUID) ([]Envio, []entregaFila, error) {
	rows, err := q.Query(ctx, `SELECT id, canales, filtro, total, omitidos, creado_por, created_at FROM formulario_envios
		WHERE formulario_id = $1 ORDER BY created_at DESC, id`, fid)
	if err != nil {
		return nil, nil, err
	}
	envs := []Envio{}
	for rows.Next() {
		var e Envio
		var filtro []byte
		if err := rows.Scan(&e.ID, &e.Canales, &filtro, &e.Total, &e.Omitidos, &e.CreadoPor, &e.CreatedAt); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if err := json.Unmarshal(filtro, &e.Filtro); err != nil {
			rows.Close()
			return nil, nil, err
		}
		envs = append(envs, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	rows, err = q.Query(ctx, `SELECT e.envio_id, e.canal, e.estado, e.evento_id, e.created_at FROM formulario_entregas e
		JOIN formulario_envios v ON v.id = e.envio_id WHERE v.formulario_id = $1`, fid)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var entregas []entregaFila
	for rows.Next() {
		var x entregaFila
		if err := rows.Scan(&x.envio, &x.canal, &x.estado, &x.evento, &x.creada); err != nil {
			return nil, nil, err
		}
		entregas = append(entregas, x)
	}
	return envs, entregas, rows.Err()
}

// aplicaEstados suma las entregas de cada envío por canal. Con consultada (messaging respondió), una entrega encolada
// que messaging no conoce y que lleva más de antiguedadOmitido en la cola cuenta como omitida: messaging la descartó.
// Lo demás sin estado cuenta como «en cola». Sin consultar a messaging, todo lo encolado cuenta como «en cola».
// «omitido» (de athletes o de messaging) suma como omitido.
func aplicaEstados(envs []Envio, entregas []entregaFila, estados map[uuid.UUID]string, ahora time.Time, consultada bool) {
	limite := ahora.Add(-antiguedadOmitido)
	idx := make(map[uuid.UUID]int, len(envs))
	for i := range envs {
		idx[envs[i].ID] = i
	}
	for _, e := range entregas {
		i, ok := idx[e.envio]
		if !ok {
			continue
		}
		c := canalEstado(&envs[i], e.canal)
		c.Total++
		if e.estado == "omitido" {
			c.Omitidos++
			continue
		}
		est, conocido := "", false
		if e.evento != nil {
			est, conocido = estados[*e.evento]
		}
		if !conocido && consultada && e.creada.Before(limite) {
			est = "omitido"
		}
		switch est {
		case "enviado":
			c.Enviados++
		case "rebotado", "fallido", "cancelado":
			c.Fallidos++
		case "omitido":
			c.Omitidos++
		default:
			c.EnCola++
		}
	}
}

// canalEstado es el estado del canal de un envío.
func canalEstado(e *Envio, canal string) *CanalEstado {
	if canal == "whatsapp" {
		return &e.WhatsApp
	}
	return &e.Email
}

// validaFiltro deja el filtro listo: por defecto, confirmados; solo confirmado o reserva.
func validaFiltro(f *FiltroEnvio) error {
	if len(f.Estados) == 0 {
		f.Estados = []string{"confirmado"}
	}
	for _, e := range f.Estados {
		if e != "confirmado" && e != "reserva" {
			return problem.Unprocessable("ESTADO_NO_VALIDO", "Los estados válidos son confirmado y reserva.")
		}
	}
	return nil
}

// canalesValidos quita los repetidos y exige al menos un canal (email o whatsapp).
func canalesValidos(canales []string) ([]string, error) {
	vistos := map[string]bool{}
	out := []string{}
	for _, c := range canales {
		if c != "email" && c != "whatsapp" {
			return nil, problem.Unprocessable("CANAL_NO_VALIDO", "Los canales válidos son email y whatsapp.")
		}
		if !vistos[c] {
			vistos[c] = true
			out = append(out, c)
		}
	}
	if len(out) == 0 {
		return nil, problem.Unprocessable("SIN_CANALES", "Elige al menos un canal: email o WhatsApp.")
	}
	return out, nil
}

// listaCSV separa una lista «a,b» sin huecos.
func listaCSV(v string) []string {
	var out []string
	for _, x := range strings.Split(v, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}

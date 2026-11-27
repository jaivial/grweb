package athletes

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Envíos de la invitación a un formulario (FORMULARIOS.md §4): quién la recibe por cada canal. Nada sale desde aquí:
// cada destinatario y canal queda como un evento (athletes.email_solicitado o athletes.whatsapp_solicitado) que
// messaging recoge y deja salir a su ritmo (la cola anti-spam). La entrega guarda el id de ese evento para seguir su
// estado, que es el evento_id del mensaje en messaging.

// maxDestinatariosEnvio acota un envío: como mucho, 5000 atletas por envío.
const maxDestinatariosEnvio = 5000

// antiguedadOmitido: una entrega encolada que messaging no conoce, pasados estos minutos desde que se creó y habiendo
// salido ya del outbox de athletes, cuenta como omitida (messaging la descartó). Antes de eso sigue «en cola».
const antiguedadOmitido = 30 * time.Minute

// maxClaveIdempotencia es el largo máximo de la cabecera Idempotency-Key.
const maxClaveIdempotencia = 80

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
	Consiente bool // consentimiento de WhatsApp (la ficha o la casilla del alta), como consentimientoWA
	Completa  bool // ya tiene la respuesta completa a este formulario
}

// entregaFila es una entrega tal como está en la base; el estado lo pone messaging. publicado: su evento ya salió del
// outbox de athletes (si messaging aún no lo conoce, eso decide si cuenta como omitida).
type entregaFila struct {
	envio     uuid.UUID
	canal     string
	estado    string
	evento    *uuid.UUID
	creada    time.Time
	publicado bool
}

// entregaNueva es una entrega antes de insertarla: encolada (con su evento) u omitida (con su motivo).
type entregaNueva struct {
	did    uuid.UUID
	canal  string
	evento uuid.UUID // uuid.Nil si la entrega está omitida
	estado string
	motivo string
}

// marcador son los textos que el HTML del formulario lleva en lugar de la acción y el enlace de cada destinatario. Se
// compila una vez por envío y se cambian por destinatario. Son aleatorios por envío: no pueden aparecer en el texto de nadie.
type marcador struct{ accion, enlace string }

func nuevoMarcador() marcador {
	b := make([]byte, 16)
	_, _ = rand.Read(b) // lectura de CSPRNG: no falla en Linux
	x := hex.EncodeToString(b)
	return marcador{accion: "fxaccion" + x, enlace: "fxenlace" + x}
}

// sustituye cambia en el HTML ya compilado los marcadores por la acción y el enlace de un destinatario (escapados).
func (m marcador) sustituye(plantilla, accion, enlace string) string {
	if plantilla == "" {
		return ""
	}
	plantilla = strings.ReplaceAll(plantilla, m.accion, html.EscapeString(accion))
	return strings.ReplaceAll(plantilla, m.enlace, html.EscapeString(enlace))
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
		CID   uuid.UUID `path:"cid"`
		ID    uuid.UUID `path:"id"`
		Clave string    `header:"Idempotency-Key" maxLength:"80" doc:"Clave para repetir el envío sin duplicarlo (hasta 80 caracteres). Misma clave: se devuelve el envío ya creado (200)."`
		Body  struct {
			Canales            []string    `json:"canales" maxItems:"2" doc:"email y/o whatsapp"`
			Filtro             FiltroEnvio `json:"filtro"`
			ConfirmarDuplicado bool        `json:"confirmarDuplicado" doc:"true: crear aunque ya exista un envio igual hace menos de 2 minutos (tras el 409 ENVIO_DUPLICADO)"`
		}
	}
	type envioOut struct {
		Status int
		Body   Envio
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
			clave := strings.TrimSpace(in.Clave)
			if n := len([]rune(clave)); n > maxClaveIdempotencia {
				return nil, problem.Unprocessable("CLAVE_DEMASIADO_LARGA", fmt.Sprintf("La clave de idempotencia no puede tener más de %d caracteres.", maxClaveIdempotencia))
			}
			c, err := s.comps.ByID(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			id, reutilizado, err := s.creaEnvio(ctx, in.CID, in.ID, c.Nombre, canales, in.Body.Filtro, clave, in.Body.ConfirmarDuplicado)
			if err != nil {
				return nil, err
			}
			// Recién encolado (o ya encolado con esa clave): todo está «en cola» y no hace falta preguntar a messaging.
			envs, entregas, err := cargaEnvios(ctx, s.a.DB, in.ID)
			if err != nil {
				return nil, err
			}
			aplicaEstados(envs, entregas, nil, time.Now(), false)
			for _, e := range envs {
				if e.ID == id {
					out := &envioOut{Status: http.StatusCreated, Body: e}
					if reutilizado {
						out.Status = http.StatusOK
					}
					return out, nil
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

// audiencia lista los atletas de la competición que cumplen el filtro (nunca «baja»), con su consentimiento de WhatsApp
// y si ya tienen la respuesta completa. Es una sola consulta: el consentimiento sigue la regla de consentimientoWA
// (autorizacion.go → waAceptado): el registrado en la ficha (whatsapp_at); si no, que la ficha no lo retire
// (whatsapp_origen = 'retirado') y que la última alta aprobada tenga la casilla de WhatsApp aceptada.
func (s *Svc) audiencia(ctx context.Context, q consulta, cid, fid uuid.UUID, f FiltroEnvio) ([]atletaEnvio, error) {
	atletas := f.Atletas
	if atletas == nil {
		atletas = []uuid.UUID{}
	}
	rows, err := q.Query(ctx, `SELECT a.id, a.nombre, COALESCE(a.email::text, ''), a.telefono,
		a.whatsapp_at IS NOT NULL OR (COALESCE(a.whatsapp_origen, '') <> 'retirado'
			AND COALESCE((alta.consentimientos::text::jsonb -> 'whatsapp' ->> 'aceptado') = 'true', false)),
		EXISTS (SELECT 1 FROM formulario_respuestas r WHERE r.formulario_id = $2 AND r.atleta_id = a.id AND r.estado = 'completa')
		FROM atletas a
		LEFT JOIN LATERAL (SELECT s.consentimientos FROM solicitudes_atleta s
			WHERE s.competition_id = a.competition_id AND s.match_atleta_id = a.id AND s.tipo = 'alta' AND s.estado = 'aprobada'
			ORDER BY s.revisado_at DESC NULLS LAST LIMIT 1) alta ON true
		WHERE a.competition_id = $1 AND a.estado = ANY($3) AND a.estado <> 'baja' AND (cardinality($4::uuid[]) = 0 OR a.id = ANY($4::uuid[]))
		ORDER BY a.apellidos, a.nombre, a.id`, cid, fid, f.Estados, atletas)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []atletaEnvio
	for rows.Next() {
		var x atletaEnvio
		if err := rows.Scan(&x.ID, &x.Nombre, &x.Email, &x.Telefono, &x.Consiente, &x.Completa); err != nil {
			return nil, err
		}
		out = append(out, x)
	}
	return out, rows.Err()
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
// Todo se escribe por lotes (un INSERT de destinatarios, un lote de outbox y un INSERT de entregas), sin una consulta por
// atleta. Con clave (Idempotency-Key) y un envío ya creado con ella, se devuelve ese envío (reutilizado=true) sin encolar.
// Sin clave, un envío igual (mismos canales y filtro) de hace menos de dos minutos es 409 ENVIO_DUPLICADO. Un formulario
// cerrado no admite envíos.
func (s *Svc) creaEnvio(ctx context.Context, cid, fid uuid.UUID, competicion string, canales []string, f FiltroEnvio, clave string, confirmado bool) (uuid.UUID, bool, error) {
	f = canonicoFiltro(f)
	huella, err := huellaEnvio(canales, f)
	if err != nil {
		return uuid.Nil, false, err
	}
	var envioID uuid.UUID
	reutilizado := false
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// Orden de bloqueo del módulo (lo respetan creaEnvio, guardaEdicion y guardaRespuesta; ver modoBloqueo):
		//  1) advisory lock de envíos del formulario: serializa los creaEnvio del mismo formulario, así que la comprobación de
		//     clave y de envío reciente (check y luego insert) no puede cruzarse con otro envío;
		//  2) lectura del formulario SIN candado durante toda la construcción del envío;
		//  3) filas hijas (envío, destinatarios, entregas, outbox): aquí se toman los candados de fila;
		//  4) FOR UPDATE del formulario solo al final, justo antes del cambio de estado, con el estado releído.
		// guardaEdicion (FOR UPDATE) no espera a ningún envío, y guardaRespuesta (FOR SHARE) solo escribe respuestas y
		// referencia destinatarios con FOR KEY SHARE, que no choca con el NO KEY UPDATE de creaEnvio. No hay ciclo.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('formulario-envio:' || $1::text))`, fid.String()); err != nil {
			return err
		}
		fm, err := leeFormulario(ctx, tx, cid, fid, sinBloqueo)
		if err != nil {
			return err
		}
		if clave != "" {
			previo, err := envioPorClave(ctx, tx, fid, clave)
			if err != nil {
				return err
			}
			if previo != nil {
				if previo.huella != huella {
					return problem.Unprocessable("CLAVE_REUTILIZADA", "Esa clave ya se usó para un envío con otros canales o filtro. Vuelve a pulsar Enviar para crear uno nuevo.")
				}
				envioID, reutilizado = previo.id, true
				return nil
			}
		}
		if fm.Estado == "cerrado" {
			return envioCerrado()
		}
		if !confirmado {
			reciente, err := envioReciente(ctx, tx, fid, huella)
			if err != nil {
				return err
			}
			if reciente != nil {
				return &envioDuplicado{
					problemaBase: problem.Conflict("ENVIO_DUPLICADO", "Ya se ha creado un envío igual hace menos de dos minutos. Confirma que quieres enviarlo otra vez."),
					CreatedAt:    reciente.createdAt,
				}
			}
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
		var claveDB *string
		if clave != "" {
			claveDB = &clave
		}
		envioID = newID()
		if _, err := tx.Exec(ctx, `INSERT INTO formulario_envios (id, formulario_id, competition_id, canales, filtro, total, creado_por, clave_idempotencia, huella)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, envioID, fid, cid, canales, filtro, len(atletas), actor(ctx), claveDB, huella); err != nil {
			return err
		}
		dids, err := destinatariosDe(ctx, tx, cid, fid, atletas)
		if err != nil {
			return err
		}
		entregas, evs, omitidos := s.planEntregas(ctx, cid, fm, competicion, canales, f, atletas, dids)
		if len(evs) > 0 {
			b := &pgx.Batch{}
			if err := events.QueueBatch(b, evs...); err != nil {
				return err
			}
			if err := tx.SendBatch(ctx, b).Close(); err != nil {
				return err
			}
		}
		if err := insertaEntregas(ctx, tx, envioID, entregas); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE formulario_envios SET omitidos = $2 WHERE id = $1`, envioID, omitidos); err != nil {
			return err
		}
		// Último paso: el formulario se bloquea (FOR UPDATE) y se relee el estado. Si se cerró mientras se construía el envío,
		// la transacción se deshace entera (destinatarios, entregas y outbox incluidos).
		actual, err := leeFormulario(ctx, tx, cid, fid, bloqueoExclusivo)
		if err != nil {
			return err
		}
		if actual.Estado == "cerrado" {
			return envioCerrado()
		}
		if actual.Estado == "borrador" {
			if _, err := tx.Exec(ctx, `UPDATE formularios SET estado = 'activo', updated_at = now() WHERE id = $1`, fid); err != nil {
				return err
			}
		}
		return auditaFormulario(ctx, tx, cid, fid, "athletes.formulario_enviado",
			map[string]any{"envio": envioID, "canales": canales, "total": len(atletas), "omitidos": omitidos})
	})
	return envioID, reutilizado, err
}

// planEntregas decide, en memoria, la entrega de cada atleta por cada canal y arma los eventos de las encoladas. El HTML
// del formulario se compila una sola vez para el envío; por destinatario solo cambian la acción y el enlace.
func (s *Svc) planEntregas(ctx context.Context, cid uuid.UUID, fm Formulario, competicion string, canales []string, f FiltroEnvio,
	atletas []atletaEnvio, dids map[uuid.UUID]uuid.UUID) ([]entregaNueva, []events.Event, int) {
	marca := nuevoMarcador()
	plantillaHTML := ""
	if slices.Contains(canales, "email") {
		plantillaHTML = formularioEmail(fm, marca.accion, marca.enlace)
	}
	var entregas []entregaNueva
	var evs []events.Event
	omitidos := 0
	for _, a := range atletas {
		did := dids[a.ID]
		encolado := false
		for _, canal := range canales {
			if motivo := motivoOmision(a, canal, f.SoloSinResponder); motivo != "" {
				entregas = append(entregas, entregaNueva{did: did, canal: canal, estado: "omitido", motivo: motivo})
				continue
			}
			ev := s.eventoInvitacion(ctx, cid, fm, competicion, a, did, canal, plantillaHTML, marca)
			evs = append(evs, ev)
			entregas = append(entregas, entregaNueva{did: did, canal: canal, evento: ev.ID, estado: "encolado"})
			encolado = true
		}
		if !encolado {
			omitidos++
		}
	}
	return entregas, evs, omitidos
}

// eventoInvitacion arma (sin escribirlo) el evento que messaging recoge para la invitación de un destinatario por un canal.
func (s *Svc) eventoInvitacion(ctx context.Context, cid uuid.UUID, fm Formulario, competicion string, a atletaEnvio, did uuid.UUID,
	canal, plantillaHTML string, marca marcador) events.Event {
	enlace, accion := s.enlacesFormulario(did)
	vars, texto := varsInvitacion(fm, competicion, a.Nombre, enlace)
	opts := []events.Option{events.Competition(cid.String()), events.Audience(events.Internal)}
	if canal == "email" {
		vars["formulario_html"] = marca.sustituye(plantillaHTML, accion, enlace)
		return events.New(ctx, "athletes.email_solicitado", map[string]any{"para": a.Email, "plantilla": plantillaInvitacion, "vars": vars}, opts...)
	}
	return events.New(ctx, "athletes.whatsapp_solicitado", map[string]any{"para": normTel(a.Telefono), "organizadores": false,
		"plantilla": plantillaInvitacion, "vars": map[string]string{"texto": texto}, "imagen": ""}, opts...)
}

// destinatariosDe da de alta (o reutiliza) el destinatario de cada atleta del envío en una sola sentencia: uno por par.
func destinatariosDe(ctx context.Context, tx pgx.Tx, cid, fid uuid.UUID, atletas []atletaEnvio) (map[uuid.UUID]uuid.UUID, error) {
	nuevos := make([]uuid.UUID, len(atletas))
	ids := make([]uuid.UUID, len(atletas))
	for i, a := range atletas {
		nuevos[i] = newID()
		ids[i] = a.ID
	}
	rows, err := tx.Query(ctx, `INSERT INTO formulario_destinatarios (id, formulario_id, competition_id, atleta_id)
		SELECT t.id, $1::uuid, $2::uuid, t.atleta FROM unnest($3::uuid[], $4::uuid[]) AS t(id, atleta)
		ON CONFLICT (formulario_id, atleta_id) DO UPDATE SET competition_id = EXCLUDED.competition_id
		RETURNING id, atleta_id`, fid, cid, nuevos, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[uuid.UUID]uuid.UUID, len(atletas))
	for rows.Next() {
		var did, atleta uuid.UUID
		if err := rows.Scan(&did, &atleta); err != nil {
			return nil, err
		}
		out[atleta] = did
	}
	return out, rows.Err()
}

// insertaEntregas guarda todas las entregas del envío en un solo INSERT (encolada si tiene evento, omitida si no).
func insertaEntregas(ctx context.Context, tx pgx.Tx, envio uuid.UUID, entregas []entregaNueva) error {
	if len(entregas) == 0 {
		return nil
	}
	ids := make([]uuid.UUID, len(entregas))
	dids := make([]uuid.UUID, len(entregas))
	canales := make([]string, len(entregas))
	eventos := make([]uuid.UUID, len(entregas))
	estados := make([]string, len(entregas))
	motivos := make([]string, len(entregas))
	for i, e := range entregas {
		ids[i], dids[i], canales[i], eventos[i], estados[i], motivos[i] = newID(), e.did, e.canal, e.evento, e.estado, e.motivo
	}
	_, err := tx.Exec(ctx, `INSERT INTO formulario_entregas (id, envio_id, destinatario_id, canal, evento_id, estado, motivo)
		SELECT t.id, $1::uuid, t.did, t.canal, NULLIF(t.evento, '00000000-0000-0000-0000-000000000000'::uuid), t.estado, t.motivo
		FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::uuid[], $6::text[], $7::text[]) AS t(id, did, canal, evento, estado, motivo)`,
		envio, ids, dids, canales, eventos, estados, motivos)
	return err
}

// envioBreve son los datos de un envío que hacen falta para repetirlo (clave) o para avisar de un duplicado (huella).
type envioBreve struct {
	id        uuid.UUID
	huella    string
	createdAt time.Time
}

// problemaBase es problem.Error con otro nombre de campo: un campo llamado Error taparía el método Error() del error.
type problemaBase = problem.Error

// envioDuplicado es el 409 ENVIO_DUPLICADO: el problema más la hora del envío igual que ya existe (createdAt).
type envioDuplicado struct {
	*problemaBase
	CreatedAt time.Time `json:"createdAt" doc:"Cuándo se creó el envío igual"`
}

// canonicoFiltro devuelve el filtro en forma canónica: estados y atletas ordenados y sin repetidos. Dos filtros con los
// mismos atletas y estados son el mismo envío, aunque lleguen en otro orden.
func canonicoFiltro(f FiltroEnvio) FiltroEnvio {
	out := FiltroEnvio{Estados: slices.Clone(f.Estados), Atletas: slices.Clone(f.Atletas), SoloSinResponder: f.SoloSinResponder}
	slices.Sort(out.Estados)
	out.Estados = slices.Compact(out.Estados)
	slices.SortFunc(out.Atletas, func(a, b uuid.UUID) int { return strings.Compare(a.String(), b.String()) })
	out.Atletas = slices.Compact(out.Atletas)
	return out
}

// huellaEnvio es el sha256 (hex) de los canales ordenados y del filtro canónico (JSON): identifica un envío igual.
func huellaEnvio(canales []string, f FiltroEnvio) (string, error) {
	j, err := json.Marshal(canonicoFiltro(f))
	if err != nil {
		return "", err
	}
	c := slices.Clone(canales)
	slices.Sort(c)
	sum := sha256.Sum256([]byte(strings.Join(c, ",") + "\n" + string(j)))
	return hex.EncodeToString(sum[:]), nil
}

// envioPorClave devuelve el envío que ya se creó con esa Idempotency-Key en el formulario (nil si no hay ninguno).
func envioPorClave(ctx context.Context, tx pgx.Tx, fid uuid.UUID, clave string) (*envioBreve, error) {
	var e envioBreve
	err := tx.QueryRow(ctx, `SELECT id, huella, created_at FROM formulario_envios WHERE formulario_id = $1 AND clave_idempotencia = $2`,
		fid, clave).Scan(&e.id, &e.huella, &e.createdAt)
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

// envioCerrado es el 409 FORMULARIO_CERRADO de un envío (lo devuelve creaEnvio en dos momentos: antes y al final).
func envioCerrado() *problem.Error {
	return problem.Conflict("FORMULARIO_CERRADO", "Este formulario está cerrado: ábrelo antes de enviarlo.")
}

// envioReciente devuelve el envío más reciente del formulario con la misma huella y de hace menos de dos minutos (nil si
// no hay ninguno). Lo que se consulta aquí se serializa con el advisory lock de creaEnvio (mismo formulario).
func envioReciente(ctx context.Context, tx pgx.Tx, fid uuid.UUID, huella string) (*envioBreve, error) {
	var e envioBreve
	err := tx.QueryRow(ctx, `SELECT id, huella, created_at FROM formulario_envios
		WHERE formulario_id = $1 AND huella = $2 AND created_at > now() - interval '2 minutes'
		ORDER BY created_at DESC LIMIT 1`, fid, huella).Scan(&e.id, &e.huella, &e.createdAt)
	if db.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
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

// cargaEnvios lee los envíos del formulario y sus entregas de la base (sin estado de messaging). Cada entrega indica si
// su evento ya salió del outbox de athletes (outbox.published_at).
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
	rows, err = q.Query(ctx, `SELECT e.envio_id, e.canal, e.estado, e.evento_id, e.created_at, o.published_at IS NOT NULL
		FROM formulario_entregas e
		JOIN formulario_envios v ON v.id = e.envio_id
		LEFT JOIN outbox o ON o.id = e.evento_id
		WHERE v.formulario_id = $1`, fid)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var entregas []entregaFila
	for rows.Next() {
		var x entregaFila
		if err := rows.Scan(&x.envio, &x.canal, &x.estado, &x.evento, &x.creada, &x.publicado); err != nil {
			return nil, nil, err
		}
		entregas = append(entregas, x)
	}
	return envs, entregas, rows.Err()
}

// aplicaEstados suma las entregas de cada envío por canal. Con consultada (messaging respondió), una entrega encolada
// que messaging no conoce, creada hace más de antiguedadOmitido y cuyo evento ya salió del outbox de athletes, cuenta
// como omitida: messaging la descartó. Lo demás sin estado cuenta como «en cola». Sin consultar a messaging, todo lo
// encolado cuenta como «en cola». «omitido» (de athletes o de messaging) suma como omitido.
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
		if !conocido && consultada && e.publicado && e.creada.Before(limite) {
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

// canalesValidos quita los repetidos, ordena los canales (así un envío con los mismos canales en otro orden es el mismo)
// y exige al menos un canal (email o whatsapp).
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
	slices.Sort(out)
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

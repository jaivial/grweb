package athletes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/formularios"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Formularios (platform/docs/FORMULARIOS.md §4): el CRUD del formulario del backoffice y sus versiones. Este fichero
// guarda también la lectura compartida (leeFormulario / formularioDe) que usan las respuestas, los envíos (fase B2) y
// la web pública: un solo sitio que lee y que escanea un formulario.

// FormularioEmail son los textos del email de invitación. Sus límites los comprueba validaTextos.
type FormularioEmail struct {
	Asunto    string `json:"asunto"`
	Preheader string `json:"preheader"`
	Intro     string `json:"intro"`
}

// FormularioWhatsApp es el texto del WhatsApp de invitación (con {{enlace}} o la variable por defecto).
type FormularioWhatsApp struct {
	Texto string `json:"texto"`
}

// Formulario es la ficha completa de un formulario.
type Formulario struct {
	ID            uuid.UUID           `json:"id"`
	Nombre        string              `json:"nombre"`
	Estado        string              `json:"estado" enum:"borrador,activo,cerrado"`
	Esquema       formularios.Esquema `json:"esquema"`
	Version       int                 `json:"version"`
	Email         FormularioEmail     `json:"email"`
	WhatsApp      FormularioWhatsApp  `json:"whatsapp"`
	SoloWeb       bool                `json:"soloWeb"`
	ActualizadoAt time.Time           `json:"actualizadoAt"`
}

// FormularioResumen es una fila de la lista de formularios, con sus contadores.
type FormularioResumen struct {
	ID            uuid.UUID `json:"id"`
	Nombre        string    `json:"nombre"`
	Estado        string    `json:"estado" enum:"borrador,activo,cerrado"`
	Titulo        string    `json:"titulo"`
	SoloWeb       bool      `json:"soloWeb"`
	Destinatarios int       `json:"destinatarios"`
	Respuestas    int       `json:"respuestas"`
	Completas     int       `json:"completas"`
	ActualizadoAt time.Time `json:"actualizadoAt"`
}

// selFormulario es la única consulta que lee un formulario completo (scanFormulario la interpreta).
const selFormulario = `SELECT id, nombre, estado, esquema, version, email, whatsapp, updated_at FROM formularios`

// scanFormulario lee una fila de selFormulario: esquema, email y WhatsApp llegan como jsonb.
func scanFormulario(r pgx.Row) (Formulario, error) {
	var f Formulario
	var esquema, email, whatsapp []byte
	if err := r.Scan(&f.ID, &f.Nombre, &f.Estado, &esquema, &f.Version, &email, &whatsapp, &f.ActualizadoAt); err != nil {
		return f, err
	}
	if err := json.Unmarshal(esquema, &f.Esquema); err != nil {
		return f, err
	}
	if err := json.Unmarshal(email, &f.Email); err != nil {
		return f, err
	}
	if err := json.Unmarshal(whatsapp, &f.WhatsApp); err != nil {
		return f, err
	}
	f.SoloWeb = formularios.SoloWeb(f.Esquema)
	return f, nil
}

// modoBloqueo es el candado que leeFormulario pone sobre la fila del formulario hasta el fin de la transacción.
//   - sinBloqueo: solo lectura (listados, la web pública, la audiencia de un envío mientras se construye).
//   - bloqueoCompartido (FOR SHARE): guardados de respuestas. Varios pueden ir a la vez; solo esperan a un cambio del
//     formulario (esquema, estado, borrado).
//   - bloqueoExclusivo (FOR UPDATE): cambios del formulario (guardaEdicion, borrado) y la comprobación final de creaEnvio.
//
// Orden de bloqueo del módulo (lo respetan creaEnvio, guardaEdicion y guardaRespuesta): primero el advisory lock de envíos
// (hashtext('formulario-envio:'||id)), después la fila del formulario, y al final las filas hijas. creaEnvio escribe sus
// filas hijas antes de tomar el FOR UPDATE de la fila; guardaRespuesta solo escribe respuestas y referencia destinatarios
// con FOR KEY SHARE, que no choca con el NO KEY UPDATE que creaEnvio toma sobre un destinatario existente.
type modoBloqueo int

const (
	sinBloqueo modoBloqueo = iota
	bloqueoCompartido
	bloqueoExclusivo
)

// clausula es el sufijo SQL del modo (constantes fijas: nunca entra texto de usuario).
func (m modoBloqueo) clausula() string {
	switch m {
	case bloqueoCompartido:
		return ` FOR SHARE`
	case bloqueoExclusivo:
		return ` FOR UPDATE`
	default:
		return ""
	}
}

// leeFormulario carga un formulario de la competición con el candado indicado (ver modoBloqueo).
func leeFormulario(ctx context.Context, q rowQuerier, cid, id uuid.UUID, modo modoBloqueo) (Formulario, error) {
	sql := selFormulario + ` WHERE id = $1 AND competition_id = $2` + modo.clausula()
	f, err := scanFormulario(q.QueryRow(ctx, sql, id, cid))
	if db.IsNoRows(err) {
		return f, problem.NotFound("Formulario no encontrado.")
	}
	return f, err
}

// formularioDe es la ficha de un formulario de la competición (solo lectura). La usa también la fase B2.
func (s *Svc) formularioDe(ctx context.Context, cid, id uuid.UUID) (Formulario, error) {
	return leeFormulario(ctx, s.a.DB, cid, id, sinBloqueo)
}

// jsonFormulario serializa lo que se guarda en las columnas jsonb del formulario.
func jsonFormulario(esq formularios.Esquema, em FormularioEmail, wa FormularioWhatsApp) (esqJSON, emJSON, waJSON []byte, err error) {
	if esqJSON, err = json.Marshal(esq); err != nil {
		return nil, nil, nil, err
	}
	if emJSON, err = json.Marshal(em); err != nil {
		return nil, nil, nil, err
	}
	if waJSON, err = json.Marshal(wa); err != nil {
		return nil, nil, nil, err
	}
	return esqJSON, emJSON, waJSON, nil
}

// esquemaBase es un formulario nuevo: título = nombre, un campo de texto corto y el tema por defecto.
func esquemaBase(nombre string) formularios.Esquema {
	e := formularios.Esquema{
		Ajustes: formularios.Ajustes{Titulo: nombre, PermiteEditar: true},
		Campos:  []formularios.Campo{{ID: formularios.NuevoID("c"), Tipo: formularios.TipoTextoCorto, Etiqueta: "Tu respuesta", Ancho: "completo"}},
	}
	formularios.Normalizar(&e)
	return e
}

// truncaRunas corta a n caracteres (no bytes) para no partir una letra acentuada.
func truncaRunas(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// validaNombre exige un nombre de 1 a formularios.MaxNombre caracteres, ya recortado (422 en español).
func validaNombre(nombre string) error {
	if nombre == "" {
		return problem.Unprocessable("NOMBRE_OBLIGATORIO", "Escribe el nombre del formulario.")
	}
	if utf8.RuneCountInString(nombre) > formularios.MaxNombre {
		return problem.Unprocessable("NOMBRE_DEMASIADO_LARGO", fmt.Sprintf("El nombre no puede tener más de %d caracteres.", formularios.MaxNombre))
	}
	return nil
}

// validaTextos comprueba los límites de los textos de invitación: asunto, preheader, introducción y WhatsApp (422 en
// español). Los mismos límites que el asistente de IA.
func validaTextos(em FormularioEmail, wa FormularioWhatsApp) error {
	switch {
	case utf8.RuneCountInString(em.Asunto) > formularios.MaxAsuntoEmail:
		return problem.Unprocessable("ASUNTO_DEMASIADO_LARGO", fmt.Sprintf("El asunto del email no puede tener más de %d caracteres.", formularios.MaxAsuntoEmail))
	case utf8.RuneCountInString(em.Preheader) > formularios.MaxPreheaderEmail:
		return problem.Unprocessable("PREHEADER_DEMASIADO_LARGO", fmt.Sprintf("El preheader del email no puede tener más de %d caracteres.", formularios.MaxPreheaderEmail))
	case utf8.RuneCountInString(em.Intro) > formularios.MaxIntroEmail:
		return problem.Unprocessable("INTRO_DEMASIADO_LARGA", fmt.Sprintf("La introducción del email no puede tener más de %d caracteres.", formularios.MaxIntroEmail))
	case utf8.RuneCountInString(wa.Texto) > formularios.MaxTextoWhatsapp:
		return problem.Unprocessable("WHATSAPP_DEMASIADO_LARGO", fmt.Sprintf("El mensaje de WhatsApp no puede tener más de %d caracteres.", formularios.MaxTextoWhatsapp))
	}
	return nil
}

// edicion es el cuerpo de PUT /formularios/{id}.
type edicion struct {
	Nombre   string              `json:"nombre"`
	Esquema  formularios.Esquema `json:"esquema"`
	Email    FormularioEmail     `json:"email"`
	WhatsApp FormularioWhatsApp  `json:"whatsapp"`
	Version  int                 `json:"version" minimum:"1"`
}

// registerFormularios registra las rutas de formularios: admin, respuestas y web pública por token.
func (s *Svc) registerFormularios() {
	s.registerFormulariosAdmin()
	s.registerFormulariosRespuestas()
	s.registerFormulariosPublico()
	s.registerFormulariosPrevia()
	s.registerFormulariosEnvios()
	s.registerFormulariosProgramados()
	s.registerFormulariosEstadisticas()
}

func (s *Svc) registerFormulariosAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/formularios"

	type formOut struct {
		Body Formulario
	}
	type listOut struct {
		Body []FormularioResumen
	}

	huma.Register(api, huma.Operation{OperationID: "formularios-list", Method: http.MethodGet, Path: base, Summary: "Formularios de la competición con sus contadores", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			items, err := s.listaFormularios(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			return &listOut{Body: items}, nil
		})

	type nombreIn struct {
		Nombre string `json:"nombre"`
	}
	type crearIn struct {
		CID  uuid.UUID `path:"cid"`
		Body nombreIn
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-create", Method: http.MethodPost, Path: base, Summary: "Crear un formulario (borrador con un campo de partida)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*formOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			nombre := strings.TrimSpace(in.Body.Nombre)
			if err := validaNombre(nombre); err != nil {
				return nil, err
			}
			id, err := s.creaFormulario(ctx, in.CID, nombre)
			if err != nil {
				return nil, err
			}
			f, err := s.formularioDe(ctx, in.CID, id)
			if err != nil {
				return nil, err
			}
			return &formOut{Body: f}, nil
		})

	type idRutaIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-get", Method: http.MethodGet, Path: base + "/{id}", Summary: "Ficha de un formulario", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idRutaIn) (*formOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			f, err := s.formularioDe(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &formOut{Body: f}, nil
		})

	type edicionIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body edicion
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-update", Method: http.MethodPut, Path: base + "/{id}", Summary: "Guardar el formulario (version optimista; 422 si el esquema no es válido)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *edicionIn) (*formOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			in.Body.Nombre = strings.TrimSpace(in.Body.Nombre)
			if err := validaNombre(in.Body.Nombre); err != nil {
				return nil, err
			}
			if err := validaTextos(in.Body.Email, in.Body.WhatsApp); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				return s.guardaEdicion(ctx, tx, in.CID, in.ID, in.Body)
			})
			if err != nil {
				return nil, err
			}
			f, err := s.formularioDe(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &formOut{Body: f}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "formularios-delete", Method: http.MethodDelete, Path: base + "/{id}", Summary: "Borrar un formulario sin envíos (409 si ya tiene envíos)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idRutaIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				f, err := leeFormulario(ctx, tx, in.CID, in.ID, bloqueoExclusivo)
				if err != nil {
					return err
				}
				var envios int
				if err := tx.QueryRow(ctx, `SELECT count(*) FROM formulario_envios WHERE formulario_id = $1`, in.ID).Scan(&envios); err != nil {
					return err
				}
				if envios > 0 {
					return problem.Conflict("TIENE_ENVIOS", "Este formulario ya se ha enviado: ciérralo en lugar de borrarlo.")
				}
				_, err = tx.Exec(ctx, `DELETE FROM formularios WHERE id = $1 AND competition_id = $2`, in.ID, in.CID)
				if err == nil {
					err = auditaFormulario(ctx, tx, in.CID, in.ID, "athletes.formulario_borrado", map[string]any{"nombre": f.Nombre})
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			return &struct{}{}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "formularios-duplicar", Method: http.MethodPost, Path: base + "/{id}/duplicar", Summary: "Duplicar un formulario (copia del esquema y de los textos)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *idRutaIn) (*formOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			nuevo := newID()
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				f, err := leeFormulario(ctx, tx, in.CID, in.ID, sinBloqueo)
				if err != nil {
					return err
				}
				esqJSON, emJSON, waJSON, err := jsonFormulario(f.Esquema, f.Email, f.WhatsApp)
				if err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO formularios (id, competition_id, nombre, esquema, version, email, whatsapp, creado_por)
					VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`, nuevo, in.CID, truncaRunas(f.Nombre+" (copia)", formularios.MaxNombre), esqJSON, emJSON, waJSON, actor(ctx)); err != nil {
					return err
				}
				_, err = tx.Exec(ctx, `INSERT INTO formulario_versiones (formulario_id, version, esquema) VALUES ($1, 1, $2)`, nuevo, esqJSON)
				if err == nil {
					err = auditaFormulario(ctx, tx, in.CID, nuevo, "athletes.formulario_duplicado", map[string]any{"origen": in.ID})
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			f, err := s.formularioDe(ctx, in.CID, nuevo)
			if err != nil {
				return nil, err
			}
			return &formOut{Body: f}, nil
		})

	type estadoIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Estado string `json:"estado" enum:"borrador,activo,cerrado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "formularios-estado", Method: http.MethodPost, Path: base + "/{id}/estado", Summary: "Cambiar el estado (borrador · activo · cerrado)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*formOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			err := s.change(ctx, in.CID, "athletes.formulario_estado", map[string]any{"id": in.ID, "estado": in.Body.Estado}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE formularios SET estado = $3, updated_at = now() WHERE id = $1 AND competition_id = $2`, in.ID, in.CID, in.Body.Estado)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					return problem.NotFound("Formulario no encontrado.")
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			f, err := s.formularioDe(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &formOut{Body: f}, nil
		})
}

// auditaFormulario deja en la misma transacción el evento de administración del formulario (registro de actividad).
func auditaFormulario(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ev string, data map[string]any) error {
	return events.Enqueue(ctx, tx, events.New(ctx, ev, data, events.Competition(cid.String()), events.Subject("formulario:"+id.String()),
		events.ForPermission("atletas.editar")))
}

// listaFormularios devuelve los formularios de la competición con sus contadores (SQL).
func (s *Svc) listaFormularios(ctx context.Context, cid uuid.UUID) ([]FormularioResumen, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT f.id, f.nombre, f.estado, f.esquema, f.updated_at,
		(SELECT count(*) FROM formulario_destinatarios d WHERE d.formulario_id = f.id)::int,
		(SELECT count(*) FROM formulario_respuestas r WHERE r.formulario_id = f.id)::int,
		(SELECT count(*) FROM formulario_respuestas r WHERE r.formulario_id = f.id AND r.estado = 'completa')::int
		FROM formularios f WHERE f.competition_id = $1 ORDER BY f.updated_at DESC`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FormularioResumen{}
	for rows.Next() {
		var r FormularioResumen
		var esquema []byte
		if err := rows.Scan(&r.ID, &r.Nombre, &r.Estado, &esquema, &r.ActualizadoAt, &r.Destinatarios, &r.Respuestas, &r.Completas); err != nil {
			return nil, err
		}
		var e formularios.Esquema
		if err := json.Unmarshal(esquema, &e); err != nil {
			return nil, err
		}
		r.Titulo, r.SoloWeb = e.Ajustes.Titulo, formularios.SoloWeb(e)
		out = append(out, r)
	}
	return out, rows.Err()
}

// creaFormulario inserta un formulario nuevo (versión 1) y devuelve su id.
func (s *Svc) creaFormulario(ctx context.Context, cid uuid.UUID, nombre string) (uuid.UUID, error) {
	id := newID()
	esqJSON, emJSON, waJSON, err := jsonFormulario(esquemaBase(nombre), FormularioEmail{}, FormularioWhatsApp{})
	if err != nil {
		return uuid.Nil, err
	}
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO formularios (id, competition_id, nombre, esquema, version, email, whatsapp, creado_por)
			VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`, id, cid, nombre, esqJSON, emJSON, waJSON, actor(ctx)); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO formulario_versiones (formulario_id, version, esquema) VALUES ($1, 1, $2)`, id, esqJSON); err != nil {
			return err
		}
		return auditaFormulario(ctx, tx, cid, id, "athletes.formulario_creado", map[string]any{"nombre": nombre})
	})
	return id, err
}

// guardaEdicion guarda la edición del formulario: 409 si la versión no coincide, 422 si el esquema no es válido, y una
// versión nueva (con su fila en formulario_versiones) cuando cambia cualquier contenido: nombre, esquema, email o WhatsApp.
// Un guardado sin cambios no sube la versión.
func (s *Svc) guardaEdicion(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, b edicion) error {
	cur, err := leeFormulario(ctx, tx, cid, id, bloqueoExclusivo)
	if err != nil {
		return err
	}
	if b.Version != cur.Version {
		return problem.Conflict("VERSION_DISTINTA", "El formulario se ha cambiado mientras lo editabas. Recárgalo para ver la última versión.")
	}
	esq := b.Esquema
	formularios.Normalizar(&esq)
	if err := formularios.Validar(esq); err != nil {
		return problem.Unprocessable("ESQUEMA_NO_VALIDO", err.Error())
	}
	// Con respuestas, los ids de campo y de opción y el tipo de cada campo son el contrato de los datos guardados.
	var conRespuestas bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM formulario_respuestas WHERE formulario_id = $1)`, id).Scan(&conRespuestas); err != nil {
		return err
	}
	if conRespuestas {
		if msg := formularios.RompeRespuestas(cur.Esquema, esq); msg != "" {
			return problem.Unprocessable("CAMPO_CON_RESPUESTAS", msg)
		}
	}
	esqJSON, emJSON, waJSON, err := jsonFormulario(esq, b.Email, b.WhatsApp)
	if err != nil {
		return err
	}
	curEsqJSON, curEmJSON, curWaJSON, err := jsonFormulario(cur.Esquema, cur.Email, cur.WhatsApp)
	if err != nil {
		return err
	}
	version := cur.Version
	if b.Nombre != cur.Nombre || !bytes.Equal(curEsqJSON, esqJSON) || !bytes.Equal(curEmJSON, emJSON) || !bytes.Equal(curWaJSON, waJSON) {
		version++
		if _, err := tx.Exec(ctx, `INSERT INTO formulario_versiones (formulario_id, version, esquema) VALUES ($1, $2, $3)`, id, version, esqJSON); err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE formularios SET nombre = $3, esquema = $4, email = $5, whatsapp = $6, version = $7, updated_at = now()
		WHERE id = $1 AND competition_id = $2`, id, cid, b.Nombre, esqJSON, emJSON, waJSON, version)
	if err == nil {
		err = auditaFormulario(ctx, tx, cid, id, "athletes.formulario_guardado", map[string]any{"nombre": b.Nombre, "version": version})
	}
	return err
}

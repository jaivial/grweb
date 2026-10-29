package competition

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strconv"
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

var (
	tagPub   = []string{"Competición (pública)"}
	tagAdmin = []string{"Evento y módulos"}
	bearer   = []map[string][]string{{"bearer": {}}}
)

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

type compOut struct {
	ETag string `header:"ETag"`
	Body Competicion
}

type estadoOut struct {
	Body struct {
		Estado      string       `json:"estado"`
		Programados []programado `json:"programados"`
	}
}

func etag(v int) string { return `W/"` + strconv.Itoa(v) + `"` }

func ifMatch(h string) int {
	v, _ := strconv.Atoi(strings.Trim(strings.TrimPrefix(strings.TrimSpace(h), "W/"), `"`))
	return v
}

// afterChange invalidates the public cache of a competition.
func (s *Svc) afterChange(ctx context.Context, c Competicion) {
	s.cache.Del(ctx, "pub:"+c.Slug, "list")
}

func (s *Svc) registerPublic() {
	api := s.a.API

	type listItem struct {
		Slug        string  `json:"slug"`
		Nombre      string  `json:"nombre"`
		Estado      string  `json:"estado"`
		FechaInicio *string `json:"fechaInicio,omitempty"`
		Ciudad      string  `json:"ciudad"`
	}
	type listOut struct{ Body []listItem }
	huma.Register(api, huma.Operation{OperationID: "competition-public-list", Method: http.MethodGet, Path: "/api/competiciones", Summary: "Competiciones publicadas", Tags: tagPub},
		func(ctx context.Context, _ *struct{}) (*listOut, error) {
			out := &listOut{}
			if s.cache.Get(ctx, "list", &out.Body) {
				return out, nil
			}
			rows, err := s.a.DB.Query(ctx, selComp+` WHERE estado NOT IN ('borrador', 'archivada') ORDER BY fecha_inicio DESC NULLS LAST`)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[Competicion])
			if err != nil {
				return nil, err
			}
			out.Body = []listItem{}
			for _, c := range list {
				out.Body = append(out.Body, listItem{c.Slug, c.Nombre, c.Estado, c.FechaInicio, c.Sede.Ciudad})
			}
			s.cache.Set(ctx, "list", out.Body, time.Minute)
			return out, nil
		})

	type slugIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
	}
	type pubOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         Publica
	}
	huma.Register(api, huma.Operation{OperationID: "competition-public-get", Method: http.MethodGet, Path: "/api/competiciones/{slug}", Summary: "Datos públicos de la competición (evento, sede, estado, módulos, inscripción, cómo llegar)", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*pubOut, error) {
			out := &pubOut{CacheControl: "public, max-age=30"}
			if s.cache.Get(ctx, "pub:"+in.Slug, &out.Body) {
				return out, nil
			}
			c, err := getComp(ctx, s.a.DB, "slug", in.Slug)
			if err != nil || c.Estado == "borrador" || c.Estado == "archivada" {
				return nil, problem.NotFound("Competición no encontrada.")
			}
			out.Body = c.publica()
			s.cache.Set(ctx, "pub:"+in.Slug, out.Body, time.Minute)
			return out, nil
		})
}

func (s *Svc) registerAdmin() {
	api := s.a.API

	type listOut struct{ Body []Competicion }
	huma.Register(api, huma.Operation{OperationID: "competition-admin-list", Method: http.MethodGet, Path: "/api/admin/competiciones", Summary: "Competiciones a las que tengo acceso", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*listOut, error) {
			p, err := auth.User(ctx)
			if err != nil {
				return nil, err
			}
			var rows pgx.Rows
			if p.Root {
				rows, err = s.a.DB.Query(ctx, selComp+` WHERE archived_at IS NULL ORDER BY fecha_inicio DESC NULLS LAST`)
			} else {
				ids := []uuid.UUID{}
				for cid := range p.Perms {
					if id, e := uuid.Parse(cid); e == nil {
						ids = append(ids, id)
					}
				}
				rows, err = s.a.DB.Query(ctx, selComp+` WHERE id = ANY($1) AND archived_at IS NULL ORDER BY fecha_inicio DESC NULLS LAST`, ids)
			}
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[Competicion])
			return &listOut{Body: list}, err
		})

	type createIn struct {
		Body struct {
			Slug        string     `json:"slug" pattern:"^[a-z0-9][a-z0-9-]{1,40}$"`
			Nombre      string     `json:"nombre" minLength:"2" maxLength:"120"`
			FechaInicio *string    `json:"fechaInicio,omitempty" format:"date"`
			ClonarDe    *uuid.UUID `json:"clonarDe,omitempty" doc:"Copia sede, evento, módulos, inscripción y cómo llegar (nunca datos personales)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-create", Method: http.MethodPost, Path: "/api/admin/competiciones", Summary: "Crear una competición (nueva edición)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *createIn) (*compOut, error) {
			p, err := auth.RequireRoot(ctx)
			if err != nil {
				return nil, err
			}
			id := newID()
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				_, err := tx.Exec(ctx, `INSERT INTO competiciones (id, slug, nombre, fecha_inicio, modulos) VALUES ($1,$2,$3,$4::date,$5)`, id, in.Body.Slug, in.Body.Nombre, in.Body.FechaInicio, defaultModulos())
				if db.IsUniqueViolation(err, "") {
					return problem.Conflict("SLUG_EN_USO", "Ya existe una competición con ese identificador.")
				} else if err != nil {
					return err
				}
				if in.Body.ClonarDe != nil {
					if _, err := tx.Exec(ctx, `UPDATE competiciones c SET sede = o.sede, evento = o.evento, modulos = o.modulos, inscripcion = o.inscripcion, como_llegar = o.como_llegar,
						zona_horaria = o.zona_horaria, edicion = o.edicion + 1 FROM competiciones o WHERE c.id = $1 AND o.id = $2`, id, *in.Body.ClonarDe); err != nil {
						return err
					}
				}
				if err := seedChecklist(ctx, tx, id); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.creada", map[string]any{"slug": in.Body.Slug, "nombre": in.Body.Nombre, "propietarioId": p.UserID},
					events.Competition(id.String()), events.Subject("competicion:"+id.String())))
			})
			if err != nil {
				return nil, err
			}
			// Default roles right away; if identity is down, its consumer of competition.creada retries until done.
			if err := s.identity.Do(ctx, http.MethodPost, "/internal/competiciones/"+id.String()+"/roles-por-defecto", map[string]any{"propietarioId": p.UserID}, nil); err != nil {
				s.a.Log.Warn("roles por defecto (se reintentará por evento)", "competicion", id, "err", err)
			}
			c, err := getComp(ctx, s.a.DB, "id", id)
			if err != nil {
				return nil, err
			}
			s.afterChange(ctx, c)
			return &compOut{ETag: etag(c.Version), Body: c}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "competition-admin-get", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}", Summary: "Datos completos de la competición", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*compOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			c, err := getComp(ctx, s.a.DB, "id", in.CID)
			if err != nil {
				return nil, err
			}
			return &compOut{ETag: etag(c.Version), Body: c}, nil
		})

	type eventoIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Nombre      *string `json:"nombre,omitempty" minLength:"2" maxLength:"120"`
			NombreCorto *string `json:"nombreCorto,omitempty" maxLength:"40"`
			Edicion     *int    `json:"edicion,omitempty" minimum:"1"`
			FechaInicio *string `json:"fechaInicio,omitempty" format:"date"`
			FechaFin    *string `json:"fechaFin,omitempty" format:"date"`
			ZonaHoraria *string `json:"zonaHoraria,omitempty"`
			Sede        *Sede   `json:"sede,omitempty"`
			Evento      *Evento `json:"evento,omitempty"`
			LogoURL     *string `json:"logoUrl,omitempty" maxLength:"500"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-evento-update", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/evento-config", Summary: "Editar datos del evento y la sede (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *eventoIn) (*compOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			b := in.Body
			if b.FechaInicio != nil && b.FechaFin != nil && *b.FechaFin < *b.FechaInicio {
				return nil, problem.Unprocessable("FECHAS_INVALIDAS", "La fecha de fin no puede ser anterior a la de inicio.")
			}
			if b.ZonaHoraria != nil {
				if _, err := time.LoadLocation(*b.ZonaHoraria); err != nil {
					return nil, problem.Unprocessable("ZONA_HORARIA", "Zona horaria desconocida.")
				}
			}
			return s.update(ctx, in.CID, in.IfMatch, "competition.actualizada", b, `nombre = COALESCE($3, nombre), nombre_corto = COALESCE($4, nombre_corto), edicion = COALESCE($5, edicion),
				fecha_inicio = COALESCE($6::date, fecha_inicio), fecha_fin = COALESCE($7::date, fecha_fin), zona_horaria = COALESCE($8, zona_horaria),
				sede = COALESCE($9, sede), evento = COALESCE($10, evento), logo_url = COALESCE($11, logo_url)`,
				b.Nombre, b.NombreCorto, b.Edicion, b.FechaInicio, b.FechaFin, b.ZonaHoraria, b.Sede, b.Evento, b.LogoURL)
		})

	type inscIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    Inscripcion
	}
	huma.Register(api, huma.Operation{OperationID: "competition-inscripcion-update", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/inscripcion", Summary: "Inscripción externa de la AEP (enlace y estado)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *inscIn) (*compOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			if in.Body.URL != "" && !strings.HasPrefix(in.Body.URL, "https://") {
				return nil, problem.Unprocessable("URL_INVALIDA", "El enlace de inscripción debe empezar por https://")
			}
			return s.update(ctx, in.CID, in.IfMatch, "competition.inscripcion_actualizada", in.Body, `inscripcion = $3`, in.Body)
		})

	type llegarIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    []ComoLlegar
	}
	huma.Register(api, huma.Operation{OperationID: "competition-como-llegar-update", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/como-llegar", Summary: "Cómo llegar (transporte con estado por confirmar)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *llegarIn) (*compOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			if len(in.Body) > 30 {
				return nil, problem.Unprocessable("DEMASIADOS", "Máximo 30 indicaciones.")
			}
			return s.update(ctx, in.CID, in.IfMatch, "competition.como_llegar_actualizado", in.Body, `como_llegar = $3`, in.Body)
		})

	// ---- estado ----
	type estadoIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Estado      string     `json:"estado" enum:"borrador,proximamente,inscripciones,completas,hoy,finalizado"`
			ProgramarEn *time.Time `json:"programarEn,omitempty" doc:"Si es futura, el cambio se aplica a esa hora"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-estado-update", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/estado", Summary: "Cambiar (o programar) el estado del evento", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*estadoOut, error) {
			p, err := auth.Require(ctx, in.CID.String(), "evento.editar")
			if err != nil {
				return nil, err
			}
			if in.Body.ProgramarEn != nil && in.Body.ProgramarEn.After(time.Now().Add(30*time.Second)) {
				var by *uuid.UUID
				if p.UserID != uuid.Nil {
					by = &p.UserID
				}
				err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
					if _, err := tx.Exec(ctx, `INSERT INTO estados_programados (id, competition_id, estado, en, creado_por) VALUES ($1,$2,$3,$4,$5)`, newID(), in.CID, in.Body.Estado, *in.Body.ProgramarEn, by); err != nil {
						return err
					}
					return events.Enqueue(ctx, tx, events.New(ctx, "competition.estado_programado", map[string]any{"estado": in.Body.Estado, "en": in.Body.ProgramarEn},
						events.Competition(in.CID.String()), events.ForPermission("evento.editar")))
				})
			} else {
				err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return s.setEstado(ctx, tx, in.CID, in.Body.Estado) })
			}
			if err != nil {
				return nil, err
			}
			return s.estadoView(ctx, in.CID)
		})
	huma.Register(api, huma.Operation{OperationID: "competition-estado-get", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/estado", Summary: "Estado actual y cambios programados", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*estadoOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			return s.estadoView(ctx, in.CID)
		})
	type progDelIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "competition-estado-cancel", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/estado/programados/{id}", Summary: "Cancelar un cambio de estado programado", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *progDelIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			_, err := s.a.DB.Exec(ctx, `UPDATE estados_programados SET cancelado_at = now() WHERE id = $1 AND competition_id = $2 AND ejecutado_at IS NULL`, in.ID, in.CID)
			return nil, err
		})

	// ---- módulos ----
	type modItem struct {
		Clave       string `json:"clave"`
		Nombre      string `json:"nombre"`
		Descripcion string `json:"descripcion"`
		Modulo
	}
	type modsOut struct{ Body []modItem }
	modsView := func(c Competicion) *modsOut {
		out := &modsOut{Body: []modItem{}}
		for _, m := range ModulosCatalogo {
			out.Body = append(out.Body, modItem{Clave: m.Clave, Nombre: m.Nombre, Descripcion: m.Descripcion, Modulo: c.Modulos[m.Clave]})
		}
		return out
	}
	huma.Register(api, huma.Operation{OperationID: "competition-modulos-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/modulos", Summary: "Módulos de la web", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*modsOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			c, err := getComp(ctx, s.a.DB, "id", in.CID)
			if err != nil {
				return nil, err
			}
			return modsView(c), nil
		})
	type modIn struct {
		CID    uuid.UUID `path:"cid"`
		Modulo string    `path:"modulo"`
		Body   struct {
			Activo bool `json:"activo"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-modulos-set", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/modulos/{modulo}", Summary: "Activar o desactivar un módulo", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *modIn) (*modsOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			if !validModulo(in.Modulo) {
				return nil, problem.NotFound("Módulo desconocido.")
			}
			var c Competicion
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var err error
				if c, err = lockComp(ctx, tx, in.CID); err != nil {
					return err
				}
				m := c.Modulos[in.Modulo]
				if m.Bloqueado && in.Body.Activo {
					return problem.Conflict("MODULO_BLOQUEADO", "El módulo está bloqueado: "+m.Motivo)
				}
				m.Activo = in.Body.Activo
				c.Modulos[in.Modulo] = m
				if _, err := tx.Exec(ctx, `UPDATE competiciones SET modulos = $2, updated_at = now(), version = version + 1 WHERE id = $1`, in.CID, c.Modulos); err != nil {
					return err
				}
				if err := markStep(ctx, tx, in.CID, "modulos", true); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.modulos_actualizados", map[string]any{"modulo": in.Modulo, "activo": in.Body.Activo},
					events.Competition(in.CID.String()), events.Audience(events.Public)))
			})
			if err != nil {
				return nil, err
			}
			s.afterChange(ctx, c)
			return modsView(c), nil
		})

	// ---- checklist ----
	type paso struct {
		Clave      string     `json:"clave"`
		Titulo     string     `json:"titulo"`
		Ayuda      string     `json:"ayuda"`
		Hecho      bool       `json:"hecho"`
		HechoAt    *time.Time `json:"hechoAt,omitempty"`
		Automatico bool       `json:"automatico"`
	}
	type checkOut struct {
		Body struct {
			Pasos    []paso `json:"pasos"`
			Hechos   int    `json:"hechos"`
			Total    int    `json:"total"`
			Completa bool   `json:"completa"`
		}
	}
	checkView := func(ctx context.Context, cid uuid.UUID) (*checkOut, error) {
		rows, err := s.a.DB.Query(ctx, `SELECT paso, hecho, hecho_at, automatico FROM checklist WHERE competition_id = $1`, cid)
		if err != nil {
			return nil, err
		}
		state := map[string]paso{}
		for rows.Next() {
			var k string
			var x paso
			if err := rows.Scan(&k, &x.Hecho, &x.HechoAt, &x.Automatico); err != nil {
				rows.Close()
				return nil, err
			}
			state[k] = x
		}
		rows.Close()
		out := &checkOut{}
		for _, st := range ChecklistPasos {
			x := state[st.Clave]
			x.Clave, x.Titulo, x.Ayuda = st.Clave, st.Titulo, st.Ayuda
			out.Body.Pasos = append(out.Body.Pasos, x)
			if x.Hecho {
				out.Body.Hechos++
			}
		}
		out.Body.Total = len(ChecklistPasos)
		out.Body.Completa = out.Body.Hechos == out.Body.Total
		return out, nil
	}
	huma.Register(api, huma.Operation{OperationID: "competition-checklist-get", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/checklist", Summary: "Checklist de puesta en marcha", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*checkOut, error) {
			if _, err := auth.RequireMember(ctx, in.CID.String()); err != nil {
				return nil, err
			}
			return checkView(ctx, in.CID)
		})
	type pasoIn struct {
		CID  uuid.UUID `path:"cid"`
		Paso string    `path:"paso"`
		Body struct {
			Hecho bool `json:"hecho"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "competition-checklist-set", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/checklist/{paso}", Summary: "Marcar o desmarcar un paso", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *pasoIn) (*checkOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			if !slices.ContainsFunc(ChecklistPasos, func(p struct{ Clave, Titulo, Ayuda string }) bool { return p.Clave == in.Paso }) {
				return nil, problem.NotFound("Paso desconocido.")
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := markStep(ctx, tx, in.CID, in.Paso, in.Body.Hecho); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.checklist_actualizado", map[string]any{"paso": in.Paso, "hecho": in.Body.Hecho},
					events.Competition(in.CID.String()), events.ForPermission("evento.editar")))
			})
			if err != nil {
				return nil, err
			}
			return checkView(ctx, in.CID)
		})

	// ---- archivar ----
	huma.Register(api, huma.Operation{OperationID: "competition-archive", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/archivar", Summary: "Archivar la competición (deja de verse en la web)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *cidIn) (*compOut, error) {
			if _, err := auth.RequireRoot(ctx); err != nil {
				return nil, err
			}
			return s.update(ctx, in.CID, "", "competition.archivada", nil, `estado = 'archivada', archived_at = now()`)
		})
}

// update applies a SQL SET clause ($1 = id, $2 = expected version or 0, $3… = args) with optimistic locking,
// emits the event and invalidates the public cache.
func (s *Svc) update(ctx context.Context, cid uuid.UUID, ifm, evType string, diff any, set string, args ...any) (*compOut, error) {
	var c Competicion
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		cur, err := lockComp(ctx, tx, cid)
		if err != nil {
			return err
		}
		if v := ifMatch(ifm); v != 0 && v != cur.Version {
			return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado estos datos. Recarga para ver la última versión.")
		}
		if _, err := tx.Exec(ctx, `UPDATE competiciones SET `+set+`, updated_at = now(), version = version + 1 WHERE id = $1 AND $2::int >= 0`, append([]any{cid, 0}, args...)...); err != nil {
			return err
		}
		if c, err = getComp(ctx, tx, "id", cid); err != nil {
			return err
		}
		if err := autoChecklist(ctx, tx, c); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, evType, map[string]any{"slug": c.Slug, "version": c.Version},
			events.Competition(cid.String()), events.ForPermission("evento.editar"), events.Subject("competicion:"+cid.String()), events.WithDiff(diff)))
	})
	if err != nil {
		return nil, err
	}
	s.afterChange(ctx, c)
	return &compOut{ETag: etag(c.Version), Body: c}, nil
}

func lockComp(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (Competicion, error) {
	if _, err := tx.Exec(ctx, `SELECT 1 FROM competiciones WHERE id = $1 FOR UPDATE`, cid); err != nil {
		return Competicion{}, err
	}
	return getComp(ctx, tx, "id", cid)
}

func defaultModulos() map[string]Modulo {
	m := map[string]Modulo{}
	for _, k := range []string{"entradas", "atletas", "horarios", "resultados", "patrocinadores", "voluntarios"} {
		m[k] = Modulo{Activo: true}
	}
	m["sorteo"] = Modulo{Activo: false, Bloqueado: true, Motivo: "Checklist legal del sorteo pendiente"}
	return m
}

func seedChecklist(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	for _, p := range ChecklistPasos {
		if _, err := tx.Exec(ctx, `INSERT INTO checklist (competition_id, paso) VALUES ($1,$2) ON CONFLICT DO NOTHING`, cid, p.Clave); err != nil {
			return err
		}
	}
	return nil
}

func markStep(ctx context.Context, tx pgx.Tx, cid uuid.UUID, paso string, hecho bool) error {
	_, err := tx.Exec(ctx, `INSERT INTO checklist (competition_id, paso, hecho, hecho_at) VALUES ($1,$2,$3, CASE WHEN $3 THEN now() END)
		ON CONFLICT (competition_id, paso) DO UPDATE SET hecho = EXCLUDED.hecho, hecho_at = EXCLUDED.hecho_at`, cid, paso, hecho)
	return err
}

// autoChecklist ticks the steps that the competition data itself proves done.
func autoChecklist(ctx context.Context, tx pgx.Tx, c Competicion) error {
	auto := map[string]bool{
		"datos-evento":    c.Nombre != "" && c.FechaInicio != nil && c.Evento.Descripcion != "",
		"sede":            c.Sede.Direccion != "" && c.Sede.Ciudad != "",
		"inscripcion-aep": c.Inscripcion.URL != "",
	}
	for paso, ok := range auto {
		if !ok {
			continue
		}
		if _, err := tx.Exec(ctx, `UPDATE checklist SET hecho = true, hecho_at = COALESCE(hecho_at, now()), automatico = true WHERE competition_id = $1 AND paso = $2 AND NOT hecho`, c.ID, paso); err != nil {
			return err
		}
	}
	return nil
}

type programado struct {
	ID     uuid.UUID `json:"id"`
	Estado string    `json:"estado"`
	En     time.Time `json:"en"`
}

func (s *Svc) estadoView(ctx context.Context, cid uuid.UUID) (*estadoOut, error) {
	out := &estadoOut{}
	if err := s.a.DB.QueryRow(ctx, `SELECT estado FROM competiciones WHERE id = $1`, cid).Scan(&out.Body.Estado); err != nil {
		return nil, problem.NotFound("Competición no encontrada.")
	}
	rows, err := s.a.DB.Query(ctx, `SELECT id, estado, en FROM estados_programados WHERE competition_id = $1 AND ejecutado_at IS NULL AND cancelado_at IS NULL ORDER BY en`, cid)
	if err != nil {
		return nil, err
	}
	out.Body.Programados, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (programado, error) {
		var p programado
		return p, r.Scan(&p.ID, &p.Estado, &p.En)
	})
	return out, err
}

// setEstado changes the state and emits the public `evento.estado` event (SSE público).
func (s *Svc) setEstado(ctx context.Context, tx pgx.Tx, cid uuid.UUID, estado string) error {
	var anterior, slug string
	if err := tx.QueryRow(ctx, `SELECT estado, slug FROM competiciones WHERE id = $1 FOR UPDATE`, cid).Scan(&anterior, &slug); err != nil {
		return problem.NotFound("Competición no encontrada.")
	}
	if anterior == estado {
		return nil
	}
	if _, err := tx.Exec(ctx, `UPDATE competiciones SET estado = $2, updated_at = now(), version = version + 1 WHERE id = $1`, cid, estado); err != nil {
		return err
	}
	s.cache.Del(ctx, "pub:"+slug, "list")
	return events.Enqueue(ctx, tx, events.New(ctx, "evento.estado", map[string]any{"estado": estado, "anterior": anterior},
		events.Competition(cid.String()), events.Audience(events.Public), events.Subject("competicion:"+cid.String())))
}

func (s *Svc) applyScheduled(ctx context.Context) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `SELECT id, competition_id, estado FROM estados_programados WHERE en <= now() AND ejecutado_at IS NULL AND cancelado_at IS NULL ORDER BY en LIMIT 20 FOR UPDATE SKIP LOCKED`)
		if err != nil {
			return err
		}
		type due struct {
			id, cid uuid.UUID
			estado  string
		}
		var list []due
		for rows.Next() {
			var d due
			if err := rows.Scan(&d.id, &d.cid, &d.estado); err != nil {
				rows.Close()
				return err
			}
			list = append(list, d)
		}
		rows.Close()
		for _, d := range list {
			if err := s.setEstado(ctx, tx, d.cid, d.estado); err != nil {
				return fmt.Errorf("programado %s: %w", d.id, err)
			}
			if _, err := tx.Exec(ctx, `UPDATE estados_programados SET ejecutado_at = now() WHERE id = $1`, d.id); err != nil {
				return err
			}
			s.a.Log.Info("estado programado aplicado", "competicion", d.cid, "estado", d.estado)
		}
		return nil
	})
}

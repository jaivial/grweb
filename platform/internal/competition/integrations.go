package competition

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/crypto"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagInt = []string{"Integraciones"}

// TiposIntegracion and the non-secret fields each one expects (Figma page 64 · "Sistema · integraciones").
var TiposIntegracion = map[string][]string{
	"smtp":     {"host", "puerto", "usuario", "remitente", "nombreRemitente", "tls"},
	"stripe":   {"modo", "clavePublica"},
	"whatsapp": {"proveedor", "url", "instancia", "numero"}, // proveedor evo-weai (Evolution API v2); secret = its API key
	"bunny":    {"zona", "cdnUrl"},
	"aep":      {"urlActa"},
}

type oneOut struct{ Body integracion }

type integracion struct {
	Tipo      string            `json:"tipo"`
	Config    map[string]string `json:"config"`
	Secreto   string            `json:"secreto" doc:"Solo la máscara (••••1234); nunca se devuelve el valor"`
	Estado    string            `json:"estado" enum:"sin_configurar,configurada,ok,error"`
	ProbadoAt *time.Time        `json:"probadoAt,omitempty"`
	Error     string            `json:"error,omitempty"`
	Version   int               `json:"version"`
}

func (s *Svc) listIntegraciones(ctx context.Context, cid uuid.UUID) ([]integracion, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT tipo, config, secreto_mascara, estado, probado_at, error, version FROM integraciones WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	have := map[string]integracion{}
	for rows.Next() {
		var i integracion
		var cfg []byte
		if err := rows.Scan(&i.Tipo, &cfg, &i.Secreto, &i.Estado, &i.ProbadoAt, &i.Error, &i.Version); err != nil {
			rows.Close()
			return nil, err
		}
		_ = json.Unmarshal(cfg, &i.Config)
		have[i.Tipo] = i
	}
	rows.Close()
	out := []integracion{}
	for _, t := range []string{"smtp", "stripe", "whatsapp", "bunny", "aep"} {
		i, ok := have[t]
		if !ok {
			i = integracion{Tipo: t, Config: map[string]string{}, Estado: "sin_configurar"}
		}
		out = append(out, i)
	}
	return out, nil
}

func (s *Svc) registerIntegrations() {
	api := s.a.API

	type listOut struct{ Body []integracion }
	huma.Register(api, huma.Operation{OperationID: "integrations-list", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/integraciones", Summary: "Integraciones (email, Stripe, WhatsApp, CDN, AEP)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *cidIn) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			list, err := s.listIntegraciones(ctx, in.CID)
			return &listOut{Body: list}, err
		})

	type putIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo" enum:"smtp,stripe,whatsapp,bunny,aep"`
		Body struct {
			Config  map[string]string `json:"config"`
			Secreto *string           `json:"secreto,omitempty" doc:"Contraseña o clave. Omitir para conservar la actual; cadena vacía para borrarla"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "integrations-put", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/integraciones/{tipo}", Summary: "Configurar una integración (el secreto se guarda cifrado)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *putIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			allowed := TiposIntegracion[in.Tipo]
			cfg := map[string]string{}
			for k, v := range in.Body.Config {
				ok := false
				for _, a := range allowed {
					ok = ok || a == k
				}
				if !ok {
					return nil, problem.Unprocessable("CAMPO_DESCONOCIDO", "Campo no válido para "+in.Tipo+": "+k)
				}
				cfg[k] = v
			}
			if p, ok := cfg["puerto"]; ok {
				if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
					return nil, problem.Unprocessable("PUERTO_INVALIDO", "Puerto no válido.")
				}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO integraciones (competition_id, tipo, config, estado) VALUES ($1,$2,$3,'configurada')
					ON CONFLICT (competition_id, tipo) DO UPDATE SET config = EXCLUDED.config, estado = 'configurada', error = '', updated_at = now(), version = integraciones.version + 1`,
					in.CID, in.Tipo, cfg); err != nil {
					return err
				}
				if in.Body.Secreto != nil {
					var sealed []byte
					mask := ""
					if *in.Body.Secreto != "" {
						sealed, mask = s.box.Seal([]byte(*in.Body.Secreto), in.CID.String()+"/"+in.Tipo), crypto.Mask(*in.Body.Secreto)
					}
					if _, err := tx.Exec(ctx, `UPDATE integraciones SET secreto = $3, secreto_mascara = $4 WHERE competition_id = $1 AND tipo = $2`, in.CID, in.Tipo, sealed, mask); err != nil {
						return err
					}
				}
				// The event never carries the secret, only that it changed.
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_actualizada", map[string]any{"tipo": in.Tipo, "secretoCambiado": in.Body.Secreto != nil},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			})
			if err != nil {
				return nil, err
			}
			return s.oneIntegracion(ctx, in.CID, in.Tipo)
		})

	type probarIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo" enum:"smtp,stripe,whatsapp,bunny,aep"`
	}
	huma.Register(api, huma.Operation{OperationID: "integrations-test", Method: http.MethodPost, Path: "/api/admin/competiciones/{cid}/integraciones/{tipo}/probar", Summary: "Probar una integración (SMTP: conexión y autenticación, sin enviar)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *probarIn) (*oneOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			cfg, secret, err := s.integrationSecret(ctx, in.CID, in.Tipo)
			if err != nil {
				return nil, err
			}
			testErr := testIntegration(ctx, in.Tipo, cfg, secret)
			estado, msg := "ok", ""
			if testErr != nil {
				estado, msg = "error", testErr.Error()
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE integraciones SET estado = $3, error = $4, probado_at = now() WHERE competition_id = $1 AND tipo = $2`, in.CID, in.Tipo, estado, msg); err != nil {
					return err
				}
				if in.Tipo == "smtp" && estado == "ok" {
					if err := markStep(ctx, tx, in.CID, "integracion-email", true); err != nil {
						return err
					}
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_probada", map[string]any{"tipo": in.Tipo, "estado": estado, "error": msg},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			})
			if err != nil {
				return nil, err
			}
			return s.oneIntegracion(ctx, in.CID, in.Tipo)
		})
}

func (s *Svc) oneIntegracion(ctx context.Context, cid uuid.UUID, tipo string) (*oneOut, error) {
	list, err := s.listIntegraciones(ctx, cid)
	if err != nil {
		return nil, err
	}
	for _, i := range list {
		if i.Tipo == tipo {
			return &oneOut{Body: i}, nil
		}
	}
	return nil, problem.NotFound("Integración no encontrada.")
}

// integrationSecret returns the config and the decrypted secret (internal use only).
func (s *Svc) integrationSecret(ctx context.Context, cid uuid.UUID, tipo string) (map[string]string, string, error) {
	var cfgRaw, sealed []byte
	err := s.a.DB.QueryRow(ctx, `SELECT config, secreto FROM integraciones WHERE competition_id = $1 AND tipo = $2`, cid, tipo).Scan(&cfgRaw, &sealed)
	if err != nil {
		return nil, "", problem.NotFound("La integración no está configurada.")
	}
	cfg := map[string]string{}
	_ = json.Unmarshal(cfgRaw, &cfg)
	secret := ""
	if len(sealed) > 0 {
		b, err := s.box.Open(sealed, cid.String()+"/"+tipo)
		if err != nil {
			return nil, "", err
		}
		secret = string(b)
	}
	return cfg, secret, nil
}

func testIntegration(ctx context.Context, tipo string, cfg map[string]string, secret string) error {
	switch tipo {
	case "smtp":
		host, port := cfg["host"], cfg["puerto"]
		if host == "" || port == "" {
			return fmt.Errorf("faltan host y puerto")
		}
		d := net.Dialer{Timeout: 8 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
		if err != nil {
			return fmt.Errorf("no se pudo conectar a %s:%s", host, port)
		}
		_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
		c, err := smtp.NewClient(conn, host)
		if err != nil {
			conn.Close()
			return fmt.Errorf("el servidor no habla SMTP")
		}
		defer c.Close()
		if ok, _ := c.Extension("STARTTLS"); ok && cfg["tls"] != "no" {
			if err := c.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
				return fmt.Errorf("STARTTLS falló: %v", err)
			}
		}
		if cfg["usuario"] != "" {
			if ok, _ := c.Extension("AUTH"); ok {
				var a smtp.Auth = smtp.PlainAuth("", cfg["usuario"], secret, host)
				if cfg["tls"] == "no" {
					a = insecurePlain{cfg["usuario"], secret} // explicitly configured without TLS (e.g. Mailpit in QA)
				}
				if err := c.Auth(a); err != nil {
					return fmt.Errorf("autenticación rechazada: %s", firstLine(err.Error()))
				}
			}
		}
		return c.Quit()
	case "stripe", "whatsapp", "bunny":
		// QA has no real credentials: these are validated for completeness only (the providers are simulated).
		if len(cfg) == 0 {
			return fmt.Errorf("sin configurar")
		}
		return nil
	case "aep":
		if cfg["urlActa"] == "" {
			return fmt.Errorf("falta la URL del acta")
		}
		return nil
	}
	return fmt.Errorf("tipo desconocido")
}

// registerInternal: endpoints for other services (service token).
func (s *Svc) registerInternal() {
	api := s.a.API
	tags := []string{"Interno"}
	type slugIn struct {
		Slug string `path:"slug"`
	}
	type compOutI struct{ Body Competicion }
	huma.Register(api, huma.Operation{OperationID: "internal-competition-by-slug", Method: http.MethodGet, Path: "/internal/competiciones/slug/{slug}", Summary: "Competición por slug", Tags: tags, Hidden: true},
		func(ctx context.Context, in *slugIn) (*compOutI, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			c, err := getComp(ctx, s.a.DB, "slug", in.Slug)
			return &compOutI{Body: c}, err
		})
	huma.Register(api, huma.Operation{OperationID: "internal-competition-get", Method: http.MethodGet, Path: "/internal/competiciones/{cid}", Summary: "Competición por id", Tags: tags, Hidden: true},
		func(ctx context.Context, in *cidIn) (*compOutI, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			c, err := getComp(ctx, s.a.DB, "id", in.CID)
			return &compOutI{Body: c}, err
		})
	type secIn struct {
		CID  uuid.UUID `path:"cid"`
		Tipo string    `path:"tipo"`
	}
	type secOut struct {
		Body struct {
			Config  map[string]string `json:"config"`
			Secreto string            `json:"secreto"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-integration-secret", Method: http.MethodGet, Path: "/internal/competiciones/{cid}/integraciones/{tipo}", Summary: "Configuración y secreto descifrado (solo servicios)", Tags: tags, Hidden: true},
		func(ctx context.Context, in *secIn) (*secOut, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			cfg, secret, err := s.integrationSecret(ctx, in.CID, in.Tipo)
			if err != nil {
				return nil, err
			}
			out := &secOut{}
			out.Body.Config, out.Body.Secreto = cfg, secret
			return out, nil
		})
	type lockIn struct {
		CID    uuid.UUID `path:"cid"`
		Modulo string    `path:"modulo"`
		Body   struct {
			Bloqueado bool   `json:"bloqueado"`
			Motivo    string `json:"motivo,omitempty"`
		}
	}
	type plazasIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Plazas int `json:"plazas" minimum:"0" maximum:"5000"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-inscripcion-plazas", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/inscripcion/plazas", Summary: "Plazas de atleta (seed de athletes)", Tags: tags, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *plazasIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			var c Competicion
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var err error
				if c, err = lockComp(ctx, tx, in.CID); err != nil {
					return err
				}
				c.Inscripcion.Plazas = in.Body.Plazas
				_, err = tx.Exec(ctx, `UPDATE competiciones SET inscripcion = $2, updated_at = now(), version = version + 1 WHERE id = $1`, in.CID, c.Inscripcion)
				return err
			})
			if err == nil {
				s.afterChange(ctx, c)
			}
			return nil, err
		})
	type pasoIn struct {
		CID  uuid.UUID `path:"cid"`
		Paso string    `path:"paso"`
		Body struct {
			Hecho bool `json:"hecho"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "internal-checklist", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/checklist/{paso}", Summary: "Marcar un paso de la checklist que otro servicio comprueba (p. ej. horarios publicados)", Tags: tags, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *pasoIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			if !slices.ContainsFunc(ChecklistPasos, func(p struct{ Clave, Titulo, Ayuda string }) bool { return p.Clave == in.Paso }) {
				return nil, problem.NotFound("Paso desconocido.")
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := markStep(ctx, tx, in.CID, in.Paso, in.Body.Hecho); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.checklist_actualizado", map[string]any{"paso": in.Paso, "hecho": in.Body.Hecho},
					events.Competition(in.CID.String()), events.ForPermission("evento.editar")))
			})
		})
	huma.Register(api, huma.Operation{OperationID: "internal-module-lock", Method: http.MethodPut, Path: "/internal/competiciones/{cid}/modulos/{modulo}/bloqueo", Summary: "Bloquear o desbloquear un módulo (p. ej. sorteo hasta completar la checklist legal)", Tags: tags, Hidden: true, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *lockIn) (*struct{}, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			var c Competicion
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				var err error
				if c, err = lockComp(ctx, tx, in.CID); err != nil {
					return err
				}
				m := c.Modulos[in.Modulo]
				m.Bloqueado, m.Motivo = in.Body.Bloqueado, in.Body.Motivo
				if m.Bloqueado {
					m.Activo = false
				}
				c.Modulos[in.Modulo] = m
				_, err = tx.Exec(ctx, `UPDATE competiciones SET modulos = $2, updated_at = now(), version = version + 1 WHERE id = $1`, in.CID, c.Modulos)
				return err
			})
			if err == nil {
				s.afterChange(ctx, c)
			}
			return nil, err
		})
}

// seedGRCup creates the GR Strength Cup 2026 competition with public data of the current site ("Datos de ejemplo"
// where the organiser still has to confirm) and makes ROOT_EMAIL its Admin. Idempotent.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	if err := s.init(a); err != nil {
		return err
	}
	var id uuid.UUID
	err := a.DB.QueryRow(ctx, `SELECT id FROM competiciones WHERE slug = 'grcup'`).Scan(&id)
	if err == nil {
		a.Log.Info("la competición grcup ya existe; no se cambia", "id", id)
	} else {
		id = newID()
		lat, lng := 39.3253, -0.4127
		sede := Sede{Nombre: "Pavelló Poliesportiu d'Almussafes", Direccion: "Avda. Laura Méndez, s/n", CP: "46440", Ciudad: "Almussafes", Provincia: "Valencia", Lat: &lat, Lng: &lng,
			MapsURL: "https://www.google.com/maps?daddr=Avda+Laura+M%C3%A9ndez,+s/n,+46440+Almussafes,+Valencia"}
		evento := Evento{Descripcion: "La competición de powerlifting más esperada del año", Nivel: "AEP · por confirmar", Organizador: "GR Strength",
			EmailContacto: "admin@grstrength.com", Puertas: "08:30", AforoPabellon: 1200, Instagram: "https://instagram.com/grstrength"}
		insc := Inscripcion{Modo: "externa", URL: "https://aep-powerlifting.com/", Estado: "proximamente", Nota: "Datos de ejemplo: enlace de la AEP por confirmar"}
		llegar := comoLlegarEjemplo()
		mods := defaultModulos()
		for _, k := range []string{"directo", "areaAtleta", "galeria", "blog", "campanas"} {
			mods[k] = Modulo{Activo: true}
		}
		err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `INSERT INTO competiciones (id, slug, nombre, nombre_corto, edicion, estado, fecha_inicio, fecha_fin, sede, evento, modulos, inscripcion, como_llegar)
				VALUES ($1,'grcup','GR Strength Cup 2026','GR Cup',2,'proximamente','2026-12-19','2026-12-19',$2,$3,$4,$5,$6)`, id, sede, evento, mods, insc, llegar); err != nil {
				return err
			}
			if err := seedChecklist(ctx, tx, id); err != nil {
				return err
			}
			c, err := getComp(ctx, tx, "id", id)
			if err != nil {
				return err
			}
			if err := autoChecklist(ctx, tx, c); err != nil {
				return err
			}
			if err := markStep(ctx, tx, id, "modulos", true); err != nil {
				return err
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "competition.creada", map[string]any{"slug": "grcup", "nombre": "GR Strength Cup 2026", "seed": true},
				events.Competition(id.String()), events.Subject("competicion:"+id.String())))
		})
		if err != nil {
			return err
		}
		a.Log.Info("competición grcup creada (Datos de ejemplo)", "id", id)
	}
	owner := config.Str("ROOT_EMAIL", "")
	if err := s.identity.Do(ctx, http.MethodPost, "/internal/competiciones/"+id.String()+"/roles-por-defecto", map[string]any{"propietarioEmail": owner}, nil); err != nil {
		return fmt.Errorf("roles por defecto: %w", err)
	}
	id25, err := s.seed2025(ctx, a)
	if err != nil {
		return err
	}
	if err := s.identity.Do(ctx, http.MethodPost, "/internal/competiciones/"+id25.String()+"/roles-por-defecto", map[string]any{"propietarioEmail": owner}, nil); err != nil {
		return fmt.Errorf("roles por defecto 2025: %w", err)
	}
	s.cache.Del(ctx, "pub:grcup", "pub:grcup-2025", "list")
	return nil
}

// seed2025 creates the archived first edition (/ediciones/2025, /resultados/2025): finished, with the facts of the
// 2025 poster. Its results are seeded by live («Datos de ejemplo» until the MySQL import of step 16).
func (s *Svc) seed2025(ctx context.Context, a *app.App) (uuid.UUID, error) {
	var id uuid.UUID
	if err := a.DB.QueryRow(ctx, `SELECT id FROM competiciones WHERE slug = 'grcup-2025'`).Scan(&id); err == nil {
		return id, nil
	}
	id = newID()
	sede := Sede{Ciudad: "Llíria", Provincia: "Valencia"} // the 2025 poster names only the town
	evento := Evento{Descripcion: "La primera edición reunió a atletas de la Comunitat Valenciana, Murcia y Baleares en una competición regional de nivel AEP-2, con jueces y cargadores certificados.",
		Nivel: "AEP-2 Regional Valencia, Murcia y Baleares", Organizador: "GR Strength", EmailContacto: "admin@grstrength.com", Instagram: "https://instagram.com/grstrengthclub"}
	insc := Inscripcion{Modo: "externa", Estado: "cerrada"}
	err := db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO competiciones (id, slug, nombre, nombre_corto, edicion, estado, fecha_inicio, fecha_fin, sede, evento, modulos, inscripcion, como_llegar)
			VALUES ($1,'grcup-2025','GR Strength Cup 2025','GR Cup 2025',1,'finalizado','2025-03-01','2025-03-02',$2,$3,$4,$5,'[]')`, id, sede, evento, defaultModulos(), insc); err != nil {
			return err
		}
		if err := seedChecklist(ctx, tx, id); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "competition.creada", map[string]any{"slug": "grcup-2025", "nombre": "GR Strength Cup 2025", "seed": true},
			events.Competition(id.String()), events.Subject("competicion:"+id.String())))
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("edición 2025: %w", err)
	}
	a.Log.Info("edición 2025 creada (Datos de ejemplo)", "id", id)
	return id, nil
}

// insecurePlain is AUTH PLAIN without net/smtp's TLS requirement; only used when the integration says tls=no.
type insecurePlain struct{ user, pass string }

func (a insecurePlain) Start(*smtp.ServerInfo) (string, []byte, error) {
	return "PLAIN", []byte("\x00" + a.user + "\x00" + a.pass), nil
}

func (a insecurePlain) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return nil, fmt.Errorf("respuesta inesperada del servidor")
	}
	return nil, nil
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	if len(s) > 160 {
		return s[:160]
	}
	return s
}

// comoLlegarEjemplo is the example «Cómo llegar» of a new competition (Figma 11), every item «por confirmar».
func comoLlegarEjemplo() []ComoLlegar {
	return []ComoLlegar{
		{Tipo: "coche", Titulo: "En coche", Detalle: "Unos 20 km al sur de Valencia por la V-31 dirección Silla. Datos de ejemplo.", Nota: "≈ 25 min desde Valencia", Estado: "por_confirmar"},
		{Tipo: "tren", Titulo: "En tren", Detalle: "Cercanías C-2, estación Benifaió-Almussafes. Datos de ejemplo.", Nota: "Comprueba horarios en Renfe", Estado: "por_confirmar"},
		{Tipo: "avion", Titulo: "En avión", Detalle: "Aeropuerto de Valencia (Manises), a unos 35 km. Datos de ejemplo.", Nota: "≈ 35 min en coche", Estado: "por_confirmar"},
		{Tipo: "bus", Titulo: "En autobús", Detalle: "Líneas interurbanas desde Valencia. Datos de ejemplo.", Nota: "Horarios por confirmar", Estado: "por_confirmar"},
		{Tipo: "parking", Titulo: "Aparcamiento", Detalle: "Plazas en las calles del entorno del pabellón. Pendiente de confirmar con el Ayuntamiento si habrá zona reservada. Datos de ejemplo.", Estado: "por_confirmar"},
		{Tipo: "accesibilidad", Titulo: "Accesibilidad", Detalle: "Confirmaremos accesos adaptados, aseos y zona reservada en grada para personas con movilidad reducida.", Estado: "por_confirmar"},
	}
}

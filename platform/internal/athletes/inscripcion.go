package athletes

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

// ReferidosCfg is the referral programme (Figma 66 · «Referidos · configuración»). Amounts in cents.
type ReferidosCfg struct {
	Activo        bool    `json:"activo"`
	Modo          string  `json:"modo" enum:"basico,acumulativo"`
	DescTipo      string  `json:"descTipo" enum:"porcentaje,importe" doc:"Descuento para quien se inscribe con el código"`
	DescValor     int     `json:"descValor" minimum:"0" doc:"Porcentaje (1–100) o céntimos"`
	Recompensa    int     `json:"recompensa" minimum:"0" doc:"Céntimos que se devuelven a quien invita, por invitado"`
	MaxUsos       int     `json:"maxUsos" minimum:"0" doc:"Invitados máximos por código (0 = sin límite)"`
	AcumModo      string  `json:"acumModo" enum:"basica,multiplicador" doc:"Solo en modo acumulativo"`
	Multiplicador float64 `json:"multiplicador" minimum:"1" maximum:"5"`
}

// Config is the registration set-up of a competition.
type Config struct {
	Modo      string       `json:"modo" enum:"externa,propia"`
	Cuota     int          `json:"cuota" minimum:"0" maximum:"100000" doc:"Céntimos"`
	Abre      *time.Time   `json:"abre,omitempty"`
	Cierra    *time.Time   `json:"cierra,omitempty"`
	Reserva   bool         `json:"reserva" doc:"Al completarse, las inscripciones quedan en reserva sin cobrar"`
	Cupones   bool         `json:"cupones"`
	Referidos ReferidosCfg `json:"referidos"`
	Version   int          `json:"version"`
}

func defaultConfig() Config {
	return Config{Modo: "externa", Cuota: 3500, Reserva: true, Cupones: true, Version: 0,
		Referidos: ReferidosCfg{Modo: "basico", DescTipo: "porcentaje", DescValor: 10, Recompensa: 500, MaxUsos: 10, AcumModo: "basica", Multiplicador: 1.5}}
}

func (s *Svc) config(ctx context.Context, q querier, cid uuid.UUID) (Config, error) {
	c := defaultConfig()
	rows, err := q.Query(ctx, `SELECT modo, cuota, abre, cierra, reserva, cupones, referidos, version FROM inscripcion_config WHERE competition_id = $1`, cid)
	if err != nil {
		return c, err
	}
	defer rows.Close()
	if rows.Next() {
		var ref []byte
		if err := rows.Scan(&c.Modo, &c.Cuota, &c.Abre, &c.Cierra, &c.Reserva, &c.Cupones, &ref, &c.Version); err != nil {
			return c, err
		}
		_ = json.Unmarshal(ref, &c.Referidos)
	}
	return c, rows.Err()
}

// ---- codes ----

// normCodigo uppercases and keeps letters and digits («grstrength 25» → «GRSTRENGTH25»).
func normCodigo(s string) string {
	var b strings.Builder
	for _, r := range norm.NFD.String(strings.ToUpper(strings.TrimSpace(s))) {
		if r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Descuento is how a code applies to the price.
type Descuento struct {
	Codigo      string `json:"codigo"`
	Valido      bool   `json:"valido"`
	Importe     int    `json:"importe" doc:"Céntimos descontados"`
	Texto       string `json:"texto" doc:"«−25 %», «−10,00 €»"`
	Motivo      string `json:"motivo,omitempty" doc:"Por qué no vale"`
	InvitadoPor string `json:"invitadoPor,omitempty" doc:"Nombre corto de quien invita (referidos)"`
}

// Precio is the breakdown shown before paying.
type Precio struct {
	Cuota    int        `json:"cuota"`
	Cupon    *Descuento `json:"cupon,omitempty"`
	Referido *Descuento `json:"referido,omitempty"`
	Total    int        `json:"total"`
}

type cuponRow struct {
	ID     uuid.UUID  `db:"id"`
	Codigo string     `db:"codigo"`
	Tipo   string     `db:"tipo"`
	Valor  int        `db:"valor"`
	Limite *int       `db:"limite"`
	Caduca *time.Time `db:"caduca"`
	Activo bool       `db:"activo"`
	Usos   int        `db:"usos"`
}

type refRow struct {
	ID            uuid.UUID     `db:"id"`
	AtletaID      uuid.UUID     `db:"atleta_id"`
	InscripcionID *uuid.UUID    `db:"inscripcion_id"`
	Codigo        string        `db:"codigo"`
	Ajustes       *ReferidosCfg `db:"ajustes"`
	Nombre        string        `db:"nombre"`
	Apellidos     string        `db:"apellidos"`
	Email         *string       `db:"email"`
	Usos          int           `db:"usos"`
}

func (r refRow) cfg(base ReferidosCfg) ReferidosCfg {
	if r.Ajustes != nil {
		a := *r.Ajustes
		a.Activo = base.Activo && a.Activo
		return a
	}
	return base
}

func descTexto(tipo string, valor int) string {
	if tipo == "porcentaje" {
		return fmt.Sprintf("−%d %%", valor)
	}
	return "−" + strings.TrimPrefix(pagos.Euros(valor), "−")
}

func aplicar(tipo string, valor, base int) int {
	if base <= 0 {
		return 0
	}
	if tipo == "porcentaje" {
		return min(base, int(math.Round(float64(base)*float64(valor)/100)))
	}
	return min(base, valor)
}

// recompensa of the n-th invitee (1-based) for a referral config.
func recompensa(c ReferidosCfg, n int) int {
	if c.Modo == "acumulativo" && c.AcumModo == "multiplicador" && c.Multiplicador > 1 {
		return int(math.Round(float64(c.Recompensa) * math.Pow(c.Multiplicador, float64(n-1))))
	}
	return c.Recompensa
}

// precio computes the breakdown (coupon first, then the referral discount on what remains).
func (s *Svc) precio(ctx context.Context, q querier, cid uuid.UUID, cfg Config, cuponIn, refIn, email string) (Precio, *cuponRow, *refRow, error) {
	p := Precio{Cuota: cfg.Cuota, Total: cfg.Cuota}
	var cup *cuponRow
	var ref *refRow
	if code := normCodigo(cuponIn); code != "" {
		d := &Descuento{Codigo: code}
		p.Cupon = d
		rows, err := q.Query(ctx, `SELECT id, codigo, tipo, valor, limite, caduca, activo, usos FROM cupones WHERE competition_id = $1 AND codigo = $2`, cid, code)
		if err != nil {
			return p, nil, nil, err
		}
		list, err := pgx.CollectRows(rows, pgx.RowToStructByName[cuponRow])
		if err != nil {
			return p, nil, nil, err
		}
		switch {
		case !cfg.Cupones || len(list) == 0:
			d.Motivo = "Este código de descuento no existe."
		case !list[0].Activo:
			d.Motivo = "Este cupón está pausado."
		case list[0].Caduca != nil && time.Now().After(*list[0].Caduca):
			d.Motivo = "Este cupón caducó el " + list[0].Caduca.In(madrid).Format("02/01") + "."
		case list[0].Limite != nil && list[0].Usos >= *list[0].Limite:
			d.Motivo = "Este cupón se ha agotado."
		default:
			cup = &list[0]
			d.Valido, d.Importe, d.Texto = true, aplicar(cup.Tipo, cup.Valor, p.Total), descTexto(cup.Tipo, cup.Valor)
			p.Total -= d.Importe
		}
	}
	if code := normCodigo(refIn); code != "" {
		d := &Descuento{Codigo: code}
		p.Referido = d
		rows, err := q.Query(ctx, `SELECT r.id, r.atleta_id, r.inscripcion_id, r.codigo, r.ajustes, a.nombre, a.apellidos, a.email::text AS email,
			(SELECT count(*) FROM referido_usos u WHERE u.codigo_id = r.id AND u.estado <> 'anulada')::int AS usos
			FROM referido_codigos r JOIN atletas a ON a.id = r.atleta_id WHERE r.competition_id = $1 AND r.codigo = $2`, cid, code)
		if err != nil {
			return p, nil, nil, err
		}
		list, err := pgx.CollectRows(rows, pgx.RowToStructByName[refRow])
		if err != nil {
			return p, nil, nil, err
		}
		if len(list) == 0 || !cfg.Referidos.Activo {
			d.Motivo = "No encontramos ese código de referido."
		} else {
			r := list[0]
			rc := r.cfg(cfg.Referidos)
			switch {
			case !rc.Activo:
				d.Motivo = "Este código de referido ya no está activo."
			case rc.MaxUsos > 0 && r.Usos >= rc.MaxUsos:
				d.Motivo = "Este código ya no admite más invitados."
			case email != "" && r.Email != nil && strings.EqualFold(*r.Email, email):
				d.Motivo = "No puedes usar tu propio código."
			default:
				ref = &r
				d.Valido, d.Importe, d.Texto = true, aplicar(rc.DescTipo, rc.DescValor, p.Total), descTexto(rc.DescTipo, rc.DescValor)
				d.InvitadoPor = r.Nombre + " " + firstRune(r.Apellidos) + "."
				var menor bool
				if err := s.a.DB.QueryRow(ctx, `SELECT COALESCE(fecha_nacimiento > ($2::date - interval '18 years'), division = 'subjunior') FROM atletas WHERE id = $1`, r.AtletaID, s.compDate(ctx, cid)).Scan(&menor); err == nil && menor {
					d.InvitadoPor = "un atleta inscrito" // never reveal a minor's name
				}
				p.Total -= d.Importe
			}
		}
	}
	return p, cup, ref, nil
}

func firstRune(s string) string {
	for _, r := range s {
		return string(unicode.ToUpper(r))
	}
	return ""
}

// ---- payment provider (Stripe from the competition's integration, else simulated) ----

type provEntry struct {
	p   pagos.Provider
	exp time.Time
}

var provCache sync.Map // cid → provEntry

// proveedor returns the gateway of a competition: Stripe with its keys, else the simulated gateway where it is
// enabled (PAGOS_SIMULADOS, never in production), else nil (no payments possible).
func (s *Svc) proveedor(ctx context.Context, cid uuid.UUID) pagos.Provider {
	if e, ok := provCache.Load(cid); ok && time.Now().Before(e.(provEntry).exp) {
		return e.(provEntry).p
	}
	var p pagos.Provider
	if s.sim != nil {
		p = s.sim
	}
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/stripe", nil, &out); err == nil && out.Secreto != "" {
		// The secret holds the API key and the webhook signing secret: {"clave":"sk_…","webhook":"whsec_…"}.
		var sec struct {
			Clave   string `json:"clave"`
			Webhook string `json:"webhook"`
		}
		if json.Unmarshal([]byte(out.Secreto), &sec) == nil && sec.Clave != "" && sec.Webhook != "" {
			p = pagos.NewStripe(sec.Clave, sec.Webhook)
		}
	}
	provCache.Store(cid, provEntry{p: p, exp: time.Now().Add(time.Minute)})
	return p
}

func (s *Svc) initPagos() {
	if !config.Bool("PAGOS_SIMULADOS", s.a.Cfg.Env == "dev") {
		return // production: only real gateways
	}
	m := hmac.New(sha256.New, []byte(s.a.Cfg.InternalToken))
	m.Write([]byte("grcup/pagos/simulado/v1"))
	s.sim = &pagos.Simulado{Redis: s.a.Redis, Prefix: s.a.Keys.Of("pagos", "sim", "athletes", ""), Secret: hex.EncodeToString(m.Sum(nil)), Service: "athletes", WebURL: s.webURL}
	s.sim.Deliver = func(ctx context.Context, payload []byte, sig string) error {
		return s.webhook(ctx, payload, http.Header{"Stripe-Signature": []string{sig}})
	}
	s.sim.Mount(s.a.Mux, "/api/pagos/simulado/athletes")
}

// ---- public API ----

// ConfigPub is what /inscripcion needs.
type ConfigPub struct {
	Modo        string     `json:"modo"`
	Estado      string     `json:"estado" enum:"abierta,proximamente,cerrada,completa" doc:"completa = solo lista de reserva"`
	Cuota       int        `json:"cuota"`
	Plazas      int        `json:"plazas"`
	Ocupadas    int        `json:"ocupadas"`
	Abre        *time.Time `json:"abre,omitempty"`
	Cierra      *time.Time `json:"cierra,omitempty"`
	Reserva     bool       `json:"reserva"`
	Cupones     bool       `json:"cupones"`
	Referidos   bool       `json:"referidos"`
	ReferidoTxt string     `json:"referidoTexto,omitempty" doc:"«10 % de descuento; a quien te invita le devolvemos 5,00 €»"`
	Pasarela    string     `json:"pasarela" enum:"stripe,simulado,ninguna" doc:"ninguna: sin claves de Stripe (solo inscripciones gratis o en reserva)"`
	Pruebas     bool       `json:"pruebas" doc:"Pasarela simulada o Stripe en modo test: no se cobra"`
}

// ocupadas counts confirmed athletes plus payments in progress (their place is held for 30 minutes).
func (s *Svc) ocupadas(ctx context.Context, cid uuid.UUID) (int, error) {
	var n int
	err := s.a.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM atletas WHERE competition_id = $1 AND estado = 'confirmado')
		+ (SELECT count(*) FROM inscripciones WHERE competition_id = $1 AND estado = 'pendiente_pago' AND expira_at > now())`, cid).Scan(&n)
	return n, err
}

func (s *Svc) configPub(ctx context.Context, cid uuid.UUID, fresh ...bool) (ConfigPub, Config, error) {
	cfg, err := s.config(ctx, s.a.DB, cid)
	if err != nil {
		return ConfigPub{}, cfg, err
	}
	get := s.comps.ByID
	if len(fresh) > 0 && fresh[0] {
		get = s.comps.ByIDFresh // places may have just changed in the backoffice
	}
	c, err := get(ctx, cid)
	if err != nil {
		return ConfigPub{}, cfg, err
	}
	n, err := s.ocupadas(ctx, cid)
	if err != nil {
		return ConfigPub{}, cfg, err
	}
	p := s.proveedor(ctx, cid)
	out := ConfigPub{Modo: cfg.Modo, Cuota: cfg.Cuota, Plazas: c.Inscripcion.Plazas, Ocupadas: n, Abre: cfg.Abre, Cierra: cfg.Cierra, Reserva: cfg.Reserva,
		Cupones: cfg.Cupones, Referidos: cfg.Referidos.Activo, Pasarela: "ninguna"}
	if p != nil {
		out.Pasarela, out.Pruebas = p.Name(), p.Name() == "simulado"
	}
	if st, ok := p.(*pagos.Stripe); ok {
		out.Pruebas = st.Test()
	}
	if cfg.Referidos.Activo {
		out.ReferidoTxt = strings.TrimPrefix(descTexto(cfg.Referidos.DescTipo, cfg.Referidos.DescValor), "−") + " de descuento con el código de un amigo inscrito"
	}
	now := time.Now()
	switch {
	case cfg.Modo != "propia":
		out.Estado = "cerrada"
	case cfg.Abre != nil && now.Before(*cfg.Abre):
		out.Estado = "proximamente"
	case cfg.Cierra != nil && now.After(*cfg.Cierra):
		out.Estado = "cerrada"
	case out.Plazas > 0 && n >= out.Plazas:
		out.Estado = "completa"
	default:
		out.Estado = "abierta"
	}
	return out, cfg, nil
}

// InscripcionIn is the public form.
type InscripcionIn struct {
	Nombre           string `json:"nombre" minLength:"1" maxLength:"80"`
	Apellidos        string `json:"apellidos" minLength:"1" maxLength:"120"`
	Email            string `json:"email" format:"email" maxLength:"254"`
	Telefono         string `json:"telefono,omitempty" maxLength:"30"`
	Sexo             string `json:"sexo" enum:"F,M"`
	FechaNacimiento  string `json:"fechaNacimiento" doc:"AAAA-MM-DD"`
	Categoria        string `json:"categoria" maxLength:"6"`
	Licencia         string `json:"licencia" minLength:"3" maxLength:"20"`
	Club             string `json:"club,omitempty" maxLength:"120"`
	Cupon            string `json:"cupon,omitempty" maxLength:"40"`
	Referido         string `json:"referido,omitempty" maxLength:"40"`
	AceptaTerminos   bool   `json:"aceptaTerminos,omitempty"`
	AceptaPrivacidad bool   `json:"aceptaPrivacidad,omitempty"`
	AceptaImagen     bool   `json:"aceptaImagen,omitempty" doc:"Opcional: publicar la foto"`
}

// EstadoInscripcion is what the confirmation page polls.
type EstadoInscripcion struct {
	ID          uuid.UUID `json:"id"`
	Estado      string    `json:"estado" enum:"pendiente_pago,pagada,gratuita,reserva,cancelada,fallida"`
	Total       int       `json:"total"`
	Email       string    `json:"email" doc:"Enmascarado"`
	Tarjeta     string    `json:"tarjeta,omitempty"`
	Referencia  string    `json:"referencia,omitempty"`
	CodigoRef   string    `json:"codigoReferido,omitempty"`
	CheckoutURL string    `json:"checkoutUrl,omitempty"`
	Categoria   string    `json:"categoria"`
}

func maskEmail(e string) string {
	u, d, ok := strings.Cut(e, "@")
	if !ok || len(u) == 0 {
		return e
	}
	return string([]rune(u)[0]) + "•••@" + d
}

func (s *Svc) registerInscripcion() {
	api := s.a.API
	pub := "/api/competiciones/{slug}/inscripcion"

	type cfgOut struct{ Body ConfigPub }
	huma.Register(api, huma.Operation{OperationID: "inscripcion-public", Method: http.MethodGet, Path: pub, Summary: "Inscripción: modo, cuota, plazas y estado", Tags: tagPub},
		func(ctx context.Context, in *slugIn) (*cfgOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			p, _, err := s.configPub(ctx, c.ID)
			return &cfgOut{Body: p}, err
		})

	type precioIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body struct {
			Cupon    string `json:"cupon,omitempty" maxLength:"40"`
			Referido string `json:"referido,omitempty" maxLength:"40"`
			Email    string `json:"email,omitempty" maxLength:"254"`
		}
	}
	type precioOut struct{ Body Precio }
	huma.Register(api, huma.Operation{OperationID: "inscripcion-precio", Method: http.MethodPost, Path: pub + "/precio", Summary: "Validar códigos y calcular el precio", Tags: tagPub},
		func(ctx context.Context, in *precioIn) (*precioOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "precio", httpx.ClientIPFrom(ctx)), 60, 10*time.Minute); !r.Allowed {
				return nil, problem.TooMany("Has probado muchos códigos seguidos. Espera unos minutos.")
			}
			cfg, err := s.config(ctx, s.a.DB, c.ID)
			if err != nil {
				return nil, err
			}
			p, _, _, err := s.precio(ctx, s.a.DB, c.ID, cfg, in.Body.Cupon, in.Body.Referido, strings.ToLower(strings.TrimSpace(in.Body.Email)))
			return &precioOut{Body: p}, err
		})

	type crearIn struct {
		Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		Body InscripcionIn
	}
	type estadoOut struct{ Body EstadoInscripcion }
	huma.Register(api, huma.Operation{OperationID: "inscripcion-crear", Method: http.MethodPost, Path: pub, Summary: "Inscribirse (devuelve la URL de pago, o confirma si es gratis o va a reserva)", Tags: tagPub, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *crearIn) (*estadoOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "inscripcion", httpx.ClientIPFrom(ctx)), 10, time.Hour); !r.Allowed {
				return nil, problem.TooMany("Has enviado varias inscripciones seguidas. Inténtalo más tarde.")
			}
			out, err := s.crearInscripcion(ctx, c.ID, in.Body)
			if err != nil {
				return nil, err
			}
			return &estadoOut{Body: out}, nil
		})

	type estIn struct {
		Slug string    `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
		ID   uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "inscripcion-estado", Method: http.MethodGet, Path: pub + "/{id}", Summary: "Estado de una inscripción (página de confirmación)", Tags: tagPub},
		func(ctx context.Context, in *estIn) (*estadoOut, error) {
			c, err := s.comps.Public(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			e, err := s.estado(ctx, c.ID, in.ID)
			if err == nil && e.Estado == "pendiente_pago" {
				var ses string
				_ = s.a.DB.QueryRow(ctx, `SELECT sesion FROM inscripciones WHERE id = $1`, in.ID).Scan(&ses)
				if s.sim != nil {
					s.sim.Redeliver(ctx, ses)
				}
				e, err = s.estado(ctx, c.ID, in.ID)
			}
			return &estadoOut{Body: e}, err
		})

	// Payment webhook (Stripe or simulated gateway, same format and signature).
	s.a.Mux.HandleFunc("POST /api/webhooks/pagos/inscripciones", func(w http.ResponseWriter, r *http.Request) {
		payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 256<<10))
		if err != nil {
			http.Error(w, "payload", http.StatusBadRequest)
			return
		}
		if err := s.webhook(r.Context(), payload, r.Header); err != nil {
			if errors.Is(err, pagos.ErrSignature) {
				s.a.Log.Warn("webhook de pago rechazado", "err", err)
				http.Error(w, "firma", http.StatusBadRequest)
				return
			}
			s.a.Log.Error("webhook de pago", "err", err)
			http.Error(w, "error", http.StatusInternalServerError) // the gateway retries
			return
		}
		w.WriteHeader(http.StatusOK)
	})
}

func (s *Svc) estado(ctx context.Context, cid, id uuid.UUID) (EstadoInscripcion, error) {
	var e EstadoInscripcion
	var email string
	var atleta *uuid.UUID
	var datos map[string]string
	err := s.a.DB.QueryRow(ctx, `SELECT id, estado, total, email::text, tarjeta, pago, atleta_id, datos FROM inscripciones WHERE competition_id = $1 AND id = $2`, cid, id).
		Scan(&e.ID, &e.Estado, &e.Total, &email, &e.Tarjeta, &e.Referencia, &atleta, &datos)
	if err != nil {
		return e, problem.NotFound("Inscripción no encontrada.")
	}
	e.Email = maskEmail(email)
	e.Categoria = datos["sexo"] + " " + datos["categoria"]
	if atleta != nil {
		_ = s.a.DB.QueryRow(ctx, `SELECT codigo FROM referido_codigos WHERE atleta_id = $1`, *atleta).Scan(&e.CodigoRef)
	}
	return e, nil
}

// crearInscripcion validates the form, reserves the place and starts the payment (or confirms free / reserve).
func (s *Svc) crearInscripcion(ctx context.Context, cid uuid.UUID, b InscripcionIn) (EstadoInscripcion, error) {
	pub, cfg, err := s.configPub(ctx, cid, true)
	if err != nil {
		return EstadoInscripcion{}, err
	}
	switch pub.Estado {
	case "cerrada":
		if cfg.Modo != "propia" {
			return EstadoInscripcion{}, problem.Conflict("INSCRIPCION_EXTERNA", "La inscripción se hace en la web de la AEP.")
		}
		return EstadoInscripcion{}, problem.Conflict("INSCRIPCION_CERRADA", "La inscripción está cerrada.")
	case "proximamente":
		return EstadoInscripcion{}, problem.Conflict("INSCRIPCION_NO_ABIERTA", "La inscripción todavía no está abierta.")
	case "completa":
		if !cfg.Reserva {
			return EstadoInscripcion{}, problem.Conflict("INSCRIPCION_COMPLETA", "No quedan plazas.")
		}
	}
	if !b.AceptaTerminos || !b.AceptaPrivacidad {
		return EstadoInscripcion{}, problem.Unprocessable("CONSENTIMIENTO_OBLIGATORIO", "Para inscribirte tienes que aceptar los términos, el reglamento y la política de privacidad.")
	}
	d := DatosIn{Licencia: b.Licencia, Nombre: b.Nombre, Apellidos: b.Apellidos, Email: b.Email, Telefono: b.Telefono, Sexo: b.Sexo, FechaNacimiento: b.FechaNacimiento, Categoria: b.Categoria, Club: b.Club, Estado: "confirmado"}
	nac, ok := ParseFecha(b.FechaNacimiento)
	if !ok {
		return EstadoInscripcion{}, problem.Unprocessable("FECHA_INVALIDA", "La fecha de nacimiento debe ser AAAA-MM-DD.")
	}
	year := s.compYear(ctx, cid)
	d.Division = DivisionPorEdad(nac, year)
	if year-nac.Year() < 14 {
		return EstadoInscripcion{}, problem.Unprocessable("EDAD_MINIMA", "La edad mínima para competir es 14 años.")
	}
	if err := d.validate(); err != nil {
		return EstadoInscripcion{}, err
	}
	if d.Email == "" {
		return EstadoInscripcion{}, problem.Unprocessable("EMAIL_INVALIDO", "Escribe tu email.")
	}
	var dup int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND licencia = $2 AND estado <> 'baja'`, cid, d.Licencia).Scan(&dup); err != nil {
		return EstadoInscripcion{}, err
	}
	if dup > 0 {
		return EstadoInscripcion{}, problem.Conflict("YA_INSCRITO", "Ya hay una inscripción con esa licencia. Si es un error, escríbenos.")
	}
	datos := map[string]string{"nombre": d.Nombre, "apellidos": d.Apellidos, "telefono": d.Telefono, "sexo": d.Sexo, "fechaNacimiento": nac.Format("2006-01-02"),
		"categoria": d.Categoria, "division": d.Division, "licencia": d.Licencia, "club": d.Club}
	cons := map[string]any{"aceptado": time.Now(), "ip": anonIP(httpx.ClientIPFrom(ctx)), "imagen": b.AceptaImagen}
	cons["terminos"], _ = s.legalVigente(ctx, cid, "terminos")
	cons["privacidad"], _ = s.legalVigente(ctx, cid, "privacidad")
	id := newID()
	out := EstadoInscripcion{ID: id, Email: maskEmail(d.Email), Categoria: d.Sexo + " " + d.Categoria}
	var checkout pagos.CheckoutIn
	prov := s.proveedor(ctx, cid)
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		// Serialise registrations of a competition (places and coupon limits are counted inside the lock).
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 7))`, cid.String()); err != nil {
			return err
		}
		precio, cup, ref, err := s.precio(ctx, tx, cid, cfg, b.Cupon, b.Referido, d.Email)
		if err != nil {
			return err
		}
		if precio.Cupon != nil && !precio.Cupon.Valido {
			return problem.Unprocessable("CUPON_INVALIDO", precio.Cupon.Motivo)
		}
		if precio.Referido != nil && !precio.Referido.Valido {
			return problem.Unprocessable("REFERIDO_INVALIDO", precio.Referido.Motivo)
		}
		var n int
		if err := tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM atletas WHERE competition_id = $1 AND estado = 'confirmado')
			+ (SELECT count(*) FROM inscripciones WHERE competition_id = $1 AND estado = 'pendiente_pago' AND expira_at > now())`, cid).Scan(&n); err != nil {
			return err
		}
		estado := "pendiente_pago"
		switch {
		case pub.Plazas > 0 && n >= pub.Plazas:
			if !cfg.Reserva {
				return problem.Conflict("INSCRIPCION_COMPLETA", "No quedan plazas.")
			}
			estado = "reserva" // no charge until there is a place
		case precio.Total == 0:
			estado = "gratuita"
		}
		var cupID, refID *uuid.UUID
		cupCode := ""
		if cup != nil {
			cupID, cupCode = &cup.ID, cup.Codigo
		}
		if ref != nil {
			refID = &ref.ID
		}
		dcup, dref := 0, 0
		if precio.Cupon != nil {
			dcup = precio.Cupon.Importe
		}
		if precio.Referido != nil {
			dref = precio.Referido.Importe
		}
		var expira *time.Time
		if estado == "pendiente_pago" {
			t := time.Now().Add(30 * time.Minute)
			expira = &t
		}
		dj, _ := json.Marshal(datos)
		cj, _ := json.Marshal(cons)
		if _, err := tx.Exec(ctx, `INSERT INTO inscripciones (id, competition_id, datos, email, licencia, cuota, desc_cupon, desc_referido, total, cupon_id, cupon_codigo, referido_id, estado, proveedor, consentimientos, expira_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, id, cid, dj, d.Email, d.Licencia, precio.Cuota, dcup, dref, precio.Total, cupID, cupCode, refID, estado, provName(prov), cj, expira); err != nil {
			if strings.Contains(err.Error(), "inscripciones_licencia_viva") {
				return problem.Conflict("YA_INSCRITO", "Ya hay una inscripción en curso con esa licencia. Si no terminaste el pago, espera 30 minutos o escríbenos.")
			}
			return err
		}
		out.Estado, out.Total = estado, precio.Total
		switch estado {
		case "gratuita":
			return s.confirmarPago(ctx, tx, cid, id, pagos.Event{})
		case "reserva":
			return s.alta(ctx, tx, cid, id, "reserva")
		}
		checkout = pagos.CheckoutIn{Amount: precio.Total, Description: "Inscripción · " + s.nombreComp(ctx, cid), Email: d.Email,
			SuccessURL: s.webURL + "/inscripcion/estado?id=" + id.String(), CancelURL: s.webURL + "/inscripcion?cancelado=" + id.String(),
			Metadata: map[string]string{"inscripcion": id.String(), "competicion": cid.String(), "idempotencia": id.String()}, ExpiresAt: *expira}
		if prov == nil { // rolls back the registration: nothing is held without a way to pay
			return problem.New(http.StatusServiceUnavailable, "PASARELA_NO_CONFIGURADA", "Los pagos todavía no están activados. Inténtalo más adelante.")
		}
		return nil
	})
	if err != nil {
		return out, err
	}
	if out.Estado != "pendiente_pago" {
		s.bump(ctx, cid)
		return out, nil
	}
	co, err := prov.CreateCheckout(ctx, checkout)
	if err != nil {
		s.a.Log.Error("checkout", "err", err)
		_, _ = s.a.DB.Exec(ctx, `UPDATE inscripciones SET estado = 'fallida', updated_at = now() WHERE id = $1`, id)
		return out, problem.New(http.StatusServiceUnavailable, "PASARELA_NO_DISPONIBLE", "No hemos podido abrir el pago. Inténtalo en unos minutos.")
	}
	if _, err := s.a.DB.Exec(ctx, `UPDATE inscripciones SET sesion = $2, updated_at = now() WHERE id = $1`, id, co.ID); err != nil {
		return out, err
	}
	out.CheckoutURL = co.URL
	return out, nil
}

func (s *Svc) nombreComp(ctx context.Context, cid uuid.UUID) string {
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		return c.Nombre
	}
	return "GR Cup"
}

// webhook verifies and applies a payment event (idempotent by event id).
func (s *Svc) webhook(ctx context.Context, payload []byte, h http.Header) error {
	// The competition decides the provider (and its secret): read it from the unverified payload, then verify.
	var peek struct {
		Data struct {
			Object struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if json.Unmarshal(payload, &peek) != nil {
		return pagos.ErrSignature
	}
	cid, err := uuid.Parse(peek.Data.Object.Metadata["competicion"])
	if err != nil {
		return pagos.ErrSignature
	}
	prov := s.proveedor(ctx, cid)
	if prov == nil {
		return pagos.ErrSignature
	}
	ev, err := prov.VerifyWebhook(payload, h)
	if err != nil && s.sim != nil && prov != pagos.Provider(s.sim) {
		// A competition may switch from the simulated gateway to Stripe with simulated payments still open.
		ev, err = s.sim.VerifyWebhook(payload, h)
	}
	if err != nil {
		return err
	}
	iid, err := uuid.Parse(ev.Metadata["inscripcion"])
	if err != nil {
		return nil // not ours: acknowledge
	}
	var reembolsos []func()
	err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `INSERT INTO pagos_eventos (id, tipo) VALUES ($1, $2) ON CONFLICT DO NOTHING`, ev.ID, ev.Type)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return nil // already processed
		}
		switch {
		case ev.Type == "checkout.session.completed" && ev.Paid:
			if err := s.confirmarPago(ctx, tx, cid, iid, ev); err != nil {
				return err
			}
			reembolsos, err = s.recompensaReferido(ctx, tx, cid, iid)
			return err
		case ev.Type == "checkout.session.expired":
			_, err := tx.Exec(ctx, `UPDATE inscripciones SET estado = 'cancelada', updated_at = now() WHERE id = $1 AND estado = 'pendiente_pago'`, iid)
			return err
		case ev.Type == "checkout.session.async_payment_failed":
			_, err := tx.Exec(ctx, `UPDATE inscripciones SET estado = 'fallida', updated_at = now() WHERE id = $1 AND estado = 'pendiente_pago'`, iid)
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}
	for _, f := range reembolsos {
		f()
	}
	s.bump(ctx, cid)
	return nil
}

// confirmarPago marks the registration paid (or free) and creates the athlete, their referral code and the coupon use.
func (s *Svc) confirmarPago(ctx context.Context, tx pgx.Tx, cid, iid uuid.UUID, ev pagos.Event) error {
	var estado string
	var cupon *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT estado, cupon_id FROM inscripciones WHERE id = $1 AND competition_id = $2 FOR UPDATE`, iid, cid).Scan(&estado, &cupon); err != nil {
		return err
	}
	if estado == "pagada" || estado == "gratuita" && ev.ID != "" {
		return nil
	}
	nuevo := "gratuita"
	if ev.ID != "" {
		nuevo = "pagada" // a payment that arrives after the 30-minute hold is still honoured
	}
	if _, err := tx.Exec(ctx, `UPDATE inscripciones SET estado = $2, pago = $3, tarjeta = $4, pagada_at = now(), expira_at = NULL, updated_at = now() WHERE id = $1`,
		iid, nuevo, ev.PaymentID, ev.Card); err != nil {
		return err
	}
	if cupon != nil {
		var usos int
		var limite *int
		var codigo string
		if err := tx.QueryRow(ctx, `UPDATE cupones SET usos = usos + 1, updated_at = now() WHERE id = $1 RETURNING usos, limite, codigo`, *cupon).Scan(&usos, &limite, &codigo); err != nil {
			return err
		}
		if limite != nil && usos >= *limite {
			if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.cupon_agotado", map[string]any{"codigo": codigo, "usos": usos}, events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
				return err
			}
		}
	}
	return s.alta(ctx, tx, cid, iid, "confirmado")
}

// alta creates the athlete of a registration (confirmed or reserve) and, when confirmed, their referral code.
func (s *Svc) alta(ctx context.Context, tx pgx.Tx, cid, iid uuid.UUID, estado string) error {
	var datos map[string]string
	var mail string
	var total int
	var cons map[string]any
	if err := tx.QueryRow(ctx, `SELECT datos, email::text, total, consentimientos FROM inscripciones WHERE id = $1`, iid).Scan(&datos, &mail, &total, &cons); err != nil {
		return err
	}
	nac, _ := ParseFecha(datos["fechaNacimiento"])
	aid := newID()
	var orden *int
	if estado == "reserva" {
		var n int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(orden_reserva), 0) + 1 FROM atletas WHERE competition_id = $1 AND estado = 'reserva'`, cid).Scan(&n); err != nil {
			return err
		}
		orden = &n
	}
	if err := tx.QueryRow(ctx, `INSERT INTO atletas (id, competition_id, licencia, nombre, apellidos, email, telefono, sexo, fecha_nacimiento, categoria, division, club, estado, orden_reserva, origen)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'propia')
		ON CONFLICT (competition_id, licencia) WHERE licencia <> '' DO UPDATE SET estado = EXCLUDED.estado, orden_reserva = EXCLUDED.orden_reserva, version = atletas.version + 1, updated_at = now()
		RETURNING id`, aid, cid, datos["licencia"], datos["nombre"], datos["apellidos"], mail, datos["telefono"], datos["sexo"], nac, datos["categoria"], datos["division"], datos["club"], estado, orden).Scan(&aid); err != nil {
		return err
	}
	var hasPerfil int
	_ = tx.QueryRow(ctx, `SELECT count(*) FROM perfiles WHERE atleta_id = $1`, aid).Scan(&hasPerfil)
	if hasPerfil == 0 {
		if err := createPerfil(ctx, tx, cid, aid, datos["nombre"]+" "+datos["apellidos"]); err != nil {
			return err
		}
	}
	if img, _ := cons["imagen"].(bool); img {
		v, h := s.legalVigente(ctx, cid, "consentimiento")
		ip, _ := cons["ip"].(string)
		if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = now(), imagen_version = $2, imagen_hash = $3, imagen_origen = '/inscripcion · formulario', imagen_ip = $4 WHERE atleta_id = $1 AND imagen_at IS NULL`, aid, v, h, ip); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE inscripciones SET atleta_id = $2 WHERE id = $1`, iid, aid); err != nil {
		return err
	}
	codigo := ""
	if estado == "confirmado" {
		var err error
		if codigo, err = s.codigoReferido(ctx, tx, cid, aid, iid, datos); err != nil {
			return err
		}
	}
	if err := hist(ctx, tx, aid, map[string]string{"confirmado": "Inscripción propia confirmada", "reserva": "Inscripción en la lista de reserva"}[estado], pagos.Euros(total)); err != nil {
		return err
	}
	plantilla := map[string]string{"confirmado": "inscripcion-confirmada", "reserva": "inscripcion-reserva"}[estado]
	if err := email(ctx, tx, cid, mail, plantilla, map[string]string{"nombre": datos["nombre"], "total": pagos.Euros(total), "codigoReferido": codigo}); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "athletes.inscripcion_"+map[string]string{"confirmado": "pagada", "reserva": "reserva"}[estado],
		map[string]any{"id": iid, "atleta": aid, "total": total}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
}

// codigoReferido creates the athlete's code (NAME + licence digits, unique in the competition).
func (s *Svc) codigoReferido(ctx context.Context, tx pgx.Tx, cid, aid, iid uuid.UUID, datos map[string]string) (string, error) {
	var existing string
	if err := tx.QueryRow(ctx, `SELECT codigo FROM referido_codigos WHERE atleta_id = $1`, aid).Scan(&existing); err == nil {
		return existing, nil
	}
	base := normCodigo(datos["nombre"])
	if len(base) > 8 {
		base = base[:8]
	}
	if base == "" {
		base = "GR"
	}
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, datos["licencia"])
	if len(digits) > 3 {
		digits = digits[len(digits)-3:]
	}
	for i := 0; i < 50; i++ {
		code := base + digits
		if i > 0 || digits == "" {
			code = fmt.Sprintf("%s%d", base, 100+int(newID().ID()%900))
		}
		tag, err := tx.Exec(ctx, `INSERT INTO referido_codigos (id, competition_id, atleta_id, inscripcion_id, codigo) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, newID(), cid, aid, iid, code)
		if err != nil {
			return "", err
		}
		if tag.RowsAffected() == 1 {
			return code, nil
		}
	}
	return "", errors.New("no se pudo generar un código de referido")
}

// recompensaReferido records the referrer's reward for a paid invitee and returns the refund to run after commit.
func (s *Svc) recompensaReferido(ctx context.Context, tx pgx.Tx, cid, iid uuid.UUID) ([]func(), error) {
	var refID *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT referido_id FROM inscripciones WHERE id = $1`, iid).Scan(&refID); err != nil || refID == nil {
		return nil, err
	}
	cfg, err := s.config(ctx, tx, cid)
	if err != nil {
		return nil, err
	}
	var ajustes *ReferidosCfg
	var refIns *uuid.UUID
	var refAtleta uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT ajustes, inscripcion_id, atleta_id FROM referido_codigos WHERE id = $1 FOR UPDATE`, *refID).Scan(&ajustes, &refIns, &refAtleta); err != nil {
		return nil, err
	}
	rc := refRow{Ajustes: ajustes}.cfg(cfg.Referidos)
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) + 1 FROM referido_usos WHERE codigo_id = $1 AND estado <> 'anulada'`, *refID).Scan(&n); err != nil {
		return nil, err
	}
	reward := recompensa(rc, n)
	// The reward is refunded on the referrer's own payment, capped at what they paid minus what was refunded.
	var pagado, devuelto int
	var pago, prov string
	if refIns != nil {
		_ = tx.QueryRow(ctx, `SELECT total, devuelto, pago, proveedor FROM inscripciones WHERE id = $1 AND estado = 'pagada'`, *refIns).Scan(&pagado, &devuelto, &pago, &prov)
	}
	// Rewards still being refunded count against the cap (two invitees may pay at the same time).
	var pendiente int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(sum(recompensa), 0) FROM referido_usos WHERE codigo_id = $1 AND estado IN ('pendiente', 'fallida')`, *refID).Scan(&pendiente); err != nil {
		return nil, err
	}
	if room := pagado - devuelto - pendiente; reward > room {
		reward = max(0, room)
	}
	uid := newID()
	estado := "pendiente"
	if reward == 0 || pago == "" {
		estado, reward = "sin_devolucion", 0
	}
	if _, err := tx.Exec(ctx, `INSERT INTO referido_usos (id, codigo_id, inscripcion_id, recompensa, estado) VALUES ($1,$2,$3,$4,$5)`, uid, *refID, iid, reward, estado); err != nil {
		return nil, err
	}
	if estado != "pendiente" {
		return nil, nil
	}
	ins := *refIns
	return []func(){func() { s.devolverReferido(context.WithoutCancel(ctx), cid, uid, ins, refAtleta, pago, reward) }}, nil
}

func (s *Svc) devolverReferido(ctx context.Context, cid, uid, ins, atleta uuid.UUID, pago string, importe int) {
	var ref string
	err := errors.New("sin pasarela de pago")
	if prov := s.proveedor(ctx, cid); prov != nil {
		ref, err = prov.Refund(ctx, pago, importe, "referido")
	}
	if err != nil && s.sim != nil && strings.HasPrefix(pago, "sim_") {
		ref, err = s.sim.Refund(ctx, pago, importe, "referido")
	}
	_ = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if err != nil {
			s.a.Log.Error("devolución de referido", "err", err)
			_, e := tx.Exec(ctx, `UPDATE referido_usos SET estado = 'fallida', intentos = intentos + 1, siguiente_at = now() + make_interval(mins => power(2, intentos + 1)::int) WHERE id = $1`, uid)
			return e
		}
		if _, e := tx.Exec(ctx, `UPDATE referido_usos SET estado = 'devuelta', devolucion = $2, devuelto_at = now() WHERE id = $1`, uid, ref); e != nil {
			return e
		}
		if _, e := tx.Exec(ctx, `UPDATE inscripciones SET devuelto = devuelto + $2, updated_at = now() WHERE id = $1`, ins, importe); e != nil {
			return e
		}
		if _, e := tx.Exec(ctx, `INSERT INTO devoluciones (id, inscripcion_id, importe, motivo, detalle, ref, por) VALUES ($1,$2,$3,'referido','Recompensa por invitado',$4,'Sistema')`, newID(), ins, importe, ref); e != nil {
			return e
		}
		var mail, nombre string
		_ = tx.QueryRow(ctx, `SELECT email::text, nombre FROM atletas WHERE id = $1`, atleta).Scan(&mail, &nombre)
		if mail != "" {
			if e := email(ctx, tx, cid, mail, "referido-recompensa", map[string]string{"nombre": nombre, "importe": pagos.Euros(importe)}); e != nil {
				return e
			}
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.devolucion_referido", map[string]any{"inscripcion": ins, "importe": importe}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
}

// expirador cancels payments not completed within their hold (plus 5 minutes for late webhooks).
func (s *Svc) expirador(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if _, err := s.a.DB.Exec(ctx, `UPDATE inscripciones SET estado = 'cancelada', updated_at = now() WHERE estado = 'pendiente_pago' AND expira_at < now() - interval '5 minutes'`); err != nil && ctx.Err() == nil {
				s.a.Log.Warn("expirador de pagos", "err", err)
			}
			s.reintentarDevoluciones(ctx)
		}
	}
}

// reintentarDevoluciones retries failed referral refunds (2, 4, 8, 16 min… up to 5 attempts). The row is claimed
// by moving it back to «pendiente», so two replicas never refund the same reward.
func (s *Svc) reintentarDevoluciones(ctx context.Context) {
	rows, err := s.a.DB.Query(ctx, `UPDATE referido_usos u SET estado = 'pendiente' FROM referido_codigos c JOIN inscripciones i ON i.id = c.inscripcion_id
		WHERE u.codigo_id = c.id AND u.estado = 'fallida' AND u.intentos < 5 AND u.siguiente_at < now()
		RETURNING u.id, c.competition_id, i.id, c.atleta_id, i.pago, u.recompensa`)
	if err != nil {
		return
	}
	type job struct {
		uid, cid, ins, atleta uuid.UUID
		pago                  string
		importe               int
	}
	var jobs []job
	for rows.Next() {
		var j job
		if rows.Scan(&j.uid, &j.cid, &j.ins, &j.atleta, &j.pago, &j.importe) == nil {
			jobs = append(jobs, j)
		}
	}
	rows.Close()
	for _, j := range jobs {
		s.devolverReferido(ctx, j.cid, j.uid, j.ins, j.atleta, j.pago, j.importe)
	}
}

func provName(p pagos.Provider) string {
	if p == nil {
		return ""
	}
	return p.Name()
}

// ofrecerPlaza offers a free place to an own-mode reserve: the registration goes back to «pendiente_pago» with a
// 24-hour hold and the athlete gets the payment link by email. It reports false for AEP athletes (direct promotion)
// and for registrations already paid.
func (s *Svc) ofrecerPlaza(ctx context.Context, cid, aid uuid.UUID) (bool, error) {
	var origen string
	if err := s.a.DB.QueryRow(ctx, `SELECT origen FROM atletas WHERE competition_id = $1 AND id = $2`, cid, aid).Scan(&origen); err != nil || origen != "propia" {
		return false, nil
	}
	var iid uuid.UUID
	var estado, mail, nombre string
	var total int
	if err := s.a.DB.QueryRow(ctx, `SELECT id, estado, total, email::text, COALESCE(datos->>'nombre', '') FROM inscripciones WHERE competition_id = $1 AND atleta_id = $2 ORDER BY created_at DESC LIMIT 1`,
		cid, aid).Scan(&iid, &estado, &total, &mail, &nombre); err != nil {
		return false, nil
	}
	switch estado {
	case "pagada", "gratuita":
		return false, nil // already paid: a normal promotion
	case "pendiente_pago":
		return false, problem.Conflict("OFERTA_EN_CURSO", "Ya tiene un enlace de pago pendiente (caduca a las 24 h de enviarlo).")
	}
	if total == 0 {
		return true, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return s.confirmarPago(ctx, tx, cid, iid, pagos.Event{}) })
	}
	prov := s.proveedor(ctx, cid)
	if prov == nil {
		return false, problem.New(http.StatusServiceUnavailable, "PASARELA_NO_CONFIGURADA", "Los pagos no están activados: no se puede enviar el enlace de pago.")
	}
	exp := time.Now().Add(23*time.Hour + 50*time.Minute) // Stripe allows at most 24 h
	tag, err := s.a.DB.Exec(ctx, `UPDATE inscripciones SET estado = 'pendiente_pago', expira_at = $2, updated_at = now() WHERE id = $1 AND estado IN ('reserva', 'cancelada', 'fallida')`, iid, exp)
	if err != nil || tag.RowsAffected() == 0 {
		return false, problem.Conflict("OFERTA_EN_CURSO", "La inscripción ha cambiado mientras tanto. Recarga la ficha.")
	}
	co, err := prov.CreateCheckout(ctx, pagos.CheckoutIn{Amount: total, Description: "Inscripción · " + s.nombreComp(ctx, cid), Email: mail,
		SuccessURL: s.webURL + "/inscripcion/estado?id=" + iid.String(), CancelURL: s.webURL + "/inscripcion?cancelado=" + iid.String(),
		Metadata: map[string]string{"inscripcion": iid.String(), "competicion": cid.String(), "idempotencia": iid.String() + "-plaza"}, ExpiresAt: exp})
	if err != nil {
		_, _ = s.a.DB.Exec(ctx, `UPDATE inscripciones SET estado = 'reserva', expira_at = NULL WHERE id = $1`, iid)
		return false, problem.New(http.StatusServiceUnavailable, "PASARELA_NO_DISPONIBLE", "No hemos podido crear el enlace de pago. Inténtalo en unos minutos.")
	}
	return true, s.change(ctx, cid, "athletes.plaza_ofrecida", map[string]any{"id": aid}, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE inscripciones SET sesion = $2, proveedor = $3 WHERE id = $1`, iid, co.ID, prov.Name()); err != nil {
			return err
		}
		if err := email(ctx, tx, cid, mail, "inscripcion-plaza-libre", map[string]string{"nombre": nombre, "enlace": co.URL, "total": pagos.Euros(total)}); err != nil {
			return err
		}
		return hist(ctx, tx, aid, "Plaza ofrecida", "Enlace de pago enviado ("+pagos.Euros(total)+", caduca en 24 h)")
	})
}

package fans

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/fanauth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/passhash"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

var tagFans = []string{"Directo social"}

var rutaWeb = regexp.MustCompile(`^/[A-Za-z0-9/_.~?=&%-]*$`)

// nextValido keeps only a path of this web (never another host: //evil, /\\evil, https://…).
func nextValido(n string) string {
	if len(n) > 200 || !rutaWeb.MatchString(n) || strings.HasPrefix(n, "//") || strings.HasPrefix(n, "/acceso") {
		return ""
	}
	return n
}

// Yo is the fan session as the web sees it (GET /fans/yo and the redemption responses).
type Yo struct {
	ID       uuid.UUID `json:"id"`
	Alias    string    `json:"alias"`
	Tipo     string    `json:"tipo" enum:"atleta,publico"`
	AtletaID uuid.UUID `json:"atletaId,omitzero" doc:"Relleno cuando el email coincide con una inscripción"`
	Insignia string    `json:"insignia,omitempty" doc:"«Atleta» o vacío (público)"`
	Email    string    `json:"email" doc:"Email de la propia sesión (rellena formularios)"`
	Telefono string    `json:"telefono,omitempty" doc:"Teléfono opcional para los avisos por WhatsApp"`
	// Next is only set by the redemption of a magic link that was asked for with a destination.
	Next string `json:"next,omitempty" doc:"Ruta interna a la que volver tras entrar (p. ej. /fantasy/unirse/CODIGO)"`
	// RequiereContrasena is only set by a redemption: the web asks for the password (PUT /fans/yo/contrasena).
	RequiereContrasena bool `json:"requiereContrasena,omitempty" doc:"Tras canjear: falta fijar la contraseña"`
}

// sesionOut is a response that (re)issues the session cookie.
type sesionOut struct {
	SetCookie []http.Cookie `header:"Set-Cookie"`
	Body      Yo
}

func (s *Svc) yoDe(f fanRow) Yo {
	y := Yo{ID: f.ID, Alias: f.Alias, Tipo: f.Tipo, AtletaID: atletaOpcional(f), Email: f.Email, Telefono: f.Telefono}
	if f.Tipo == fanauth.TipoAtleta && f.AtletaID != uuid.Nil {
		y.Insignia = "Atleta"
	}
	return y
}

// sesion verifies the fan token (cookie `grcup_fan` or, for the load test, X-GrCup-Fan) and that it
// belongs to this competition.
func (s *Svc) sesion(ctx context.Context, cid uuid.UUID, cookie, header string) (fanauth.Fan, error) {
	tok := cookie
	if tok == "" {
		tok = header
	}
	f, err := s.verifier.Verify(ctx, tok)
	if err != nil {
		return fanauth.Fan{}, fanauth.Problem(err)
	}
	if f.CompetitionID != cid {
		return fanauth.Fan{}, fanauth.Problem(fanauth.ErrInvalid)
	}
	return f, nil
}

// cookie builds the grcup_fan cookie (maxAge < 0 deletes it).
func (s *Svc) cookie(tok string, maxAge int) *http.Cookie {
	return fanauth.SessionCookie(tok, maxAge, s.secure)
}

// firmar signs a fresh token for row with its current version.
func (s *Svc) firmar(row fanRow) (string, error) {
	return fanauth.Sign(s.verifier.Key, fanauth.Fan{ID: row.ID, CompetitionID: row.CompetitionID, Tipo: row.Tipo,
		Alias: row.Alias, AtletaID: atletaOpcional(row), Ver: row.Version, Verificado: true})
}

// SesionIn carries the fan token for huma (cookie; the header is the load-test alternative).
type SesionIn struct {
	Session string `cookie:"grcup_fan"`
	Header  string `header:"X-GrCup-Fan"`
}

type SlugIn struct {
	Slug string `path:"slug" pattern:"^[a-z0-9-]{2,41}$"`
}

func (s *Svc) registerPublic() {
	api := s.a.API
	base := "/api/competiciones/{slug}/fans"

	// ---- alta: pedir el enlace mágico ----
	type accesoIn struct {
		SlugIn
		Body struct {
			Email        string `json:"email" format:"email" maxLength:"254"`
			Tipo         string `json:"tipo" enum:"atleta,publico"`
			Alias        string `json:"alias,omitempty" maxLength:"20" doc:"Nombre público en el chat y las clasificaciones (obligatorio al crear la cuenta; vacío = enlace para crear o cambiar la contraseña)"`
			AceptaNormas bool   `json:"aceptaNormas" doc:"Debe ser true: normas de participación del directo"`
			Next         string `json:"next,omitempty" maxLength:"200" doc:"Ruta de la web a la que volver tras entrar (p. ej. /inscripcion?ref=…)"`
			Telefono     string `json:"telefono,omitempty" maxLength:"30" doc:"Opcional: móvil para recibir los avisos por WhatsApp"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-acceso", Method: http.MethodPost, Path: base + "/acceso",
		Summary: "Pedir el enlace mágico de acceso (siempre 202)", Tags: tagFans, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *accesoIn) (*struct{}, error) {
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if in.Body.Alias != "" && !in.Body.AceptaNormas { // creating the account; a password reset has no alias
				return nil, problem.Unprocessable("NORMAS_REQUERIDAS", "Debes aceptar las normas de participación para entrar al directo.")
			}
			alias := validarAlias(in.Body.Alias)
			if alias == "" && in.Body.Alias != "" {
				return nil, problem.Unprocessable("ALIAS_NO_VALIDO", "El alias debe tener entre 3 y 20 letras, números, espacios o _ . - , sin palabras prohibidas.")
			}
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			tel, ok := normTelefono(in.Body.Telefono)
			if !ok {
				return nil, problem.Unprocessable("TELEFONO_NO_VALIDO", "El teléfono no es válido. Escríbelo con prefijo, p. ej. +34 600 123 456, o déjalo vacío.")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "fans", "ip", httpx.ClientIPFrom(ctx)), limiteIP, time.Hour); !r.Allowed {
				return nil, demasiados(r, "Se han pedido muchos accesos desde tu red")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "fans", "email", emailHash(email)[:16]), limiteEmail, time.Hour); !r.Allowed {
				return nil, demasiados(r, "Ya hemos enviado varios enlaces a este email. Revisa tu bandeja (y la carpeta de spam)")
			}
			if in.Body.Tipo == fanauth.TipoAtleta {
				aid, err := s.atletas.porEmail(ctx, cid, email)
				if err != nil {
					s.a.Log.Warn("athletes por-email no disponible", "err", err)
					return nil, problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE", "No podemos verificar tu inscripción ahora mismo. Inténtalo en unos segundos.")
				}
				if aid == uuid.Nil {
					return nil, problem.Unprocessable("ATLETA_NO_ENCONTRADO", "No te hemos encontrado entre los atletas inscritos con ese email. Puedes entrar como público.")
				}
			}
			tok := randomToken()
			if err := s.a.DB.QueryRow(ctx, `INSERT INTO accesos (id, competition_id, token_hash, fan_email, email_hash, tipo, alias, ip, next, telefono, expires_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + interval '30 minutes') RETURNING created_at`,
				newID(), cid, hashToken(tok), email, emailHash(email), in.Body.Tipo, alias, ipAnon(httpx.ClientIPFrom(ctx)), nextValido(in.Body.Next), tel).Scan(new(time.Time)); err != nil {
				return nil, err
			}
			link := s.webURL + "/acceso?acceso=" + tok
			plantilla := "fans-acceso"
			if alias == "" {
				plantilla = "fans-acceso-contrasena"
			}
			if next := nextValido(in.Body.Next); next != "" {
				link += "&next=" + url.QueryEscape(next)
				switch {
				case strings.HasPrefix(next, "/inscripcion"):
					plantilla = "fans-acceso-inscripcion"
				case strings.HasPrefix(next, "/voluntarios"):
					plantilla = "fans-acceso-voluntarios"
				case strings.HasPrefix(next, "/clubs"):
					plantilla = "fans-acceso-clubs"
				}
			}
			if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				return emailSolicitado(ctx, tx, cid, email, plantilla, map[string]string{"alias": alias, "tipo": in.Body.Tipo, "enlace": link})
			}); err != nil {
				return nil, err
			}
			// Dev: messaging may not have the template yet; the link lands in the log (never the email) to test by hand.
			if s.a.Cfg.Env == "dev" {
				s.a.Log.Info("enlace mágico de fan (dev)", "alias", alias, "tipo", in.Body.Tipo, "enlace", link)
			}
			return nil, nil
		})

	// ---- canje: GET del enlace o POST con el token ----
	type canjeIn struct {
		SlugIn
		Token string `path:"token" minLength:"20" maxLength:"100"`
	}
	type canjeBodyIn struct {
		SlugIn
		Body struct {
			Token string `json:"token" minLength:"20" maxLength:"100"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-canjear-enlace", Method: http.MethodGet, Path: base + "/acceso/{token}",
		Summary: "Entrar con el enlace del email (crea o recupera la cuenta y pone la cookie)", Tags: tagFans},
		func(ctx context.Context, in *canjeIn) (*sesionOut, error) {
			return s.canjear(ctx, in.Slug, in.Token)
		})
	huma.Register(api, huma.Operation{OperationID: "fans-canjear", Method: http.MethodPost, Path: base + "/canjear",
		Summary: "Canjear el token del enlace (misma operación que el GET, para la web)", Tags: tagFans},
		func(ctx context.Context, in *canjeBodyIn) (*sesionOut, error) {
			return s.canjear(ctx, in.Slug, in.Body.Token)
		})

	// ---- entrar con email y contraseña ----
	type entrarIn struct {
		SlugIn
		Body struct {
			Email    string `json:"email" format:"email" maxLength:"254"`
			Password string `json:"password" minLength:"1" maxLength:"128"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-entrar", Method: http.MethodPost, Path: base + "/entrar",
		Summary: "Entrar con email y contraseña (error genérico: no dice si el email existe)", Tags: tagFans},
		func(ctx context.Context, in *entrarIn) (*sesionOut, error) {
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			// Same bounds as the team login (identity): 30 per IP / 10 min, 8 per email / 15 min.
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "fans", "entrar-ip", httpx.ClientIPFrom(ctx)), 30, 10*time.Minute); !r.Allowed {
				return nil, demasiados(r, "Demasiados intentos desde tu red")
			}
			if r, _ := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", "fans", "entrar-email", emailHash(email)[:16]), 8, 15*time.Minute); !r.Allowed {
				return nil, demasiados(r, "Demasiados intentos con este email")
			}
			var id uuid.UUID
			hash := ""
			err = s.a.DB.QueryRow(ctx, `SELECT id, password_hash FROM fans WHERE competition_id = $1 AND email_hash = $2`, cid, emailHash(email)).Scan(&id, &hash)
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
			if hash == "" { // unknown email or an older account without password: same work, same answer
				passhash.Check(passhash.Dummy, in.Body.Password)
				return nil, credencialesInvalidas()
			}
			if !passhash.Check(hash, in.Body.Password) {
				return nil, credencialesInvalidas()
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1`, id))
			if err != nil {
				return nil, err
			}
			if row.BaneadoHasta != nil && row.BaneadoHasta.After(time.Now()) {
				return nil, baneado(*row.BaneadoHasta)
			}
			t, err := s.firmar(row)
			if err != nil {
				return nil, err
			}
			return &sesionOut{SetCookie: []http.Cookie{*s.cookie(t, int(fanauth.TTL.Seconds()))}, Body: s.yoDe(row)}, nil
		})

	// ---- yo ----
	type yoIn struct {
		SesionIn
		SlugIn
	}
	type yoOut struct {
		Status    int
		SetCookie []http.Cookie `header:"Set-Cookie" doc:"Se re-emite a menos de 7 días de caducar; se borra (Max-Age=0) si la sesión no vale"`
		Body      Yo
	}
	huma.Register(api, huma.Operation{OperationID: "fans-yo", Method: http.MethodGet, Path: base + "/yo",
		Summary: "Mi cuenta de directo (204 sin sesión válida: visitante anónimo, sin 401 en la consola; borra la cookie caducada)", Tags: tagFans},
		func(ctx context.Context, in *yoIn) (*yoOut, error) {
			if in.Session == "" && in.Header == "" {
				return &yoOut{Status: http.StatusNoContent}, nil
			}
			// Expired/invalid/revoked session: anonymous visitor, and the dead cookie is cleared.
			anonimo := &yoOut{Status: http.StatusNoContent}
			if in.Session != "" {
				anonimo.SetCookie = []http.Cookie{*s.cookie("", -1)}
			}
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.sesion(ctx, cid, in.Session, in.Header)
			if err != nil {
				return anonimo, nil
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1 AND competition_id = $2`, f.ID, cid))
			if errors.Is(err, pgx.ErrNoRows) {
				return anonimo, nil
			} else if err != nil {
				return nil, err
			}
			if row.Version > f.Ver { // revoked while Redis was unreachable: fail closed now
				return anonimo, nil
			}
			o := &yoOut{Status: http.StatusOK, Body: s.yoDe(row)}
			// Re-issue while the session is in use so an active fan is never logged out mid-event.
			if time.Until(time.Unix(f.Exp, 0)) < reemision {
				if tok, err := s.firmar(row); err == nil {
					o.SetCookie = []http.Cookie{*s.cookie(tok, int(fanauth.TTL.Seconds()))}
				}
			}
			return o, nil
		})

	// ---- cambiar alias ----
	type aliasIn struct {
		SesionIn
		SlugIn
		Body struct {
			Alias string `json:"alias" minLength:"3" maxLength:"20"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-yo-alias", Method: http.MethodPatch, Path: base + "/yo",
		Summary: "Cambiar mi alias (la sesión se re-emite con el nuevo)", Tags: tagFans},
		func(ctx context.Context, in *aliasIn) (*sesionOut, error) {
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.sesion(ctx, cid, in.Session, in.Header)
			if err != nil {
				return nil, err
			}
			alias := validarAlias(in.Body.Alias)
			if alias == "" {
				return nil, problem.Unprocessable("ALIAS_NO_VALIDO", "El alias debe tener entre 3 y 20 letras, números, espacios o _ . - , sin palabras prohibidas.")
			}
			var n int
			if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM fans WHERE competition_id = $1 AND alias = $2 AND id <> $3`, cid, alias, f.ID).Scan(&n); err != nil {
				return nil, err
			}
			if n > 0 {
				return nil, aliasOcupado()
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, `UPDATE fans SET alias = $3, updated_at = now() WHERE id = $1 AND competition_id = $2
				RETURNING id, competition_id, email::text, tipo, alias::text, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), baneado_hasta, baneado_motivo, version, created_at, telefono`, f.ID, cid, alias))
			if err != nil {
				return nil, err
			}
			// The token carries the alias: raise the version so every older session (chat, ranking) dies with it.
			if row.Version, err = s.bumpVersion(ctx, row.ID); err != nil {
				return nil, err
			}
			tok, err := s.firmar(row)
			if err != nil {
				return nil, err
			}
			return &sesionOut{SetCookie: []http.Cookie{*s.cookie(tok, int(fanauth.TTL.Seconds()))}, Body: s.yoDe(row)}, nil
		})

	// ---- fijar la contraseña (tras canjear un enlace) ----
	type claveIn struct {
		SesionIn
		SlugIn
		Body struct {
			Password string `json:"password" minLength:"8" maxLength:"128"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "fans-yo-contrasena", Method: http.MethodPut, Path: base + "/yo/contrasena",
		Summary: "Fijar mi contraseña: si la cuenta no tiene, o en los 30 min tras canjear un enlace de «he olvidado mi contraseña»", Tags: tagFans},
		func(ctx context.Context, in *claveIn) (*sesionOut, error) {
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			f, err := s.sesion(ctx, cid, in.Session, in.Header)
			if err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE fans SET password_hash = $3, password_reset_hasta = NULL, updated_at = now()
				WHERE id = $1 AND competition_id = $2 AND (password_hash = '' OR password_reset_hasta > now())`, f.ID, cid, passhash.Hash(in.Body.Password))
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.Forbidden("Tu cuenta ya tiene contraseña. Para cambiarla pide un enlace con «¿Has olvidado tu contraseña?».")
			}
			row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1`, f.ID))
			if err != nil {
				return nil, err
			}
			// Every other session dies with the old password; this one is re-issued.
			if row.Version, err = s.bumpVersion(ctx, row.ID); err != nil {
				return nil, err
			}
			tok, err := s.firmar(row)
			if err != nil {
				return nil, err
			}
			return &sesionOut{SetCookie: []http.Cookie{*s.cookie(tok, int(fanauth.TTL.Seconds()))}, Body: s.yoDe(row)}, nil
		})

	// ---- salir ----
	type salirIn struct {
		SesionIn
		SlugIn
	}
	type salirOut struct {
		SetCookie []http.Cookie `header:"Set-Cookie"`
	}
	huma.Register(api, huma.Operation{OperationID: "fans-salir", Method: http.MethodPost, Path: base + "/salir",
		Summary: "Cerrar la sesión en este navegador y en todos (sube la versión)", Tags: tagFans, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *salirIn) (*salirOut, error) {
			cid, err := s.comps.ID(ctx, in.Slug)
			if err != nil {
				return nil, err
			}
			if f, err := s.sesion(ctx, cid, in.Session, in.Header); err == nil {
				if _, err := s.bumpVersion(ctx, f.ID); err != nil {
					s.a.Log.Warn("versión de fan al salir", "err", err)
				}
			}
			return &salirOut{SetCookie: []http.Cookie{*s.cookie("", -1)}}, nil
		})
}

func atletaOpcional(f fanRow) uuid.UUID {
	if f.Tipo == fanauth.TipoAtleta && f.AtletaID != uuid.Nil {
		return f.AtletaID
	}
	return uuid.Nil
}

// ipAnon keeps the /24 (IPv4) or /48 (IPv6) of the access request (same rule as the athlete area).
func ipAnon(ip string) string {
	p := net.ParseIP(ip)
	if p == nil {
		return ""
	}
	if v4 := p.To4(); v4 != nil {
		return fmt.Sprintf("%d.%d.%d.x", v4[0], v4[1], v4[2])
	}
	return p.Mask(net.CIDRMask(48, 128)).String() + "…"
}

// canjear consumes a magic link: creates the account on first use, recovers it afterwards, and sets the
// session cookie with the current version.
func (s *Svc) canjear(ctx context.Context, slug, tok string) (*sesionOut, error) {
	cid, err := s.comps.ID(ctx, slug)
	if err != nil {
		return nil, err
	}
	var acc struct {
		Email     string
		EmailHash string
		Tipo      string
		Alias     string
		Telefono  string
	}
	var next string
	err = s.a.DB.QueryRow(ctx, `UPDATE accesos SET usado_at = now() WHERE token_hash = $1 AND usado_at IS NULL AND expires_at > now()
		RETURNING fan_email::text, email_hash, tipo, alias::text, next, telefono`, hashToken(tok)).Scan(&acc.Email, &acc.EmailHash, &acc.Tipo, &acc.Alias, &next, &acc.Telefono)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, problem.Unauthorized("ENLACE_INVALIDO", "El enlace ha caducado o ya se usó. Pide otro desde el directo.")
	} else if err != nil {
		return nil, err
	}
	row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE competition_id = $1 AND email_hash = $2`, cid, acc.EmailHash))
	if errors.Is(err, pgx.ErrNoRows) {
		if acc.Alias == "" { // link to reset the password of an account that does not exist
			return nil, problem.Unprocessable("CUENTA_NO_ENCONTRADA", "No hay ninguna cuenta con ese email. Crea una cuenta desde «Crear cuenta».")
		}
		if row, err = s.crearFan(ctx, cid, acc); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if row.BaneadoHasta != nil && row.BaneadoHasta.After(time.Now()) {
		return nil, baneado(*row.BaneadoHasta)
	}
	// One redemption burns every other pending link of the email (an older one cannot be replayed later).
	if _, err := s.a.DB.Exec(ctx, `UPDATE accesos SET usado_at = now() WHERE competition_id = $1 AND email_hash = $2 AND usado_at IS NULL`, cid, acc.EmailHash); err != nil {
		return nil, err
	}
	// The link proved the email. The password is chosen AFTER it (PUT /fans/yo/contrasena), never with the
	// request: whoever asks for a link for someone else's email cannot plant a password. A reset link (no alias)
	// opens a 30-minute window to replace an existing password.
	var sinClave bool
	if err := s.a.DB.QueryRow(ctx, `UPDATE fans SET password_reset_hasta = CASE WHEN $3 THEN now() + interval '30 minutes' ELSE password_reset_hasta END
		WHERE id = $1 AND competition_id = $2 RETURNING password_hash = ''`, row.ID, cid, acc.Alias == "").Scan(&sinClave); err != nil {
		return nil, err
	}
	// Insignia de atleta: re-check on every redemption (covers late registration uploads and links
	// requested as público that turned out to belong to an athlete).
	if acc.Tipo == fanauth.TipoAtleta && (row.Tipo != fanauth.TipoAtleta || row.AtletaID == uuid.Nil) {
		if aid, err := s.atletas.porEmail(ctx, cid, acc.Email); err != nil {
			s.a.Log.Warn("athletes por-email no disponible", "err", err)
		} else if aid != uuid.Nil {
			if err := s.a.DB.QueryRow(ctx, `UPDATE fans SET tipo = 'atleta', atleta_id = $3, updated_at = now() WHERE id = $1 AND competition_id = $2 RETURNING version`,
				row.ID, cid, aid).Scan(&row.Version); err != nil {
				return nil, err
			}
			row.Tipo, row.AtletaID = fanauth.TipoAtleta, aid
		}
	}
	t, err := s.firmar(row)
	if err != nil {
		return nil, err
	}
	yo := s.yoDe(row)
	yo.Next = nextValido(next) // validated again on the way out
	yo.RequiereContrasena = sinClave || acc.Alias == ""
	return &sesionOut{SetCookie: []http.Cookie{*s.cookie(t, int(fanauth.TTL.Seconds()))}, Body: yo}, nil
}

// crearFan inserts the account of a first redemption; a concurrent redemption with the same alias (or the
// same email) falls back to the unique constraints of the table.
func (s *Svc) crearFan(ctx context.Context, cid uuid.UUID, acc struct {
	Email     string
	EmailHash string
	Tipo      string
	Alias     string
	Telefono  string
}) (fanRow, error) {
	id := newID()
	_, err := s.a.DB.Exec(ctx, `INSERT INTO fans (id, competition_id, email, email_hash, tipo, alias, telefono) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		id, cid, acc.Email, acc.EmailHash, acc.Tipo, acc.Alias, acc.Telefono)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		if strings.Contains(pg.ConstraintName, "alias") {
			return fanRow{}, aliasOcupado()
		}
		// Two links of the same email redeemed at once: recover the row the other one created.
		return scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE competition_id = $1 AND email_hash = $2`, cid, acc.EmailHash))
	}
	if err != nil {
		return fanRow{}, err
	}
	row, err := scanFan(s.a.DB.QueryRow(ctx, selFan+` WHERE id = $1`, id))
	if err == nil {
		s.bienvenida(ctx, row) // «Cuenta creada» (público o atleta); the 40-minute announcements come from the worker
	}
	return row, err
}

// demasiados answers 429 with Retry-After and the real wait in the message.
func demasiados(r ratelimit.Result, motivo string) error {
	seg := int(r.RetryAfter.Seconds()) + 1
	if seg < 1 {
		seg = 60
	}
	espera := "1 minuto"
	if m := (seg + 59) / 60; m > 1 {
		espera = strconv.Itoa(m) + " minutos"
	}
	return huma.ErrorWithHeaders(problem.TooMany(motivo+". Podrás volver a intentarlo en "+espera+"."),
		http.Header{"Retry-After": []string{strconv.Itoa(seg)}})
}

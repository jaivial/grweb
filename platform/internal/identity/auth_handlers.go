package identity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/ratelimit"
)

const refreshCookie = "gr_rt"

var tagAuth = []string{"Acceso"}

type rolRef struct {
	Slug   string `json:"slug"`
	Nombre string `json:"nombre"`
}

type membresiaMe struct {
	CompetitionID string   `json:"competitionId"`
	Rol           rolRef   `json:"rol"`
	Permisos      []string `json:"permisos"`
}

type usuarioMe struct {
	ID            uuid.UUID     `json:"id"`
	Email         string        `json:"email"`
	Nombre        string        `json:"nombre"`
	Root          bool          `json:"root"`
	Competiciones []membresiaMe `json:"competiciones"`
}

type sesionBody struct {
	AccessToken  string    `json:"accessToken"`
	TokenType    string    `json:"tokenType"`
	ExpiresAt    time.Time `json:"expiresAt"`
	RefreshToken string    `json:"refreshToken,omitempty" doc:"Solo clientes CLI: la web lo recibe en una cookie httpOnly"`
	Usuario      usuarioMe `json:"usuario"`
}

type sesionOut struct {
	SetCookie []http.Cookie `header:"Set-Cookie"`
	Body      sesionBody
}

type emptyOut struct {
	SetCookie []http.Cookie `header:"Set-Cookie"`
}

func (s *Svc) me(ctx context.Context, u usuario) (usuarioMe, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT m.competition_id, r.slug, r.nombre, r.permisos FROM membresias m JOIN roles r ON r.id = m.rol_id
		WHERE m.usuario_id = $1 AND m.estado = 'activo' ORDER BY m.created_at`, u.ID)
	if err != nil {
		return usuarioMe{}, err
	}
	defer rows.Close()
	out := usuarioMe{ID: u.ID, Email: u.Email, Nombre: u.Nombre, Root: u.Root, Competiciones: []membresiaMe{}}
	for rows.Next() {
		var m membresiaMe
		var cid uuid.UUID
		var perms []string
		if err := rows.Scan(&cid, &m.Rol.Slug, &m.Rol.Nombre, &perms); err != nil {
			return usuarioMe{}, err
		}
		m.CompetitionID, m.Permisos = cid.String(), auth.Expand(perms)
		out.Competiciones = append(out.Competiciones, m)
	}
	return out, rows.Err()
}

func (s *Svc) cookie(value string, maxAge int) http.Cookie {
	return http.Cookie{Name: refreshCookie, Value: value, Path: "/api/auth", HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: maxAge}
}

// sessionOut returns the refresh token in a cookie (web) or in the body (cli).
func (s *Svc) sessionOut(ctx context.Context, u usuario, tp tokenPair, cliente string) (*sesionOut, error) {
	me, err := s.me(ctx, u)
	if err != nil {
		return nil, err
	}
	out := &sesionOut{Body: sesionBody{AccessToken: tp.Access, TokenType: "Bearer", ExpiresAt: tp.ExpiresAt, Usuario: me}}
	if tp.Refresh == "" {
		return out, nil // grace refresh: keep the refresh token the client already has
	}
	if cliente == "cli" {
		out.Body.RefreshToken = tp.Refresh
	} else {
		out.SetCookie = []http.Cookie{s.cookie(tp.Refresh, int(s.cfg.RefreshTTL.Seconds()))}
	}
	return out, nil
}

func (s *Svc) limit(ctx context.Context, key string, n int64, window time.Duration) error {
	r, err := ratelimit.Allow(ctx, s.a.Redis, s.a.Keys.Of("rl", key), n, window)
	if err != nil {
		s.a.Log.Warn("ratelimit", "err", err)
	}
	if !r.Allowed {
		return problem.TooMany("Demasiados intentos. Espera unos minutos y vuelve a probar.")
	}
	return nil
}

// emailKey hashes an email for Redis key names (no personal data in the shared Redis keyspace).
func emailKey(email string) string {
	sum := sha256.Sum256([]byte(email))
	return hex.EncodeToString(sum[:12])
}

func origin(cliente string) string {
	if cliente == "cli" {
		return "cli"
	}
	return "web"
}

// requestEmail enqueues an email for the messaging service (template + variables, never secrets in logs).
func requestEmail(ctx context.Context, tx pgx.Tx, to, template string, vars map[string]string) error {
	return events.Enqueue(ctx, tx, events.New(ctx, "identity.email_solicitado",
		map[string]any{"para": to, "plantilla": template, "vars": vars}, events.Audience(events.Internal)))
}

func (s *Svc) registerAuth() {
	api := s.a.API
	s.a.Mux.HandleFunc("GET /.well-known/jwks.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/jwk-set+json")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_, _ = w.Write(s.signer.JWKS())
	})

	type loginIn struct {
		UserAgent string `header:"User-Agent"`
		Body      struct {
			Email    string `json:"email" format:"email" maxLength:"254"`
			Password string `json:"password" minLength:"1" maxLength:"256"`
			Cliente  string `json:"cliente,omitempty" enum:"web,cli" default:"web" doc:"cli devuelve el refresh token en el cuerpo"`
			Recordar *bool  `json:"recordar,omitempty" doc:"false: la cookie de sesión se borra al cerrar el navegador (web)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-login", Method: http.MethodPost, Path: "/api/auth/login", Summary: "Iniciar sesión con email y contraseña", Tags: tagAuth},
		func(ctx context.Context, in *loginIn) (*sesionOut, error) {
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if err := s.limit(ctx, "login:ip:"+httpx.ClientIPFrom(ctx), 30, 10*time.Minute); err != nil {
				return nil, err
			}
			if err := s.limit(ctx, "login:email:"+emailKey(email), 8, 15*time.Minute); err != nil {
				return nil, err
			}
			u, err := getUsuario(ctx, s.a.DB, "email", email)
			ok := err == nil && u.PasswordHash != nil && checkPassword(*u.PasswordHash, in.Body.Password)
			if err != nil {
				checkPassword(dummyHash, in.Body.Password)
			}
			if !ok {
				return nil, problem.Unauthorized("CREDENCIALES_INVALIDAS", "Email o contraseña incorrectos.")
			}
			if u.Estado != "activo" {
				return nil, problem.Forbidden("Tu cuenta está suspendida. Habla con un administrador.")
			}
			ratelimit.Reset(ctx, s.a.Redis, s.a.Keys.Of("rl", "login:email:"+emailKey(email)))
			tp, err := s.startSession(ctx, u, origin(in.Body.Cliente), in.UserAgent, httpx.ClientIPFrom(ctx))
			if err != nil {
				return nil, err
			}
			out, err := s.sessionOut(ctx, u, tp, in.Body.Cliente)
			if err == nil && in.Body.Recordar != nil && !*in.Body.Recordar {
				for i := range out.SetCookie {
					out.SetCookie[i].MaxAge = 0 // session cookie: gone when the browser closes
				}
			}
			return out, err
		})

	type refreshIn struct {
		Cookie string `cookie:"gr_rt"`
		Body   *struct {
			RefreshToken string `json:"refreshToken,omitempty"`
		} `required:"false"`
	}
	huma.Register(api, huma.Operation{OperationID: "auth-refresh", Method: http.MethodPost, Path: "/api/auth/refresh", Summary: "Renovar el token de acceso (rota el refresh token)", Tags: tagAuth},
		func(ctx context.Context, in *refreshIn) (*sesionOut, error) {
			cliente, refresh := "web", in.Cookie
			if in.Body != nil && in.Body.RefreshToken != "" {
				cliente, refresh = "cli", in.Body.RefreshToken
			}
			tp, u, err := s.rotate(ctx, refresh)
			if err != nil {
				return nil, err
			}
			return s.sessionOut(ctx, u, tp, cliente)
		})

	huma.Register(api, huma.Operation{OperationID: "auth-logout", Method: http.MethodPost, Path: "/api/auth/logout", Summary: "Cerrar la sesión actual", Tags: tagAuth, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *refreshIn) (*emptyOut, error) {
			refresh := in.Cookie
			if in.Body != nil && in.Body.RefreshToken != "" {
				refresh = in.Body.RefreshToken
			}
			// Only a valid secret (or the caller's own access token) can end a session: session ids are not secrets.
			if sid, ok := s.sessionFor(ctx, refresh); ok {
				s.revokeSession(ctx, sid)
			} else if p, ok := auth.FromContext(ctx); ok && p.SID != "" {
				if sid, err := uuid.Parse(p.SID); err == nil {
					s.revokeSession(ctx, sid)
				}
			}
			return &emptyOut{SetCookie: []http.Cookie{s.cookie("", -1)}}, nil
		})

	type meOut struct{ Body usuarioMe }
	huma.Register(api, huma.Operation{OperationID: "auth-me", Method: http.MethodGet, Path: "/api/auth/me", Summary: "Usuario actual, competiciones y permisos", Tags: tagAuth, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*meOut, error) {
			p, err := auth.User(ctx)
			if err != nil {
				return nil, err
			}
			if p.IsService() {
				return nil, problem.Forbidden("Endpoint de usuario.")
			}
			u, err := getUsuario(ctx, s.a.DB, "id", p.UserID)
			if err != nil {
				return nil, problem.Unauthorized("TOKEN_INVALIDO", "El usuario ya no existe.")
			}
			me, err := s.me(ctx, u)
			return &meOut{Body: me}, err
		})

	type pwIn struct {
		Body struct {
			Actual string `json:"actual" minLength:"1"`
			Nueva  string `json:"nueva" minLength:"10" maxLength:"256"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-password", Method: http.MethodPost, Path: "/api/auth/password", Summary: "Cambiar mi contraseña (cierra el resto de sesiones)", Tags: tagAuth, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *pwIn) (*struct{}, error) {
			p, err := auth.User(ctx)
			if err != nil {
				return nil, err
			}
			u, err := getUsuario(ctx, s.a.DB, "id", p.UserID)
			if err != nil || u.PasswordHash == nil || !checkPassword(*u.PasswordHash, in.Body.Actual) {
				return nil, problem.Unauthorized("CREDENCIALES_INVALIDAS", "La contraseña actual no es correcta.")
			}
			if err := validPassword(in.Body.Nueva); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `UPDATE usuarios SET password_hash = $2, updated_at = now(), version = version + 1 WHERE id = $1`, u.ID, hashPassword(in.Body.Nueva)); err != nil {
				return nil, err
			}
			rows, _ := s.a.DB.Query(ctx, `SELECT id FROM sesiones WHERE usuario_id = $1 AND revoked_at IS NULL AND id::text <> $2`, u.ID, p.SID)
			ids, _ := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
			for _, id := range ids {
				s.revokeSession(ctx, id)
			}
			return nil, nil
		})

	// ---- magic link ----
	type magicIn struct {
		Body struct {
			Email     string `json:"email" format:"email" maxLength:"254"`
			Siguiente string `json:"siguiente,omitempty" maxLength:"300" doc:"Ruta del backoffice a la que volver"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-magic-link", Method: http.MethodPost, Path: "/api/auth/magic-link", Summary: "Enviar un enlace de acceso por email (responde 202 siempre)", Tags: tagAuth, DefaultStatus: http.StatusAccepted},
		func(ctx context.Context, in *magicIn) (*struct{}, error) {
			email := strings.ToLower(strings.TrimSpace(in.Body.Email))
			if err := s.limit(ctx, "magic:"+emailKey(email), 3, 15*time.Minute); err != nil {
				return nil, err
			}
			u, err := getUsuario(ctx, s.a.DB, "email", email)
			if err != nil || u.Estado != "activo" {
				return nil, nil // no user enumeration
			}
			tok := randomToken(32)
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO enlaces_magicos (id, usuario_id, token_hash, siguiente, expires_at) VALUES ($1,$2,$3,$4,$5)`,
					uuid.Must(uuid.NewV7()), u.ID, hashToken(tok), safeNext(in.Body.Siguiente), time.Now().Add(15*time.Minute)); err != nil {
					return err
				}
				return requestEmail(ctx, tx, u.Email, "acceso-enlace-magico", map[string]string{"nombre": u.Nombre, "url": s.cfg.BOURL + "/api/auth/magic/" + tok})
			})
			return nil, err
		})

	type magicUseIn struct {
		Token     string `path:"token"`
		UserAgent string `header:"User-Agent"`
	}
	type redirectOut struct {
		Status    int
		Location  string        `header:"Location"`
		SetCookie []http.Cookie `header:"Set-Cookie"`
	}
	huma.Register(api, huma.Operation{OperationID: "auth-magic-use", Method: http.MethodGet, Path: "/api/auth/magic/{token}", Summary: "Usar un enlace mágico (redirige al backoffice con la sesión iniciada)", Tags: tagAuth, DefaultStatus: http.StatusFound},
		func(ctx context.Context, in *magicUseIn) (*redirectOut, error) {
			var uid uuid.UUID
			var next string
			err := s.a.DB.QueryRow(ctx, `UPDATE enlaces_magicos SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING usuario_id, siguiente`, hashToken(in.Token)).Scan(&uid, &next)
			if err != nil {
				return &redirectOut{Status: http.StatusFound, Location: s.cfg.BOURL + "/login?error=enlace-caducado"}, nil
			}
			u, err := getUsuario(ctx, s.a.DB, "id", uid)
			if err != nil || u.Estado != "activo" {
				return &redirectOut{Status: http.StatusFound, Location: s.cfg.BOURL + "/login?error=cuenta"}, nil
			}
			tp, err := s.startSession(ctx, u, "web", in.UserAgent, httpx.ClientIPFrom(ctx))
			if err != nil {
				return nil, err
			}
			if next == "" {
				next = "/"
			}
			return &redirectOut{Status: http.StatusFound, Location: s.cfg.BOURL + next, SetCookie: []http.Cookie{s.cookie(tp.Refresh, int(s.cfg.RefreshTTL.Seconds()))}}, nil
		})

	s.registerDevice()
	s.registerInvitationAccept()
}

// safeNext only allows relative backoffice paths.
func safeNext(n string) string {
	if n == "" || !strings.HasPrefix(n, "/") || strings.HasPrefix(n, "//") {
		return ""
	}
	if u, err := url.Parse(n); err != nil || u.Host != "" {
		return ""
	}
	return n
}

var bearer = []map[string][]string{{"bearer": {}}}

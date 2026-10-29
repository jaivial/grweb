package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/argon2"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

type usuario struct {
	ID           uuid.UUID  `db:"id" json:"id"`
	Email        string     `db:"email" json:"email"`
	Nombre       string     `db:"nombre" json:"nombre"`
	PasswordHash *string    `db:"password_hash" json:"-"`
	Root         bool       `db:"root" json:"root"`
	Estado       string     `db:"estado" json:"estado"`
	UltimoAcceso *time.Time `db:"ultimo_acceso" json:"ultimoAcceso,omitempty"`
	CreatedAt    time.Time  `db:"created_at" json:"createdAt"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updatedAt"`
	Version      int        `db:"version" json:"version"`
}

const selUsuario = `id, email, nombre, password_hash, root, estado, ultimo_acceso, created_at, updated_at, version`

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func getUsuario(ctx context.Context, q querier, where string, arg any) (usuario, error) {
	rows, err := q.Query(ctx, `SELECT `+selUsuario+` FROM usuarios WHERE `+where+` = $1`, arg)
	if err != nil {
		return usuario{}, err
	}
	return pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[usuario])
}

// ---- secrets ----

var b64 = base64.RawURLEncoding

func randomToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b64.EncodeToString(b)
}

func hashToken(t string) []byte { s := sha256.Sum256([]byte(t)); return s[:] }

// userCode is the short code shown by the CLI (RFC 8628), without ambiguous characters.
func userCode() string {
	const alphabet = "BCDFGHJKLMNPQRSTVWXZ"
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	out := make([]byte, 0, 9)
	for i, c := range b {
		if i == 4 {
			out = append(out, '-')
		}
		out = append(out, alphabet[int(c)%len(alphabet)])
	}
	return string(out)
}

// argon2id with OWASP parameters (m=19 MiB, t=2, p=1), PHC string.
func hashPassword(pw string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(pw), salt, 2, 19*1024, 1, 32)
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s", b64.EncodeToString(salt), b64.EncodeToString(key))
}

func checkPassword(hash, pw string) bool {
	var m, t uint32
	var p uint8
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err1 := b64.DecodeString(parts[4])
	want, err2 := b64.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// dummyHash keeps login timing similar for unknown emails.
var dummyHash = hashPassword(randomToken(16))

func validPassword(pw string) error {
	if len([]rune(pw)) < 10 {
		return problem.Unprocessable("CONTRASENA_DEBIL", "La contraseña debe tener al menos 10 caracteres.")
	}
	return nil
}

// ---- permissions ----

// permsFor returns competition id → expanded permissions for the user's active memberships.
func (s *Svc) permsFor(ctx context.Context, uid uuid.UUID) (map[string][]string, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT m.competition_id, r.permisos FROM membresias m JOIN roles r ON r.id = m.rol_id
		WHERE m.usuario_id = $1 AND m.estado = 'activo'`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var cid uuid.UUID
		var perms []string
		if err := rows.Scan(&cid, &perms); err != nil {
			return nil, err
		}
		out[cid.String()] = auth.Expand(perms)
	}
	return out, rows.Err()
}

// ---- sessions & tokens ----

type tokenPair struct {
	Access    string
	ExpiresAt time.Time
	Refresh   string // "<session id>.<secret>"
	SessionID uuid.UUID
}

func (s *Svc) mintAccess(ctx context.Context, u usuario, sid, origin string, comp map[string][]string) (string, time.Time, error) {
	if comp == nil {
		var err error
		if comp, err = s.permsFor(ctx, u.ID); err != nil {
			return "", time.Time{}, err
		}
	}
	now := time.Now()
	exp := now.Add(s.cfg.AccessTTL)
	tok, err := s.signer.Sign(auth.Claims{
		Typ: auth.TypAccess, Name: u.Nombre, Email: u.Email, Root: u.Root, Comp: comp, SID: sid, Origin: origin,
		RegisteredClaims: jwt.RegisteredClaims{Subject: u.ID.String(), ID: uuid.NewString(), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(exp)},
	})
	return tok, exp, err
}

// startSession creates a session and its first token pair.
func (s *Svc) startSession(ctx context.Context, u usuario, origin, ua, ip string) (tokenPair, error) {
	sid := uuid.Must(uuid.NewV7())
	secret := randomToken(32)
	_, err := s.a.DB.Exec(ctx, `INSERT INTO sesiones (id, usuario_id, refresh_hash, origen, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		sid, u.ID, hashToken(secret), origin, truncate(ua, 300), ip, time.Now().Add(s.cfg.RefreshTTL))
	if err != nil {
		return tokenPair{}, err
	}
	_, _ = s.a.DB.Exec(ctx, `UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, u.ID)
	access, exp, err := s.mintAccess(ctx, u, sid.String(), origin, nil)
	if err != nil {
		return tokenPair{}, err
	}
	return tokenPair{Access: access, ExpiresAt: exp, Refresh: sid.String() + "." + secret, SessionID: sid}, nil
}

var errSesion = problem.Unauthorized("SESION_CADUCADA", "Tu sesión ha caducado. Vuelve a iniciar sesión.")

// rotate validates a refresh token and rotates its secret. Reusing an old secret revokes the session.
func (s *Svc) rotate(ctx context.Context, refresh string) (tokenPair, usuario, error) {
	sidStr, secret, ok := strings.Cut(refresh, ".")
	sid, err := uuid.Parse(sidStr)
	if !ok || err != nil || secret == "" {
		return tokenPair{}, usuario{}, errSesion
	}
	var uid uuid.UUID
	var hash []byte
	var origin string
	var revoked *time.Time
	var expires time.Time
	err = s.a.DB.QueryRow(ctx, `SELECT usuario_id, refresh_hash, origen, revoked_at, expires_at FROM sesiones WHERE id = $1`, sid).Scan(&uid, &hash, &origin, &revoked, &expires)
	if err != nil {
		return tokenPair{}, usuario{}, errSesion
	}
	if revoked != nil || time.Now().After(expires) {
		return tokenPair{}, usuario{}, errSesion
	}
	if subtle.ConstantTimeCompare(hash, hashToken(secret)) != 1 {
		s.revokeSession(ctx, sid)
		return tokenPair{}, usuario{}, problem.Unauthorized("SESION_REUTILIZADA", "Se detectó un uso repetido de la sesión y se ha cerrado por seguridad.")
	}
	u, err := getUsuario(ctx, s.a.DB, "id", uid)
	if err != nil || u.Estado != "activo" {
		return tokenPair{}, usuario{}, errSesion
	}
	newSecret := randomToken(32)
	if _, err := s.a.DB.Exec(ctx, `UPDATE sesiones SET refresh_hash = $2, last_used_at = now(), expires_at = $3 WHERE id = $1`, sid, hashToken(newSecret), time.Now().Add(s.cfg.RefreshTTL)); err != nil {
		return tokenPair{}, usuario{}, err
	}
	_, _ = s.a.DB.Exec(ctx, `UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, uid)
	access, exp, err := s.mintAccess(ctx, u, sid.String(), origin, nil)
	if err != nil {
		return tokenPair{}, usuario{}, err
	}
	return tokenPair{Access: access, ExpiresAt: exp, Refresh: sid.String() + "." + newSecret, SessionID: sid}, u, nil
}

// revokeSession revokes a session and blocks its live access tokens until they expire.
func (s *Svc) revokeSession(ctx context.Context, sid uuid.UUID) {
	_, _ = s.a.DB.Exec(ctx, `UPDATE sesiones SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, sid)
	_ = s.a.Redis.Set(ctx, s.a.Keys.Of("revoked", "sid", sid.String()), "1", s.cfg.AccessTTL+time.Minute).Err()
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func isNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

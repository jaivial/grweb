package identity

import (
	"context"
	"crypto/pbkdf2"
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

// argonSlots bounds concurrent argon2id runs: each one allocates 19 MiB, so a login burst cannot exhaust
// the pod's memory (the container limit and GOMEMLIMIT are sized for this bound).
var argonSlots = make(chan struct{}, 4)

func argonKey(pw, salt []byte, t, m uint32, p uint8, n uint32) []byte {
	argonSlots <- struct{}{}
	defer func() { <-argonSlots }()
	return argon2.IDKey(pw, salt, t, m, p, n)
}

// argon2id with OWASP parameters (m=19 MiB, t=2, p=1), PHC string.
func hashPassword(pw string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argonKey([]byte(pw), salt, 2, 19*1024, 1, 32)
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s", b64.EncodeToString(salt), b64.EncodeToString(key))
}

func checkPassword(hash, pw string) bool {
	var m, t uint32
	var p uint8
	parts := strings.Split(hash, "$")
	if len(parts) == 5 && parts[1] == legacyScheme {
		return checkLegacy(parts, pw)
	}
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
	got := argonKey([]byte(pw), salt, t, m, p, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// legacyScheme marks a password hash imported from the previous web (step 16): ASP.NET KeyDerivation.Pbkdf2 with
// HMAC-SHA256, 100 000 iterations, 16-byte salt and 32-byte key, stored there as «salt:key» in standard base64.
// The first login with it replaces the hash with argon2id (needsRehash), so users keep their password.
const legacyScheme = "pbkdf2-sha256"

// legacyHash converts the old «salt:key» to «$pbkdf2-sha256$i=100000$salt$key» ("" if it is not that format).
func legacyHash(old string) string {
	salt, key, ok := strings.Cut(strings.TrimSpace(old), ":")
	s, err1 := base64.StdEncoding.DecodeString(salt)
	k, err2 := base64.StdEncoding.DecodeString(key)
	if !ok || err1 != nil || err2 != nil || len(s) < 8 || len(k) != 32 {
		return ""
	}
	return fmt.Sprintf("$%s$i=100000$%s$%s", legacyScheme, salt, key)
}

func checkLegacy(parts []string, pw string) bool {
	var iter int
	if _, err := fmt.Sscanf(parts[2], "i=%d", &iter); err != nil || iter < 10000 || iter > 1000000 {
		return false
	}
	salt, err1 := base64.StdEncoding.DecodeString(parts[3])
	want, err2 := base64.StdEncoding.DecodeString(parts[4])
	if err1 != nil || err2 != nil {
		return false
	}
	argonSlots <- struct{}{} // same concurrency bound as argon2id
	got, err := pbkdf2.Key(sha256.New, pw, salt, iter, len(want))
	<-argonSlots
	return err == nil && subtle.ConstantTimeCompare(got, want) == 1
}

// needsRehash says whether a verified hash should be replaced with argon2id.
func needsRehash(hash string) bool { return strings.HasPrefix(hash, "$"+legacyScheme+"$") }

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

// refreshGrace is how long the previous refresh secret stays valid after a rotation, so concurrent
// refreshes from several tabs (shared cookie) do not look like token reuse.
const refreshGrace = 30 * time.Second

type sesionRow struct {
	uid       uuid.UUID
	hash      []byte
	prev      []byte
	rotatedAt *time.Time
	origin    string
	revoked   *time.Time
	expires   time.Time
}

// secretState classifies a presented refresh secret: "current", "grace" (previous one, within the window) or "" (reuse/invalid).
func (r sesionRow) secretState(secret string) string {
	h := hashToken(secret)
	if subtle.ConstantTimeCompare(r.hash, h) == 1 {
		return "current"
	}
	if r.prev != nil && r.rotatedAt != nil && time.Since(*r.rotatedAt) < refreshGrace && subtle.ConstantTimeCompare(r.prev, h) == 1 {
		return "grace"
	}
	return ""
}

func (s *Svc) loadSession(ctx context.Context, refresh string) (uuid.UUID, string, sesionRow, bool) {
	sidStr, secret, ok := strings.Cut(refresh, ".")
	sid, err := uuid.Parse(sidStr)
	if !ok || err != nil || secret == "" {
		return uuid.Nil, "", sesionRow{}, false
	}
	var r sesionRow
	err = s.a.DB.QueryRow(ctx, `SELECT usuario_id, refresh_hash, prev_hash, rotated_at, origen, revoked_at, expires_at FROM sesiones WHERE id = $1`, sid).
		Scan(&r.uid, &r.hash, &r.prev, &r.rotatedAt, &r.origin, &r.revoked, &r.expires)
	if err != nil {
		return uuid.Nil, "", sesionRow{}, false
	}
	return sid, secret, r, true
}

// rotate validates a refresh token and rotates its secret. Within the grace window the previous secret
// only gets a new access token (Refresh is empty: the client keeps the cookie set by the winning request).
// Any other mismatch is treated as reuse and revokes the session.
func (s *Svc) rotate(ctx context.Context, refresh string) (tokenPair, usuario, error) {
	sid, secret, r, ok := s.loadSession(ctx, refresh)
	if !ok || r.revoked != nil || time.Now().After(r.expires) {
		return tokenPair{}, usuario{}, errSesion
	}
	state := r.secretState(secret)
	if state == "" {
		s.revokeSession(ctx, sid)
		return tokenPair{}, usuario{}, problem.Unauthorized("SESION_REUTILIZADA", "Se detectó un uso repetido de la sesión y se ha cerrado por seguridad.")
	}
	u, err := getUsuario(ctx, s.a.DB, "id", r.uid)
	if err != nil || u.Estado != "activo" {
		return tokenPair{}, usuario{}, errSesion
	}
	newRefresh := ""
	if state == "current" {
		newSecret := randomToken(32)
		// Optimistic rotation: if a concurrent request rotated first, this one falls back to the grace path.
		tag, err := s.a.DB.Exec(ctx, `UPDATE sesiones SET prev_hash = refresh_hash, refresh_hash = $3, rotated_at = now(), last_used_at = now(), expires_at = $4
			WHERE id = $1 AND refresh_hash = $2`, sid, r.hash, hashToken(newSecret), time.Now().Add(s.cfg.RefreshTTL))
		if err != nil {
			return tokenPair{}, usuario{}, err
		}
		if tag.RowsAffected() == 1 {
			newRefresh = sid.String() + "." + newSecret
		}
	}
	_, _ = s.a.DB.Exec(ctx, `UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, r.uid)
	access, exp, err := s.mintAccess(ctx, u, sid.String(), r.origin, nil)
	if err != nil {
		return tokenPair{}, usuario{}, err
	}
	return tokenPair{Access: access, ExpiresAt: exp, Refresh: newRefresh, SessionID: sid}, u, nil
}

// sessionFor returns the session id of a refresh token whose secret is valid (current or within grace).
func (s *Svc) sessionFor(ctx context.Context, refresh string) (uuid.UUID, bool) {
	sid, secret, r, ok := s.loadSession(ctx, refresh)
	if !ok || r.secretState(secret) == "" {
		return uuid.Nil, false
	}
	return sid, true
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

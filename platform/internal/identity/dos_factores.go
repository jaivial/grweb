package identity

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Two-step verification with TOTP (RFC 6238: SHA-1, 6 digits, 30 s), as Google Authenticator, 1Password…

const (
	totpStep    = 30
	totpIssuer  = "GR Cup"
	nRecuperar  = 8
	codeAttempt = 5 // wrong codes per user per 5 minutes
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

var (
	errSegundoFactor = problem.Unauthorized("SEGUNDO_FACTOR_REQUERIDO", "Escribe el código de 6 cifras de tu app de verificación.")
	errCodigo        = problem.Unauthorized("CODIGO_INVALIDO", "El código no es correcto o ha caducado. Prueba con el siguiente.")
)

func totpAt(secret []byte, step int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	m := hmac.New(sha1.New, secret)
	m.Write(msg[:])
	h := m.Sum(nil)
	o := h[len(h)-1] & 0x0f
	v := binary.BigEndian.Uint32(h[o:o+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", v%1_000_000)
}

// totpMatch returns the matching time step (±1 for clock drift) or -1.
func totpMatch(secret []byte, code string, now time.Time) int64 {
	cur := now.Unix() / totpStep
	for _, st := range []int64{cur, cur - 1, cur + 1} {
		if subtle.ConstantTimeCompare([]byte(totpAt(secret, st)), []byte(code)) == 1 {
			return st
		}
	}
	return -1
}

// seal / open encrypt the TOTP secret at rest (AES-256-GCM, key derived from TOTP_KEY or the signing key).
func (s *Svc) seal(plain []byte) ([]byte, error) {
	g, err := s.gcm()
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, g.NonceSize())
	_, _ = rand.Read(nonce)
	return g.Seal(nonce, nonce, plain, nil), nil
}

func (s *Svc) open(box []byte) ([]byte, error) {
	g, err := s.gcm()
	if err != nil {
		return nil, err
	}
	if len(box) < g.NonceSize() {
		return nil, errors.New("totp: secreto corrupto")
	}
	return g.Open(nil, box[:g.NonceSize()], box[g.NonceSize():], nil)
}

func (s *Svc) gcm() (cipher.AEAD, error) {
	k := sha256.Sum256(append([]byte("grcup-totp:"), s.totpKey...))
	b, err := aes.NewCipher(k[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(b)
}

func normCode(c string) string {
	return strings.ToUpper(strings.NewReplacer(" ", "", "-", "").Replace(strings.TrimSpace(c)))
}

func hashRecovery(c string) string {
	h := sha256.Sum256([]byte("grcup-rc:" + normCode(c)))
	return hex.EncodeToString(h[:])
}

// recoveryCodes returns n codes «7KQ2-9M4X» (unambiguous alphabet).
func recoveryCodes(n int) []string {
	const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	out := make([]string, n)
	for i := range out {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		for j := range b {
			b[j] = abc[int(b[j])%len(abc)]
		}
		out[i] = string(b[:4]) + "-" + string(b[4:])
	}
	return out
}

type dosFactores struct {
	secreto   []byte
	activado  *time.Time
	recuperar []string
}

func (s *Svc) loadTOTP(ctx context.Context, q querier, uid uuid.UUID) (dosFactores, error) {
	var d dosFactores
	err := q.QueryRow(ctx, `SELECT totp_secreto, totp_activado_at, codigos_recuperacion FROM usuarios WHERE id = $1`, uid).Scan(&d.secreto, &d.activado, &d.recuperar)
	return d, err
}

// checkSecondFactor validates a TOTP code (one use per time step) or consumes a recovery code.
func (s *Svc) checkSecondFactor(ctx context.Context, uid uuid.UUID, d dosFactores, code string) error {
	code = normCode(code)
	if code == "" {
		return errSegundoFactor
	}
	if err := s.limit(ctx, "2fa:"+uid.String(), codeAttempt, 5*time.Minute); err != nil {
		return err
	}
	if len(code) == 6 && strings.Trim(code, "0123456789") == "" {
		sec, err := s.open(d.secreto)
		if err != nil {
			return err
		}
		st := totpMatch(sec, code, time.Now())
		if st < 0 {
			return errCodigo
		}
		// a code cannot be replayed within its window
		if ok, err := s.a.Redis.SetNX(ctx, s.a.Keys.Of("totp", uid.String(), strconv.FormatInt(st, 10)), "1", 3*totpStep*time.Second).Result(); err == nil && !ok {
			return errCodigo
		}
		return nil
	}
	tag, err := s.a.DB.Exec(ctx, `UPDATE usuarios SET codigos_recuperacion = array_remove(codigos_recuperacion, $2) WHERE id = $1 AND $2 = ANY (codigos_recuperacion)`, uid, hashRecovery(code))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errCodigo
	}
	return nil
}

func mask(secret string) string {
	if len(secret) <= 4 {
		return secret
	}
	return strings.Repeat("•", 4) + " " + secret[len(secret)-4:]
}

func (s *Svc) registerTwoFactor() {
	api := s.a.API
	type estadoOut struct {
		Body struct {
			Activado            bool       `json:"activado"`
			ActivadoAt          *time.Time `json:"activadoAt,omitempty"`
			CodigosRecuperacion int        `json:"codigosRecuperacion" doc:"Códigos de recuperación sin usar"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-2fa-get", Method: http.MethodGet, Path: "/api/auth/2fa", Summary: "Estado de mi verificación en dos pasos", Tags: tagAuth, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*estadoOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			d, err := s.loadTOTP(ctx, s.a.DB, p.UserID)
			if err != nil {
				return nil, err
			}
			out := &estadoOut{}
			out.Body.Activado, out.Body.ActivadoAt, out.Body.CodigosRecuperacion = d.activado != nil, d.activado, len(d.recuperar)
			return out, nil
		})

	type activarOut struct {
		Body struct {
			OtpauthURL     string `json:"otpauthUrl" doc:"Para el código QR"`
			Secreto        string `json:"secreto" doc:"Para escribirlo a mano en la app"`
			SecretoMascara string `json:"secretoMascara"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-2fa-start", Method: http.MethodPost, Path: "/api/auth/2fa/activar", Summary: "Empezar a activar la verificación en dos pasos (genera el secreto)", Tags: tagAuth, Security: bearer},
		func(ctx context.Context, _ *struct{}) (*activarOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			raw := make([]byte, 20)
			_, _ = rand.Read(raw)
			box, err := s.seal(raw)
			if err != nil {
				return nil, err
			}
			tag, err := s.a.DB.Exec(ctx, `UPDATE usuarios SET totp_secreto = $2 WHERE id = $1 AND totp_activado_at IS NULL`, p.UserID, box)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() == 0 {
				return nil, problem.Conflict("2FA_YA_ACTIVADO", "La verificación en dos pasos ya está activada.")
			}
			sec := b32.EncodeToString(raw)
			out := &activarOut{}
			out.Body.Secreto, out.Body.SecretoMascara = sec, mask(sec)
			out.Body.OtpauthURL = "otpauth://totp/" + url.PathEscape(totpIssuer+":"+p.Email) + "?" + url.Values{"secret": {sec}, "issuer": {totpIssuer}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}.Encode()
			return out, nil
		})

	type codigoIn struct {
		Body struct {
			Codigo string `json:"codigo" minLength:"6" maxLength:"12"`
		}
	}
	type confirmarOut struct {
		Body struct {
			Activado            bool     `json:"activado"`
			CodigosRecuperacion []string `json:"codigosRecuperacion" doc:"Se muestran una sola vez"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-2fa-confirm", Method: http.MethodPost, Path: "/api/auth/2fa/confirmar", Summary: "Confirmar la activación con el primer código", Tags: tagAuth, Security: bearer},
		func(ctx context.Context, in *codigoIn) (*confirmarOut, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			d, err := s.loadTOTP(ctx, s.a.DB, p.UserID)
			if err != nil {
				return nil, err
			}
			if d.activado != nil {
				return nil, problem.Conflict("2FA_YA_ACTIVADO", "La verificación en dos pasos ya está activada.")
			}
			if d.secreto == nil {
				return nil, problem.Conflict("2FA_SIN_EMPEZAR", "Empieza la activación de nuevo.")
			}
			code := normCode(in.Body.Codigo)
			if len(code) != 6 {
				return nil, errCodigo
			}
			if err := s.checkSecondFactor(ctx, p.UserID, d, code); err != nil {
				return nil, err
			}
			codes := recoveryCodes(nRecuperar)
			hashes := make([]string, len(codes))
			for i, c := range codes {
				hashes[i] = hashRecovery(c)
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE usuarios SET totp_activado_at = now(), codigos_recuperacion = $2, updated_at = now() WHERE id = $1`, p.UserID, hashes); err != nil {
					return err
				}
				return s.enqueueTwoFactor(ctx, tx, p.UserID, true)
			})
			if err != nil {
				return nil, err
			}
			out := &confirmarOut{}
			out.Body.Activado, out.Body.CodigosRecuperacion = true, codes
			return out, nil
		})

	type desactivarIn struct {
		Body struct {
			Codigo string `json:"codigo" minLength:"6" maxLength:"12" doc:"Código de la app o de recuperación"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "auth-2fa-disable", Method: http.MethodDelete, Path: "/api/auth/2fa", Summary: "Desactivar mi verificación en dos pasos (pide un código)", Tags: tagAuth, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *desactivarIn) (*struct{}, error) {
			p, err := userOnly(ctx)
			if err != nil {
				return nil, err
			}
			d, err := s.loadTOTP(ctx, s.a.DB, p.UserID)
			if err != nil {
				return nil, err
			}
			if d.activado == nil {
				return nil, nil
			}
			if err := s.checkSecondFactor(ctx, p.UserID, d, in.Body.Codigo); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE usuarios SET totp_secreto = NULL, totp_activado_at = NULL, codigos_recuperacion = '{}', updated_at = now() WHERE id = $1`, p.UserID); err != nil {
					return err
				}
				return s.enqueueTwoFactor(ctx, tx, p.UserID, false)
			})
		})
}

// enqueueTwoFactor emits identity.dos_factores_cambiado once per competition of the user (audit + live team list).
func (s *Svc) enqueueTwoFactor(ctx context.Context, tx pgx.Tx, uid uuid.UUID, on bool) error {
	rows, err := tx.Query(ctx, `SELECT competition_id FROM membresias WHERE usuario_id = $1`, uid)
	if err != nil {
		return err
	}
	cids, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return err
	}
	for _, cid := range cids {
		if err := events.Enqueue(ctx, tx, events.New(ctx, "identity.dos_factores_cambiado", map[string]any{"usuarioId": uid, "activado": on},
			events.Competition(cid.String()), events.ForPermission("equipo.gestionar"), events.Subject("usuario:"+uid.String()))); err != nil {
			return err
		}
	}
	return nil
}


package formularios

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"

	"github.com/google/uuid"
)

// Token es el enlace personal de un destinatario (§3): base64url(id[16 bytes] || HMAC-SHA256(clave,
// "formulario:" + id)[:16]), sin relleno. No se guarda en claro: se recalcula con la clave del servicio.
func Token(clave []byte, id uuid.UUID) string {
	buf := make([]byte, 0, 32)
	buf = append(buf, id[:]...)
	buf = append(buf, firma(clave, id)...)
	return base64.RawURLEncoding.EncodeToString(buf)
}

// LeerToken devuelve el destinatario de un token válido. La firma se compara en tiempo constante.
func LeerToken(clave []byte, tok string) (uuid.UUID, bool) {
	var id uuid.UUID
	b, err := base64.RawURLEncoding.DecodeString(tok)
	if err != nil || len(b) != 32 {
		return uuid.Nil, false
	}
	copy(id[:], b[:16])
	if !hmac.Equal(b[16:], firma(clave, id)) {
		return uuid.Nil, false
	}
	return id, true
}

func firma(clave []byte, id uuid.UUID) []byte {
	m := hmac.New(sha256.New, clave)
	m.Write([]byte("formulario:" + id.String()))
	return m.Sum(nil)[:16]
}

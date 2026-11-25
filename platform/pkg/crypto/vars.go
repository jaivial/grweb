package crypto

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
)

// Secret email variables (an initial password): the producer seals the value before it travels in the event, so
// the outbox, the stream and the stored message only ever hold ciphertext. messaging opens it at render time.
// The key is derived from the internal token both services already share.

const prefijoSellado = "sellado:v1:"

// Oculto is what a staff view shows instead of a secret variable.
const Oculto = "••••••••"

func varBox(internalToken string) *Box {
	k := sha256.Sum256([]byte("grcup/vars-secretas/" + internalToken))
	b, _ := NewBox(hex.EncodeToString(k[:]))
	return b
}

// SellarVar seals a secret variable; aad is the template key (a value sealed for one template does not open in another).
func SellarVar(internalToken, aad, valor string) string {
	return prefijoSellado + base64.RawURLEncoding.EncodeToString(varBox(internalToken).Seal([]byte(valor), aad))
}

// EsSellada tells whether v was sealed with SellarVar.
func EsSellada(v string) bool { return strings.HasPrefix(v, prefijoSellado) }

// AbrirVars returns a copy of vars with every sealed value opened (one that does not open is left empty).
func AbrirVars(internalToken, aad string, vars map[string]string) map[string]string {
	out := make(map[string]string, len(vars))
	for k, v := range vars {
		if EsSellada(v) {
			v = ""
			if raw, err := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(vars[k], prefijoSellado)); err == nil {
				if p, err := varBox(internalToken).Open(raw, aad); err == nil {
					v = string(p)
				}
			}
		}
		out[k] = v
	}
	return out
}

// OcultarVars returns a copy of vars with every sealed value replaced by Oculto (staff views, stored content).
func OcultarVars(vars map[string]string) map[string]string {
	out := make(map[string]string, len(vars))
	for k, v := range vars {
		if EsSellada(v) {
			v = Oculto
		}
		out[k] = v
	}
	return out
}

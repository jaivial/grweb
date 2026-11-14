// Package passhash hashes passwords with argon2id (OWASP: m=19 MiB, t=2, p=1) in PHC format, the same scheme
// internal/identity uses for the team, so the fan accounts (público/atleta) share it.
package passhash

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

var b64 = base64.RawURLEncoding

// slots bounds concurrent argon2id runs (19 MiB each) so a login burst during the live event cannot exhaust the pod.
var slots = make(chan struct{}, 4)

func key(pw, salt []byte, t, m uint32, p uint8, n uint32) []byte {
	slots <- struct{}{}
	defer func() { <-slots }()
	return argon2.IDKey(pw, salt, t, m, p, n)
}

// Hash returns «$argon2id$v=19$m=19456,t=2,p=1$salt$key».
func Hash(pw string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	k := key([]byte(pw), salt, 2, 19*1024, 1, 32)
	return fmt.Sprintf("$argon2id$v=19$m=19456,t=2,p=1$%s$%s", b64.EncodeToString(salt), b64.EncodeToString(k))
}

// Check verifies pw against a Hash result in constant time ("" or any other format is false).
func Check(hash, pw string) bool {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var m, t uint32
	var p uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &p); err != nil {
		return false
	}
	salt, err1 := b64.DecodeString(parts[4])
	want, err2 := b64.DecodeString(parts[5])
	if err1 != nil || err2 != nil {
		return false
	}
	return subtle.ConstantTimeCompare(key([]byte(pw), salt, t, m, p, uint32(len(want))), want) == 1
}

// Dummy is a valid hash of a random password: checking it keeps the timing of an unknown email equal to a real one.
var Dummy = func() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return Hash(b64.EncodeToString(b))
}()

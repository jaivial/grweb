// Package crypto seals integration secrets (SMTP passwords, Stripe and Meta keys…) with AES-256-GCM.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
)

// Box encrypts and decrypts with one 32-byte key (CRYPTO_KEY, hex).
type Box struct{ aead cipher.AEAD }

// NewBox parses a 64-hex-char key.
func NewBox(hexKey string) (*Box, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil || len(key) != 32 {
		return nil, errors.New("CRYPTO_KEY debe ser 32 bytes en hexadecimal")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead}, nil
}

// Seal returns nonce || ciphertext. aad binds the secret to its owner (e.g. "<competition>/smtp").
func (b *Box) Seal(plain []byte, aad string) []byte {
	nonce := make([]byte, b.aead.NonceSize())
	_, _ = rand.Read(nonce)
	return b.aead.Seal(nonce, nonce, plain, []byte(aad))
}

// Open reverses Seal.
func (b *Box) Open(sealed []byte, aad string) ([]byte, error) {
	n := b.aead.NonceSize()
	if len(sealed) < n {
		return nil, errors.New("secreto cifrado corrupto")
	}
	out, err := b.aead.Open(nil, sealed[:n], sealed[n:], []byte(aad))
	if err != nil {
		return nil, fmt.Errorf("no se pudo descifrar el secreto: %w", err)
	}
	return out, nil
}

// Mask shows only the last 4 characters (the API never returns secrets).
func Mask(s string) string {
	if len(s) <= 4 {
		return "••••"
	}
	return "••••" + s[len(s)-4:]
}

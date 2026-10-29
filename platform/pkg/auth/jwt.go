package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"

	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var b64 = base64.RawURLEncoding

// Signer signs access tokens with ES256 (identity only).
type Signer struct {
	key    *ecdsa.PrivateKey
	kid    string
	issuer string
}

// GenerateKeyPEM creates a P-256 private key in PKCS#8 PEM (dev and first deploy).
func GenerateKeyPEM() ([]byte, error) {
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return nil, err
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), nil
}

// NewSigner parses a PEM P-256 private key.
func NewSigner(pemBytes []byte, issuer string) (*Signer, error) {
	k, err := jwt.ParseECPrivateKeyFromPEM(pemBytes)
	if err != nil {
		return nil, fmt.Errorf("clave JWT: %w", err)
	}
	pub, err := k.PublicKey.Bytes()
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(pub)
	return &Signer{key: k, kid: b64.EncodeToString(sum[:])[:16], issuer: issuer}, nil
}

// Sign signs claims, filling issuer and kid.
func (s *Signer) Sign(c Claims) (string, error) {
	c.Issuer = s.issuer
	t := jwt.NewWithClaims(jwt.SigningMethodES256, c)
	t.Header["kid"] = s.kid
	return t.SignedString(s.key)
}

// Keys returns the public keys by kid.
func (s *Signer) Keys() map[string]*ecdsa.PublicKey {
	return map[string]*ecdsa.PublicKey{s.kid: &s.key.PublicKey}
}

type jwk struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
}

// JWKS returns the JSON Web Key Set served at /.well-known/jwks.json.
func (s *Signer) JWKS() []byte {
	pub, _ := s.key.PublicKey.Bytes() // 0x04 || X || Y
	set := struct {
		Keys []jwk `json:"keys"`
	}{[]jwk{{Kty: "EC", Crv: "P-256", X: b64.EncodeToString(pub[1:33]), Y: b64.EncodeToString(pub[33:65]), Kid: s.kid, Use: "sig", Alg: "ES256"}}}
	out, _ := json.Marshal(set)
	return out
}

// Verifier validates access tokens (JWKS, refreshed on unknown kid) and service tokens (HS256).
type Verifier struct {
	jwksURL  string
	issuer   string
	self     string
	internal []byte
	client   *http.Client
	rdb      *redis.Client
	keys     redisKeys

	mu      sync.RWMutex
	pubs    map[string]*ecdsa.PublicKey
	fetched time.Time
	static  bool
}

type redisKeys interface{ Of(...string) string }

// NewVerifier builds a verifier. If static keys are given (identity itself) the JWKS URL is not used.
func NewVerifier(jwksURL, issuer, self, internalSecret string, static map[string]*ecdsa.PublicKey) *Verifier {
	v := &Verifier{jwksURL: jwksURL, issuer: issuer, self: self, client: &http.Client{Timeout: 5 * time.Second}, pubs: map[string]*ecdsa.PublicKey{}}
	if internalSecret != "" {
		v.internal = []byte(internalSecret)
	}
	if static != nil {
		v.pubs, v.static = static, true
	}
	return v
}

// WithRevocation enables the session revocation check (key <prefix>revoked:sid:<sid>).
func (v *Verifier) WithRevocation(rdb *redis.Client, keys redisKeys) *Verifier {
	v.rdb, v.keys = rdb, keys
	return v
}

func (v *Verifier) key(ctx context.Context, kid string) (*ecdsa.PublicKey, error) {
	v.mu.RLock()
	k, ok := v.pubs[kid]
	stale := time.Since(v.fetched) > 30*time.Second
	v.mu.RUnlock()
	if ok {
		return k, nil
	}
	if v.static || !stale {
		return nil, errors.New("kid desconocido")
	}
	if err := v.refresh(ctx); err != nil {
		return nil, err
	}
	v.mu.RLock()
	defer v.mu.RUnlock()
	if k, ok := v.pubs[kid]; ok {
		return k, nil
	}
	return nil, errors.New("kid desconocido")
}

func (v *Verifier) refresh(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, v.jwksURL, nil)
	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("jwks: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil || resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks: estado %d", resp.StatusCode)
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.Unmarshal(body, &set); err != nil {
		return err
	}
	pubs := map[string]*ecdsa.PublicKey{}
	for _, k := range set.Keys {
		x, ex := b64.DecodeString(k.X)
		y, ey := b64.DecodeString(k.Y)
		if ex != nil || ey != nil || k.Crv != "P-256" || len(x) != 32 || len(y) != 32 {
			continue
		}
		pk, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), slices.Concat([]byte{4}, x, y))
		if err != nil {
			continue
		}
		pubs[k.Kid] = pk
	}
	v.mu.Lock()
	v.pubs, v.fetched = pubs, time.Now()
	v.mu.Unlock()
	return nil
}

// Verify parses and validates a token.
func (v *Verifier) Verify(ctx context.Context, raw string) (*Claims, error) {
	c := &Claims{}
	_, err := jwt.ParseWithClaims(raw, c, func(t *jwt.Token) (any, error) {
		switch t.Method.Alg() {
		case "ES256":
			kid, _ := t.Header["kid"].(string)
			return v.key(ctx, kid)
		case "HS256":
			if v.internal == nil {
				return nil, errors.New("tokens internos deshabilitados")
			}
			return v.internal, nil
		}
		return nil, errors.New("algoritmo no permitido")
	}, jwt.WithValidMethods([]string{"ES256", "HS256"}), jwt.WithLeeway(30*time.Second), jwt.WithExpirationRequired())
	if err != nil {
		return nil, err
	}
	switch c.Typ {
	case TypAccess:
		if c.Issuer != v.issuer {
			return nil, errors.New("emisor no válido")
		}
	case TypService:
		if !slices.Contains(c.Audience, v.self) {
			return nil, errors.New("audiencia no válida")
		}
	default:
		return nil, errors.New("tipo de token no válido")
	}
	if c.SID != "" && v.rdb != nil {
		if n, err := v.rdb.Exists(ctx, v.keys.Of("revoked", "sid", c.SID)).Result(); err == nil && n > 0 {
			return nil, errors.New("sesión revocada")
		}
	}
	return c, nil
}

// Middleware authenticates the Bearer token when present. Invalid tokens do not block public
// endpoints: the error surfaces only when a handler calls auth.User / auth.Require.
func Middleware(v *Verifier) httpx.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearer(r.Header.Get("Authorization"))
			if raw != "" && v != nil {
				c, err := v.Verify(r.Context(), raw)
				if err != nil {
					r = r.WithContext(withAuthError(r.Context(), problem.Unauthorized("TOKEN_INVALIDO", "Tu sesión ha caducado o no es válida. Vuelve a iniciar sesión.")))
				} else {
					r = r.WithContext(WithPrincipal(r.Context(), principalFromClaims(c, raw)))
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ServiceToken mints a short HS256 token for calling service `to` from service `from`.
func ServiceToken(secret, from, to string) (string, error) {
	now := time.Now()
	c := Claims{Typ: TypService, Svc: from, RegisteredClaims: jwt.RegisteredClaims{
		Issuer: from, Audience: jwt.ClaimStrings{to}, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(2 * time.Minute)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(secret))
}

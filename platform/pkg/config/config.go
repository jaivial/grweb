// Package config reads service configuration from environment variables.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Common is the configuration every service shares.
type Common struct {
	Service       string
	Env           string // dev | qa | prod
	HTTPAddr      string
	DatabaseURL   string
	AutoMigrate   bool
	RedisAddr     string
	RedisUser     string
	RedisPassword string
	RedisDB       int
	KeyPrefix     string // every Redis key and channel starts with it (grcup:<env>:)
	JWKSURL       string
	JWTIssuer     string
	InternalToken string // HS256 secret for service-to-service tokens
	LogLevel      string
}

// Load reads the common configuration for the named service.
func Load(service string) Common {
	env := Str("SERVICE_ENV", "dev")
	return Common{
		Service:       service,
		Env:           env,
		HTTPAddr:      Str("HTTP_ADDR", ":8080"),
		DatabaseURL:   Str("DATABASE_URL", ""),
		AutoMigrate:   Bool("AUTO_MIGRATE", false),
		RedisAddr:     Str("REDIS_ADDR", ""),
		RedisUser:     Str("REDIS_USERNAME", ""),
		RedisPassword: Str("REDIS_PASSWORD", ""),
		RedisDB:       Int("REDIS_DB", 0),
		KeyPrefix:     Str("KEY_PREFIX", "grcup:"+env+":"),
		JWKSURL:       Str("JWKS_URL", "http://identity:8080/.well-known/jwks.json"),
		JWTIssuer:     Str("JWT_ISSUER", "grcup-identity"),
		InternalToken: Str("INTERNAL_TOKEN_SECRET", ""),
		LogLevel:      Str("LOG_LEVEL", "info"),
	}
}

func Str(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return def
}

func Int(key string, def int) int {
	if v, err := strconv.Atoi(Str(key, "")); err == nil {
		return v
	}
	return def
}

func Bool(key string, def bool) bool {
	if v, err := strconv.ParseBool(Str(key, "")); err == nil {
		return v
	}
	return def
}

func Duration(key string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(Str(key, "")); err == nil {
		return v
	}
	return def
}

// List splits a comma-separated variable.
func List(key string) []string {
	var out []string
	for _, p := range strings.Split(Str(key, ""), ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

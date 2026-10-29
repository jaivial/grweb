// Package cache keeps JSON read models of public endpoints in Redis, invalidated by the owning service.
package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache stores JSON values under a namespaced prefix.
type Cache struct {
	R      *redis.Client
	Prefix string // e.g. grcup:qa:cache:competition:
}

// Get decodes key into out; ok=false on miss or error (callers fall back to the database).
func (c *Cache) Get(ctx context.Context, key string, out any) bool {
	if c == nil || c.R == nil {
		return false
	}
	b, err := c.R.Get(ctx, c.Prefix+key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(b, out) == nil
}

// Set stores v for ttl (errors are ignored: the cache is an optimisation).
func (c *Cache) Set(ctx context.Context, key string, v any, ttl time.Duration) {
	if c == nil || c.R == nil {
		return
	}
	if b, err := json.Marshal(v); err == nil {
		_ = c.R.Set(ctx, c.Prefix+key, b, ttl).Err()
	}
}

// Del invalidates keys.
func (c *Cache) Del(ctx context.Context, keys ...string) {
	if c == nil || c.R == nil || len(keys) == 0 {
		return
	}
	full := make([]string, len(keys))
	for i, k := range keys {
		full[i] = c.Prefix + k
	}
	_ = c.R.Del(ctx, full...).Err()
}

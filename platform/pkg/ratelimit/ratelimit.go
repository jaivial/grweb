// Package ratelimit implements fixed-window limits on Redis (one atomic script, Redis 6.0 compatible).
package ratelimit

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

var incr = redis.NewScript(`local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}`)

// Result of a check.
type Result struct {
	Allowed    bool
	Count      int64
	RetryAfter time.Duration
}

// Allow counts one hit on key within window. If Redis fails the request is allowed (fail-open) and err is returned.
func Allow(ctx context.Context, rdb *redis.Client, key string, limit int64, window time.Duration) (Result, error) {
	if rdb == nil {
		return Result{Allowed: true}, nil
	}
	v, err := incr.Run(ctx, rdb, []string{key}, window.Milliseconds()).Int64Slice()
	if err != nil || len(v) != 2 {
		return Result{Allowed: true}, err
	}
	return Result{Allowed: v[0] <= limit, Count: v[0], RetryAfter: time.Duration(v[1]) * time.Millisecond}, nil
}

// Reset clears a key (e.g. failed-login counter after a successful login).
func Reset(ctx context.Context, rdb *redis.Client, key string) {
	if rdb != nil {
		_ = rdb.Del(ctx, key).Err()
	}
}

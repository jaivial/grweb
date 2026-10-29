// Package redisx creates the Redis client (Redis 6.0 compatible) and namespaced keys.
package redisx

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Options for the shared Redis.
type Options struct {
	Addr, Username, Password string
	DB                       int
	Prefix                   string
}

// Connect returns a client and waits up to 30 s for PING.
func Connect(ctx context.Context, o Options) (*redis.Client, error) {
	c := redis.NewClient(&redis.Options{
		Addr:            o.Addr,
		Username:        o.Username,
		Password:        o.Password,
		DB:              o.DB,
		Protocol:        2,    // RESP2: kraken runs Redis 6.0
		DisableIdentity: true, // CLIENT SETINFO does not exist before Redis 7.2
		DialTimeout:     3 * time.Second,
		ReadTimeout:     6 * time.Second,
		WriteTimeout:    3 * time.Second,
	})
	deadline := time.Now().Add(30 * time.Second)
	for {
		pctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := c.Ping(pctx).Err()
		cancel()
		if err == nil {
			return c, nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			_ = c.Close()
			return nil, fmt.Errorf("redis no responde: %w", err)
		}
		time.Sleep(time.Second)
	}
}

// Keys builds namespaced keys: grcup:<env>:<parts…>. The ACL user can only touch grcup:*.
type Keys string

func (k Keys) Of(parts ...string) string { return string(k) + strings.Join(parts, ":") }

// Events is the Redis Stream every service publishes domain events to.
func (k Keys) Events() string { return k.Of("events") }

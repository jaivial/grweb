// Package visitas counts the distinct people connected to a live page across pods: the browser sends a random id
// (?v=, kept in localStorage, the same in every tab), every pod reports the ids it has connected into one sorted
// set scored by the report time, and the count is the ids reported within the window. A browser with several tabs,
// a reconnection that overlaps the old connection or a client served by two pods counts once; a browser that
// leaves stops counting when the window passes.
package visitas

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Cada is how often the pods report; Ventana is how long a reported id keeps counting (2 missed reports).
const (
	Cada    = 10 * time.Second
	Ventana = 25 * time.Second
)

// ID is the visitor id of the query parameter v: a uuid, "" otherwise (that connection is not counted).
func ID(v string) string {
	u, err := uuid.Parse(v)
	if err != nil {
		return ""
	}
	return u.String()
}

// Marcar reports the ids connected to this pod now and prunes the ones out of the window.
func Marcar(ctx context.Context, rdb redis.Cmdable, key string, ids []string) error {
	now := time.Now().UnixMilli()
	p := rdb.TxPipeline()
	if len(ids) > 0 {
		zs := make([]redis.Z, len(ids))
		for i, id := range ids {
			zs[i] = redis.Z{Score: float64(now), Member: id}
		}
		p.ZAdd(ctx, key, zs...)
	}
	p.ZRemRangeByScore(ctx, key, "-inf", "("+strconv.FormatInt(now-Ventana.Milliseconds(), 10))
	p.Expire(ctx, key, 4*Ventana)
	_, err := p.Exec(ctx)
	return err
}

// Contar is the number of distinct ids reported by any pod within the window.
func Contar(ctx context.Context, rdb redis.Cmdable, key string) (int64, error) {
	return rdb.ZCount(ctx, key, strconv.FormatInt(time.Now().UnixMilli()-Ventana.Milliseconds(), 10), "+inf").Result()
}

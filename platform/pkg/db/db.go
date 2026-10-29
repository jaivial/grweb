// Package db connects to PostgreSQL (pgx pool) and applies goose migrations embedded in each binary.
package db

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/database"
	"github.com/pressly/goose/v3/lock"
)

//go:embed platform/*.sql
var platformFS embed.FS

// Connect opens a pool and waits (up to 60 s) for the database to accept connections.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL: %w", err)
	}
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	deadline := time.Now().Add(60 * time.Second)
	for {
		pctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		err = pool.Ping(pctx)
		cancel()
		if err == nil {
			return pool, nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			pool.Close()
			return nil, fmt.Errorf("postgres no responde: %w", err)
		}
		time.Sleep(2 * time.Second)
	}
}

// Migrate applies the platform migrations (outbox, processed_events) and then the service's own,
// each tracked in its own goose table and serialised with a Postgres advisory lock.
func Migrate(ctx context.Context, pool *pgxpool.Pool, service fs.FS, log *slog.Logger) error {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	sets := []struct {
		table string
		fsys  fs.FS
	}{{"goose_platform", mustSub(platformFS, "platform")}}
	if service != nil {
		sets = append(sets, struct {
			table string
			fsys  fs.FS
		}{"goose_service", service})
	}
	for _, s := range sets {
		store, err := database.NewStore(database.DialectPostgres, s.table)
		if err != nil {
			return err
		}
		locker, err := lock.NewPostgresSessionLocker(lock.WithLockID(4_242_000 + int64(len(s.table))))
		if err != nil {
			return err
		}
		p, err := goose.NewProvider("", sqlDB, s.fsys, goose.WithStore(store), goose.WithSessionLocker(locker), goose.WithDisableGlobalRegistry(true))
		if err != nil {
			return fmt.Errorf("migraciones %s: %w", s.table, err)
		}
		res, err := p.Up(ctx)
		if err != nil {
			return fmt.Errorf("migraciones %s: %w", s.table, err)
		}
		for _, r := range res {
			log.Info("migración aplicada", "set", s.table, "migracion", r.Source.Version, "dur", r.Duration)
		}
	}
	return nil
}

func mustSub(f fs.FS, dir string) fs.FS {
	s, err := fs.Sub(f, dir)
	if err != nil {
		panic(err)
	}
	return s
}

// Tx runs fn in a transaction, committing on success.
func Tx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// IsUniqueViolation reports a unique-constraint error (optionally for a given constraint).
func IsUniqueViolation(err error, constraint string) bool {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return constraint == "" || pg.ConstraintName == constraint
	}
	return false
}

// IsNoRows reports pgx.ErrNoRows.
func IsNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

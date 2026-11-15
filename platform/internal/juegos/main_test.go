package juegos

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// The concurrency tests the client asked for run against a real PostgreSQL when TEST_DATABASE_URL is set
// (e.g. postgres://postgres:test@127.0.0.1:55432/postgres?sslmode=disable). Without it they skip.
var (
	testOnce sync.Once
	testPool *pgxpool.Pool
	testErr  error
)

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL no definida: los tests de concurrencia necesitan un PostgreSQL real")
	}
	testOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		admin, err := pgxpool.New(ctx, url)
		if err != nil {
			testErr = err
			return
		}
		defer admin.Close()
		nombre := "grcup_juegos_test_" + time.Now().Format("20060102_150405")
		if _, err = admin.Exec(ctx, fmt.Sprintf(`DROP DATABASE IF EXISTS %s`, nombre)); err != nil {
			testErr = err
			return
		}
		if _, err = admin.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s`, nombre)); err != nil {
			testErr = err
			return
		}
		cfg, err := pgxpool.ParseConfig(reemplazaBD(url, nombre))
		if err != nil {
			testErr = err
			return
		}
		cfg.MaxConns = 64 // the concurrency tests open many goroutines at once
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			testErr = err
			return
		}
		if err = db.Migrate(ctx, pool, mustMigrations(), slog.Default()); err != nil {
			pool.Close()
			testErr = err
			return
		}
		testPool = pool
	})
	if testErr != nil {
		t.Fatalf("base de datos de prueba: %v", testErr)
	}
	return testPool
}

// reemplazaBD swaps the database name of a connection URL, keeping the query string.
func reemplazaBD(url, nombre string) string {
	slash := -1
	for i := len(url) - 1; i >= 0; i-- {
		if url[i] == '/' {
			slash = i
			break
		}
	}
	if slash < 0 {
		return url
	}
	query := ""
	if q := strings.IndexByte(url[slash:], '?'); q >= 0 {
		query = url[slash+q:]
		return url[:slash+1] + nombre + query
	}
	return url[:slash+1] + nombre
}

// nuevaJornada creates one jornada of a fresh competition (unique per test: no interference between tests).
func nuevaJornada(t *testing.T, q querier, estado string) (uuid.UUID, jornada) {
	t.Helper()
	ctx := context.Background()
	cid := uuid.Must(uuid.NewV7())
	jid := uuid.Must(uuid.NewV7())
	dia := time.Now().In(madridTz).Format("2006-01-02")
	_, err := q.Exec(ctx, `INSERT INTO jornadas (id, competition_id, dia, nombre, estado) VALUES ($1,$2,$3,$4,$5)`,
		jid, cid, dia, "J-"+jid.String()[:8], estado)
	if err != nil {
		t.Fatalf("jornada de prueba: %v", err)
	}
	j, err := scanJornada(q.QueryRow(ctx, selJornada+" FROM jornadas WHERE id = $1", jid))
	if err != nil {
		t.Fatalf("jornada de prueba: %v", err)
	}
	return cid, j
}

// atletaFantasiaDePrueba inserts one fantasy athlete, optionally owned by a fan inside a room.
func atletaFantasiaDePrueba(t *testing.T, q querier, cid, jid, sala uuid.UUID, dueno *uuid.UUID, clausula int64) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	aid := uuid.Must(uuid.NewV7())
	if clausula <= 0 {
		clausula = 200000
	}
	_, err := q.Exec(ctx, `INSERT INTO fantasy_atletas (jornada_id, competition_id, atleta_id, nombre_publico, sexo, categoria, clausula)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, jid, cid, aid, "Atleta de prueba", "M", "-93", clausula)
	if err == nil && dueno != nil {
		_, err = q.Exec(ctx, `INSERT INTO sala_atletas (sala_id, jornada_id, atleta_id, dueno_fan_id, dueno_alias) VALUES ($1,$2,$3,$4,'dueno')`, sala, jid, aid, *dueno)
	}
	if err != nil {
		t.Fatalf("atleta de prueba: %v", err)
	}
	return aid
}

// salaDePrueba inserts a room with the given members (the first one is the host; no size check on purpose: the
// concurrency tests seat more fans than a real room holds).
func salaDePrueba(t *testing.T, q querier, cid uuid.UUID, j jornada, plazas int, fans ...uuid.UUID) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	sid := uuid.Must(uuid.NewV7())
	if len(fans) == 0 {
		fans = []uuid.UUID{uuid.Must(uuid.NewV7())}
	}
	if _, err := q.Exec(ctx, `INSERT INTO salas (id, competition_id, jornada_id, nombre, nombre_norm, anfitrion_fan_id, plazas, codigo)
		VALUES ($1,$2,$3,$4,$4,$5,$6,$7)`, sid, cid, j.ID, "sala "+sid.String()[24:], fans[0], plazas, nuevoCodigo()); err != nil {
		t.Fatalf("sala de prueba: %v", err)
	}
	sociosDePrueba(t, q, j, sid, fans...)
	return sid
}

// sociosDePrueba seats fans in a room and opens their fantasy wallets.
func sociosDePrueba(t *testing.T, q querier, j jornada, sala uuid.UUID, fans ...uuid.UUID) {
	t.Helper()
	ctx := context.Background()
	for _, f := range fans {
		if _, err := q.Exec(ctx, `INSERT INTO sala_miembros (sala_id, jornada_id, fan_id, miembro_id, alias) VALUES ($1,$2,$3,$4,$5)`,
			sala, j.ID, f, uuid.Must(uuid.NewV7()), "fan"+f.String()[30:]); err != nil {
			t.Fatalf("socio de prueba: %v", err)
		}
		if _, err := abrirCarteraTx(ctx, q, j, f, Fantasy, ""); err != nil {
			t.Fatalf("cartera de prueba: %v", err)
		}
	}
}

// farFuture keeps a fixed scoreboard in the cache of the service during a test.
var farFuture = time.Now().Add(time.Hour)

func nuevoFan() uuid.UUID { return uuid.Must(uuid.NewV7()) }

func codigoDe(t *testing.T, err error) string {
	t.Helper()
	var p *problem.Error
	if !errors.As(err, &p) {
		return fmt.Sprint(err)
	}
	return p.Code
}

// madridTz is the jornada timezone (Europe/Madrid, contract §2).
var madridTz = func() *time.Location {
	l, err := time.LoadLocation("Europe/Madrid")
	if err != nil {
		return time.UTC
	}
	return l
}()

// saldoDe reads one wallet balance (a wallet that was never opened counts as 0 coins).
func saldoDe(t *testing.T, q querier, jid, fanID uuid.UUID, m Moneda) int64 {
	t.Helper()
	var saldo int64
	err := q.QueryRow(context.Background(), `SELECT saldo FROM saldos WHERE jornada_id = $1 AND fan_id = $2 AND moneda = $3`, jid, fanID, m).Scan(&saldo)
	if err != nil {
		if db.IsNoRows(err) {
			return 0
		}
		t.Fatalf("saldo: %v", err)
	}
	return saldo
}

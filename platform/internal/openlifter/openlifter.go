// Package openlifter connects the competition desk run with OpenLifter (our fork, openlifter.menustudioai.com) to
// the platform: the fork sends its entries (name, weigh-in, attempts and good / no lift) and the lifting group on
// screen; this service links each entry with an athlete of the competition (see match.go) and applies the changes
// through athletes (weigh-in, openers, racks) and live (attempts, results, live flight). live emits the usual
// directo.* events, so /en-directo, /horarios, the arena screen and the backoffice follow the desk by SSE.
package openlifter

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

var bearer = []map[string][]string{{"bearer": {}}}

var tag = []string{"OpenLifter"}

// Svc holds the service dependencies.
type Svc struct {
	a        *app.App
	athletes *svcclient.Client
	live     *svcclient.Client
	idMu     sync.Mutex
	ids      map[uuid.UUID]idCache
}

type idCache struct {
	list []*identidad
	at   time.Time
}

// Service returns the openlifter service definition.
func Service() app.Service {
	s := &Svc{ids: map[uuid.UUID]idCache{}}
	m, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		panic(err)
	}
	return app.Service{Name: "openlifter", Title: "GR Cup · openlifter", Migrations: m, NeedsDB: true, NeedsRedis: true, Setup: s.setup, BodyLimit: 4 << 20}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	s.athletes = svcclient.New(config.Str("UPSTREAM_ATHLETES", "http://athletes:8080"), "openlifter", "athletes", a.Cfg.InternalToken)
	s.live = svcclient.New(config.Str("UPSTREAM_LIVE", "http://live:8080"), "openlifter", "live", a.Cfg.InternalToken)
	s.register()
	return nil
}

// operar: the desk needs «directo.operar» (it writes the live) — the weigh-in goes through the same permission.
func operar(ctx context.Context, cid uuid.UUID) (string, error) {
	p, err := auth.User(ctx)
	if err != nil {
		return "", err
	}
	if !p.Can(cid.String(), "directo.operar") {
		return "", problem.Forbidden("Tu rol no puede operar la mesa (permiso «directo.operar»).")
	}
	n := p.Name
	if n == "" {
		n = p.Email
	}
	return "OpenLifter · " + n, nil
}

// identidades of the confirmed athletes (cached 15 s per process: the desk syncs every few seconds).
func (s *Svc) identidades(ctx context.Context, cid uuid.UUID, fresco bool) ([]*identidad, error) {
	s.idMu.Lock()
	c, ok := s.ids[cid]
	s.idMu.Unlock()
	if ok && !fresco && time.Since(c.at) < 15*time.Second {
		return c.list, nil
	}
	var list []*identidad
	if err := s.athletes.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/atletas/identidad", nil, &list); err != nil {
		s.a.Log.Warn("atletas", "err", err)
		return nil, problem.New(http.StatusServiceUnavailable, "ATLETAS_NO_DISPONIBLES", "No se pudieron leer los atletas. Reintenta en unos segundos.")
	}
	for _, x := range list {
		x.toks = tokens(x.nombreCompleto())
	}
	s.idMu.Lock()
	s.ids[cid] = idCache{list: list, at: time.Now()}
	s.idMu.Unlock()
	return list, nil
}

func indexar(list []*identidad) map[uuid.UUID]*identidad {
	m := make(map[uuid.UUID]*identidad, len(list))
	for _, x := range list {
		m[x.ID] = x
	}
	return m
}

// ---- API types ----

// Grupo is the lifting group the desk has on screen.
type Grupo struct {
	Day      int    `json:"day"`
	Platform int    `json:"platform"`
	Flight   string `json:"flight" maxLength:"2"`
	Lift     string `json:"lift" enum:"S,B,D"`
}

// Vinculo is the link of an entry.
type Vinculo struct {
	EntryID    int         `json:"entryId"`
	NombreOL   string      `json:"nombreOL"`
	AtletaID   *uuid.UUID  `json:"atletaId,omitempty"`
	Nombre     string      `json:"nombre,omitempty" doc:"Atleta de la competición"`
	Vinculo    string      `json:"vinculo" enum:"auto,confirmado,sugerido,sin_coincidencia,ignorado"`
	Puntuacion float64     `json:"puntuacion"`
	Motivo     string      `json:"motivo,omitempty"`
	Candidatos []Candidato `json:"candidatos,omitempty"`
}

// Aviso is something the platform could not apply.
type Aviso struct {
	EntryID int    `json:"entryId,omitempty"`
	Mensaje string `json:"mensaje"`
}

// Aplicado counts what reached the platform.
type Aplicado struct {
	Pesajes      int  `json:"pesajes"`
	Intentos     int  `json:"intentos"`
	Veredictos   int  `json:"veredictos"`
	Correcciones int  `json:"correcciones"`
	Estado       bool `json:"estado"`
}

// Estado is the answer of every call: the links of the desk and what was applied.
type Estado struct {
	Mesa     string    `json:"mesa"`
	Rev      int64     `json:"rev"`
	Ignorada bool      `json:"ignorada,omitempty" doc:"Revisión antigua de este dispositivo: no se ha aplicado"`
	Vinculos []Vinculo `json:"vinculos"`
	Avisos   []Aviso   `json:"avisos"`
	Aplicado Aplicado  `json:"aplicado"`
}

// ---- storage ----

type fila struct {
	EntryID      int
	Datos        Entrada
	AtletaID     *uuid.UUID
	Vinculo      string
	Puntuacion   float64
	Motivo       string
	PesajeHash   string
	IntentosHash string
}

func cargar(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, cid uuid.UUID, mesa string) ([]*fila, error) {
	rows, err := q.Query(ctx, `SELECT entry_id, datos, atleta_id, vinculo, puntuacion::float8, motivo, pesaje_hash, intentos_hash FROM entradas
		WHERE competition_id = $1 AND mesa = $2 ORDER BY entry_id`, cid, mesa)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*fila
	for rows.Next() {
		f := &fila{}
		if err := rows.Scan(&f.EntryID, &f.Datos, &f.AtletaID, &f.Vinculo, &f.Puntuacion, &f.Motivo, &f.PesajeHash, &f.IntentosHash); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func cargarAlias(ctx context.Context, tx pgx.Tx, cid uuid.UUID) (map[string]uuid.UUID, error) {
	rows, err := tx.Query(ctx, `SELECT clave, atleta_id FROM alias WHERE competition_id = $1`, cid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := map[string]uuid.UUID{}
	for rows.Next() {
		var k string
		var id uuid.UUID
		if err := rows.Scan(&k, &id); err != nil {
			return nil, err
		}
		m[k] = id
	}
	return m, rows.Err()
}

func bloquear(ctx context.Context, tx pgx.Tx, cid uuid.UUID, mesa string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 11))`, cid.String()+"|"+mesa)
	return err
}

// rematch recalculates the links that are not fixed (confirmed or ignored) and stores the changes. It returns the
// result per entry (with candidates) and the entries whose athlete changed.
func rematch(ctx context.Context, tx pgx.Tx, cid uuid.UUID, mesa string, filas []*fila, ids []*identidad) (map[int]emparejado, map[int]bool, error) {
	alias, err := cargarAlias(ctx, tx, cid)
	if err != nil {
		return nil, nil, err
	}
	fijos := map[uuid.UUID]bool{}
	var libres []*Entrada
	for _, f := range filas {
		switch f.Vinculo {
		case "confirmado":
			if f.AtletaID != nil {
				fijos[*f.AtletaID] = true
			}
		case "ignorado":
		default:
			if f.Datos.Name != "" {
				d := f.Datos
				d.ID = f.EntryID
				libres = append(libres, &d)
			}
		}
	}
	res := emparejar(libres, ids, fijos, alias)
	cambiados := map[int]bool{}
	var cambios []*fila
	for _, f := range filas {
		if f.Vinculo == "confirmado" || f.Vinculo == "ignorado" {
			continue
		}
		r, ok := res[f.EntryID]
		if !ok {
			r = emparejado{vinculo: "sin_coincidencia"} // entry without a name yet
		}
		mismo := (f.AtletaID == nil) == (r.atleta == nil) && (f.AtletaID == nil || *f.AtletaID == *r.atleta)
		if mismo && f.Vinculo == r.vinculo && f.Motivo == r.motivo && f.Puntuacion == float64(float32(r.puntuacion)) {
			continue
		}
		if !mismo {
			cambiados[f.EntryID] = true
			f.PesajeHash, f.IntentosHash = "", "" // a new athlete gets everything
		}
		f.AtletaID, f.Vinculo, f.Puntuacion, f.Motivo = r.atleta, r.vinculo, float64(float32(r.puntuacion)), r.motivo
		cambios = append(cambios, f)
	}
	if len(cambios) == 0 {
		return res, cambiados, nil
	}
	// Free the athletes first (unique athlete per desk), then write the new links.
	ids2 := make([]int, len(cambios))
	for i, f := range cambios {
		ids2[i] = f.EntryID
	}
	if _, err := tx.Exec(ctx, `UPDATE entradas SET atleta_id = NULL WHERE competition_id = $1 AND mesa = $2 AND entry_id = ANY($3)`, cid, mesa, ids2); err != nil {
		return nil, nil, err
	}
	for _, f := range cambios {
		if _, err := tx.Exec(ctx, `UPDATE entradas SET atleta_id = $4, vinculo = $5, puntuacion = $6, motivo = $7, pesaje_hash = $8, intentos_hash = $9, updated_at = now()
			WHERE competition_id = $1 AND mesa = $2 AND entry_id = $3`, cid, mesa, f.EntryID, f.AtletaID, f.Vinculo, f.Puntuacion, f.Motivo, f.PesajeHash, f.IntentosHash); err != nil {
			return nil, nil, err
		}
	}
	return res, cambiados, nil
}

func vista(mesa string, rev int64, filas []*fila, res map[int]emparejado, ids map[uuid.UUID]*identidad) Estado {
	e := Estado{Mesa: mesa, Rev: rev, Vinculos: make([]Vinculo, 0, len(filas)), Avisos: []Aviso{}}
	for _, f := range filas {
		v := Vinculo{EntryID: f.EntryID, NombreOL: f.Datos.Name, AtletaID: f.AtletaID, Vinculo: f.Vinculo, Puntuacion: f.Puntuacion, Motivo: f.Motivo}
		if f.AtletaID != nil {
			if x := ids[*f.AtletaID]; x != nil {
				v.Nombre = x.nombreCompleto()
			} else {
				e.Avisos = append(e.Avisos, Aviso{f.EntryID, "El atleta vinculado ya no está confirmado en la competición."})
			}
		}
		if r, ok := res[f.EntryID]; ok && f.AtletaID == nil {
			v.Candidatos = r.candidatos
		}
		e.Vinculos = append(e.Vinculos, v)
	}
	return e
}

// ---- what goes to athletes and live ----

type pesaje struct {
	Peso     float64 `json:"peso"`
	RackSQ   *int    `json:"rackSq,omitempty"`
	RackBP   string  `json:"rackBp,omitempty"`
	Intentos struct {
		SQ *float64 `json:"sq,omitempty"`
		BP *float64 `json:"bp,omitempty"`
		DL *float64 `json:"dl,omitempty"`
	} `json:"intentos"`
	Por string `json:"por,omitempty"`
}

func primero(kg []float64) *float64 {
	if len(kg) > 0 && kg[0] > 0 {
		v := kg[0]
		return &v
	}
	return nil
}

// rack reads the first number of OpenLifter's free text («12», «12 in», «8/out»).
func rack(s string) *int {
	s = strings.TrimSpace(s)
	i := 0
	for i < len(s) && s[i] >= '0' && s[i] <= '9' {
		i++
	}
	if n, err := strconv.Atoi(s[:i]); err == nil && n >= 1 && n <= 30 {
		return &n
	}
	return nil
}

func pesajeDe(e *Entrada) *pesaje {
	if e.BodyweightKg < 20 || e.BodyweightKg > 300 {
		return nil // not weighed yet (OpenLifter keeps 0)
	}
	p := &pesaje{Peso: float64(int64(e.BodyweightKg*100+0.5)) / 100, RackSQ: rack(e.SquatRackInfo)}
	if bp := strings.TrimSpace(e.BenchRackInfo); bp != "" {
		p.RackBP = string([]rune(bp)[:min(10, len([]rune(bp)))])
	}
	p.Intentos.SQ, p.Intentos.BP, p.Intentos.DL = primero(e.SquatKg), primero(e.BenchKg), primero(e.DeadliftKg)
	return p
}

type intentoOL struct {
	Movimiento string  `json:"movimiento"`
	Numero     int     `json:"numero"`
	Peso       float64 `json:"peso"`
	Resultado  string  `json:"resultado"`
}

func intentosDe(e *Entrada) []intentoOL {
	var out []intentoOL
	for _, m := range []struct {
		mov string
		kg  []float64
		st  []int
	}{{"sq", e.SquatKg, e.SquatStatus}, {"bp", e.BenchKg, e.BenchStatus}, {"dl", e.DeadliftKg, e.DeadliftStatus}} {
		for i := 0; i < 3 && i < len(m.kg); i++ { // the 4th attempt (records) does not count for the total
			if m.kg[i] <= 0 || m.kg[i] > 600 {
				continue
			}
			r := "pendiente"
			if i < len(m.st) {
				switch m.st[i] {
				case 1:
					r = "valido"
				case -1:
					r = "nulo"
				}
			}
			out = append(out, intentoOL{m.mov, i + 1, m.kg[i], r})
		}
	}
	return out
}

func huella(v any) string {
	b, _ := json.Marshal(v)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:12])
}

var movDe = map[string]string{"S": "sq", "B": "bp", "D": "dl"}

func statusDe(e *Entrada, lift string) []int {
	switch lift {
	case "S":
		return e.SquatStatus
	case "B":
		return e.BenchStatus
	}
	return e.DeadliftStatus
}

// aplicar sends the weigh-in and the attempts of the given linked entries, plus the live group, and stores what
// was applied (a failure is retried on the next sync because the stored fingerprint does not change).
func (s *Svc) aplicar(ctx context.Context, cid uuid.UUID, mesa, por string, filas []*fila, enviar map[int]bool, grupo *Grupo, ids map[uuid.UUID]*identidad, est *Estado) {
	type atletaOL struct {
		AtletaID uuid.UUID   `json:"atletaId"`
		Intentos []intentoOL `json:"intentos"`
	}
	var lote []atletaOL
	porAtleta := map[uuid.UUID]*fila{}
	nuevosIntentos := map[int]string{}
	for _, f := range filas {
		if !enviar[f.EntryID] || f.AtletaID == nil || (f.Vinculo != "auto" && f.Vinculo != "confirmado") || ids[*f.AtletaID] == nil {
			continue
		}
		porAtleta[*f.AtletaID] = f
		if p := pesajeDe(&f.Datos); p != nil {
			if h := huella(p); h != f.PesajeHash {
				p.Por = por
				if err := s.athletes.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/atletas/"+f.AtletaID.String()+"/pesaje", p, nil); err != nil {
					est.Avisos = append(est.Avisos, Aviso{f.EntryID, "Pesaje no guardado: " + mensaje(err)})
				} else if _, err := s.a.DB.Exec(ctx, `UPDATE entradas SET pesaje_hash = $4 WHERE competition_id = $1 AND mesa = $2 AND entry_id = $3`, cid, mesa, f.EntryID, h); err == nil {
					f.PesajeHash = h
					est.Aplicado.Pesajes++
				}
			}
		}
		if its := intentosDe(&f.Datos); len(its) > 0 {
			if h := huella(its); h != f.IntentosHash {
				lote = append(lote, atletaOL{*f.AtletaID, its})
				nuevosIntentos[f.EntryID] = h
			}
		}
	}
	body := map[string]any{"por": por, "atletas": lote}
	if grupo != nil {
		// The live follows the desk's group once a decision of that group and lift exists (not while testing).
		var grupoIDs []uuid.UUID
		juzgado := false
		for _, f := range filas {
			d := &f.Datos
			if d.Day != grupo.Day || d.Platform != grupo.Platform || d.Flight != grupo.Flight {
				continue
			}
			for i, st := range statusDe(d, grupo.Lift) {
				if i < 3 && st != 0 {
					juzgado = true
				}
			}
			if f.AtletaID != nil && (f.Vinculo == "auto" || f.Vinculo == "confirmado") && len(grupoIDs) < 100 {
				grupoIDs = append(grupoIDs, *f.AtletaID)
			}
		}
		if juzgado && len(grupoIDs) > 0 {
			body["estado"] = map[string]any{"atletas": grupoIDs, "movimiento": movDe[grupo.Lift]}
		}
	}
	if len(lote) == 0 && body["estado"] == nil {
		return
	}
	var r struct {
		Intentos     int  `json:"intentos"`
		Veredictos   int  `json:"veredictos"`
		Correcciones int  `json:"correcciones"`
		Estado       bool `json:"estado"`
		Avisos       []struct {
			AtletaID uuid.UUID `json:"atletaId"`
			Mensaje  string    `json:"mensaje"`
		} `json:"avisos"`
	}
	if err := s.live.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/directo/openlifter", body, &r); err != nil {
		est.Avisos = append(est.Avisos, Aviso{Mensaje: "El directo no ha recibido los intentos: " + mensaje(err) + " Se reintentará."})
		return
	}
	est.Aplicado.Intentos, est.Aplicado.Veredictos, est.Aplicado.Correcciones, est.Aplicado.Estado = r.Intentos, r.Veredictos, r.Correcciones, r.Estado
	conAviso := map[uuid.UUID]bool{}
	for _, a := range r.Avisos {
		x := Aviso{Mensaje: a.Mensaje}
		if f := porAtleta[a.AtletaID]; f != nil && a.AtletaID != uuid.Nil {
			x.EntryID = f.EntryID
			conAviso[a.AtletaID] = true
		}
		est.Avisos = append(est.Avisos, x)
	}
	for _, f := range filas {
		h, ok := nuevosIntentos[f.EntryID]
		if !ok || conAviso[*f.AtletaID] {
			continue
		}
		if _, err := s.a.DB.Exec(ctx, `UPDATE entradas SET intentos_hash = $4 WHERE competition_id = $1 AND mesa = $2 AND entry_id = $3`, cid, mesa, f.EntryID, h); err == nil {
			f.IntentosHash = h
		}
	}
}

func mensaje(err error) string {
	var p *problem.Error
	if errors.As(err, &p) && p.Detail != "" {
		return p.Detail
	}
	return "servicio no disponible."
}

// ---- endpoints ----

func (s *Svc) register() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/openlifter"

	// Athletes to create the OpenLifter registration from the platform (no matching needed afterwards).
	type AtletaImport struct {
		ID              uuid.UUID `json:"id"`
		Nombre          string    `json:"nombre"`
		Sexo            string    `json:"sexo"`
		FechaNacimiento string    `json:"fechaNacimiento,omitempty"`
		Categoria       string    `json:"categoria"`
		Division        string    `json:"division"`
		Club            string    `json:"club,omitempty"`
		Licencia        string    `json:"licencia,omitempty"`
		Instagram       string    `json:"instagram,omitempty"`
		Flight          string    `json:"flight,omitempty"`
		Plataforma      *int      `json:"plataforma,omitempty"`
		PesoCorporal    *float64  `json:"pesoCorporal,omitempty"`
		Primeros        struct {
			SQ *float64 `json:"sq,omitempty"`
			BP *float64 `json:"bp,omitempty"`
			DL *float64 `json:"dl,omitempty"`
		} `json:"primeros"`
		RackSQ *int   `json:"rackSq,omitempty"`
		RackBP string `json:"rackBp,omitempty"`
	}
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	type atletasOut struct {
		Body struct {
			Atletas []AtletaImport `json:"atletas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-atletas", Method: http.MethodGet, Path: base + "/atletas", Summary: "Atletas confirmados para crear la inscripción de OpenLifter", Tags: tag, Security: bearer},
		func(ctx context.Context, in *cidIn) (*atletasOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			ids, err := s.identidades(ctx, in.CID, true)
			if err != nil {
				return nil, err
			}
			o := &atletasOut{}
			o.Body.Atletas = make([]AtletaImport, 0, len(ids))
			for _, x := range ids {
				a := AtletaImport{ID: x.ID, Nombre: x.nombreCompleto(), Sexo: x.Sexo, FechaNacimiento: x.FechaNacimiento, Categoria: x.Categoria, Division: x.Division,
					Club: x.Club, Licencia: x.Licencia, Instagram: x.Instagram, Flight: x.Flight, Plataforma: x.Plataforma, PesoCorporal: x.PesoCorporal, RackSQ: x.RackSQ, RackBP: x.RackBP}
				a.Primeros.SQ, a.Primeros.BP, a.Primeros.DL = x.Primeros.SQ, x.Primeros.BP, x.Primeros.DL
				o.Body.Atletas = append(o.Body.Atletas, a)
			}
			return o, nil
		})

	type syncIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Mesa        string    `json:"mesa" minLength:"1" maxLength:"120" doc:"Clave de la competición de OpenLifter (nombre y fecha)"`
			Dispositivo string    `json:"dispositivo" maxLength:"64" doc:"Identificador del navegador de la mesa"`
			Rev         int64     `json:"rev" minimum:"0" doc:"Revisión creciente de este dispositivo"`
			Grupo       *Grupo    `json:"grupo,omitempty"`
			Entradas    []Entrada `json:"entradas" maxItems:"1000" doc:"Entradas cambiadas (o todas)"`
			Borradas    []int     `json:"borradas,omitempty" maxItems:"1000"`
		}
	}
	type estadoOut struct{ Body Estado }
	huma.Register(api, huma.Operation{OperationID: "openlifter-sync", Method: http.MethodPost, Path: base + "/sync", Summary: "Enviar el estado de la mesa de OpenLifter (idempotente)", Tags: tag, Security: bearer, MaxBodyBytes: 4 << 20},
		func(ctx context.Context, in *syncIn) (*estadoOut, error) {
			por, err := operar(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			b := in.Body
			ids, err := s.identidades(ctx, in.CID, false)
			if err != nil {
				return nil, err
			}
			var filas []*fila
			var res map[int]emparejado
			var cambiados map[int]bool
			var rev int64
			ignorada := false
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := bloquear(ctx, tx, in.CID, b.Mesa); err != nil {
					return err
				}
				var disp string
				err := tx.QueryRow(ctx, `SELECT dispositivo, rev FROM mesas WHERE competition_id = $1 AND mesa = $2`, in.CID, b.Mesa).Scan(&disp, &rev)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				// A delayed retry of an older revision of the same browser must not undo a newer one.
				ignorada = err == nil && disp == b.Dispositivo && b.Rev <= rev
				if !ignorada {
					rev = b.Rev
					if _, err := tx.Exec(ctx, `INSERT INTO mesas (competition_id, mesa, dispositivo, rev, grupo, por) VALUES ($1,$2,$3,$4,$5,$6)
						ON CONFLICT (competition_id, mesa) DO UPDATE SET dispositivo = $3, rev = $4, grupo = COALESCE($5, mesas.grupo), por = $6, updated_at = now()`,
						in.CID, b.Mesa, b.Dispositivo, b.Rev, b.Grupo, por); err != nil {
						return err
					}
					for i := range b.Entradas {
						e := &b.Entradas[i]
						if _, err := tx.Exec(ctx, `INSERT INTO entradas (competition_id, mesa, entry_id, datos) VALUES ($1,$2,$3,$4)
							ON CONFLICT (competition_id, mesa, entry_id) DO UPDATE SET datos = $4, updated_at = now()`, in.CID, b.Mesa, e.ID, e); err != nil {
							return err
						}
					}
					if len(b.Borradas) > 0 {
						if _, err := tx.Exec(ctx, `DELETE FROM entradas WHERE competition_id = $1 AND mesa = $2 AND entry_id = ANY($3)`, in.CID, b.Mesa, b.Borradas); err != nil {
							return err
						}
					}
				}
				if filas, err = cargar(ctx, tx, in.CID, b.Mesa); err != nil {
					return err
				}
				res, cambiados, err = rematch(ctx, tx, in.CID, b.Mesa, filas, ids)
				return err
			})
			if err != nil {
				return nil, err
			}
			idx := indexar(ids)
			est := vista(b.Mesa, rev, filas, res, idx)
			est.Ignorada = ignorada
			if !ignorada {
				enviar := cambiados
				for _, e := range b.Entradas {
					enviar[e.ID] = true
				}
				s.aplicar(ctx, in.CID, b.Mesa, por, filas, enviar, b.Grupo, idx, &est)
			}
			return &estadoOut{Body: est}, nil
		})

	type mesaIn struct {
		CID  uuid.UUID `path:"cid"`
		Mesa string    `query:"mesa" required:"true" maxLength:"120"`
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-vinculos", Method: http.MethodGet, Path: base + "/vinculos", Summary: "Vínculos de las entradas de una mesa con los atletas", Tags: tag, Security: bearer},
		func(ctx context.Context, in *mesaIn) (*estadoOut, error) {
			if _, err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			ids, err := s.identidades(ctx, in.CID, false)
			if err != nil {
				return nil, err
			}
			var filas []*fila
			var res map[int]emparejado
			var rev int64
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := bloquear(ctx, tx, in.CID, in.Mesa); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `SELECT rev FROM mesas WHERE competition_id = $1 AND mesa = $2`, in.CID, in.Mesa).Scan(&rev); err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				var err error
				if filas, err = cargar(ctx, tx, in.CID, in.Mesa); err != nil {
					return err
				}
				res, _, err = rematch(ctx, tx, in.CID, in.Mesa, filas, ids)
				return err
			})
			if err != nil {
				return nil, err
			}
			return &estadoOut{Body: vista(in.Mesa, rev, filas, res, indexar(ids))}, nil
		})

	type cambio struct {
		EntryID  int        `json:"entryId" minimum:"0"`
		AtletaID *uuid.UUID `json:"atletaId,omitempty" doc:"Atleta elegido; vacío para desvincular"`
		Ignorar  bool       `json:"ignorar,omitempty" doc:"Esta entrada no se sincroniza (no es de la competición)"`
	}
	type vincIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Mesa    string   `json:"mesa" minLength:"1" maxLength:"120"`
			Cambios []cambio `json:"cambios" minItems:"1" maxItems:"1000"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "openlifter-vincular", Method: http.MethodPut, Path: base + "/vinculos", Summary: "Confirmar, cambiar o quitar el atleta de entradas de OpenLifter", Tags: tag, Security: bearer},
		func(ctx context.Context, in *vincIn) (*estadoOut, error) {
			por, err := operar(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			b := in.Body
			ids, err := s.identidades(ctx, in.CID, true)
			if err != nil {
				return nil, err
			}
			idx := indexar(ids)
			for _, c := range b.Cambios {
				if c.AtletaID != nil && idx[*c.AtletaID] == nil {
					return nil, problem.Unprocessable("ATLETA_NO_VALIDO", "Ese atleta no está confirmado en la competición.")
				}
			}
			var filas []*fila
			var res map[int]emparejado
			var rev int64
			enviar := map[int]bool{}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if err := bloquear(ctx, tx, in.CID, b.Mesa); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `SELECT rev FROM mesas WHERE competition_id = $1 AND mesa = $2`, in.CID, b.Mesa).Scan(&rev); err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}
				for _, c := range b.Cambios {
					vinc, motivo := "sin_coincidencia", ""
					switch {
					case c.AtletaID != nil:
						vinc, motivo = "confirmado", "Confirmado por "+strings.TrimPrefix(por, "OpenLifter · ")
						// the athlete leaves any other entry of this desk
						if _, err := tx.Exec(ctx, `UPDATE entradas SET atleta_id = NULL, vinculo = 'sin_coincidencia', puntuacion = 0, motivo = '', updated_at = now()
							WHERE competition_id = $1 AND mesa = $2 AND atleta_id = $3 AND entry_id <> $4`, in.CID, b.Mesa, *c.AtletaID, c.EntryID); err != nil {
							return err
						}
					case c.Ignorar:
						vinc = "ignorado"
					}
					var nombre string
					if err := tx.QueryRow(ctx, `INSERT INTO entradas (competition_id, mesa, entry_id, datos, atleta_id, vinculo, puntuacion, motivo) VALUES ($1,$2,$3,'{}',$4,$5,$6,$7)
						ON CONFLICT (competition_id, mesa, entry_id) DO UPDATE SET atleta_id = $4, vinculo = $5, puntuacion = $6, motivo = $7, pesaje_hash = '', intentos_hash = '', updated_at = now()
						RETURNING COALESCE(entradas.datos->>'name', '')`, in.CID, b.Mesa, c.EntryID, c.AtletaID, vinc, map[bool]float64{true: 1}[c.AtletaID != nil], motivo).Scan(&nombre); err != nil {
						return err
					}
					if k := clave(nombre); c.AtletaID != nil && k != "" {
						if _, err := tx.Exec(ctx, `INSERT INTO alias (competition_id, clave, atleta_id) VALUES ($1,$2,$3) ON CONFLICT (competition_id, clave) DO UPDATE SET atleta_id = $3`,
							in.CID, k, *c.AtletaID); err != nil {
							return err
						}
					}
					enviar[c.EntryID] = true
				}
				var err error
				if filas, err = cargar(ctx, tx, in.CID, b.Mesa); err != nil {
					return err
				}
				var cambiados map[int]bool
				res, cambiados, err = rematch(ctx, tx, in.CID, b.Mesa, filas, ids)
				for k := range cambiados {
					enviar[k] = true
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			est := vista(b.Mesa, rev, filas, res, idx)
			s.aplicar(ctx, in.CID, b.Mesa, por, filas, enviar, nil, idx, &est)
			return &estadoOut{Body: est}, nil
		})
}

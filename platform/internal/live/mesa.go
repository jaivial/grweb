package live

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagDirecto = []string{"Directo"}

// Pantalla are the arena screen settings.
type Pantalla struct {
	Siguientes bool `json:"siguientes" doc:"Mostrar los 3 siguientes"`
	Carrusel   bool `json:"carrusel" doc:"Carrusel de patrocinadores entre intentos"`
	QR         bool `json:"qr" doc:"QR de /en-directo"`
	Ver        int  `json:"ver,omitempty" readOnly:"true"`
}

// Estado is the live state of a competition.
type Estado struct {
	Version      int        `json:"version"`
	Fase         string     `json:"fase" enum:"antes,en_directo,finalizado"`
	FlightID     *uuid.UUID `json:"flightId,omitempty"`
	Movimiento   string     `json:"movimiento" enum:"sq,bp,dl"`
	Pausa        bool       `json:"pausa"`
	RetrasoMin   int        `json:"retrasoMin"`
	StreamURL    string     `json:"streamUrl"`
	ReplayURL    string     `json:"replayUrl"`
	Pantalla     Pantalla   `json:"pantalla"`
	PublicarAuto bool       `json:"publicarAuto"`
	TurnoAt      *time.Time `json:"turnoAt,omitempty"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

const selEstado = `SELECT version, fase, flight_id, movimiento, pausa, retraso_min, stream_url, replay_url, pantalla, publicar_auto, turno_at, updated_at FROM estado WHERE competition_id = $1`

func scanEstado(r pgx.Row) (Estado, error) {
	var e Estado
	err := r.Scan(&e.Version, &e.Fase, &e.FlightID, &e.Movimiento, &e.Pausa, &e.RetrasoMin, &e.StreamURL, &e.ReplayURL, &e.Pantalla, &e.PublicarAuto, &e.TurnoAt, &e.UpdatedAt)
	return e, err
}

// estado reads (creating if needed) the live state; lock=true takes the row lock for a change.
func (s *Svc) estado(ctx context.Context, tx pgx.Tx, cid uuid.UUID, lock bool) (Estado, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO estado (competition_id) VALUES ($1) ON CONFLICT DO NOTHING`, cid); err != nil {
		return Estado{}, err
	}
	q := selEstado
	if lock {
		q += ` FOR UPDATE`
	}
	return scanEstado(tx.QueryRow(ctx, q, cid))
}

func (s *Svc) estadoLeer(ctx context.Context, cid uuid.UUID) (Estado, error) {
	e, err := scanEstado(s.a.DB.QueryRow(ctx, selEstado, cid))
	if errors.Is(err, pgx.ErrNoRows) {
		return Estado{Version: 0, Fase: "antes", Movimiento: "sq", Pantalla: Pantalla{Siguientes: true, Carrusel: true, Ver: 1}, PublicarAuto: true}, nil
	}
	return e, err
}

// ---- the desk view ----

// IntentoMesa is an attempt cell of the desk table.
type IntentoMesa struct {
	ID        uuid.UUID `json:"id"`
	Peso      float64   `json:"peso"`
	Votos     string    `json:"votos"`
	Resultado string    `json:"resultado" enum:"pendiente,valido,nulo,renuncia"`
	Corregido bool      `json:"corregido"`
}

// FilaMesa is an athlete row of the desk.
type FilaMesa struct {
	ID           uuid.UUID                  `json:"id"`
	Lote         int                        `json:"lote"`
	Nombre       string                     `json:"nombre"`
	Sexo         string                     `json:"sexo"`
	Categoria    string                     `json:"categoria"`
	Club         string                     `json:"club"`
	Division     string                     `json:"division"`
	PesoCorporal *float64                   `json:"pesoCorporal,omitempty"`
	RackSQ       *int                       `json:"rackSq,omitempty"`
	RackBP       string                     `json:"rackBp,omitempty"`
	Intentos     map[string][3]*IntentoMesa `json:"intentos"`
	Mejor        map[string]*float64        `json:"mejor"`
	Total        *float64                   `json:"total,omitempty"`
	Turno        int                        `json:"turno" doc:"Posición en la cola (1 = en la plataforma, 0 = ha terminado el movimiento)"`
	SinPeso      bool                       `json:"sinPeso,omitempty" doc:"No tiene declarado el intento que le toca"`
}

// Turno is an athlete in the queue of the platform.
type Turno struct {
	AtletaID  uuid.UUID  `json:"atletaId"`
	Nombre    string     `json:"nombre"`
	Club      string     `json:"club"`
	Sexo      string     `json:"sexo"`
	Categoria string     `json:"categoria"`
	Lote      int        `json:"lote"`
	IntentoID *uuid.UUID `json:"intentoId,omitempty"`
	Numero    int        `json:"numero"`
	Peso      float64    `json:"peso"`
	RackSQ    *int       `json:"rackSq,omitempty"`
	RackBP    string     `json:"rackBp,omitempty"`
	Frase     string     `json:"frase,omitempty"`
}

// FlightMesa is a published flight with its progress.
type FlightMesa struct {
	ID         uuid.UUID `json:"id"`
	Codigo     string    `json:"codigo"`
	Titulo     string    `json:"titulo"`
	Plataforma int       `json:"plataforma"`
	Dia        string    `json:"dia"`
	Inicio     time.Time `json:"inicio"`
	Atletas    int       `json:"atletas"`
	Hechos     int       `json:"hechos" doc:"Intentos resueltos"`
	Estado     string    `json:"estado" enum:"programado,en_curso,finalizado"`
}

// Mesa is the desk: state, flights and the current flight table.
type Mesa struct {
	Estado              Estado       `json:"estado"`
	HorariosPublicados  bool         `json:"horariosPublicados"`
	Espectadores        int          `json:"espectadores"`
	PantallaPing        *time.Time   `json:"pantallaPing,omitempty"`
	Flights             []FlightMesa `json:"flights"`
	Flight              *FlightMesa  `json:"flight,omitempty"`
	Ronda               int          `json:"ronda" doc:"1-3; 4 = el movimiento ha terminado"`
	Atletas             []FilaMesa   `json:"atletas"`
	Actual              *Turno       `json:"actual,omitempty"`
	Siguientes          []Turno      `json:"siguientes"`
	MovimientoCompleto  bool         `json:"movimientoCompleto"`
	SiguienteMovimiento string       `json:"siguienteMovimiento,omitempty"`
	FlightCompleto      bool         `json:"flightCompleto"`
}

func turnoDe(t turno) Turno {
	x := Turno{AtletaID: t.Atleta.ID, Nombre: t.Atleta.Nombre, Club: t.Atleta.Club, Sexo: t.Atleta.Sexo, Categoria: t.Atleta.Categoria, Lote: t.Atleta.Lote,
		Numero: t.Numero, Peso: t.Peso, RackSQ: t.Atleta.RackSQ, RackBP: t.Atleta.RackBP, Frase: t.Atleta.Frase}
	if t.Intento != nil {
		id := t.Intento.ID
		x.IntentoID = &id
	}
	return x
}

func progreso(f *flight, t tabla, e Estado) FlightMesa {
	fm := FlightMesa{ID: f.ID, Codigo: f.Codigo, Titulo: f.Titulo, Plataforma: f.Plataforma, Dia: f.Dia, Inicio: f.Inicio, Atletas: len(f.Atletas), Estado: "programado"}
	for _, x := range f.Atletas {
		for _, m := range movs {
			for n := 1; n <= 3; n++ {
				if t.get(x.ID, m, n).resuelto() {
					fm.Hechos++
				}
			}
		}
	}
	switch {
	case flightCompleto(f, t):
		fm.Estado = "finalizado"
	case e.FlightID != nil && *e.FlightID == f.ID && e.Fase == "en_directo":
		fm.Estado = "en_curso"
	}
	return fm
}

var sigMov = map[string]string{"sq": "bp", "bp": "dl"}

func (s *Svc) mesa(ctx context.Context, cid uuid.UUID) (*Mesa, error) {
	p, err := s.cargarPlan(ctx, cid)
	if err != nil {
		return nil, err
	}
	e, err := s.estadoLeer(ctx, cid)
	if err != nil {
		return nil, err
	}
	// A late weigh-in (openers entered after the flight started) is picked up here.
	if e.FlightID != nil && e.Fase == "en_directo" {
		if f := p.flight(*e.FlightID); f != nil {
			if err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return abrir(ctx, tx, cid, p, f, e.Movimiento) }); err != nil {
				return nil, err
			}
		}
	}
	t, err := cargarIntentos(ctx, s.a.DB, cid)
	if err != nil {
		return nil, err
	}
	m := &Mesa{Estado: e, HorariosPublicados: len(p.Flights) > 0, Espectadores: s.espectadores(ctx, cid), Flights: []FlightMesa{}, Atletas: []FilaMesa{}, Siguientes: []Turno{}}
	if v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("live", "pantalla-ping", cid.String())).Int64(); err == nil {
		at := time.Unix(v, 0)
		m.PantallaPing = &at
	}
	for i := range p.Flights {
		m.Flights = append(m.Flights, progreso(&p.Flights[i], t, e))
	}
	if e.FlightID == nil {
		return m, nil
	}
	f := p.flight(*e.FlightID)
	if f == nil {
		return m, nil // the flight left the published schedule: the desk picks another one
	}
	fm := progreso(f, t, e)
	m.Flight = &fm
	m.FlightCompleto = fm.Estado == "finalizado"
	ronda, cola := orden(p, f, t, e.Movimiento)
	m.Ronda = ronda
	m.MovimientoCompleto = ronda > 3
	if m.MovimientoCompleto {
		m.SiguienteMovimiento = sigMov[e.Movimiento]
	}
	pos := map[uuid.UUID]int{}
	for i, x := range cola {
		if x.Numero == ronda {
			pos[x.Atleta.ID] = i + 1
		}
	}
	if len(cola) > 0 && cola[0].Numero == ronda {
		a := turnoDe(cola[0])
		m.Actual = &a
		for _, x := range cola[1:] {
			if len(m.Siguientes) == 5 {
				break
			}
			m.Siguientes = append(m.Siguientes, turnoDe(x))
		}
	}
	for _, x := range f.Atletas {
		a := p.Atletas[x.ID]
		if a == nil {
			continue
		}
		r := FilaMesa{ID: a.ID, Lote: x.Lote, Nombre: a.Nombre, Sexo: a.Sexo, Categoria: a.Categoria, Club: a.Club, Division: a.DivisionNombre, PesoCorporal: a.PesoCorporal,
			RackSQ: a.RackSQ, RackBP: a.RackBP, Intentos: map[string][3]*IntentoMesa{}, Mejor: map[string]*float64{}, Turno: pos[a.ID]}
		var total float64
		todos := true
		for _, mv := range movs {
			var cs [3]*IntentoMesa
			var mejor *float64
			for n := 1; n <= 3; n++ {
				if it := t.get(a.ID, mv, n); it != nil {
					cs[n-1] = &IntentoMesa{ID: it.ID, Peso: it.Peso, Votos: it.Votos, Resultado: it.Resultado, Corregido: it.CorregidoPor != ""}
					if it.Resultado == "valido" && (mejor == nil || it.Peso > *mejor) {
						v := it.Peso
						mejor = &v
					}
				}
			}
			r.Intentos[mv], r.Mejor[mv] = cs, mejor
			if mejor == nil {
				todos = false
			} else {
				total += *mejor
			}
		}
		if todos {
			r.Total = &total
		}
		if r.Turno > 0 {
			for _, q := range cola {
				if q.Atleta.ID == a.ID && q.Peso == 0 {
					r.SinPeso = true
				}
			}
		}
		m.Atletas = append(m.Atletas, r)
	}
	return m, nil
}

// abrir creates the first attempts of a lift from the openers declared at the weigh-in (idempotent).
func abrir(ctx context.Context, tx pgx.Tx, cid uuid.UUID, p *plan, f *flight, mov string) error {
	for _, x := range f.Atletas {
		a := p.Atletas[x.ID]
		if a == nil || a.Primeros.de(mov) == nil {
			continue
		}
		if _, err := tx.Exec(ctx, `INSERT INTO intentos (id, competition_id, atleta_id, flight_id, movimiento, numero, peso) VALUES ($1,$2,$3,$4,$5,1,$6)
			ON CONFLICT (competition_id, atleta_id, movimiento, numero) DO NOTHING`, newID(), cid, a.ID, f.ID, mov, *a.Primeros.de(mov)); err != nil {
			return err
		}
	}
	return nil
}

// ---- weights ----

// validarPeso applies the IPF loading rules: multiples of 2.5 kg (0.5 kg for a record attempt), never lighter than
// the previous attempt, and at least 2.5 kg more after a good lift.
func validarPeso(peso float64, record bool, prev *intento) error {
	paso := 2.5
	if record {
		paso = 0.5
	}
	if peso < 20 || peso > 500 {
		return problem.Unprocessable("PESO_NO_VALIDO", "El peso debe estar entre 20 y 500 kg.")
	}
	if r := math.Mod(peso*10, paso*10); r > 0.001 && paso*10-r > 0.001 {
		if record {
			return problem.Unprocessable("PESO_NO_VALIDO", "En un intento de récord el peso va de 0,5 en 0,5 kg.")
		}
		return problem.Unprocessable("PESO_NO_VALIDO", "El peso va de 2,5 en 2,5 kg (marca «Récord» para pesos de 0,5 kg).")
	}
	if prev == nil {
		return nil
	}
	min := prev.Peso
	if prev.Resultado == "valido" {
		min += paso
	}
	if peso+0.001 < min {
		return problem.Unprocessable("PESO_NO_VALIDO", fmt.Sprintf("No puede ser menos de %s kg (intento anterior: %s kg, %s).", kg(min), kg(prev.Peso), map[string]string{"valido": "válido", "nulo": "nulo", "renuncia": "renuncia", "pendiente": "sin juzgar"}[prev.Resultado]))
	}
	return nil
}

// ---- schedule sync (the public /horarios shows the live flight and the delay; athletes times the 30-min notice) ----

func (s *Svc) sincronizarHorarios(ctx context.Context, cid uuid.UUID, p *plan, e Estado, t tabla) {
	if e.FlightID == nil {
		return
	}
	cur := p.flight(*e.FlightID)
	if cur == nil {
		return
	}
	key := s.a.Keys.Of("live", "horarios", cid.String())
	for i := range p.Flights {
		f := &p.Flights[i]
		if f.Dia != cur.Dia {
			continue
		}
		estado, retraso := "programado", 0
		switch {
		case flightCompleto(f, t) || (f.ID == cur.ID && e.Fase == "finalizado"):
			estado = "finalizado"
		case f.ID == cur.ID && e.Fase == "en_directo":
			estado = "en_curso"
		}
		if !f.Inicio.Before(cur.Inicio) && estado != "finalizado" {
			retraso = e.RetrasoMin
		}
		v := estado + "|" + itoa(retraso)
		if old, _ := s.a.Redis.HGet(ctx, key, f.ID.String()).Result(); old == v {
			continue
		}
		if err := s.schedule.Do(ctx, http.MethodPut, "/internal/competiciones/"+cid.String()+"/horarios/flights/"+f.ID.String()+"/directo",
			map[string]any{"estado": estado, "retrasoMin": retraso}, nil); err != nil {
			s.a.Log.Warn("estado del flight en horarios", "flight", f.Codigo, "err", err)
			continue
		}
		s.a.Redis.HSet(ctx, key, f.ID.String(), v)
		s.a.Redis.Expire(ctx, key, 14*24*time.Hour)
	}
}

// ---- endpoints ----

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

type mesaOut struct {
	ETag string `header:"ETag"`
	Body *Mesa
}

func out(m *Mesa) *mesaOut { return &mesaOut{ETag: fmt.Sprintf(`"%d"`, m.Estado.Version), Body: m} }

func (s *Svc) registerMesa() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/directo"
	leer := func(ctx context.Context, cid uuid.UUID) error {
		_, err := requireAny(ctx, cid, "Tu rol no tiene acceso al directo de esta competición.", "directo.operar", "resultados.publicar")
		return err
	}
	operar := func(ctx context.Context, cid uuid.UUID) error {
		_, err := requireAny(ctx, cid, "Tu rol no puede operar la mesa (permiso «directo.operar»).", "directo.operar")
		return err
	}
	// after a change: refresh caches, sync /horarios and return the desk
	despues := func(ctx context.Context, cid uuid.UUID) (*mesaOut, error) {
		s.bump(ctx, cid)
		m, err := s.mesa(ctx, cid)
		if err != nil {
			return nil, err
		}
		if p, err := s.cargarPlan(ctx, cid); err == nil {
			if t, err := cargarIntentos(ctx, s.a.DB, cid); err == nil {
				s.sincronizarHorarios(ctx, cid, p, m.Estado, t)
				s.publicarAuto(ctx, cid, p, t, m.Estado)
			}
		}
		return out(m), nil
	}

	huma.Register(api, huma.Operation{OperationID: "directo-mesa", Method: http.MethodGet, Path: base, Summary: "Mesa: estado, flights y tabla del flight en curso", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *cidIn) (*mesaOut, error) {
			if err := leer(ctx, in.CID); err != nil {
				return nil, err
			}
			m, err := s.mesa(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			return out(m), nil
		})

	type estadoIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    struct {
			Fase         string     `json:"fase" enum:"antes,en_directo,finalizado"`
			FlightID     *uuid.UUID `json:"flightId,omitempty"`
			Movimiento   string     `json:"movimiento" enum:"sq,bp,dl"`
			Pausa        bool       `json:"pausa"`
			RetrasoMin   int        `json:"retrasoMin" minimum:"0" maximum:"600"`
			StreamURL    string     `json:"streamUrl" maxLength:"500"`
			ReplayURL    string     `json:"replayUrl" maxLength:"500"`
			Pantalla     Pantalla   `json:"pantalla"`
			PublicarAuto bool       `json:"publicarAuto"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "directo-estado", Method: http.MethodPut, Path: base + "/estado", Summary: "Cambiar flight, movimiento, pausa, retraso, emisión o pantalla", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*mesaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			for _, u := range []string{b.StreamURL, b.ReplayURL} {
				if u != "" && !strings.HasPrefix(u, "https://") {
					return nil, problem.Unprocessable("URL_NO_VALIDA", "La emisión debe ser un enlace https (YouTube, Twitch…).")
				}
			}
			p, err := s.cargarPlan(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			var f *flight
			if b.FlightID != nil {
				if f = p.flight(*b.FlightID); f == nil {
					return nil, problem.Unprocessable("FLIGHT_NO_VALIDO", "Ese flight no está en los horarios publicados.")
				}
			}
			if b.Fase == "en_directo" && f == nil {
				return nil, problem.Unprocessable("FLIGHT_NO_VALIDO", "Elige el flight que empieza.")
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				e, err := s.estado(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != itoa(e.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado el directo. Se ha recargado la mesa.")
				}
				fase := b.Fase
				if fase == "antes" && f != nil && (e.FlightID == nil || *e.FlightID != f.ID) {
					fase = "en_directo" // choosing a flight starts the live
				}
				cambiaTurno := !eqID(e.FlightID, b.FlightID) || e.Movimiento != b.Movimiento || (e.Pausa && !b.Pausa)
				if f != nil && (cambiaTurno || fase == "en_directo") {
					if err := abrir(ctx, tx, in.CID, p, f, b.Movimiento); err != nil {
						return err
					}
				}
				pan := b.Pantalla
				pan.Ver = max(e.Pantalla.Ver, 1)
				if _, err := tx.Exec(ctx, `UPDATE estado SET fase=$2, flight_id=$3, movimiento=$4, pausa=$5, retraso_min=$6, stream_url=$7, replay_url=$8, pantalla=$9,
					publicar_auto=$10, turno_at = CASE WHEN $11 THEN now() ELSE turno_at END, version = version + 1, updated_at = now() WHERE competition_id = $1`,
					in.CID, fase, b.FlightID, b.Movimiento, b.Pausa, b.RetrasoMin, b.StreamURL, b.ReplayURL, pan, b.PublicarAuto, cambiaTurno); err != nil {
					return err
				}
				d := map[string]any{"fase": fase, "movimiento": b.Movimiento, "pausa": b.Pausa, "retrasoMin": b.RetrasoMin}
				sub := "directo"
				if f != nil {
					d["flightId"], d["flight"] = f.ID, f.Codigo
					sub = "flight " + f.Codigo
				}
				if err := evento(ctx, tx, in.CID, "directo.estado", d, events.Subject(sub)); err != nil {
					return err
				}
				// The audit log keeps who started, paused or ended the live and changed the delay.
				if fase != e.Fase || e.Pausa != b.Pausa || e.RetrasoMin != b.RetrasoMin || !eqID(e.FlightID, b.FlightID) {
					return events.Enqueue(ctx, tx, events.New(ctx, "directo.cambio", map[string]any{"antes": map[string]any{"fase": e.Fase, "pausa": e.Pausa, "retrasoMin": e.RetrasoMin},
						"despues": d, "por": actor(ctx)}, events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject(sub)))
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
			return despues(ctx, in.CID)
		})

	type declararIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			AtletaID   uuid.UUID `json:"atletaId"`
			Movimiento string    `json:"movimiento" enum:"sq,bp,dl"`
			Numero     int       `json:"numero" minimum:"1" maximum:"3"`
			Peso       float64   `json:"peso"`
			Record     bool      `json:"record,omitempty" doc:"Intento de récord (incrementos de 0,5 kg)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "directo-declarar", Method: http.MethodPost, Path: base + "/intentos", Summary: "Declarar o cambiar el peso de un intento", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *declararIn) (*mesaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			p, err := s.cargarPlan(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			a := p.Atletas[b.AtletaID]
			if a == nil || a.Flight == uuid.Nil {
				return nil, problem.Unprocessable("ATLETA_NO_VALIDO", "Ese atleta no está en los horarios publicados.")
			}
			err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := s.estado(ctx, tx, in.CID, true); err != nil {
					return err
				}
				t, err := cargarIntentos(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				cur := t.get(a.ID, b.Movimiento, b.Numero)
				if cur.resuelto() {
					return problem.Conflict("YA_JUZGADO", "Ese intento ya está juzgado. Usa «Corregir» si hay un error.")
				}
				var prev *intento
				if b.Numero > 1 {
					if prev = t.get(a.ID, b.Movimiento, b.Numero-1); !prev.resuelto() {
						return problem.Unprocessable("ORDEN_INTENTOS", fmt.Sprintf("Primero hay que juzgar el %s intento.", ordinal[b.Numero-1]))
					}
				}
				if err := validarPeso(b.Peso, b.Record, prev); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO intentos (id, competition_id, atleta_id, flight_id, movimiento, numero, peso) VALUES ($1,$2,$3,$4,$5,$6,$7)
					ON CONFLICT (competition_id, atleta_id, movimiento, numero) DO UPDATE SET peso = EXCLUDED.peso, updated_at = now() WHERE intentos.resultado = 'pendiente'`,
					newID(), in.CID, a.ID, a.Flight, b.Movimiento, b.Numero, b.Peso); err != nil {
					return err
				}
				return evento(ctx, tx, in.CID, "directo.intento", map[string]any{"flightId": a.Flight, "movimiento": b.Movimiento, "numero": b.Numero, "peso": b.Peso})
			})
			if err != nil {
				return nil, err
			}
			return despues(ctx, in.CID)
		})

	type veredictoIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Votos    string `json:"votos,omitempty" pattern:"^[BR]{3}$" doc:"Lateral 1, central, lateral 2 (B blanca, R roja)"`
			Renuncia bool   `json:"renuncia,omitempty" doc:"El atleta no hace el intento"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "directo-veredicto", Method: http.MethodPost, Path: base + "/intentos/{id}/veredicto", Summary: "Luces de los jueces (idempotente: repetir las mismas luces no cambia nada)", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *veredictoIn) (*mesaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			if !b.Renuncia && len(b.Votos) != 3 {
				return nil, problem.Unprocessable("VOTOS_NO_VALIDOS", "Faltan luces: marca los tres jueces.")
			}
			res, votos := "renuncia", ""
			if !b.Renuncia {
				votos = b.Votos
				res = "nulo"
				if strings.Count(votos, "B") >= 2 {
					res = "valido"
				}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := s.estado(ctx, tx, in.CID, true); err != nil {
					return err
				}
				var it intento
				err := tx.QueryRow(ctx, `SELECT atleta_id, flight_id, movimiento, numero, peso::float8, votos, resultado FROM intentos WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).
					Scan(&it.AtletaID, &it.FlightID, &it.Mov, &it.Numero, &it.Peso, &it.Votos, &it.Resultado)
				if errors.Is(err, pgx.ErrNoRows) {
					return problem.NotFound("Intento no encontrado.")
				}
				if err != nil {
					return err
				}
				if it.Resultado != "pendiente" {
					if it.Resultado == res && it.Votos == votos {
						return errYaHecho // replay of a queued decision (offline desk): nothing to do
					}
					return problem.Conflict("YA_JUZGADO", "Ese intento ya estaba juzgado con otras luces. Usa «Corregir» para cambiarlo.")
				}
				if _, err := tx.Exec(ctx, `UPDATE intentos SET votos = $2, resultado = $3, juzgado_at = now(), updated_at = now() WHERE id = $1`, in.ID, votos, res); err != nil {
					return err
				}
				// Default next attempt (the athlete has a minute to change it): +2.5 kg after a good lift, the same otherwise.
				if it.Numero < 3 {
					sig := it.Peso
					if res == "valido" {
						sig += 2.5
					}
					if _, err := tx.Exec(ctx, `INSERT INTO intentos (id, competition_id, atleta_id, flight_id, movimiento, numero, peso) VALUES ($1,$2,$3,$4,$5,$6,$7)
						ON CONFLICT (competition_id, atleta_id, movimiento, numero) DO NOTHING`, newID(), in.CID, it.AtletaID, it.FlightID, it.Mov, it.Numero+1, sig); err != nil {
						return err
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE estado SET turno_at = now() WHERE competition_id = $1`, in.CID); err != nil {
					return err
				}
				return evento(ctx, tx, in.CID, "directo.veredicto", map[string]any{"flightId": it.FlightID, "movimiento": it.Mov, "numero": it.Numero, "peso": it.Peso,
					"votos": votos, "resultado": res})
			})
			if err != nil && !errors.Is(err, errYaHecho) {
				return nil, err
			}
			return despues(ctx, in.CID)
		})

	type correccionIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Votos    string   `json:"votos,omitempty" pattern:"^[BR]{3}$"`
			Renuncia bool     `json:"renuncia,omitempty"`
			Peso     *float64 `json:"peso,omitempty"`
			Motivo   string   `json:"motivo" minLength:"5" maxLength:"200"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "directo-correccion", Method: http.MethodPost, Path: base + "/intentos/{id}/correccion", Summary: "Corregir un intento juzgado (motivo obligatorio, queda en la auditoría)", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *correccionIn) (*mesaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			b := in.Body
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := s.estado(ctx, tx, in.CID, true); err != nil {
					return err
				}
				var it intento
				err := tx.QueryRow(ctx, `SELECT atleta_id, flight_id, movimiento, numero, peso::float8, votos, resultado FROM intentos WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).
					Scan(&it.AtletaID, &it.FlightID, &it.Mov, &it.Numero, &it.Peso, &it.Votos, &it.Resultado)
				if errors.Is(err, pgx.ErrNoRows) {
					return problem.NotFound("Intento no encontrado.")
				}
				if err != nil {
					return err
				}
				if it.Resultado == "pendiente" {
					return problem.Conflict("SIN_JUZGAR", "Ese intento aún no está juzgado: cambia el peso desde la mesa.")
				}
				votos, res := it.Votos, it.Resultado
				switch {
				case b.Renuncia:
					votos, res = "", "renuncia"
				case b.Votos != "":
					votos, res = b.Votos, "nulo"
					if strings.Count(votos, "B") >= 2 {
						res = "valido"
					}
				}
				peso := it.Peso
				if b.Peso != nil {
					if err := validarPeso(*b.Peso, true, nil); err != nil {
						return err
					}
					peso = *b.Peso
				}
				if votos == it.Votos && res == it.Resultado && peso == it.Peso {
					return problem.Unprocessable("VOTOS_NO_VALIDOS", "No has cambiado nada.")
				}
				if _, err := tx.Exec(ctx, `UPDATE intentos SET votos = $2, resultado = $3, peso = $4, corregido_por = $5, motivo = $6, updated_at = now() WHERE id = $1`,
					in.ID, votos, res, peso, actor(ctx), strings.TrimSpace(b.Motivo)); err != nil {
					return err
				}
				antes := map[string]any{"resultado": it.Resultado, "votos": it.Votos, "peso": it.Peso}
				despues := map[string]any{"resultado": res, "votos": votos, "peso": peso}
				if err := evento(ctx, tx, in.CID, "directo.correccion", map[string]any{"flightId": it.FlightID, "movimiento": it.Mov, "numero": it.Numero}); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "directo.correccion_registrada", map[string]any{"intentoId": in.ID, "movimiento": movNombre[it.Mov], "numero": it.Numero,
					"antes": antes, "despues": despues, "motivo": strings.TrimSpace(b.Motivo), "por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject("intento:"+in.ID.String())))
			})
			if err != nil {
				return nil, err
			}
			return despues(ctx, in.CID)
		})

	// The arena screen: its signed URL and whether it is online.
	type pantallaOut struct {
		Body struct {
			URL  string     `json:"url"`
			Ping *time.Time `json:"ping,omitempty"`
		}
	}
	pantallaURL := func(ctx context.Context, cid uuid.UUID, ver int) (string, error) {
		c, err := s.comps.ByID(ctx, cid)
		if err != nil {
			return "", err
		}
		return s.webURL + "/pantalla/" + c.Slug + "?token=" + s.tokenPantalla(cid, ver), nil
	}
	huma.Register(api, huma.Operation{OperationID: "directo-pantalla", Method: http.MethodGet, Path: base + "/pantalla", Summary: "Enlace de la pantalla del pabellón", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *cidIn) (*pantallaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			e, err := s.estadoLeer(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			o := &pantallaOut{}
			if o.Body.URL, err = pantallaURL(ctx, in.CID, max(e.Pantalla.Ver, 1)); err != nil {
				return nil, err
			}
			if v, err := s.a.Redis.Get(ctx, s.a.Keys.Of("live", "pantalla-ping", in.CID.String())).Int64(); err == nil {
				at := time.Unix(v, 0)
				o.Body.Ping = &at
			}
			return o, nil
		})
	huma.Register(api, huma.Operation{OperationID: "directo-pantalla-rotar", Method: http.MethodPost, Path: base + "/pantalla/rotar", Summary: "Nuevo enlace de la pantalla (el anterior deja de valer)", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *cidIn) (*pantallaOut, error) {
			if err := operar(ctx, in.CID); err != nil {
				return nil, err
			}
			var ver int
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := s.estado(ctx, tx, in.CID, true); err != nil {
					return err
				}
				if err := tx.QueryRow(ctx, `UPDATE estado SET pantalla = jsonb_set(pantalla, '{ver}', to_jsonb(COALESCE((pantalla->>'ver')::int, 1) + 1)), version = version + 1, updated_at = now()
					WHERE competition_id = $1 RETURNING (pantalla->>'ver')::int`, in.CID).Scan(&ver); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "directo.pantalla_rotada", map[string]any{"por": actor(ctx)},
					events.Competition(in.CID.String()), events.ForPermission("directo.operar"), events.Subject("pantalla")))
			})
			if err != nil {
				return nil, err
			}
			_ = s.a.Redis.Del(ctx, s.a.Keys.Of("live", "pantalla-ping", in.CID.String())).Err()
			o := &pantallaOut{}
			o.Body.URL, err = pantallaURL(ctx, in.CID, ver)
			return o, err
		})
}

var errYaHecho = errors.New("ya hecho")

func eqID(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

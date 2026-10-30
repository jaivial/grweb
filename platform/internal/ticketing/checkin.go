package ticketing

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

const baseCheckin = "/api/admin/competiciones/{cid}/checkin"

// Escaneo is a scan as the door and the box office see it.
type Escaneo struct {
	ID        uuid.UUID `json:"id"`
	Codigo    string    `json:"codigo"`
	Nombre    string    `json:"nombre"`
	Puesto    string    `json:"puesto"`
	Usuario   string    `json:"usuario"`
	Resultado string    `json:"resultado"`
	Personas  int       `json:"personas"`
	Offline   bool      `json:"offline"`
	At        time.Time `json:"at"`
}

func (s *Svc) escaneos(ctx context.Context, cid uuid.UUID, where string, limit int, args ...any) ([]Escaneo, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT e.id, e.codigo, COALESCE(n.nombre || ' ' || n.apellidos, ''), e.puesto, e.usuario, e.resultado, e.personas, e.offline, e.escaneado_at
		FROM escaneos e LEFT JOIN entradas n ON n.id = e.entrada_id WHERE e.competition_id = $1 AND `+where+fmt.Sprintf(` ORDER BY e.escaneado_at DESC LIMIT %d`, limit), append([]any{cid}, args...)...)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Escaneo])
	if out == nil {
		out = []Escaneo{}
	}
	return out, err
}

// Resultado is the answer of a scan (Figma 59: válida, ya usada, sesión equivocada, QR no válido).
type Resultado struct {
	Resultado  string     `json:"resultado" enum:"valida,ya_usada,otra_sesion,invalida,anulada,manual"`
	Codigo     string     `json:"codigo"`
	Nombre     string     `json:"nombre"`
	Personas   int        `json:"personas"`
	Dentro     int        `json:"dentro"`
	Pendientes int        `json:"pendientes" doc:"Personas que aún pueden entrar con esta entrada"`
	SesionID   *uuid.UUID `json:"sesionId,omitempty"`
	Sesion     string     `json:"sesion"`
	Mensaje    string     `json:"mensaje"`
	Primera    *time.Time `json:"primera,omitempty" doc:"Primer acceso (ya usada)"`
	PuestoAnt  string     `json:"puestoAnterior,omitempty"`
	Registrado bool       `json:"registrado" doc:"Se ha registrado la entrada (no solo comprobado)"`
}

// EscaneoIn is a scan from a station.
type EscaneoIn struct {
	QR          string     `json:"qr,omitempty" maxLength:"80" doc:"Contenido del QR"`
	Codigo      string     `json:"codigo,omitempty" maxLength:"12" doc:"Código tecleado o elegido en la búsqueda"`
	Puesto      string     `json:"puesto" minLength:"1" maxLength:"40"`
	SesionID    *uuid.UUID `json:"sesionId,omitempty" doc:"Sesión que controla el puesto"`
	Confirmar   bool       `json:"confirmar,omitempty" doc:"Registrar la entrada (si no, solo comprobar)"`
	Personas    int        `json:"personas,omitempty" minimum:"0" maximum:"20" doc:"Cuántas entran (por defecto, todas las pendientes)"`
	Forzar      bool       `json:"forzar,omitempty" doc:"Dejar pasar con otra sesión («Permitir igualmente»)"`
	Clave       string     `json:"clave,omitempty" maxLength:"64" doc:"Idempotencia (cola sin conexión)"`
	Offline     bool       `json:"offline,omitempty"`
	EscaneadoAt *time.Time `json:"escaneadoAt,omitempty"`
}

// escanear validates (and, when confirmed, registers) a scan. Idempotent by the device key.
func (s *Svc) escanear(ctx context.Context, cid uuid.UUID, in EscaneoIn) (Resultado, error) {
	var r Resultado
	if in.Clave != "" {
		var prev string
		var cod string
		var pers int
		if err := s.a.DB.QueryRow(ctx, `SELECT resultado, codigo, personas FROM escaneos WHERE idempotency_key = $1`, cid.String()+":"+in.Clave).Scan(&prev, &cod, &pers); err == nil {
			r.Resultado, r.Codigo, r.Personas, r.Registrado, r.Mensaje = prev, cod, pers, prev == "valida" || prev == "manual", "Ya procesado"
			return r, nil
		}
	}
	at := time.Now()
	if in.EscaneadoAt != nil && in.EscaneadoAt.Before(at) && at.Sub(*in.EscaneadoAt) < 72*time.Hour {
		at = *in.EscaneadoAt
	}
	codigo := strings.ToUpper(strings.TrimSpace(in.Codigo))
	if in.QR != "" {
		cod, ok := s.leerQR(cid, in.QR)
		if !ok {
			r.Resultado, r.Mensaje = "invalida", "Firma no reconocida: no es una entrada de esta competición."
			return r, s.registrar(ctx, cid, nil, "", in, r.Resultado, 0, at)
		}
		codigo = cod
	}
	if codigo == "" {
		return r, problem.Unprocessable("SIN_CODIGO", "Escanea un QR o escribe un código.")
	}
	quien := actor(ctx)
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		var id, sid uuid.UUID
		var nombre, ape, estado, sesion string
		var personas, dentro int
		err := tx.QueryRow(ctx, `SELECT e.id, e.sesion_id, e.nombre, e.apellidos, e.estado, s.nombre, e.personas, e.dentro FROM entradas e JOIN sesiones s ON s.id = e.sesion_id
			WHERE e.competition_id = $1 AND e.codigo = $2 FOR UPDATE OF e`, cid, codigo).Scan(&id, &sid, &nombre, &ape, &estado, &sesion, &personas, &dentro)
		if db.IsNoRows(err) {
			r.Resultado, r.Codigo, r.Mensaje = "invalida", codigo, "No hay ninguna entrada con ese código."
			return s.registrarTx(ctx, tx, cid, nil, codigo, in, r.Resultado, 0, at, quien)
		}
		if err != nil {
			return err
		}
		r.Codigo, r.Nombre, r.Personas, r.Dentro, r.Sesion, r.SesionID = codigo, strings.TrimSpace(nombre+" "+ape), personas, dentro, sesion, &sid
		r.Pendientes = max(0, personas-dentro)
		switch {
		case estado == "anulada":
			r.Resultado, r.Mensaje = "anulada", "Esta entrada está anulada."
		case r.Pendientes == 0:
			r.Resultado = "ya_usada"
			var p time.Time
			if err := tx.QueryRow(ctx, `SELECT escaneado_at, puesto FROM escaneos WHERE entrada_id = $1 AND resultado IN ('valida', 'manual') ORDER BY escaneado_at LIMIT 1`, id).Scan(&p, &r.PuestoAnt); err == nil {
				r.Primera = &p
				r.Mensaje = fmt.Sprintf("Entró a las %s · %s", hm(p), r.PuestoAnt)
				// Two doors accepting the same ticket within 2 minutes: an incident for the box office.
				if r.PuestoAnt != in.Puesto && at.Sub(p) < 2*time.Minute {
					if err := events.Enqueue(ctx, tx, events.New(ctx, "checkin.duplicado", map[string]any{"codigo": codigo, "puestos": []string{r.PuestoAnt, in.Puesto}, "segundos": int(at.Sub(p).Seconds())},
						events.Competition(cid.String()), events.ForPermission("checkin.escanear"))); err != nil {
						return err
					}
				}
			} else {
				r.Mensaje = "Ya ha entrado todo el grupo."
			}
		case in.SesionID != nil && *in.SesionID != sid && !in.Forzar:
			r.Resultado, r.Mensaje = "otra_sesion", "Su entrada es para «"+sesion+"»."
		default:
			r.Resultado = "valida"
			r.Mensaje = fmt.Sprintf("%d persona%s · %s", r.Pendientes, map[bool]string{true: "s"}[r.Pendientes != 1], sesion)
		}
		if r.Resultado != "valida" {
			return s.registrarTx(ctx, tx, cid, &id, codigo, in, r.Resultado, 0, at, quien)
		}
		if !in.Confirmar {
			return nil // just checked: nothing recorded until the doorman confirms
		}
		n := in.Personas
		if n <= 0 || n > r.Pendientes {
			n = r.Pendientes
		}
		r.Dentro += n
		r.Pendientes -= n
		r.Registrado = true
		nuevo := "reservada"
		if r.Pendientes == 0 {
			nuevo = "usada"
		}
		if _, err := tx.Exec(ctx, `UPDATE entradas SET dentro = $2, estado = $3, updated_at = now() WHERE id = $1`, id, r.Dentro, nuevo); err != nil {
			return err
		}
		res := "valida"
		if in.Codigo != "" && in.QR == "" {
			res = "manual"
		}
		return s.registrarTx(ctx, tx, cid, &id, codigo, in, res, n, at, quien)
	})
	if db.IsUniqueViolation(err, "") && in.Clave != "" {
		// The same queued scan arrived twice at once: answer with the stored result.
		return s.escanear(ctx, cid, in)
	}
	return r, err
}

func (s *Svc) registrar(ctx context.Context, cid uuid.UUID, id *uuid.UUID, codigo string, in EscaneoIn, res string, n int, at time.Time) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error { return s.registrarTx(ctx, tx, cid, id, codigo, in, res, n, at, actor(ctx)) })
}

func (s *Svc) registrarTx(ctx context.Context, tx pgx.Tx, cid uuid.UUID, id *uuid.UUID, codigo string, in EscaneoIn, res string, n int, at time.Time, quien string) error {
	var clave *string
	if in.Clave != "" {
		k := cid.String() + ":" + in.Clave
		clave = &k
	}
	if _, err := tx.Exec(ctx, `INSERT INTO escaneos (id, competition_id, entrada_id, codigo, puesto, usuario, resultado, personas, idempotency_key, offline, escaneado_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		newID(), cid, id, codigo, in.Puesto, quien, res, n, clave, in.Offline, at); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE puestos SET ultimo_ping_at = now() WHERE competition_id = $1 AND nombre = $2`, cid, in.Puesto); err != nil {
		return err
	}
	return events.Enqueue(ctx, tx, events.New(ctx, "checkin.escaneo", map[string]any{"codigo": codigo, "resultado": res, "puesto": in.Puesto, "personas": n, "offline": in.Offline},
		events.Competition(cid.String()), events.ForPermission("checkin.escanear")))
}

// Puesto is a door or box-office station.
type Puesto struct {
	ID       uuid.UUID  `json:"id"`
	Nombre   string     `json:"nombre"`
	Tipo     string     `json:"tipo"`
	Detalle  string     `json:"detalle"`
	Ping     *time.Time `json:"ultimoPing,omitempty"`
	Cola     int        `json:"cola"`
	Escaneos int        `json:"escaneos15" doc:"Escaneos en los últimos 15 minutos"`
}

// Compacta is one ticket of the offline list (only what the door needs).
type Compacta struct {
	Codigo   string    `json:"c"`
	Sesion   uuid.UUID `json:"s"`
	Nombre   string    `json:"n"`
	Personas int       `json:"p"`
	Dentro   int       `json:"d"`
	Estado   string    `json:"e"`
}

func (s *Svc) puestos(ctx context.Context, cid uuid.UUID) ([]Puesto, error) {
	rows, err := s.a.DB.Query(ctx, `SELECT p.id, p.nombre, p.tipo, p.detalle, p.ultimo_ping_at, p.cola,
		(SELECT count(*) FROM escaneos e WHERE e.competition_id = p.competition_id AND e.puesto = p.nombre AND e.escaneado_at > now() - interval '15 minutes')::int
		FROM puestos p WHERE p.competition_id = $1 ORDER BY p.orden, p.nombre`, cid)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Puesto])
	if out == nil {
		out = []Puesto{}
	}
	return out, err
}

func (s *Svc) registerCheckin() {
	api := s.a.API
	tags := []string{"Check-in"}
	leer := []string{"checkin.escanear", perm}
	type bootOut struct {
		Body struct {
			Puestos  []Puesto      `json:"puestos"`
			Sesiones []SesionAdmin `json:"sesiones"`
			Actual   *uuid.UUID    `json:"actual,omitempty" doc:"Sesión en curso o la siguiente"`
			Lista    []Compacta    `json:"lista" doc:"Entradas para validar sin conexión"`
			Generado time.Time     `json:"generado"`
		}
	}
	type cidIn2 struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-bootstrap", Method: http.MethodGet, Path: baseCheckin + "/bootstrap", Summary: "Puestos, sesiones y lista compacta para escanear sin conexión", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidIn2) (*bootOut, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			o := &bootOut{}
			var err error
			if o.Body.Puestos, err = s.puestos(ctx, in.CID); err != nil {
				return nil, err
			}
			l, err := sesiones(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			now := time.Now()
			o.Body.Sesiones = []SesionAdmin{}
			for _, x := range l {
				o.Body.Sesiones = append(o.Body.Sesiones, admin(x, now))
				if o.Body.Actual == nil && now.Before(x.Fin) && x.Publicada {
					id := x.ID
					o.Body.Actual = &id
				}
			}
			rows, err := s.a.DB.Query(ctx, `SELECT codigo, sesion_id, trim(nombre || ' ' || apellidos), personas, dentro, estado FROM entradas WHERE competition_id = $1 AND estado <> 'anulada'`, in.CID)
			if err != nil {
				return nil, err
			}
			if o.Body.Lista, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Compacta]); err != nil {
				return nil, err
			}
			if o.Body.Lista == nil {
				o.Body.Lista = []Compacta{}
			}
			o.Body.Generado = now
			return o, nil
		})

	type escIn struct {
		CID  uuid.UUID `path:"cid"`
		Body EscaneoIn
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-escaneo", Method: http.MethodPost, Path: baseCheckin + "/escaneos", Summary: "Comprobar o registrar una entrada en la puerta", Tags: tags, Security: bearer},
		func(ctx context.Context, in *escIn) (*struct{ Body Resultado }, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			r, err := s.escanear(ctx, in.CID, in.Body)
			if err == nil && r.Registrado {
				s.bump(ctx, in.CID)
			}
			return &struct{ Body Resultado }{r}, err
		})
	type loteIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Items []EscaneoIn `json:"items" maxItems:"500"`
		}
	}
	type loteOut struct {
		Body struct {
			Resultados []Resultado `json:"resultados"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-lote", Method: http.MethodPost, Path: baseCheckin + "/escaneos/lote", Summary: "Subir la cola sin conexión (idempotente; duplicados resueltos aquí)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *loteIn) (*loteOut, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			o := &loteOut{}
			for _, it := range in.Body.Items {
				it.Offline, it.Confirmar = true, true
				if it.Clave == "" {
					return nil, problem.Unprocessable("SIN_CLAVE", "Cada escaneo de la cola necesita su clave de idempotencia.")
				}
				r, err := s.escanear(ctx, in.CID, it)
				if err != nil {
					return nil, err
				}
				o.Body.Resultados = append(o.Body.Resultados, r)
			}
			s.bump(ctx, in.CID)
			return o, nil
		})
	type buscarIn struct {
		CID uuid.UUID `path:"cid"`
		Q   string    `query:"q" minLength:"2" maxLength:"60"`
	}
	type buscarOut struct {
		Body []Entrada
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-buscar", Method: http.MethodGet, Path: baseCheckin + "/buscar", Summary: "Buscar entradas por nombre, email, teléfono o código (sin tildes)", Tags: tags, Security: bearer},
		func(ctx context.Context, in *buscarIn) (*buscarOut, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			where, args := filtro(listaIn{CID: in.CID, Q: in.Q})
			rows, err := s.a.DB.Query(ctx, selEntrada+` WHERE `+where+` AND e.estado <> 'anulada' ORDER BY s.inicio, e.apellidos LIMIT 20`, args...)
			if err != nil {
				return nil, err
			}
			l, err := pgx.CollectRows(rows, scanEntrada)
			if l == nil {
				l = []Entrada{}
			}
			return &buscarOut{l}, err
		})
	type pingIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Puesto string `json:"puesto" minLength:"1" maxLength:"40"`
			Cola   int    `json:"cola" minimum:"0" maximum:"100000"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-ping", Method: http.MethodPost, Path: baseCheckin + "/ping", Summary: "Latido de un puesto (cola sin conexión pendiente)", Tags: tags, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *pingIn) (*struct{}, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			_, err := s.a.DB.Exec(ctx, `UPDATE puestos SET ultimo_ping_at = now(), cola = $3 WHERE competition_id = $1 AND nombre = $2`, in.CID, in.Body.Puesto, in.Body.Cola)
			return nil, err
		})
	type resumenOut struct {
		Body struct {
			Sesiones    []SesionAdmin `json:"sesiones"`
			Puestos     []Puesto      `json:"puestos"`
			Ultimos     []Escaneo     `json:"ultimos"`
			Incidencias []Escaneo     `json:"incidencias"`
			Ritmo       []int         `json:"ritmo" doc:"Personas por minuto (últimos 30 min)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-resumen", Method: http.MethodGet, Path: baseCheckin + "/resumen", Summary: "Taquilla: aforo dentro, puestos, últimos accesos e incidencias", Tags: tags, Security: bearer},
		func(ctx context.Context, in *cidIn2) (*resumenOut, error) {
			if _, err := requireAny(ctx, in.CID, leer...); err != nil {
				return nil, err
			}
			o := &resumenOut{}
			l, err := sesiones(ctx, s.a.DB, in.CID, false)
			if err != nil {
				return nil, err
			}
			now := time.Now()
			for _, x := range l {
				o.Body.Sesiones = append(o.Body.Sesiones, admin(x, now))
			}
			if o.Body.Puestos, err = s.puestos(ctx, in.CID); err != nil {
				return nil, err
			}
			if o.Body.Ultimos, err = s.escaneos(ctx, in.CID, "TRUE", 20); err != nil {
				return nil, err
			}
			if o.Body.Incidencias, err = s.escaneos(ctx, in.CID, "e.resultado IN ('ya_usada', 'otra_sesion', 'invalida', 'anulada') AND e.escaneado_at > now() - interval '24 hours'", 20); err != nil {
				return nil, err
			}
			o.Body.Ritmo = make([]int, 30)
			rows, err := s.a.DB.Query(ctx, `SELECT (extract(epoch FROM now() - escaneado_at) / 60)::int, COALESCE(sum(personas), 0)::int FROM escaneos
				WHERE competition_id = $1 AND resultado IN ('valida', 'manual') AND escaneado_at > now() - interval '30 minutes' GROUP BY 1`, in.CID)
			if err == nil {
				for rows.Next() {
					var m, n int
					if rows.Scan(&m, &n) == nil && m >= 0 && m < 30 {
						o.Body.Ritmo[29-m] = n
					}
				}
				rows.Close()
			}
			return o, nil
		})
	type puestoIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Nombre  string `json:"nombre" minLength:"1" maxLength:"40"`
			Tipo    string `json:"tipo" enum:"puerta,taquilla,pesaje"`
			Detalle string `json:"detalle,omitempty" maxLength:"80"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "checkin-puesto", Method: http.MethodPost, Path: baseCheckin + "/puestos", Summary: "Nuevo puesto", Tags: tags, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *puestoIn) (*struct{ Body []Puesto }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), perm); err != nil {
				return nil, err
			}
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO puestos (id, competition_id, nombre, tipo, detalle) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (competition_id, nombre) DO UPDATE SET tipo = $4, detalle = $5`,
				newID(), in.CID, strings.TrimSpace(in.Body.Nombre), in.Body.Tipo, in.Body.Detalle); err != nil {
				return nil, err
			}
			l, err := s.puestos(ctx, in.CID)
			return &struct{ Body []Puesto }{l}, err
		})
}

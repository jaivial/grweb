package athletes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/pagos"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagIns = []string{"Inscripción, cupones y referidos"}

// Cupon is a coupon as the backoffice lists it.
type Cupon struct {
	ID      uuid.UUID  `json:"id" db:"id"`
	Codigo  string     `json:"codigo" db:"codigo"`
	Tipo    string     `json:"tipo" db:"tipo" enum:"porcentaje,importe"`
	Valor   int        `json:"valor" db:"valor" doc:"Porcentaje o céntimos"`
	Limite  *int       `json:"limite,omitempty" db:"limite"`
	Caduca  *time.Time `json:"caduca,omitempty" db:"caduca"`
	Activo  bool       `json:"activo" db:"activo"`
	Usos    int        `json:"usos" db:"usos"`
	Ahorro  int        `json:"ahorro" db:"ahorro" doc:"Céntimos descontados en inscripciones pagadas"`
	Estado  string     `json:"estado" db:"-" enum:"activo,pausado,agotado,caducado"`
	Created time.Time  `json:"createdAt" db:"created_at"`
}

func (c *Cupon) setEstado() {
	switch {
	case c.Caduca != nil && time.Now().After(*c.Caduca):
		c.Estado = "caducado"
	case c.Limite != nil && c.Usos >= *c.Limite:
		c.Estado = "agotado"
	case !c.Activo:
		c.Estado = "pausado"
	default:
		c.Estado = "activo"
	}
}

// CuponIn creates or edits a coupon.
type CuponIn struct {
	Codigo string     `json:"codigo" minLength:"3" maxLength:"30"`
	Tipo   string     `json:"tipo" enum:"porcentaje,importe"`
	Valor  int        `json:"valor" minimum:"1" maximum:"100000"`
	Limite *int       `json:"limite,omitempty" minimum:"1" maximum:"100000"`
	Caduca *time.Time `json:"caduca,omitempty"`
	Activo bool       `json:"activo,omitempty"`
}

// CodigoRef is a referral code with its numbers (Figma 66 · «Referidos · códigos»).
type CodigoRef struct {
	ID        uuid.UUID     `json:"id" db:"id"`
	Codigo    string        `json:"codigo" db:"codigo"`
	AtletaID  uuid.UUID     `json:"atletaId" db:"atleta_id"`
	Atleta    string        `json:"atleta" db:"atleta"`
	Club      string        `json:"club" db:"club"`
	Pagado    int           `json:"pagado" db:"pagado"`
	Invitados int           `json:"invitados" db:"invitados"`
	Descuento int           `json:"descuento" db:"descuento" doc:"Céntimos descontados a sus invitados"`
	Devuelto  int           `json:"devuelto" db:"devuelto"`
	Fallidas  int           `json:"fallidas" db:"fallidas" doc:"Devoluciones que la pasarela rechazó (se reintentan hasta 5 veces)"`
	Ajustes   *ReferidosCfg `json:"ajustes,omitempty" db:"ajustes" doc:"Ajustes propios (si no, los generales)"`
}

// Pago is a registration with its payment (Figma 66 · «Pagos»).
type Pago struct {
	ID           uuid.UUID         `json:"id" db:"id"`
	Fecha        time.Time         `json:"fecha" db:"created_at"`
	Atleta       string            `json:"atleta" db:"atleta"`
	Email        string            `json:"email" db:"email"`
	AtletaID     *uuid.UUID        `json:"atletaId,omitempty" db:"atleta_id"`
	Cuota        int               `json:"cuota" db:"cuota"`
	DescCupon    int               `json:"descCupon" db:"desc_cupon"`
	DescRef      int               `json:"descReferido" db:"desc_referido"`
	Total        int               `json:"total" db:"total"`
	Devuelto     int               `json:"devuelto" db:"devuelto"`
	Cupon        string            `json:"cupon" db:"cupon_codigo"`
	Referido     string            `json:"referido" db:"referido"`
	Estado       string            `json:"estado" db:"estado"`
	Proveedor    string            `json:"proveedor" db:"proveedor"`
	Referencia   string            `json:"referencia" db:"referencia"`
	Tarjeta      string            `json:"tarjeta" db:"tarjeta"`
	PagadaAt     *time.Time        `json:"pagadaAt,omitempty" db:"pagada_at"`
	Devoluciones []Devolucion      `json:"devoluciones,omitempty" db:"-"`
	Datos        map[string]string `json:"datos,omitempty" db:"-"`
}

// Devolucion is a refund.
type Devolucion struct {
	Importe int       `json:"importe" db:"importe"`
	Motivo  string    `json:"motivo" db:"motivo"`
	Detalle string    `json:"detalle" db:"detalle"`
	Ref     string    `json:"ref" db:"ref"`
	Por     string    `json:"por" db:"por"`
	At      time.Time `json:"at" db:"created_at"`
}

const selPago = `SELECT i.id, i.created_at, COALESCE(i.datos->>'nombre', '') || ' ' || COALESCE(i.datos->>'apellidos', '') AS atleta, i.email::text AS email, i.atleta_id,
	i.cuota, i.desc_cupon, i.desc_referido, i.total, i.devuelto, i.cupon_codigo, COALESCE(r.codigo, '') AS referido, i.estado, i.proveedor,
	CASE WHEN i.pago <> '' THEN i.pago ELSE i.sesion END AS referencia, i.tarjeta, i.pagada_at
	FROM inscripciones i LEFT JOIN referido_codigos r ON r.id = i.referido_id`

func (s *Svc) registerInscripcionAdmin() {
	api := s.a.API
	C := "/api/admin/competiciones/{cid}"

	type cfgOut struct {
		ETag string `header:"ETag"`
		Body Config
	}
	huma.Register(api, huma.Operation{OperationID: "inscripcion-config", Method: http.MethodGet, Path: C + "/inscripcion/config", Summary: "Configuración de la inscripción", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *cidIn) (*cfgOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			c, err := s.config(ctx, s.a.DB, in.CID)
			return &cfgOut{ETag: etag(c.Version), Body: c}, err
		})
	type cfgIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match"`
		Body    Config
	}
	huma.Register(api, huma.Operation{OperationID: "inscripcion-config-update", Method: http.MethodPut, Path: C + "/inscripcion/config", Summary: "Guardar la configuración (If-Match)", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *cfgIn) (*cfgOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			b := in.Body
			if b.Abre != nil && b.Cierra != nil && !b.Cierra.After(*b.Abre) {
				return nil, problem.Unprocessable("FECHAS_INVALIDAS", "El cierre tiene que ser posterior a la apertura.")
			}
			if b.Referidos.DescTipo == "porcentaje" && b.Referidos.DescValor > 100 {
				return nil, problem.Unprocessable("DESCUENTO_INVALIDO", "Un porcentaje no puede pasar del 100 %.")
			}
			err := s.change(ctx, in.CID, "athletes.inscripcion_configurada", map[string]any{"modo": b.Modo, "cuota": b.Cuota}, func(tx pgx.Tx) error {
				prev, err := s.config(ctx, tx, in.CID)
				if err != nil {
					return err
				}
				if in.IfMatch != "" && ifMatch(in.IfMatch) != prev.Version {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado la configuración. Recarga para ver sus cambios.")
				}
				if prev.Modo == "propia" && b.Modo != "propia" {
					var n int
					_ = tx.QueryRow(ctx, `SELECT count(*) FROM inscripciones WHERE competition_id = $1 AND estado = 'pendiente_pago' AND expira_at > now()`, in.CID).Scan(&n)
					if n > 0 {
						return problem.Conflict("PAGOS_EN_CURSO", "Hay pagos en curso: espera a que terminen (30 minutos como mucho) para cambiar el modo.")
					}
				}
				ref, _ := json.Marshal(b.Referidos)
				_, err = tx.Exec(ctx, `INSERT INTO inscripcion_config (competition_id, modo, cuota, abre, cierra, reserva, cupones, referidos) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
					ON CONFLICT (competition_id) DO UPDATE SET modo = $2, cuota = $3, abre = $4, cierra = $5, reserva = $6, cupones = $7, referidos = $8, version = inscripcion_config.version + 1, updated_at = now()`,
					in.CID, b.Modo, b.Cuota, b.Abre, b.Cierra, b.Reserva, b.Cupones, ref)
				return err
			})
			if err != nil {
				return nil, err
			}
			c, err := s.config(ctx, s.a.DB, in.CID)
			return &cfgOut{ETag: etag(c.Version), Body: c}, err
		})

	// ---- coupons ----
	type cupList struct{ Body []Cupon }
	listCupones := func(ctx context.Context, cid uuid.UUID, where string, args ...any) ([]Cupon, error) {
		rows, err := s.a.DB.Query(ctx, `SELECT c.id, c.codigo, c.tipo, c.valor, c.limite, c.caduca, c.activo, c.usos, c.created_at,
			COALESCE((SELECT sum(i.desc_cupon) FROM inscripciones i WHERE i.cupon_id = c.id AND i.estado IN ('pagada', 'gratuita')), 0)::int AS ahorro
			FROM cupones c WHERE c.competition_id = $1 `+where+` ORDER BY c.activo DESC, c.created_at DESC`, append([]any{cid}, args...)...)
		if err != nil {
			return nil, err
		}
		list, err := pgx.CollectRows(rows, pgx.RowToStructByName[Cupon])
		for i := range list {
			list[i].setEstado()
		}
		if list == nil {
			list = []Cupon{}
		}
		return list, err
	}
	huma.Register(api, huma.Operation{OperationID: "cupones-list", Method: http.MethodGet, Path: C + "/cupones", Summary: "Cupones", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *cidIn) (*cupList, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			l, err := listCupones(ctx, in.CID, "")
			return &cupList{Body: l}, err
		})
	type cupOne struct{ Body Cupon }
	saveCupon := func(ctx context.Context, cid uuid.UUID, id *uuid.UUID, b CuponIn) (*cupOne, error) {
		b.Codigo = normCodigo(b.Codigo)
		if len(b.Codigo) < 3 {
			return nil, problem.Unprocessable("CODIGO_INVALIDO", "El código necesita al menos 3 letras o números.")
		}
		if b.Tipo == "porcentaje" && b.Valor > 100 {
			return nil, problem.Unprocessable("DESCUENTO_INVALIDO", "Un porcentaje no puede pasar del 100 %.")
		}
		cid2 := newID()
		if id != nil {
			cid2 = *id
		}
		err := s.change(ctx, cid, "athletes.cupon_guardado", map[string]any{"codigo": b.Codigo}, func(tx pgx.Tx) error {
			if id == nil {
				_, err := tx.Exec(ctx, `INSERT INTO cupones (id, competition_id, codigo, tipo, valor, limite, caduca, activo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, cid2, cid, b.Codigo, b.Tipo, b.Valor, b.Limite, b.Caduca, b.Activo)
				if db.IsUniqueViolation(err, "") {
					return problem.Conflict("CODIGO_DUPLICADO", "Ya existe un cupón con ese código.")
				}
				return err
			}
			var usos int
			var tipo string
			var valor int
			if err := tx.QueryRow(ctx, `SELECT usos, tipo, valor FROM cupones WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, cid2).Scan(&usos, &tipo, &valor); err != nil {
				return problem.NotFound("Cupón no encontrado.")
			}
			if usos > 0 && (tipo != b.Tipo || valor != b.Valor) {
				return problem.Conflict("CUPON_CON_USOS", "Este cupón ya se ha usado: no cambies el descuento. Páusalo y crea otro.")
			}
			_, err := tx.Exec(ctx, `UPDATE cupones SET codigo = $3, tipo = $4, valor = $5, limite = $6, caduca = $7, activo = $8, updated_at = now() WHERE competition_id = $1 AND id = $2`,
				cid, cid2, b.Codigo, b.Tipo, b.Valor, b.Limite, b.Caduca, b.Activo)
			if db.IsUniqueViolation(err, "") {
				return problem.Conflict("CODIGO_DUPLICADO", "Ya existe un cupón con ese código.")
			}
			return err
		})
		if err != nil {
			return nil, err
		}
		l, err := listCupones(ctx, cid, "AND c.id = $2", cid2)
		if err != nil || len(l) == 0 {
			return nil, err
		}
		return &cupOne{Body: l[0]}, nil
	}
	type cupIn struct {
		CID  uuid.UUID `path:"cid"`
		Body CuponIn
	}
	huma.Register(api, huma.Operation{OperationID: "cupones-create", Method: http.MethodPost, Path: C + "/cupones", Summary: "Crear cupón", Tags: tagIns, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *cupIn) (*cupOne, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return saveCupon(ctx, in.CID, nil, in.Body)
		})
	type cupIDIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body CuponIn
	}
	huma.Register(api, huma.Operation{OperationID: "cupones-update", Method: http.MethodPut, Path: C + "/cupones/{id}", Summary: "Editar cupón", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *cupIDIn) (*cupOne, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return saveCupon(ctx, in.CID, &in.ID, in.Body)
		})
	huma.Register(api, huma.Operation{OperationID: "cupones-delete", Method: http.MethodDelete, Path: C + "/cupones/{id}", Summary: "Borrar cupón (solo sin usos)", Tags: tagIns, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "athletes.cupon_borrado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				var usos int
				if err := tx.QueryRow(ctx, `SELECT usos FROM cupones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).Scan(&usos); err != nil {
					return problem.NotFound("Cupón no encontrado.")
				}
				if usos > 0 {
					return problem.Conflict("CUPON_CON_USOS", "Este cupón ya se ha usado: páusalo en vez de borrarlo.")
				}
				_, err := tx.Exec(ctx, `DELETE FROM cupones WHERE id = $1`, in.ID)
				return err
			})
		})

	// ---- referral codes ----
	type refList struct{ Body []CodigoRef }
	listRefs := func(ctx context.Context, cid uuid.UUID, extra string, args ...any) ([]CodigoRef, error) {
		rows, err := s.a.DB.Query(ctx, `SELECT r.id, r.codigo, r.atleta_id, a.nombre || ' ' || a.apellidos AS atleta, a.club, r.ajustes,
			COALESCE((SELECT total FROM inscripciones WHERE id = r.inscripcion_id AND estado = 'pagada'), 0)::int AS pagado,
			(SELECT count(*) FROM referido_usos u WHERE u.codigo_id = r.id AND u.estado <> 'anulada')::int AS invitados,
			COALESCE((SELECT sum(i.desc_referido) FROM inscripciones i WHERE i.referido_id = r.id AND i.estado IN ('pagada', 'gratuita')), 0)::int AS descuento,
			COALESCE((SELECT sum(u.recompensa) FROM referido_usos u WHERE u.codigo_id = r.id AND u.estado = 'devuelta'), 0)::int AS devuelto,
			(SELECT count(*) FROM referido_usos u WHERE u.codigo_id = r.id AND u.estado = 'fallida')::int AS fallidas
			FROM referido_codigos r JOIN atletas a ON a.id = r.atleta_id WHERE r.competition_id = $1 `+extra+` ORDER BY invitados DESC, r.created_at DESC LIMIT 500`, append([]any{cid}, args...)...)
		if err != nil {
			return nil, err
		}
		l, err := pgx.CollectRows(rows, pgx.RowToStructByName[CodigoRef])
		if l == nil {
			l = []CodigoRef{}
		}
		return l, err
	}
	huma.Register(api, huma.Operation{OperationID: "referidos-codigos", Method: http.MethodGet, Path: C + "/referidos/codigos", Summary: "Códigos de referido", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *cidIn) (*refList, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			l, err := listRefs(ctx, in.CID, "")
			return &refList{Body: l}, err
		})
	type ajIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Ajustes *ReferidosCfg `json:"ajustes,omitempty" doc:"null = usar la configuración general"`
		}
	}
	type refOne struct{ Body CodigoRef }
	huma.Register(api, huma.Operation{OperationID: "referidos-ajustes", Method: http.MethodPut, Path: C + "/referidos/codigos/{id}", Summary: "Ajustes propios de un código", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *ajIn) (*refOne, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			var aj any
			if in.Body.Ajustes != nil {
				b, _ := json.Marshal(in.Body.Ajustes)
				aj = b
			}
			err := s.change(ctx, in.CID, "athletes.referido_ajustado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `UPDATE referido_codigos SET ajustes = $3 WHERE competition_id = $1 AND id = $2`, in.CID, in.ID, aj)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Código no encontrado.")
				}
				return err
			})
			if err != nil {
				return nil, err
			}
			l, err := listRefs(ctx, in.CID, "AND r.id = $2", in.ID)
			if err != nil || len(l) == 0 {
				return nil, err
			}
			return &refOne{Body: l[0]}, nil
		})

	// ---- payments ----
	type pagosIn struct {
		CID    uuid.UUID `path:"cid"`
		Estado string    `query:"estado" enum:"pendiente_pago,pagada,gratuita,reserva,cancelada,fallida,"`
		Q      string    `query:"q" maxLength:"80"`
	}
	type pagosOut struct {
		Body struct {
			Items      []Pago `json:"items"`
			Recaudado  int    `json:"recaudado"`
			Devuelto   int    `json:"devuelto"`
			Pendientes int    `json:"pendientes"`
			Rechazados int    `json:"rechazados"`
			Pasarela   string `json:"pasarela"`
			Pruebas    bool   `json:"pruebas"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "pagos-list", Method: http.MethodGet, Path: C + "/pagos", Summary: "Pagos de inscripción", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *pagosIn) (*pagosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			out := &pagosOut{}
			args := []any{in.CID}
			where := ` WHERE i.competition_id = $1`
			if in.Estado != "" {
				args = append(args, in.Estado)
				where += ` AND i.estado = $2`
			}
			rows, err := s.a.DB.Query(ctx, selPago+where+` ORDER BY i.created_at DESC LIMIT 1000`, args...)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[Pago])
			if err != nil {
				return nil, err
			}
			q := fold(in.Q)
			out.Body.Items = []Pago{}
			for _, p := range list {
				if q != "" && !strings.Contains(fold(p.Atleta+" "+p.Email+" "+p.Referencia+" "+p.Cupon), q) {
					continue
				}
				out.Body.Items = append(out.Body.Items, p)
			}
			_ = s.a.DB.QueryRow(ctx, `SELECT COALESCE(sum(total) FILTER (WHERE estado = 'pagada'), 0), COALESCE(sum(devuelto), 0),
				count(*) FILTER (WHERE estado = 'pendiente_pago' AND expira_at > now()), count(*) FILTER (WHERE estado = 'fallida') FROM inscripciones WHERE competition_id = $1`, in.CID).
				Scan(&out.Body.Recaudado, &out.Body.Devuelto, &out.Body.Pendientes, &out.Body.Rechazados)
			p := s.proveedor(ctx, in.CID)
			out.Body.Pasarela = "ninguna"
			if p != nil {
				out.Body.Pasarela, out.Body.Pruebas = p.Name(), p.Name() == "simulado"
			}
			if st, ok := p.(*pagos.Stripe); ok {
				out.Body.Pruebas = st.Test()
			}
			return out, nil
		})
	type pagoOut struct{ Body Pago }
	getPago := func(ctx context.Context, cid, id uuid.UUID) (Pago, error) {
		rows, err := s.a.DB.Query(ctx, selPago+` WHERE i.competition_id = $1 AND i.id = $2`, cid, id)
		if err != nil {
			return Pago{}, err
		}
		p, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[Pago])
		if err != nil {
			return p, problem.NotFound("Pago no encontrado.")
		}
		rows, err = s.a.DB.Query(ctx, `SELECT importe, motivo, detalle, ref, por, created_at FROM devoluciones WHERE inscripcion_id = $1 ORDER BY created_at`, id)
		if err != nil {
			return p, err
		}
		p.Devoluciones, err = pgx.CollectRows(rows, pgx.RowToStructByName[Devolucion])
		_ = s.a.DB.QueryRow(ctx, `SELECT datos FROM inscripciones WHERE id = $1`, id).Scan(&p.Datos)
		return p, err
	}
	huma.Register(api, huma.Operation{OperationID: "pagos-get", Method: http.MethodGet, Path: C + "/pagos/{id}", Summary: "Detalle de un pago", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *idIn) (*pagoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			p, err := getPago(ctx, in.CID, in.ID)
			return &pagoOut{Body: p}, err
		})
	type reIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Importe   int  `json:"importe" minimum:"1" doc:"Céntimos"`
			DarDeBaja bool `json:"darDeBaja,omitempty" doc:"Además, pasa al atleta a «Baja»"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "pagos-reembolso", Method: http.MethodPost, Path: C + "/pagos/{id}/reembolso", Summary: "Reembolsar (total o parcial; solo Admin)", Tags: tagIns, Security: bearer},
		func(ctx context.Context, in *reIn) (*pagoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "evento.editar"); err != nil {
				return nil, err
			}
			var total, devuelto int
			var pago, estado string
			var atleta *uuid.UUID
			if err := s.a.DB.QueryRow(ctx, `SELECT total, devuelto, pago, estado, atleta_id FROM inscripciones WHERE competition_id = $1 AND id = $2`, in.CID, in.ID).
				Scan(&total, &devuelto, &pago, &estado, &atleta); err != nil {
				return nil, problem.NotFound("Pago no encontrado.")
			}
			if estado != "pagada" || pago == "" {
				return nil, problem.Conflict("SIN_PAGO", "Esta inscripción no tiene un pago que reembolsar.")
			}
			if in.Body.Importe > total-devuelto {
				return nil, problem.Unprocessable("IMPORTE_EXCESIVO", "Como mucho puedes reembolsar "+pagos.Euros(total-devuelto)+".")
			}
			// One refund at a time per payment (two clicks must not refund twice).
			if ok, _ := s.a.Redis.SetNX(ctx, s.a.Keys.Of("lock", "reembolso", in.ID.String()), "1", time.Minute).Result(); !ok {
				return nil, problem.Conflict("REEMBOLSO_EN_CURSO", "Ya hay un reembolso en curso para este pago.")
			}
			defer s.a.Redis.Del(ctx, s.a.Keys.Of("lock", "reembolso", in.ID.String()))
			var ref string
			err := errors.New("sin pasarela de pago")
			if prov := s.proveedor(ctx, in.CID); prov != nil {
				ref, err = prov.Refund(ctx, pago, in.Body.Importe, "manual")
			}
			if err != nil && s.sim != nil && strings.HasPrefix(pago, "sim_") {
				ref, err = s.sim.Refund(ctx, pago, in.Body.Importe, "manual")
			}
			if err != nil {
				s.a.Log.Error("reembolso", "err", err)
				return nil, problem.New(http.StatusBadGateway, "PASARELA_ERROR", "La pasarela no ha aceptado el reembolso: "+err.Error())
			}
			err = s.change(ctx, in.CID, "athletes.reembolso", map[string]any{"id": in.ID, "importe": in.Body.Importe}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `UPDATE inscripciones SET devuelto = devuelto + $2, updated_at = now() WHERE id = $1`, in.ID, in.Body.Importe); err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `INSERT INTO devoluciones (id, inscripcion_id, importe, motivo, detalle, ref, por) VALUES ($1,$2,$3,'manual','Reembolso manual',$4,$5)`, newID(), in.ID, in.Body.Importe, ref, actor(ctx)); err != nil {
					return err
				}
				if in.Body.DarDeBaja && atleta != nil {
					if _, err := tx.Exec(ctx, `UPDATE atletas SET estado = 'baja', orden_reserva = NULL, version = version + 1, updated_at = now() WHERE id = $1`, *atleta); err != nil {
						return err
					}
					if err := hist(ctx, tx, *atleta, "Baja tras reembolso", pagos.Euros(in.Body.Importe)); err != nil {
						return err
					}
				}
				var mail, nombre string
				_ = tx.QueryRow(ctx, `SELECT email::text, COALESCE(datos->>'nombre', '') FROM inscripciones WHERE id = $1`, in.ID).Scan(&mail, &nombre)
				return email(ctx, tx, in.CID, mail, "reembolso", map[string]string{"nombre": nombre, "importe": pagos.Euros(in.Body.Importe)})
			})
			if err != nil {
				return nil, err
			}
			p, err := getPago(ctx, in.CID, in.ID)
			return &pagoOut{Body: p}, err
		})
}

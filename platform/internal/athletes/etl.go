package athletes

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/legacy"
	"github.com/jaivial/grweb/platform/pkg/pagos"
)

// inscripcionLegado is a row of the old `Inscripciones` (the old site's registration and athlete in one).
type inscripcionLegado struct {
	ID, Comp                                   int
	Nombre, Ap1, Ap2, Email, Instagram, Tel    string
	Sexo, Categoria, Modalidad, Experiencia    string
	Entrenador, Handler, Pagada, Confirmada    bool
	Acepta                                     bool
	Metodo, Notas, Sesion, Intent, CuponCodigo string
	Total, Subtotal, Descuento                 float64
	Cupon, Referido                            sql.NullInt64
	Creada, Actualizada                        time.Time
	Checkin                                    sql.NullTime
}

// etlMySQL («athletes etl-mysql --mysql DSN [--dry-run]») imports, for every migrated edition, the old coupons,
// the registrations (confirmed ones become athletes with their public profile; abandoned payments stay as
// cancelled registrations, without an athlete or a contact) and the referral codes and uses. Contacts reach crm
// through the usual internal event, with the privacy acceptance of the old form and no marketing consent.
// Already imported rows are left as they are (ids derive from the old ones), so it can run again.
func (s *Svc) etlMySQL(ctx context.Context, a *app.App, args []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	o, err := legacy.Leer(args)
	if err != nil {
		return err
	}
	mapa, err := legacy.CargarMapa(ctx, a.Redis, a.Keys, o.DryRun)
	if err != nil {
		return err
	}
	my, err := legacy.Abrir(ctx, o.DSN)
	if err != nil {
		return err
	}
	defer my.Close()
	inf := legacy.NuevoInforme("athletes", o.DryRun)

	// ---- read everything first (one read-only MySQL session) ----
	type cupon struct {
		ID, Comp               int
		Codigo, Tipo           string
		Valor                  float64
		Activo, ConLimite, Cad bool
		Limite                 sql.NullInt64
		Caduca                 sql.NullTime
		Creado                 time.Time
	}
	var cupones []cupon
	rows, err := my.QueryContext(ctx, `SELECT Id, CompeticionId, COALESCE(NULLIF(CodigoNormalizado, ''), Codigo), TipoDescuento, Valor, Activo, TieneLimiteUsos, LimiteUsos,
		TieneFechaExpiracion, FechaExpiracion, CreatedAt FROM CuponesDescuento ORDER BY Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var c cupon
		if err := rows.Scan(&c.ID, &c.Comp, &c.Codigo, &c.Tipo, &c.Valor, &c.Activo, &c.ConLimite, &c.Limite, &c.Cad, &c.Caduca, &c.Creado); err != nil {
			rows.Close()
			return err
		}
		cupones = append(cupones, c)
	}
	rows.Close()
	var ins []inscripcionLegado
	rows, err = my.QueryContext(ctx, `SELECT Id, CompeticionId, Nombre, COALESCE(Apellido1, ''), COALESCE(Apellido2, ''), Email, COALESCE(Instagram, ''), COALESCE(Telefono, ''),
		COALESCE(Sexo, ''), COALESCE(CategoriaPeso, ''), COALESCE(Modalidad, ''), COALESCE(Experiencia, ''), TieneEntrenador, QuiereHandler, PagoConfirmado, ParticipacionConfirmada,
		AceptaTerminos, COALESCE(PaymentMethod, ''), COALESCE(Notas, ''), COALESCE(StripeSessionId, ''), COALESCE(StripePaymentIntentId, ''), COALESCE(CodigoCupon, ''),
		COALESCE(TotalPagado, 0), COALESCE(SubtotalAntesDescuento, 0), COALESCE(ImporteDescuento, 0), CuponDescuentoId, ReferralCodeId, CreatedAt, UpdatedAt, CheckinAt
		FROM Inscripciones ORDER BY Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var r inscripcionLegado
		if err := rows.Scan(&r.ID, &r.Comp, &r.Nombre, &r.Ap1, &r.Ap2, &r.Email, &r.Instagram, &r.Tel, &r.Sexo, &r.Categoria, &r.Modalidad, &r.Experiencia,
			&r.Entrenador, &r.Handler, &r.Pagada, &r.Confirmada, &r.Acepta, &r.Metodo, &r.Notas, &r.Sesion, &r.Intent, &r.CuponCodigo,
			&r.Total, &r.Subtotal, &r.Descuento, &r.Cupon, &r.Referido, &r.Creada, &r.Actualizada, &r.Checkin); err != nil {
			rows.Close()
			return err
		}
		ins = append(ins, r)
	}
	rows.Close()
	type codigo struct {
		ID, Ins, Comp int
		Codigo        string
		Creado        time.Time
	}
	var codigos []codigo
	rows, err = my.QueryContext(ctx, `SELECT Id, InscripcionId, CompeticionId, COALESCE(NULLIF(CodigoNormalizado, ''), Codigo), CreatedAt FROM CodigosReferido ORDER BY Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var c codigo
		if err := rows.Scan(&c.ID, &c.Ins, &c.Comp, &c.Codigo, &c.Creado); err != nil {
			rows.Close()
			return err
		}
		codigos = append(codigos, c)
	}
	rows.Close()
	type uso struct {
		ID, Codigo, Ins int
		Recompensa      float64
		Refund          string
		Devuelto        sql.NullTime
		Creado          time.Time
	}
	var usos []uso
	rows, err = my.QueryContext(ctx, `SELECT Id, CodigoReferidoId, InscripcionId, COALESCE(ImporteDescuento, 0), COALESCE(StripeRefundId, ''), RefundedAt, CreatedAt FROM NewUserReferrals ORDER BY Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var u uso
		if err := rows.Scan(&u.ID, &u.Codigo, &u.Ins, &u.Recompensa, &u.Refund, &u.Devuelto, &u.Creado); err != nil {
			rows.Close()
			return err
		}
		usos = append(usos, u)
	}
	rows.Close()
	var horarios, configRef int
	_ = my.QueryRowContext(ctx, `SELECT count(*) FROM Schedules`).Scan(&horarios)
	_ = my.QueryRowContext(ctx, `SELECT count(*) FROM ReferidosConfig WHERE Activo = 1`).Scan(&configRef)

	// ---- write (one transaction: all or nothing) ----
	atletaDe := map[int]uuid.UUID{} // old registration → athlete
	insImportada := map[int]bool{}
	cuponID := map[int]uuid.UUID{}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for _, c := range cupones {
			inf.Leidos["cupones"]++
			ed, ok := mapa[c.Comp]
			if !ok {
				inf.Omitir("cupón de una competición no migrada")
				continue
			}
			code := normCodigo(c.Codigo)
			id := legacy.ID("CuponesDescuento", c.ID)
			var otro uuid.UUID
			if err := tx.QueryRow(ctx, `SELECT id FROM cupones WHERE competition_id = $1 AND codigo = $2`, ed.NuevaID, code).Scan(&otro); err == nil {
				if otro != id {
					inf.Omitir("cupón con un código que ya existe en la edición")
					continue
				}
				cuponID[c.ID] = id
				inf.Omitir("cupón ya importado")
				continue
			}
			tipo, valor := "importe", legacy.Centimos(c.Valor)
			if strings.HasPrefix(strings.ToLower(c.Tipo), "porc") {
				tipo, valor = "porcentaje", min(100, int(c.Valor+0.5))
			}
			if valor <= 0 {
				inf.Omitir("cupón con valor 0")
				continue
			}
			var limite *int
			if c.ConLimite && c.Limite.Valid {
				v := int(c.Limite.Int64)
				limite = &v
			}
			var caduca *time.Time
			if c.Cad && c.Caduca.Valid {
				// the old site accepted a coupon through the whole day of its date (Date < UtcNow.Date)
				d := c.Caduca.Time
				fin := time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, madrid)
				caduca = &fin
			}
			usosCupon := 0
			for _, r := range ins {
				if r.Cupon.Valid && int(r.Cupon.Int64) == c.ID && r.Pagada {
					usosCupon++
				}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO cupones (id, competition_id, codigo, tipo, valor, limite, caduca, activo, usos, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				id, ed.NuevaID, code, tipo, valor, limite, caduca, c.Activo && !ed.Finalizada, usosCupon, c.Creado); err != nil {
				return fmt.Errorf("cupón %d: %w", c.ID, err)
			}
			cuponID[c.ID] = id
			inf.Escritos["cupones"]++
		}

		for _, r := range ins {
			inf.Leidos["inscripciones"]++
			ed, ok := mapa[r.Comp]
			if !ok {
				inf.Omitir("inscripción de una competición no migrada")
				continue
			}
			iid := legacy.ID("Inscripciones", r.ID)
			var ya int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM inscripciones WHERE id = $1`, iid).Scan(&ya); err != nil {
				return err
			}
			if ya > 0 {
				insImportada[r.ID] = true
				var aid *uuid.UUID
				_ = tx.QueryRow(ctx, `SELECT atleta_id FROM inscripciones WHERE id = $1`, iid).Scan(&aid)
				if aid != nil {
					atletaDe[r.ID] = *aid
				}
				inf.Omitir("inscripción ya importada")
				continue
			}
			sexo, cat := legacy.Sexo(r.Sexo), legacy.Categoria(r.Categoria)
			nombre, apellidos := strings.TrimSpace(r.Nombre), strings.TrimSpace(strings.Join(strings.Fields(r.Ap1+" "+r.Ap2), " "))
			if apellidos == "" {
				nombre, apellidos = legacy.Partir(nombre)
			}
			email := strings.ToLower(strings.TrimSpace(r.Email))
			if nombre == "" {
				inf.Omitir("inscripción sin nombre")
				continue
			}
			conEmail := strings.Contains(email, "@")
			if !conEmail {
				email = "" // still an athlete (they may be in the results); no contact without an email
			}
			if cat == "" && r.Categoria != "" {
				inf.Omitir("categoría antigua no reconocida (el atleta queda sin categoría)")
			}
			confirmada := r.Pagada || r.Confirmada
			total := legacy.Centimos(r.Total)
			cuota := legacy.Centimos(r.Subtotal)
			if cuota < total {
				cuota = total
			}
			descCupon, descRef := 0, 0
			var cupID *uuid.UUID
			if r.Cupon.Valid {
				if id, ok := cuponID[int(r.Cupon.Int64)]; ok {
					cupID = &id
				}
				descCupon = min(legacy.Centimos(r.Descuento), cuota-total)
			}
			if r.Referido.Valid {
				descRef = max(0, cuota-total-descCupon)
			}
			estado := "cancelada"
			switch {
			case r.Pagada && total > 0:
				estado = "pagada"
			case confirmada:
				estado = "gratuita"
			}
			proveedor := ""
			if r.Sesion != "" || r.Intent != "" || strings.Contains(strings.ToLower(r.Metodo), "stripe") {
				proveedor = "stripe"
			}
			datos := map[string]string{"nombre": nombre, "apellidos": apellidos, "email": email, "telefono": strings.TrimSpace(r.Tel), "sexo": sexo, "categoria": cat,
				"division": "open", "licencia": "", "club": "", "modalidad": r.Modalidad, "experiencia": r.Experiencia, "instagram": strings.TrimSpace(r.Instagram),
				"entrenador": siNo(r.Entrenador), "handler": siNo(r.Handler), "notas": strings.TrimSpace(r.Notas), "origen": "web anterior"}
			cons := map[string]any{}
			if r.Acepta {
				cons["privacidad"] = "web-anterior"
			}
			var pagadaAt *time.Time
			if estado != "cancelada" {
				t := r.Actualizada
				pagadaAt = &t
			}
			var aid *uuid.UUID
			if confirmada {
				id := legacy.ID("Inscripciones/atleta", r.ID)
				var em *string
				if conEmail {
					em = &email
				}
				if _, err := tx.Exec(ctx, `INSERT INTO atletas (id, competition_id, nombre, apellidos, email, telefono, sexo, categoria, division, estado, origen, created_at)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open','confirmado','propia',$9)`, id, ed.NuevaID, nombre, apellidos, em, datos["telefono"], sexo, cat, r.Creada); err != nil {
					return fmt.Errorf("inscripción %d (atleta): %w", r.ID, err)
				}
				if err := createPerfil(ctx, tx, ed.NuevaID, id, nombre+" "+apellidos); err != nil {
					return err
				}
				if ig := strings.TrimPrefix(datos["instagram"], "@"); ig != "" {
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET instagram = $2 WHERE atleta_id = $1`, id, ig); err != nil {
						return err
					}
				}
				if err := hist(ctx, tx, id, "Importado de la web anterior", fmt.Sprintf("Inscripción %d · %s", r.ID, pagos.Euros(total))); err != nil {
					return err
				}
				aid = &id
				atletaDe[r.ID] = id
				inf.Escritos["atletas"]++
				if r.Checkin.Valid {
					inf.Escritos["atletas con check-in (no se migra la hora)"]++
				}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO inscripciones (id, competition_id, atleta_id, datos, email, cuota, desc_cupon, desc_referido, total, cupon_id, cupon_codigo, estado,
				proveedor, sesion, pago, consentimientos, pagada_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
				iid, ed.NuevaID, aid, datos, email, cuota, descCupon, descRef, total, cupID, normCodigo(r.CuponCodigo), estado, proveedor, r.Sesion, r.Intent, cons, pagadaAt, r.Creada, r.Actualizada); err != nil {
				return fmt.Errorf("inscripción %d: %w", r.ID, err)
			}
			insImportada[r.ID] = true
			inf.Escritos["inscripciones "+estado]++
			if aid == nil {
				continue // an abandoned payment: no athlete and no contact (data minimisation)
			}
			if !conEmail {
				inf.Omitir("atleta sin email (sin contacto en crm)")
				continue
			}
			consents := []map[string]any{}
			if r.Acepta {
				consents = append(consents, map[string]any{"finalidad": "privacidad", "estado": "confirmado", "version": "web-anterior", "origen": "web anterior · inscripción"})
			}
			if err := contacto(ctx, tx, ed.NuevaID, map[string]any{"email": email, "telefono": datos["telefono"], "nombre": strings.TrimSpace(nombre + " " + apellidos), "origen": "inscripcion",
				"relacion": map[string]any{"atleta": true}, "consentimientos": consents,
				"actividad": map[string]any{"tipo": "inscripcion", "titulo": "Se inscribió en la web anterior", "detalle": pagos.Euros(total)}}); err != nil {
				return err
			}
			inf.Escritos["contactos enviados a crm"]++
		}

		codigoID := map[int]uuid.UUID{}
		for _, c := range codigos {
			inf.Leidos["códigos de referido"]++
			ed, ok := mapa[c.Comp]
			aid, okA := atletaDe[c.Ins]
			if !ok || !okA {
				inf.Omitir("código de referido sin atleta migrado")
				continue
			}
			id := legacy.ID("CodigosReferido", c.ID)
			var iid *uuid.UUID
			if insImportada[c.Ins] {
				v := legacy.ID("Inscripciones", c.Ins)
				iid = &v
			}
			tag, err := tx.Exec(ctx, `INSERT INTO referido_codigos (id, competition_id, atleta_id, inscripcion_id, codigo, created_at) VALUES ($1,$2,$3,$4,$5,$6)
				ON CONFLICT DO NOTHING`, id, ed.NuevaID, aid, iid, normCodigo(c.Codigo), c.Creado)
			if err != nil {
				return fmt.Errorf("código de referido %d: %w", c.ID, err)
			}
			if tag.RowsAffected() == 0 {
				inf.Omitir("código de referido ya importado o repetido")
			} else {
				inf.Escritos["códigos de referido"]++
			}
			codigoID[c.ID] = id
		}
		for _, r := range ins {
			if !r.Referido.Valid || !insImportada[r.ID] {
				continue
			}
			if cid, ok := codigoID[int(r.Referido.Int64)]; ok {
				if _, err := tx.Exec(ctx, `UPDATE inscripciones SET referido_id = $2 WHERE id = $1 AND referido_id IS NULL`, legacy.ID("Inscripciones", r.ID), cid); err != nil {
					return err
				}
			}
		}
		for _, u := range usos {
			inf.Leidos["usos de referido"]++
			cid, ok := codigoID[u.Codigo]
			if !ok || !insImportada[u.Ins] {
				inf.Omitir("uso de referido sin código o inscripción migrados")
				continue
			}
			// never «pendiente»: the refund worker must not act on payments of the old site
			estado, at := "sin_devolucion", (*time.Time)(nil)
			if u.Devuelto.Valid {
				estado, at = "devuelta", &u.Devuelto.Time
			}
			tag, err := tx.Exec(ctx, `INSERT INTO referido_usos (id, codigo_id, inscripcion_id, recompensa, estado, devolucion, created_at, devuelto_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				ON CONFLICT DO NOTHING`, legacy.ID("NewUserReferrals", u.ID), cid, legacy.ID("Inscripciones", u.Ins), legacy.Centimos(u.Recompensa), estado, u.Refund, u.Creado, at)
			if err != nil {
				return fmt.Errorf("uso de referido %d: %w", u.ID, err)
			}
			if tag.RowsAffected() > 0 {
				inf.Escritos["usos de referido "+estado]++
			}
		}
		if o.DryRun {
			return legacy.ErrDryRun
		}
		return nil
	})
	if err != nil && !errors.Is(err, legacy.ErrDryRun) {
		return err
	}
	if horarios > 0 {
		inf.Notas = append(inf.Notas, fmt.Sprintf("%d franjas de horario de la web anterior no se migran: los horarios se rehacen con el planificador (Horarios)", horarios))
	}
	if configRef > 0 {
		inf.Notas = append(inf.Notas, "la configuración de inscripción y referidos no se migra: se revisa en «Atletas › Inscripción» (cuota, plazos, recompensas)")
	}
	if !o.DryRun {
		for _, ed := range mapa {
			s.bump(ctx, ed.NuevaID)
		}
	}
	inf.Log(a.Log)
	return nil
}

func siNo(b bool) string {
	if b {
		return "si"
	}
	return "no"
}

package raffle

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/legacy"
)

// etlMySQL («raffle etl-mysql --mysql DSN [--dry-run]») imports, for every migrated edition, the raffle settings
// (only where the edition has none: an edition already configured keeps its own) and the tickets sold, grouped in
// purchases by payment, with their old numbers. Purchases never paid are kept as expired, without tickets. The
// old site's winner was not drawn verifiably: it is reported, not turned into a draw. The sale stays closed
// (activation goes through the legal checklist in the backoffice).
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
	inf := legacy.NuevoInforme("raffle", o.DryRun)

	type cfg struct {
		Comp            int
		Premio, Detalle string
		Precio          float64
		Total           sql.NullInt64
		Fecha           sql.NullTime
		Ganador         string
		Confirmado      bool
	}
	cfgs := map[int]cfg{}
	rows, err := my.QueryContext(ctx, `SELECT CompeticionId, COALESCE(NombrePremio, ''), COALESCE(DescripcionPremio, ''), COALESCE(PrecioTicket, 0), TicketsTotal, FechaSorteo,
		COALESCE(NumeroGanador, ''), GanadorConfirmado FROM RifaConfigs ORDER BY Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var c cfg
		if err := rows.Scan(&c.Comp, &c.Premio, &c.Detalle, &c.Precio, &c.Total, &c.Fecha, &c.Ganador, &c.Confirmado); err != nil {
			rows.Close()
			return err
		}
		cfgs[c.Comp] = c // the last one of a competition wins
	}
	rows.Close()
	type boleto struct {
		ID, Comp            int
		Numero, Pago, Email string
		Nombre              string
		Confirmado          bool
		Creado              time.Time
	}
	compras := map[string][]boleto{}
	var claves []string
	rows, err = my.QueryContext(ctx, `SELECT Id, CompeticionId, NumeroTicket, COALESCE(StripePaymentId, ''), COALESCE(BuyerEmail, ''), COALESCE(BuyerNombre, ''), Confirmado, CreatedAt
		FROM RifaTickets ORDER BY CompeticionId, CreatedAt, Id`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var b boleto
		if err := rows.Scan(&b.ID, &b.Comp, &b.Numero, &b.Pago, &b.Email, &b.Nombre, &b.Confirmado, &b.Creado); err != nil {
			rows.Close()
			return err
		}
		inf.Leidos["boletos"]++
		// one purchase = one payment (or, without a payment id, the same buyer within the same minute)
		k := fmt.Sprintf("%d/%s", b.Comp, b.Pago)
		if b.Pago == "" {
			k = fmt.Sprintf("%d/%s/%s", b.Comp, strings.ToLower(strings.TrimSpace(b.Email)), b.Creado.UTC().Format("2006-01-02T15:04"))
		}
		if _, ok := compras[k]; !ok {
			claves = append(claves, k)
		}
		compras[k] = append(compras[k], b)
	}
	rows.Close()
	var v1Participantes, v1Sorteos int
	_ = my.QueryRowContext(ctx, `SELECT count(*) FROM Participants`).Scan(&v1Participantes)
	_ = my.QueryRowContext(ctx, `SELECT count(*) FROM Draws`).Scan(&v1Sorteos)

	precioDe := map[uuid.UUID]int{}
	err = db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		comps := make([]int, 0, len(cfgs))
		for k := range cfgs {
			comps = append(comps, k)
		}
		sort.Ints(comps)
		for _, k := range comps {
			c := cfgs[k]
			inf.Leidos["configuraciones"]++
			ed, ok := mapa[c.Comp]
			if !ok {
				inf.Omitir("sorteo de una competición no migrada")
				continue
			}
			precio := legacy.Centimos(c.Precio)
			if precio < 50 || precio > 10000 {
				inf.Notas = append(inf.Notas, fmt.Sprintf("%s: precio %.2f € fuera de 0,50–100 € → 1 €", ed.Nueva, c.Precio))
				precio = 100
			}
			var total *int
			if c.Total.Valid && c.Total.Int64 > 0 {
				v := int(c.Total.Int64)
				total = &v
			}
			var fecha *time.Time
			if c.Fecha.Valid {
				fecha = &c.Fecha.Time
			}
			tag, err := tx.Exec(ctx, `INSERT INTO config (competition_id, premio, premio_detalle, precio, total_max, fecha_sorteo, activa, updated_por) VALUES ($1,$2,$3,$4,$5,$6,false,$7)
				ON CONFLICT (competition_id) DO NOTHING`, ed.NuevaID, strings.TrimSpace(c.Premio), strings.TrimSpace(c.Detalle), precio, total, fecha, o.Etiqueta)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				inf.Omitir("sorteo ya configurado en la edición (se conserva)")
				_ = tx.QueryRow(ctx, `SELECT precio FROM config WHERE competition_id = $1`, ed.NuevaID).Scan(&precio)
			} else {
				inf.Escritos["configuraciones"]++
			}
			precioDe[ed.NuevaID] = precio
			if c.Ganador != "" {
				inf.Notas = append(inf.Notas, fmt.Sprintf("%s: la web anterior registró como ganador el boleto %s (confirmado: %s); no se crea un sorteo porque no fue verificable",
					ed.Nueva, c.Ganador, siNo(c.Confirmado)))
			}
		}
		for _, k := range claves {
			bs := compras[k]
			b0 := bs[0]
			ed, ok := mapa[b0.Comp]
			if !ok {
				inf.Omitir("compra de una competición no migrada")
				continue
			}
			inf.Leidos["compras"]++
			id := legacy.ID("RifaTickets/compra", k)
			var ya int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM compras WHERE id = $1`, id).Scan(&ya); err != nil {
				return err
			}
			if ya > 0 {
				inf.Omitir("compra ya importada")
				continue
			}
			pagada := true
			for _, b := range bs {
				pagada = pagada && b.Confirmado
			}
			cantidad := min(len(bs), 100)
			if len(bs) > cantidad {
				inf.Notas = append(inf.Notas, fmt.Sprintf("compra %s: %d boletos, se importan 100 (máximo por compra)", k, len(bs)))
				for range len(bs) - cantidad {
					inf.Omitir("boleto por encima de 100 en una compra")
				}
			}
			precio := precioDe[ed.NuevaID]
			if precio == 0 {
				precio = 100
			}
			estado, pasarela := "caducada", ""
			var pagadaAt *time.Time
			if pagada {
				estado, pagadaAt = "pagada", &b0.Creado
			}
			if b0.Pago != "" {
				pasarela = "stripe"
			}
			nombre := strings.TrimSpace(b0.Nombre)
			if nombre == "" {
				nombre = "Comprador (web anterior)"
			}
			email := strings.ToLower(strings.TrimSpace(b0.Email))
			var em *string
			if strings.Contains(email, "@") {
				em = &email
			}
			if _, err := tx.Exec(ctx, `INSERT INTO compras (id, competition_id, nombre, email, cantidad, importe, estado, pasarela, pago, origen, created_at, pagada_at, updated_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'web anterior',$10,$11,$10)`, id, ed.NuevaID, nombre, em, cantidad, cantidad*precio, estado, pasarela, b0.Pago, b0.Creado, pagadaAt); err != nil {
				return fmt.Errorf("compra %s: %w", k, err)
			}
			inf.Escritos["compras "+estado]++
			if !pagada {
				continue
			}
			nums := []string{}
			for _, b := range bs[:cantidad] {
				n, err := strconv.Atoi(strings.TrimLeft(strings.TrimSpace(b.Numero), "#"))
				if err != nil || n <= 0 {
					inf.Omitir("boleto con un número no numérico")
					continue
				}
				tag, err := tx.Exec(ctx, `INSERT INTO boletos (id, competition_id, compra_id, numero, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
					legacy.ID("RifaTickets", b.ID), ed.NuevaID, id, n, b.Creado)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					inf.Omitir("boleto con un número ya usado en la edición")
					continue
				}
				nums = append(nums, fmt.Sprintf("%04d", n))
				inf.Escritos["boletos"]++
			}
			if em != nil {
				if err := contacto(ctx, tx, ed.NuevaID, map[string]any{"email": email, "nombre": nombre, "origen": "sorteo", "relacion": map[string]any{"boletos": len(nums)},
					"consentimientos": []map[string]any{},
					"actividad":       map[string]any{"tipo": "sorteo", "titulo": fmt.Sprintf("Compró %d boletos en la web anterior", len(nums)), "detalle": strings.Join(nums, ", ")}}); err != nil {
					return err
				}
				inf.Escritos["contactos enviados a crm"]++
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
	if v1Participantes+v1Sorteos > 0 {
		inf.Notas = append(inf.Notas, fmt.Sprintf("tablas del primer sorteo (Participants %d, Draws %d) sin competición: no se migran; quedan en la copia de MySQL", v1Participantes, v1Sorteos))
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
		return "sí"
	}
	return "no"
}

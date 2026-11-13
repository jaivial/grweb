package audit

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// maxCSV caps one export (the accounting firm asks for a month at a time).
const maxCSV = 50000

// filtro holds the audit-log filters shared by the list and the CSV export.
type filtro struct {
	Usuario string `query:"usuario" doc:"Id del usuario que hizo el cambio"`
	Tipo    string `query:"tipo" doc:"Prefijo del tipo de evento (p. ej. identity.)"`
	Entidad string `query:"entidad" doc:"Tipo de entidad: prefijo del subject (campana, rol, usuario…)"`
	Origen  string `query:"origen" enum:"web,cli,mcp,token,"`
	Desde   string `query:"desde" format:"date-time"`
	Hasta   string `query:"hasta" format:"date-time"`
}

func (f filtro) sql(cid uuid.UUID) ([]string, []any, error) {
	where := []string{"competition_id = $1"}
	args := []any{cid}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", "$"+itoa(len(args))))
	}
	if f.Usuario != "" {
		id, err := uuid.Parse(f.Usuario)
		if err != nil {
			return nil, nil, problem.Unprocessable("USUARIO_INVALIDO", "Id de usuario no válido.")
		}
		add("actor_usuario_id = ?", id)
	}
	if f.Tipo != "" {
		add("tipo LIKE ?", likeEscape(f.Tipo)+"%")
	}
	if f.Entidad != "" {
		add("subject LIKE ?", likeEscape(f.Entidad)+":%")
	}
	if f.Origen == "token" {
		where = append(where, "actor_origen LIKE 'token:%'")
	} else if f.Origen != "" {
		add("actor_origen = ?", f.Origen)
	}
	if f.Desde != "" {
		add("occurred_at >= ?::timestamptz", f.Desde)
	}
	if f.Hasta != "" {
		add("occurred_at < ?::timestamptz", f.Hasta)
	}
	return where, args, nil
}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s)
}

type persona struct {
	ID     uuid.UUID `json:"id" db:"id"`
	Nombre string    `json:"nombre" db:"nombre"`
}

// entradas runs selEntrada with a WHERE/ORDER tail and fills the human summary of each row.
func (s *Svc) entradas(ctx context.Context, tail string, args ...any) ([]entrada, error) {
	rows, err := s.a.DB.Query(ctx, selEntrada+tail, args...)
	if err != nil {
		return nil, err
	}
	l, err := pgx.CollectRows(rows, pgx.RowToStructByName[entrada])
	for i := range l {
		l[i].Resumen = resumen(events.Event{Type: l[i].Tipo, Data: l[i].Datos})
	}
	return l, err
}

// auditCSV: occurredAt,tipo,subject,actor,origen,requestId,diff (UTF-8 with BOM so Excel opens accents right).
func auditCSV(items []entrada) []byte {
	var b bytes.Buffer
	b.WriteString("\uFEFF")
	w := csv.NewWriter(&b)
	_ = w.Write([]string{"occurredAt", "tipo", "subject", "actor", "origen", "ip", "peticion", "requestId", "resumen", "diff"})
	for _, e := range items {
		actor := e.ActorNombre
		if actor == "" {
			actor = "Sistema"
		}
		diff := ""
		if len(e.Diff) > 0 && string(e.Diff) != "null" {
			var c bytes.Buffer
			if json.Compact(&c, e.Diff) == nil {
				diff = c.String()
			}
		}
		_ = w.Write([]string{e.OccurredAt.UTC().Format(time.RFC3339), e.Tipo, e.Subject, csvSafe(actor), e.Origen, e.IP, e.Peticion, e.RequestID, csvSafe(e.Resumen), csvSafe(diff)})
	}
	w.Flush()
	return b.Bytes()
}

// csvSafe neutralises spreadsheet formulas (CSV injection) in free-text cells.
func csvSafe(v string) string {
	if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
		return "'" + v
	}
	return v
}

package crm

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// registerAudiencia: messaging asks for the audience of a campaign. The channel consent is always applied (double
// opt-in for email, the separate WhatsApp opt-in) and suppressed destinations never appear, whatever the segment
// says. With lista=true it returns the addresses to send to, each with its own one-click unsubscribe link.
func (s *Svc) registerAudiencia() {
	type in struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			SegmentoID *uuid.UUID `json:"segmentoId,omitempty"`
			Canales    []string   `json:"canales" maxItems:"2"`
			Lista      bool       `json:"lista,omitempty"`
		}
	}
	type dest struct {
		ContactoID uuid.UUID `json:"contactoId"`
		Nombre     string    `json:"nombre"`
		Canal      string    `json:"canal"`
		Destino    string    `json:"destino"`
		Mascara    string    `json:"mascara"`
		Baja       string    `json:"baja"`
		BajaPost   string    `json:"bajaPost"`
	}
	type out struct {
		Body struct {
			Segmento      string `json:"segmento"`
			Total         int    `json:"total"`
			Email         int    `json:"email"`
			WhatsApp      int    `json:"whatsapp"`
			Excluidos     int    `json:"excluidos"`
			Destinatarios []dest `json:"destinatarios"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "internal-audiencia", Method: http.MethodPost, Path: "/internal/competiciones/{cid}/audiencia", Summary: "Audiencia de una campaña (solo messaging)", Tags: []string{"Interno"}, Hidden: true},
		func(ctx context.Context, in *in) (*out, error) {
			if _, err := auth.RequireService(ctx); err != nil {
				return nil, err
			}
			o := &out{}
			o.Body.Destinatarios = []dest{}
			cs := []Condicion{}
			o.Body.Segmento = "Todos con consentimiento"
			if in.Body.SegmentoID != nil {
				var seg Segmento
				err := s.a.DB.QueryRow(ctx, `SELECT nombre, condiciones FROM segmentos WHERE competition_id = $1 AND id = $2`, in.CID, *in.Body.SegmentoID).Scan(&seg.Nombre, &seg.Condiciones)
				if db.IsNoRows(err) {
					return nil, problem.NotFound("Segmento no encontrado.")
				}
				if err != nil {
					return nil, err
				}
				cs, o.Body.Segmento = seg.Condiciones, seg.Nombre
			}
			r, err := s.contar(ctx, in.CID, cs)
			if err != nil {
				return nil, err
			}
			quiere := map[string]bool{}
			for _, c := range in.Body.Canales {
				quiere[c] = true
			}
			o.Body.Total = r.Total
			alcanzables := 0
			if quiere["email"] {
				o.Body.Email = r.Email
			}
			if quiere["whatsapp"] {
				o.Body.WhatsApp = r.WhatsApp
			}
			// reachable contacts on at least one requested channel
			args := []any{in.CID}
			where, err := condSQL(cs, &args)
			if err != nil {
				return nil, err
			}
			args = append(args, quiere["email"], quiere["whatsapp"])
			ne, nw := len(args)-1, len(args)
			q := `SELECT c.id, COALESCE(c.nombre, ''), c.email::text, c.telefono,
				($` + itoa(ne) + `::boolean AND c.email IS NOT NULL AND EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'novedades_email' AND k.estado = 'confirmado')
					AND NOT EXISTS (SELECT 1 FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'email' AND x.contacto_id = c.id)) AS por_email,
				($` + itoa(nw) + `::boolean AND c.telefono IS NOT NULL AND EXISTS (SELECT 1 FROM consentimientos k WHERE k.contacto_id = c.id AND k.finalidad = 'avisos_whatsapp' AND k.estado = 'confirmado')
					AND NOT EXISTS (SELECT 1 FROM supresiones x WHERE x.competition_id = c.competition_id AND x.canal = 'whatsapp' AND x.contacto_id = c.id)) AS por_wa
				FROM contactos c WHERE c.competition_id = $1 AND c.anonimizado_at IS NULL AND ` + where
			rows, err := s.a.DB.Query(ctx, q, args...)
			if err != nil {
				return nil, err
			}
			defer rows.Close()
			for rows.Next() {
				var id uuid.UUID
				var nombre string
				var em, tel *string
				var pe, pw bool
				if err := rows.Scan(&id, &nombre, &em, &tel, &pe, &pw); err != nil {
					return nil, err
				}
				if !pe && !pw {
					continue
				}
				alcanzables++
				if !in.Body.Lista {
					continue
				}
				// The suppression list is also checked by destination hash (an address suppressed before it had a contact).
				if pe && !s.suprimido(ctx, in.CID, "email", *em) {
					b := s.bajaToken(id, "novedades_email")
					o.Body.Destinatarios = append(o.Body.Destinatarios, dest{id, nombre, "email", *em, mascara("email", *em), s.webURL + "/baja?t=" + b, s.webURL + "/api/baja/" + b})
				}
				if pw && !s.suprimido(ctx, in.CID, "whatsapp", *tel) {
					b := s.bajaToken(id, "avisos_whatsapp")
					o.Body.Destinatarios = append(o.Body.Destinatarios, dest{id, nombre, "whatsapp", *tel, mascara("whatsapp", *tel), s.webURL + "/baja?t=" + b, s.webURL + "/api/baja/" + b})
				}
			}
			if err := rows.Err(); err != nil {
				return nil, err
			}
			o.Body.Excluidos = o.Body.Total - alcanzables
			if in.Body.Lista && in.Body.SegmentoID != nil {
				_, _ = s.a.DB.Exec(ctx, `UPDATE segmentos SET ultimo_uso = 'Campaña · ' || to_char(now() AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI') WHERE id = $1`, *in.Body.SegmentoID)
			}
			return o, nil
		})
}

func (s *Svc) suprimido(ctx context.Context, cid uuid.UUID, canal, destino string) bool {
	if canal == "whatsapp" {
		destino = normTel(destino)
	}
	var n int
	_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM supresiones WHERE competition_id = $1 AND canal = $2 AND destino_hash = $3`, cid, canal, s.hashDestino(destino)).Scan(&n)
	return n > 0
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

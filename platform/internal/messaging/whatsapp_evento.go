package messaging

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
)

// handleWhatsapp queues the WhatsApp messages of a request: one to the athlete (only if he consented and the switch
// «WhatsApp al atleta» is on) and one to each phone of the list of organisers (one message per phone, never a
// group: the consent and the opt-out only work that way). The switches and the list live in «Avisos de solicitudes».
func (s *Svc) handleWhatsapp(ctx context.Context, e events.Event) error {
	var d struct {
		Para          string            `json:"para"`
		Organizadores bool              `json:"organizadores"`
		Plantilla     string            `json:"plantilla"`
		Vars          map[string]string `json:"vars"`
		Imagen        string            `json:"imagen"`
	}
	if json.Unmarshal(e.Data, &d) != nil {
		return nil // poison message: nothing to send
	}
	cid := uuid.Nil
	if id, err := uuid.Parse(e.CompetitionID); err == nil {
		cid = id
	}
	t, ok := porClave[d.Plantilla]
	if !ok || t.WA == nil {
		return nil // unknown template (or without a WhatsApp version): nothing to send
	}
	// The photo travels in «imagen» (the media of the message); if the producer only sent it as a variable, it is
	// the same signed URL.
	if d.Imagen == "" && t.WA.Imagen && strings.HasPrefix(d.Vars["foto"], "http") {
		d.Imagen = d.Vars["foto"]
	}
	avisos := s.avisosDe(ctx, cid)
	var destinos []string
	if d.Para != "" && avisos.AlAtleta {
		if num := normTel(d.Para); num != "" {
			destinos = append(destinos, num)
		}
	}
	if d.Organizadores && avisos.AOrganizadores {
		for _, tel := range avisos.Telefonos {
			if tel.Numero != "" {
				destinos = append(destinos, tel.Numero)
			}
		}
	}
	vistos := map[string]bool{}
	return s.tx(ctx, func(tx pgx.Tx) error {
		for _, num := range destinos {
			if vistos[num] {
				continue
			}
			vistos[num] = true
			vars := map[string]string{}
			for k, v := range d.Vars {
				vars[k] = v
			}
			if d.Imagen != "" {
				vars["__imagen"] = d.Imagen // the photo of the request (a signed URL): sent as an image
			}
			// The id is derived from the event and the recipient: a redelivery does not duplicate the message.
			id := uuid.NewSHA1(e.ID, []byte(num))
			if _, err := tx.Exec(ctx, `INSERT INTO mensajes (id, competition_id, evento_id, canal, plantilla, destino, vars, estado)
				VALUES ($1,$2,$3,'whatsapp',$4,$5,$6,'en_cola') ON CONFLICT (evento_id) DO NOTHING`,
				id, cid, id, d.Plantilla, num, vars); err != nil {
				return err
			}
		}
		return nil
	})
}

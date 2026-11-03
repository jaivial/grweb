package live

import (
	"context"
	"net/http"
	"net/url"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// videoOK accepts the links /en-directo can embed (empty = no video): YouTube — watch?v=, /live/ID, /embed/ID, /shorts/ID,
// youtu.be/ID and a channel's live (/channel/UC…/live) — and Twitch channels. Anything else would be an arbitrary iframe.
func videoOK(raw string) bool {
	if raw == "" {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		return false
	}
	host := strings.TrimPrefix(strings.TrimPrefix(strings.ToLower(u.Hostname()), "www."), "m.")
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	switch host {
	case "youtube.com", "youtube-nocookie.com":
		if u.Path == "/watch" {
			return u.Query().Get("v") != ""
		}
		if len(parts) == 2 && (parts[0] == "live" || parts[0] == "embed" || parts[0] == "shorts") && parts[1] != "" && parts[1] != "live_stream" {
			return true
		}
		return len(parts) >= 2 && parts[0] == "channel" && strings.HasPrefix(parts[1], "UC")
	case "youtu.be":
		return len(parts) == 1 && parts[0] != ""
	case "twitch.tv":
		return len(parts) == 1 && parts[0] != ""
	}
	return false
}

const msgVideo = "Tiene que ser un enlace https de YouTube (youtube.com/live/…, youtube.com/watch?v=…, youtu.be/…) o de un canal de Twitch."

// registerRetransmision: Backoffice › Directo › Retransmisión (Figma 57): the YouTube broadcast of /en-directo, its replay
// and whether the page shows it. Only those columns change, so the desk keeps working while it is edited.
func (s *Svc) registerRetransmision() {
	type retIn struct {
		CID     uuid.UUID `path:"cid"`
		IfMatch string    `header:"If-Match" required:"true"`
		Body    struct {
			StreamURL string `json:"streamUrl" maxLength:"500" doc:"Emisión en directo (YouTube o Twitch)"`
			ReplayURL string `json:"replayUrl" maxLength:"500" doc:"Repetición; vacío: la misma emisión"`
			Visible   bool   `json:"visible" doc:"Mostrar el vídeo en /en-directo"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "directo-retransmision", Method: http.MethodPut, Path: "/api/admin/competiciones/{cid}/directo/retransmision",
		Summary: "Retransmisión de /en-directo: emisión, repetición y visibilidad", Tags: tagDirecto, Security: bearer},
		func(ctx context.Context, in *retIn) (*mesaOut, error) {
			if _, err := requireAny(ctx, in.CID, "Tu rol no puede cambiar la retransmisión (permiso «directo.operar»).", "directo.operar"); err != nil {
				return nil, err
			}
			b := in.Body
			b.StreamURL, b.ReplayURL = strings.TrimSpace(b.StreamURL), strings.TrimSpace(b.ReplayURL)
			for _, u := range []string{b.StreamURL, b.ReplayURL} {
				if !videoOK(u) {
					return nil, problem.Unprocessable("URL_NO_VALIDA", msgVideo)
				}
			}
			err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				e, err := s.estado(ctx, tx, in.CID, true)
				if err != nil {
					return err
				}
				if strings.Trim(in.IfMatch, `"W/`) != itoa(e.Version) {
					return problem.Conflict("CONFLICTO_EDICION", "Otra persona ha cambiado el directo. Recarga para ver la última versión.")
				}
				if _, err := tx.Exec(ctx, `UPDATE estado SET stream_url = $2, replay_url = $3, stream_visible = $4, version = version + 1, updated_at = now() WHERE competition_id = $1`,
					in.CID, b.StreamURL, b.ReplayURL, b.Visible); err != nil {
					return err
				}
				// /en-directo reloads on «directo.estado» (public SSE): the new video shows without a refresh
				return evento(ctx, tx, in.CID, "directo.estado", map[string]any{"fase": e.Fase, "retransmision": true}, events.Subject("retransmisión"))
			})
			if err != nil {
				return nil, err
			}
			s.bump(ctx, in.CID)
			m, err := s.mesa(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			return out(m), nil
		})
}

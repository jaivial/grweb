package athletes

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/problem"
)

// «Comparte tu cuenta atrás» (Figma 83): the browser composes the 1080×1920 PNG; the API serves the athlete's
// photo same-origin (so the canvas is not tainted by the CDN) and counts the shares.
func (s *Svc) registerAreaStory() {
	base := "/api/area-atleta/story"
	cli := &http.Client{Timeout: 10 * time.Second}

	s.a.Mux.HandleFunc("GET "+base+"/foto", func(w http.ResponseWriter, req *http.Request) {
		v := ""
		if ck, _ := req.Cookie(areaCookie); ck != nil {
			v = ck.Value
		}
		r, err := s.session(req.Context(), v)
		if err != nil {
			problem.Write(w, err.(*problem.Error))
			return
		}
		var url string
		_ = s.a.DB.QueryRow(req.Context(), `SELECT coalesce(foto_url, '') FROM perfiles WHERE atleta_id = $1`, r.ID).Scan(&url)
		if !strings.HasPrefix(url, "https://") {
			problem.Write(w, problem.NotFound("Aún no tienes foto en tu ficha."))
			return
		}
		up, err := http.NewRequestWithContext(req.Context(), http.MethodGet, url, nil)
		if err != nil {
			problem.Write(w, problem.Internal())
			return
		}
		res, err := cli.Do(up)
		if err != nil || res.StatusCode != http.StatusOK {
			if res != nil {
				res.Body.Close()
			}
			slog.WarnContext(req.Context(), "story: foto no disponible", "atleta", r.ID, "err", err)
			problem.Write(w, problem.NotFound("No hemos podido cargar tu foto."))
			return
		}
		defer res.Body.Close()
		w.Header().Set("Content-Type", res.Header.Get("Content-Type"))
		w.Header().Set("Cache-Control", "private, max-age=300")
		_, _ = io.Copy(w, io.LimitReader(res.Body, 16<<20))
	})

	type compartirIn struct {
		Session string `cookie:"gr_area"`
		Body    struct {
			Modo    string `json:"modo" enum:"cuenta_atras,fecha"`
			Formato string `json:"formato" enum:"story,sticker"`
			Canal   string `json:"canal" enum:"compartir,descarga"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "area-story-compartida", Method: http.MethodPost, Path: base + "/comparticiones", Summary: "Registrar que compartí o descargué mi story", Tags: tagArea, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *compartirIn) (*struct{}, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			id, _ := uuid.NewV7()
			if _, err := s.a.DB.Exec(ctx, `INSERT INTO story_comparticiones (id, competition_id, atleta_id, modo, formato, canal) VALUES ($1, $2, $3, $4, $5, $6)`,
				id, r.CompetitionID, r.ID, in.Body.Modo, in.Body.Formato, in.Body.Canal); err != nil {
				return nil, problem.Internal()
			}
			slog.InfoContext(ctx, "story compartida", "atleta", r.ID, "modo", in.Body.Modo, "formato", in.Body.Formato, "canal", in.Body.Canal)
			return nil, nil
		})
}

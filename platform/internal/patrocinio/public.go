package patrocinio

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// registerPublic mounts the click redirect: it is a 302, not JSON, so it lives on the raw mux (like the payment
// webhook of raffle).
func (s *Svc) registerPublic() {
	s.a.Mux.HandleFunc("GET /api/competiciones/{slug}/patrocinio/banners/{id}/clic", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		c, err := s.comps.Public(ctx, r.PathValue("slug"))
		if err != nil {
			var p *problem.Error
			if errors.As(err, &p) {
				problem.Write(w, p)
				return
			}
			http.Error(w, "error", http.StatusInternalServerError)
			return
		}
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		var destino string
		var activo bool
		if err := s.a.DB.QueryRow(ctx, `SELECT url_destino, activo FROM banners WHERE competition_id = $1 AND id = $2`, c.ID, id).Scan(&destino, &activo); err != nil || !activo {
			http.NotFound(w, r)
			return
		}
		// Validated on save, checked again here: never redirect to a non-http(s) destination.
		if !urlSegura(destino) {
			http.NotFound(w, r)
			return
		}
		// One counted click per banner, día and IP (límite por IP); repeats insert nothing.
		ip := httpx.ClientIPFrom(ctx)
		h := sha256.Sum256([]byte(s.a.Cfg.InternalToken + ":clic:" + ip))
		_, _ = s.a.DB.Exec(ctx, `INSERT INTO clics (id, competition_id, banner_id, dia, ip_hash) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
			newID(), c.ID, id, diaTexto(hoyMadrid(time.Now())), hex.EncodeToString(h[:16]))
		http.Redirect(w, r, destino, http.StatusFound)
	})
}

// urlSegura accepts only absolute http/https destinations.
func urlSegura(u string) bool {
	p, err := url.Parse(u)
	return err == nil && (p.Scheme == "http" || p.Scheme == "https") && p.Host != ""
}

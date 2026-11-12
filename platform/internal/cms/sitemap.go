package cms

import (
	"encoding/xml"
	"net/http"
	"regexp"
	"time"
)

// sitemapRutas are the public routes of the web (Figma 20 · arquitectura SEO). Published pages, blog posts and
// sections are added from the database; routes marked not indexable in «seo» are left out.
var sitemapRutas = []string{"/", "/en", "/categorias-de-peso", "/marcas-minimas", "/reglamento", "/preguntas-frecuentes",
	"/atletas", "/participantes", "/horarios", "/entradas", "/sorteo", "/en-directo", "/resultados", "/resultados/2025",
	"/ediciones/2025", "/publico", "/clubs", "/patrocinadores", "/galeria", "/voluntarios", "/como-llegar",
	"/donde-dormir-y-comer", "/mapa-de-accesos", "/blog", "/privacidad", "/terminos", "/cookies", "/consentimiento-datos",
	"/politica-concurso", "/alta-atleta"}

var origenRe = regexp.MustCompile(`^https://[a-z0-9.-]+$`)

type smLink struct {
	Rel      string `xml:"rel,attr"`
	Hreflang string `xml:"hreflang,attr"`
	Href     string `xml:"href,attr"`
}

type smURL struct {
	Loc     string   `xml:"loc"`
	Lastmod string   `xml:"lastmod,omitempty"`
	Links   []smLink `xml:"xhtml:link"`
}

type urlset struct {
	XMLName xml.Name `xml:"urlset"`
	NS      string   `xml:"xmlns,attr"`
	XHTML   string   `xml:"xmlns:xhtml,attr"`
	URLs    []smURL  `xml:"url"`
}

// registerSitemap: GET /api/sitemap?competicion={slug}[&origen=https://host] → sitemap.xml (cache 1 h).
func (s *Svc) registerSitemap() {
	s.a.Mux.HandleFunc("GET /api/sitemap", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		q := r.URL.Query()
		cid, err := s.cidFor(ctx, q.Get("competicion"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		origen := q.Get("origen")
		if !origenRe.MatchString(origen) {
			origen = "https://grcup.es"
		}
		rows, err := s.a.DB.Query(ctx, `SELECT CASE WHEN tipo = 'blog' THEN '/blog/' ELSE '/' END || slug, updated_at, false FROM paginas WHERE competition_id = $1 AND `+visible+`
			UNION ALL SELECT '/' || pagina, max(updated_at), false FROM secciones WHERE competition_id = $1 AND pagina <> 'home' AND publicado IS NOT NULL GROUP BY pagina
			UNION ALL SELECT '/', max(updated_at), false FROM secciones WHERE competition_id = $1 AND pagina = 'home' AND publicado IS NOT NULL HAVING count(*) > 0
			UNION ALL SELECT '/preguntas-frecuentes', max(updated_at), false FROM faq WHERE competition_id = $1 AND publicada HAVING count(*) > 0
			UNION ALL SELECT ruta, updated_at, true FROM seo WHERE competition_id = $1 AND NOT indexable`, cid)
		if err != nil {
			s.a.Log.Error("sitemap", "err", err)
			http.Error(w, "sitemap no disponible", http.StatusServiceUnavailable)
			return
		}
		rutas := append([]string{}, sitemapRutas...)
		lastmod, noindex := map[string]time.Time{}, map[string]bool{}
		var ultimo time.Time // routes with no dated content of their own: the latest content change
		for rows.Next() {
			var ruta string
			var at time.Time
			var ni bool
			if err := rows.Scan(&ruta, &at, &ni); err != nil {
				continue
			}
			if ni {
				noindex[ruta] = true
				continue
			}
			rutas = append(rutas, ruta)
			lastmod[ruta] = at
			if at.After(ultimo) {
				ultimo = at
			}
		}
		rows.Close()
		out := urlset{NS: "http://www.sitemaps.org/schemas/sitemap/0.9", XHTML: "http://www.w3.org/1999/xhtml"}
		vistos := map[string]bool{}
		for _, ruta := range rutas {
			if vistos[ruta] || noindex[ruta] {
				continue
			}
			vistos[ruta] = true
			u := smURL{Loc: origen + ruta}
			if at, ok := lastmod[ruta]; ok {
				u.Lastmod = at.Format("2006-01-02")
			} else if !ultimo.IsZero() {
				u.Lastmod = ultimo.Format("2006-01-02")
			}
			if ruta == "/" || ruta == "/en" {
				u.Links = []smLink{{"alternate", "es", origen + "/"}, {"alternate", "en", origen + "/en"}, {"alternate", "x-default", origen + "/"}}
			}
			out.URLs = append(out.URLs, u)
		}
		w.Header().Set("Content-Type", "application/xml; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_, _ = w.Write([]byte(xml.Header))
		_ = xml.NewEncoder(w).Encode(out)
	})
}


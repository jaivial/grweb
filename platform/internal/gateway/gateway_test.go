package gateway

import "testing"

// The client asked for this one test: the routing table must keep sending every public and admin path of
// the paso 17 services (directo social) to their owner, including the WebSocket of the chat, without
// touching the routes that already existed.
func TestMatch(t *testing.T) {
	casos := []struct {
		ruta string
		svc  string
	}{
		// cms: access maps (public list and backoffice)
		{"/api/competiciones/grc-2026/mapas", "cms"},
		{"/api/admin/competiciones/01970000-0000-7000-8000-000000000001/web/mapas/imagen", "cms"},
		{"/api/medios/mapas/mapas-0198.png", "cms"},
		// fans
		{"/api/competiciones/grc-2026/fans/acceso", "fans"},
		{"/api/competiciones/grc-2026/fans/acceso/un-token-largo-32", "fans"},
		{"/api/competiciones/grc-2026/fans/canjear", "fans"},
		{"/api/competiciones/grc-2026/fans/yo", "fans"},
		{"/api/competiciones/grc-2026/fans/salir", "fans"},
		{"/api/competiciones/grc-2026/fans", "fans"},
		{"/api/admin/competiciones/01970000-0000-7000-8000-000000000001/fans", "fans"},
		{"/api/admin/competiciones/01970000-0000-7000-8000-000000000001/fans/un-id/banear", "fans"},
		// chat (WebSocket, SSE y REST comparten prefijo)
		{"/api/competiciones/grc-2026/chat/ws", "chat"},
		{"/api/competiciones/grc-2026/chat/stream", "chat"},
		{"/api/competiciones/grc-2026/chat/mensajes", "chat"},
		{"/api/admin/competiciones/01970000-0000-7000-8000-000000000001/chat", "chat"},
		// donaciones
		{"/api/competiciones/grc-2026/donaciones", "donaciones"},
		{"/api/competiciones/grc-2026/donaciones/ranking", "donaciones"},
		{"/api/webhooks/pagos/donaciones", "donaciones"},
		{"/api/pagos/simulado/donaciones/checkout", "donaciones"},
		// patrocinio y juegos
		{"/api/competiciones/grc-2026/patrocinio/banners/b1/clic", "patrocinio"},
		{"/api/admin/competiciones/01970000-0000-7000-8000-000000000001/patrocinio", "patrocinio"},
		{"/api/competiciones/grc-2026/juegos/porra/mercados", "juegos"},
		{"/api/competiciones/grc-2026/juegos/fantasy/clasificacion", "juegos"},
		{"/api/competiciones/grc-2026/juegos/premios", "juegos"},
		// las rutas de antes no cambian
		{"/api/competiciones", "competition"},
		{"/api/competiciones/grc-2026", "competition"},
		{"/api/competiciones/grc-2026/config", "competition"},
		{"/api/competiciones/grc-2026/directo", "live"},
		{"/api/competiciones/grc-2026/resultados/categoria", "live"},
		{"/api/competiciones/grc-2026/atletas", "athletes"},
		{"/api/competiciones/grc-2026/inscripcion", "athletes"},
		{"/api/webhooks/pagos/inscripciones", "athletes"},
		{"/api/pagos/simulado/athletes/checkout", "athletes"},
		{"/api/webhooks/pagos/sorteo", "raffle"},
		{"/api/competiciones/grc-2026/sorteo", "raffle"},
		{"/api/competiciones/grc-2026/horarios.ics", "schedule"},
		{"/api/competiciones/grc-2026/entradas", "ticketing"},
		{"/api/competiciones/grc-2026/stream", "realtime"},
		{"/api/auth/login", "identity"},
		{"/api/webhooks/whatsapp", "messaging"},
		// Sin dueño en la tabla: competition es el último catch-all y responderá 404.
		{"/api/competiciones/grc-2026/otro-servicio/x", "competition"},
	}
	for _, c := range casos {
		if got := match(c.ruta); got != c.svc {
			t.Errorf("match(%q) = %q; quiero %q", c.ruta, got, c.svc)
		}
	}
}

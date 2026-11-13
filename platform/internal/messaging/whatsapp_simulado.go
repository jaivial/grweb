package messaging

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
)

// Simulated linking (WHATSAPP_SIMULADO=true, QA only): without an evo-weai integration «Sistema › WhatsApp» still walks
// the whole flow — create instance, QR or code, «conectando» and, a few seconds later, «conectado» via the same SSE
// event the webhook would emit. The state lives in whatsapp_instancia (url = 'simulado'); nothing leaves the platform.

const simEspera = 12 * time.Second

func (s *Svc) waSimulado(ctx context.Context, cid uuid.UUID) bool {
	if !config.Bool("WHATSAPP_SIMULADO", false) {
		return false
	}
	cfg, clave := s.waIntegracion(ctx, cid)
	return cfg["proveedor"] != "evo-weai" || cfg["url"] == "" || clave == ""
}

// simQR is a QR-looking SVG (data URL); it changes with the seed so a «new QR» looks new.
func simQR(semilla string) string {
	h := sha256.Sum256([]byte(semilla))
	const n = 25
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges"><rect width="%d" height="%d" fill="#fff"/>`, n+2, n+2, n+2, n+2)
	ojo := func(x, y int) bool { return (x < 7 && y < 7) || (x >= n-7 && y < 7) || (x < 7 && y >= n-7) }
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			on := false
			if ojo(x, y) {
				lx, ly := x%(n-7), y%(n-7)
				if x >= n-7 {
					lx = x - (n - 7)
				}
				if y >= n-7 {
					ly = y - (n - 7)
				}
				on = lx == 0 || ly == 0 || lx == 6 || ly == 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4)
			} else {
				i := (y*n + x) % 256
				on = (h[i/8%32]>>(uint(i)%8))&1 == 1 != ((x*7+y*13)%3 == 0)
			}
			if on {
				fmt.Fprintf(&b, `<rect x="%d" y="%d" width="1" height="1"/>`, x+1, y+1)
			}
		}
	}
	b.WriteString("</svg>")
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(b.String()))
}

func simCodigo(semilla string) string {
	const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	h := sha256.Sum256([]byte(semilla))
	out := make([]byte, 8)
	for i := range out {
		out[i] = abc[int(h[i])%len(abc)]
	}
	return string(out)
}

// simEstado fills the admin state from the simulated row.
func (s *Svc) simEstado(ctx context.Context, cid uuid.UUID, out *WAEstadoAdmin) {
	out.Servicio, out.Modo = "ok", "simulado"
	var estado, numero, inst string
	var desde *time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT instancia, estado, numero, conectado_desde FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&inst, &estado, &numero, &desde); err != nil {
		return // no row: «sin_instancia»
	}
	out.InstanciaID, out.Estado, out.Numero, out.ConectadoDesde = inst, estado, numero, desde
}

// simConectando stores «conectando» and, after simEspera, links the (fake) number and emits whatsapp.conexion.
func (s *Svc) simConectando(ctx context.Context, cid uuid.UUID, numero string) string {
	inst := s.instanciaNombre(ctx, cid)
	_, _ = s.a.DB.Exec(ctx, `INSERT INTO whatsapp_instancia (competition_id, instancia, url, estado, numero, updated_at) VALUES ($1,$2,'simulado','conectando',$3, now())
		ON CONFLICT (competition_id) DO UPDATE SET instancia = EXCLUDED.instancia, url = 'simulado', estado = 'conectando',
		numero = CASE WHEN EXCLUDED.numero <> '' THEN EXCLUDED.numero ELSE whatsapp_instancia.numero END, conectado_desde = NULL, updated_at = now()`, cid, inst, numero)
	var marca time.Time
	_ = s.a.DB.QueryRow(ctx, `SELECT updated_at FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&marca)
	s.a.Log.Info("whatsapp simulado: vinculando", "competicion", cid, "instancia", inst)
	time.AfterFunc(simEspera, func() {
		bg, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		// Only if nothing changed meanwhile (a new QR, a restart or a disconnection restart the clock or remove the row).
		tag, err := s.a.DB.Exec(bg, `UPDATE whatsapp_instancia SET estado = 'conectado', conectado_desde = now(),
			numero = CASE WHEN numero = '' THEN '+34 600 000 000' ELSE numero END, updated_at = now()
			WHERE competition_id = $1 AND estado = 'conectando' AND url = 'simulado' AND updated_at = $2`, cid, marca)
		if err != nil || tag.RowsAffected() == 0 {
			return
		}
		s.a.Log.Info("whatsapp simulado: conectado", "competicion", cid)
		_ = s.tx(bg, func(tx pgx.Tx) error {
			return events.Enqueue(bg, tx, events.New(bg, "whatsapp.conexion", map[string]any{"estado": "conectado"},
				events.Competition(cid.String()), events.ForPermission("integraciones.config")))
		})
	})
	return inst
}

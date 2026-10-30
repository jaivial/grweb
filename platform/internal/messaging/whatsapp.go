package messaging

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// WhatsApp goes through an evo-weai instance (Evolution API v2 compatible, decision of 29/10) configured as the
// competition's «whatsapp» integration: proveedor=evo-weai, url, instancia, numero, secret = the API key. Without it
// and with WHATSAPP_SIMULADO=true (QA) messages are recorded as delivered without leaving the platform.

type waCfg struct {
	Modo      string // evo-weai · simulado · ninguno
	URL       string
	Instancia string
	Numero    string
	Clave     string
}

func (s *Svc) waDe(ctx context.Context, cid uuid.UUID) waCfg {
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/whatsapp", nil, &out)
	if err == nil && out.Config["proveedor"] == "evo-weai" && out.Config["url"] != "" && out.Config["instancia"] != "" && out.Secreto != "" {
		return waCfg{Modo: "evo-weai", URL: strings.TrimRight(out.Config["url"], "/"), Instancia: out.Config["instancia"], Numero: out.Config["numero"], Clave: out.Secreto}
	}
	if err != nil {
		var p *problem.Error
		if !errors.As(err, &p) || p.Status != http.StatusNotFound {
			s.a.Log.Warn("integración whatsapp no disponible", "err", err)
		}
	}
	if config.Bool("WHATSAPP_SIMULADO", false) {
		return waCfg{Modo: "simulado", Numero: "+34 600 000 000"}
	}
	return waCfg{Modo: "ninguno"}
}

// errWA is a send error; permanent means the number is not on WhatsApp.
type errWA struct {
	msg        string
	permanente bool
}

func (e *errWA) Error() string { return e.msg }

func (s *Svc) evo(ctx context.Context, c waCfg, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, _ := json.Marshal(in)
		body = bytes.NewReader(b)
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, c.URL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.Clave)
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return &errWA{msg: "evo-weai no responde: " + err.Error()}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		m := strings.TrimSpace(string(raw))
		if len(m) > 200 {
			m = m[:200]
		}
		low := strings.ToLower(m)
		perm := res.StatusCode == http.StatusBadRequest && (strings.Contains(low, "exists") || strings.Contains(low, "not on whatsapp") || strings.Contains(low, "invalid number"))
		return &errWA{msg: fmt.Sprintf("evo-weai %d: %s", res.StatusCode, m), permanente: perm}
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

// enviarWA sends the derived message: the image with the text as caption (or the image, then the text, when it
// is longer than a caption allows). Returns the provider message id.
func (s *Svc) enviarWA(ctx context.Context, c waCfg, numero string, w WhatsApp) (string, error) {
	numero = strings.TrimPrefix(strings.ReplaceAll(numero, " ", ""), "+")
	switch c.Modo {
	case "simulado":
		return "sim-" + uuid.Must(uuid.NewV7()).String(), nil
	case "evo-weai":
	default:
		return "", &errWA{msg: "WhatsApp no está configurado"}
	}
	var r struct {
		Key struct {
			ID string `json:"id"`
		} `json:"key"`
	}
	if w.Imagen != "" {
		caption := w.Texto
		if len(caption) > 1000 {
			caption = ""
		}
		if err := s.evo(ctx, c, http.MethodPost, "/message/sendMedia/"+c.Instancia, map[string]any{"number": numero, "mediatype": "image", "media": w.Imagen, "caption": caption}, &r); err != nil {
			return "", err
		}
		if caption != "" {
			return r.Key.ID, nil
		}
	}
	if err := s.evo(ctx, c, http.MethodPost, "/message/sendText/"+c.Instancia, map[string]any{"number": numero, "text": w.Texto}, &r); err != nil {
		return "", err
	}
	return r.Key.ID, nil
}

// webhookToken signs the webhook URL of a competition.
func (s *Svc) webhookToken(cid uuid.UUID) string {
	m := hmac.New(sha256.New, []byte(s.a.Cfg.InternalToken))
	m.Write([]byte("grcup/whatsapp/webhook:" + cid.String()))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil)[:18])
}

// WAEstado is the WhatsApp channel state (campaign settings, «Emails y avisos»).
type WAEstado struct {
	Modo     string `json:"modo" enum:"evo-weai,simulado,ninguno"`
	Numero   string `json:"numero,omitempty"`
	Conexion string `json:"conexion" enum:"open,connecting,close,simulado,ninguno" doc:"Estado de la sesión de WhatsApp"`
	Detalle  string `json:"detalle,omitempty"`
}

func (s *Svc) waEstado(ctx context.Context, cid uuid.UUID) WAEstado {
	c := s.waDe(ctx, cid)
	e := WAEstado{Modo: c.Modo, Numero: c.Numero, Conexion: c.Modo}
	if c.Modo != "evo-weai" {
		return e
	}
	var r struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	if err := s.evo(ctx, c, http.MethodGet, "/instance/connectionState/"+c.Instancia, nil, &r); err != nil {
		e.Conexion, e.Detalle = "close", err.Error()
		return e
	}
	e.Conexion = r.Instance.State
	if e.Conexion == "" {
		e.Conexion = "close"
	}
	return e
}

func (s *Svc) registerWhatsApp() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/whatsapp"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-estado", Method: http.MethodGet, Path: base, Summary: "Estado del canal de WhatsApp (evo-weai)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body WAEstado }, error) {
			if _, err := requirePerm(ctx, in.CID); err != nil {
				return nil, err
			}
			return &struct{ Body WAEstado }{s.waEstado(ctx, in.CID)}, nil
		})

	type conIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Numero string `json:"numero" pattern:"^\\+?[0-9 ]{9,16}$" doc:"Número del teléfono que se vincula (código de vinculación en WhatsApp › Dispositivos vinculados)"`
		}
	}
	type conOut struct {
		Body struct {
			Codigo string `json:"codigo,omitempty" doc:"Código de vinculación de 8 caracteres"`
			QR     string `json:"qr,omitempty" doc:"QR en base64 (alternativa al código)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-conectar", Method: http.MethodPost, Path: base + "/conectar", Summary: "Vincular el número (código de vinculación) y registrar el webhook", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *conIn) (*conOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			c := s.waDe(ctx, in.CID)
			if c.Modo != "evo-weai" {
				return nil, problem.Conflict("WHATSAPP_SIN_CONFIGURAR", "Configura antes la integración de WhatsApp (evo-weai: URL, instancia y clave) en «Sistema e integraciones».")
			}
			num := strings.TrimPrefix(strings.ReplaceAll(in.Body.Numero, " ", ""), "+")
			var r struct {
				PairingCode string `json:"pairingCode"`
				Code        string `json:"code"`
				Base64      string `json:"base64"`
			}
			if err := s.evo(ctx, c, http.MethodGet, "/instance/connect/"+c.Instancia+"?number="+num, nil, &r); err != nil {
				return nil, problem.New(http.StatusBadGateway, "WHATSAPP_NO_RESPONDE", err.Error())
			}
			hook := strings.TrimRight(config.Str("PUBLIC_API_URL", s.webURL), "/") + "/api/webhooks/whatsapp?c=" + in.CID.String() + "&t=" + s.webhookToken(in.CID)
			if err := s.evo(ctx, c, http.MethodPost, "/webhook/set/"+c.Instancia, map[string]any{"webhook": map[string]any{"enabled": true, "url": hook, "events": []string{"MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"}}}, nil); err != nil {
				s.a.Log.Warn("webhook de whatsapp", "err", err)
			}
			o := &conOut{}
			o.Body.Codigo, o.Body.QR = r.PairingCode, r.Base64
			return o, nil
		})

	// Webhook of evo-weai: delivery and read receipts update the campaign recipients; a «BAJA» reply unsubscribes
	// that number (crm suppression + consent revoked).
	type hookIn struct {
		C    uuid.UUID `query:"c"`
		T    string    `query:"t" maxLength:"64"`
		Body json.RawMessage
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-webhook", Method: http.MethodPost, Path: "/api/webhooks/whatsapp", Summary: "Webhook de evo-weai (estados y respuestas)", Tags: tagCamp, DefaultStatus: http.StatusNoContent, MaxBodyBytes: 1 << 20},
		func(ctx context.Context, in *hookIn) (*struct{}, error) {
			if !hmac.Equal([]byte(s.webhookToken(in.C)), []byte(in.T)) {
				return nil, problem.Forbidden("Firma no válida.")
			}
			var ev struct {
				Event string          `json:"event"`
				Data  json.RawMessage `json:"data"`
			}
			if json.Unmarshal(in.Body, &ev) != nil {
				return nil, nil
			}
			switch strings.ToLower(strings.ReplaceAll(ev.Event, "_", ".")) {
			case "messages.update":
				var ds []struct {
					KeyID  string `json:"keyId"`
					Status string `json:"status"`
					Key    struct {
						ID string `json:"id"`
					} `json:"key"`
				}
				if json.Unmarshal(ev.Data, &ds) != nil {
					var one struct {
						KeyID  string `json:"keyId"`
						Status string `json:"status"`
					}
					if json.Unmarshal(ev.Data, &one) != nil {
						return nil, nil
					}
					ds = append(ds, struct {
						KeyID  string `json:"keyId"`
						Status string `json:"status"`
						Key    struct {
							ID string `json:"id"`
						} `json:"key"`
					}{KeyID: one.KeyID, Status: one.Status})
				}
				for _, d := range ds {
					id := d.KeyID
					if id == "" {
						id = d.Key.ID
					}
					switch strings.ToUpper(d.Status) {
					case "DELIVERY_ACK":
						_, _ = s.a.DB.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'entregado', entregado_at = now(), updated_at = now() WHERE proveedor_id = $1 AND estado = 'enviado'`, id)
					case "READ", "PLAYED":
						_, _ = s.a.DB.Exec(ctx, `UPDATE campana_destinatarios SET estado = 'leido', leido_at = now(), entregado_at = COALESCE(entregado_at, now()), updated_at = now() WHERE proveedor_id = $1 AND estado IN ('enviado', 'entregado')`, id)
					}
				}
			case "messages.upsert":
				var d struct {
					Key struct {
						RemoteJid string `json:"remoteJid"`
						FromMe    bool   `json:"fromMe"`
					} `json:"key"`
					Message struct {
						Conversation string `json:"conversation"`
						Extended     struct {
							Text string `json:"text"`
						} `json:"extendedTextMessage"`
					} `json:"message"`
				}
				if json.Unmarshal(ev.Data, &d) != nil || d.Key.FromMe {
					return nil, nil
				}
				txt := strings.ToUpper(strings.TrimSpace(d.Message.Conversation + d.Message.Extended.Text))
				if txt == "BAJA" || txt == "STOP" || strings.HasPrefix(txt, "DARME DE BAJA") {
					tel := "+" + strings.Split(d.Key.RemoteJid, "@")[0]
					err := s.tx(ctx, func(tx pgx.Tx) error {
						return events.Enqueue(ctx, tx, events.New(ctx, "messaging.baja", map[string]any{"canal": "whatsapp", "para": tel, "motivo": "Respondió «BAJA» por WhatsApp"},
							events.Competition(in.C.String()), events.Audience(events.Internal)))
					})
					return nil, err
				}
			}
			return nil, nil
		})
}

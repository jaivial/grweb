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
//
// «Sistema › WhatsApp» (Figma 76-77) creates the instance from here, links the number by QR or by code and keeps the
// list of organiser phones that receive the athlete sign-up notices.

type waCfg struct {
	Modo      string // evo-weai · simulado · ninguno
	URL       string
	Instancia string
	Numero    string
	Clave     string
}

// waIntegracion returns the «whatsapp» integration of the competition (config + decrypted key).
func (s *Svc) waIntegracion(ctx context.Context, cid uuid.UUID) (map[string]string, string) {
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/whatsapp", nil, &out)
	if err == nil {
		return out.Config, out.Secreto
	}
	var p *problem.Error
	if !errors.As(err, &p) || p.Status != http.StatusNotFound {
		s.a.Log.Warn("integración whatsapp no disponible", "err", err)
	}
	return nil, ""
}

func (s *Svc) waDe(ctx context.Context, cid uuid.UUID) waCfg {
	cfg, clave := s.waIntegracion(ctx, cid)
	if cfg["proveedor"] != "evo-weai" || cfg["url"] == "" || clave == "" {
		if config.Bool("WHATSAPP_SIMULADO", false) {
			return waCfg{Modo: "simulado", Numero: s.numeroInstancia(ctx, cid)}
		}
		return waCfg{Modo: "ninguno"}
	}
	// The instance can come from the integration (the organiser filled it) or from the one we created from
	// «Sistema › WhatsApp» (the technical name is ours: «grcup-<slug>»).
	instancia := cfg["instancia"]
	if instancia == "" {
		instancia = s.instanciaNombre(ctx, cid)
	}
	numero := cfg["numero"]
	if numero == "" {
		numero = s.numeroInstancia(ctx, cid)
	}
	if instancia == "" {
		if config.Bool("WHATSAPP_SIMULADO", false) {
			return waCfg{Modo: "simulado", Numero: s.numeroInstancia(ctx, cid)}
		}
		return waCfg{Modo: "ninguno"}
	}
	return waCfg{Modo: "evo-weai", URL: strings.TrimRight(cfg["url"], "/"), Instancia: instancia, Numero: numero, Clave: clave}
}

// errWA is a send error; permanent means the number is not on WhatsApp.
type errWA struct {
	msg        string
	texto      string // the message of the provider, without the JSON wrapper (for the log and the translation)
	permanente bool
	servidor   bool // evo-weai itself is down (connection, 5xx): the batch waits, no try is spent
	existe     bool // the instance already exists (409): the caller adopts it
	codigo     int  // the HTTP status of the answer of evo-weai
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
		return &errWA{msg: "evo-weai no responde: " + err.Error(), texto: "no responde: " + err.Error(), servidor: true}
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
		// The provider answers in English and with the technical name of the instance: only the log sees it.
		texto := m
		var j struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(raw, &j) == nil && j.Message != "" {
			texto = j.Message
		}
		return &errWA{msg: fmt.Sprintf("evo-weai %d: %s", res.StatusCode, m), texto: texto, permanente: perm, servidor: res.StatusCode >= 500,
			existe: res.StatusCode == http.StatusConflict || strings.Contains(low, "already in use"), codigo: res.StatusCode}
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
		return "", &errWA{msg: "WhatsApp no está configurado", texto: "not configured"}
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

// webhookURL is where evo-weai sends the events: the internal service (QA, no trip to the internet) or the public
// API (production). The signature travels in the query string.
func (s *Svc) webhookURL(cid uuid.UUID) string {
	base := config.Str("WHATSAPP_WEBHOOK_URL", "")
	if base == "" {
		base = config.Str("PUBLIC_API_URL", config.Str("API_URL", s.webURL))
	}
	return strings.TrimRight(base, "/") + "/api/webhooks/whatsapp?c=" + cid.String() + "&t=" + s.webhookToken(cid)
}

// registrarWebhook tells evo-weai where to send the events, with a Bearer header (the same key of the integration:
// defence in depth if the URL leaks).
func (s *Svc) registrarWebhook(ctx context.Context, c waCfg, cid uuid.UUID) error {
	hook := s.webhookURL(cid)
	body := map[string]any{"webhook": map[string]any{
		"enabled": true, "url": hook, "webhookByEvents": false, "webhookBase64": false,
		"events":  []string{"QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE"},
		"headers": map[string]string{"authorization": "Bearer " + c.Clave},
	}}
	return s.evo(ctx, c, http.MethodPost, "/webhook/set/"+c.Instancia, body, nil)
}

// WAEstado is the WhatsApp channel state (campaign settings, «Emails y avisos»).
type WAEstado struct {
	Modo     string `json:"modo" enum:"evo-weai,simulado,ninguno"`
	Numero   string `json:"numero,omitempty"`
	Conexion string `json:"conexion" enum:"open,connecting,close,simulado,ninguno" doc:"Estado de la sesión de WhatsApp"`
	Detalle  string `json:"detalle,omitempty"`
	Webhook  string `json:"webhook,omitempty" doc:"URL firmada del webhook para evo-weai (solo con integraciones.config)"`
}

func (s *Svc) waEstado(ctx context.Context, cid uuid.UUID) WAEstado {
	c := s.waDe(ctx, cid)
	e := WAEstado{Modo: c.Modo, Numero: c.Numero, Conexion: c.Modo}
	if c.Modo == "simulado" {
		// The simulated instance (whatsapp_instancia) is the truth: the same state «Sistema › WhatsApp» shows.
		var estado string
		if s.a.DB.QueryRow(ctx, `SELECT estado FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&estado) == nil {
			e.Conexion = map[string]string{"conectado": "open", "conectando": "connecting"}[estado]
			if e.Conexion == "" {
				e.Conexion = "close"
			}
		}
		return e
	}
	if c.Modo != "evo-weai" {
		return e
	}
	var r struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	if err := s.evo(ctx, c, http.MethodGet, "/instance/connectionState/"+c.Instancia, nil, &r); err != nil {
		s.waLog(ctx, cid, "estado de la sesión", err)
		e.Conexion, e.Detalle = "close", s.waMensaje(ctx, cid, err)
		return e
	}
	e.Conexion = r.Instance.State
	if e.Conexion == "" {
		e.Conexion = "close"
	}
	return e
}

// ---- «Sistema › WhatsApp»: instance, link by QR or code, state ----

// WAEstadoAdmin is the state of the WhatsApp service of the competition («Sistema › WhatsApp»).
type WAEstadoAdmin struct {
	Servicio       string     `json:"servicio" enum:"ok,caido,sin_configurar" doc:"Estado del servicio evo-weai"`
	Instancia      string     `json:"instancia" doc:"Nombre legible de la instancia (p. ej. «GR Cup 2026»)"`
	InstanciaID    string     `json:"instanciaId,omitempty" doc:"Nombre técnico de la instancia en evo-weai"`
	Estado         string     `json:"estado" enum:"sin_instancia,conectando,conectado,desconectado,error"`
	Numero         string     `json:"numero,omitempty"`
	ConectadoDesde *time.Time `json:"conectadoDesde,omitempty"`
	Modo           string     `json:"modo" enum:"evo-weai,simulado,ninguno"`
	Error          string     `json:"error,omitempty"`
}

// instanciaNombre is the technical name of the instance («grcup-<slug>»): the one evo-weai knows.
func (s *Svc) instanciaNombre(ctx context.Context, cid uuid.UUID) string {
	slug := ""
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		slug = c.Slug
	}
	if slug == "" {
		slug = cid.String()[:8]
	}
	return "grcup-" + slug
}

// nombreLegible is what the backoffice shows: the name of the competition with its year («GR Cup 2026»), never the
// technical name of the instance («grcup-grcup»).
func (s *Svc) nombreLegible(ctx context.Context, cid uuid.UUID) string {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil || c.Nombre == "" {
		return "GR Cup"
	}
	nom := c.Nombre
	if año := fmt.Sprint(c.Year()); !strings.Contains(nom, año) {
		nom += " " + año
	}
	return nom
}

// instanciaNombrePropio is the instance we created for this competition (empty if there is none).
func (s *Svc) instanciaNombrePropio(ctx context.Context, cid uuid.UUID) string {
	var nombre string
	_ = s.a.DB.QueryRow(ctx, `SELECT instancia FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&nombre)
	return nombre
}

// numeroInstancia is the number linked to our instance (the organiser paired it with a QR or a code).
func (s *Svc) numeroInstancia(ctx context.Context, cid uuid.UUID) string {
	var numero string
	_ = s.a.DB.QueryRow(ctx, `SELECT numero FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&numero)
	return numero
}

// guardarEstadoInstancia records the state of the instance and when it opened (the row is created if the organiser
// configured the integration by hand instead of creating the instance from here).
func (s *Svc) guardarEstadoInstancia(ctx context.Context, cid uuid.UUID, instancia, estado, numero string) {
	_, _ = s.a.DB.Exec(ctx, `INSERT INTO whatsapp_instancia (competition_id, instancia, estado, numero, conectado_desde)
		VALUES ($1,$2,$3,$4, CASE WHEN $3 = 'conectado' THEN now() ELSE NULL END)
		ON CONFLICT (competition_id) DO UPDATE SET
		instancia = CASE WHEN EXCLUDED.instancia <> '' THEN EXCLUDED.instancia ELSE whatsapp_instancia.instancia END,
		estado = EXCLUDED.estado,
		numero = CASE WHEN EXCLUDED.numero <> '' THEN EXCLUDED.numero ELSE whatsapp_instancia.numero END,
		conectado_desde = CASE WHEN EXCLUDED.estado = 'conectado' AND whatsapp_instancia.estado <> 'conectado' THEN now()
			WHEN EXCLUDED.estado = 'conectado' THEN COALESCE(whatsapp_instancia.conectado_desde, now())
			ELSE whatsapp_instancia.conectado_desde END,
		updated_at = now()`, cid, instancia, estado, numero)
}

// estadoAdmin reads the state of the service and the state of the session.
// waEvento publishes a «whatsapp.*» event to the admins of the integrations of the competition (SSE).
func (s *Svc) waEvento(ctx context.Context, cid uuid.UUID, tipo string, data map[string]any) error {
	return s.tx(ctx, func(tx pgx.Tx) error {
		return events.Enqueue(ctx, tx, events.New(ctx, tipo, data, events.Competition(cid.String()), events.ForPermission("integraciones.config")))
	})
}

// waDesconectado keeps the row as «desconectado» (with its last connection): the page offers QR and code to link again.
func (s *Svc) waDesconectado(ctx context.Context, cid uuid.UUID, instancia string) error {
	_, _ = s.a.DB.Exec(ctx, `UPDATE whatsapp_instancia SET estado = 'desconectado', updated_at = now() WHERE competition_id = $1`, cid)
	return s.waEvento(ctx, cid, "whatsapp.desconectado", map[string]any{"instancia": instancia})
}

func (s *Svc) estadoAdmin(ctx context.Context, cid uuid.UUID) WAEstadoAdmin {
	out := WAEstadoAdmin{Estado: "sin_instancia", Instancia: s.nombreLegible(ctx, cid), Modo: "ninguno"}
	cfg, clave := s.waIntegracion(ctx, cid)
	if cfg["proveedor"] != "evo-weai" || cfg["url"] == "" || clave == "" {
		out.Servicio = "sin_configurar"
		if config.Bool("WHATSAPP_SIMULADO", false) {
			s.simEstado(ctx, cid, &out)
		}
		return out
	}
	out.Servicio = "ok"
	out.Modo = "evo-weai"
	instancia := cfg["instancia"]
	if instancia == "" {
		instancia = s.instanciaNombrePropio(ctx, cid)
	}
	out.InstanciaID = instancia
	if instancia == "" {
		return out
	}
	c := waCfg{Modo: "evo-weai", URL: strings.TrimRight(cfg["url"], "/"), Instancia: instancia, Clave: clave}
	var r struct {
		Instance struct {
			State string `json:"state"`
		} `json:"instance"`
	}
	if err := s.evo(ctx, c, http.MethodGet, "/instance/connectionState/"+instancia, nil, &r); err != nil {
		var ew *errWA
		if errors.As(err, &ew) && ew.codigo == http.StatusNotFound {
			// The instance is not in evo-weai (it was deleted or the service was reset): disconnected, not down.
			out.Estado = "desconectado"
			return out
		}
		s.waLog(ctx, cid, "estado de la sesión", err)
		out.Servicio, out.Estado, out.Error = "caido", "error", s.waMensaje(ctx, cid, err)
		return out
	}
	switch r.Instance.State {
	case "open":
		out.Estado = "conectado"
	case "connecting":
		out.Estado = "conectando"
	default:
		out.Estado = "desconectado"
	}
	out.Numero = cfg["numero"]
	if out.Numero == "" {
		out.Numero = s.numeroInstancia(ctx, cid)
	}
	if out.Numero == "" {
		out.Numero = s.numeroEvo(ctx, c)
	}
	var desde time.Time
	if err := s.a.DB.QueryRow(ctx, `SELECT conectado_desde FROM whatsapp_instancia WHERE competition_id = $1`, cid).Scan(&desde); err == nil {
		out.ConectadoDesde = &desde
	}
	return out
}

// numeroEvo asks evo-weai for the number of the linked device (the owner JID of the session).
func (s *Svc) numeroEvo(ctx context.Context, c waCfg) string {
	var lista []struct {
		InstanceName string `json:"instanceName"`
		Number       string `json:"number"`
		OwnerJid     string `json:"ownerJid"`
	}
	if err := s.evo(ctx, c, http.MethodGet, "/instance/fetchInstances", nil, &lista); err != nil {
		return ""
	}
	for _, i := range lista {
		if i.InstanceName != c.Instancia {
			continue
		}
		if i.OwnerJid != "" {
			return "+" + strings.TrimSuffix(i.OwnerJid, "@s.whatsapp.net")
		}
		return i.Number
	}
	return ""
}

func (s *Svc) registerWhatsApp() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/whatsapp"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-estado", Method: http.MethodGet, Path: base, Summary: "Estado del canal de WhatsApp (evo-weai)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body WAEstado }, error) {
			p, err := requirePerm(ctx, in.CID)
			if err != nil {
				return nil, err
			}
			e := s.waEstado(ctx, in.CID)
			if p.Can(in.CID.String(), "integraciones.config") {
				e.Webhook = s.webhookURL(in.CID)
			}
			return &struct{ Body WAEstado }{e}, nil
		})

	// ---- «Sistema › WhatsApp» (Figma 76-77) ----

	huma.Register(api, huma.Operation{OperationID: "whatsapp-estado-admin", Method: http.MethodGet, Path: base + "/estado", Summary: "Estado del servicio de WhatsApp y de la sesión", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body WAEstadoAdmin }, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			return &struct{ Body WAEstadoAdmin }{s.estadoAdmin(ctx, in.CID)}, nil
		})

	type instOut struct {
		Body struct {
			Instancia   string `json:"instancia" doc:"Nombre legible de la instancia"`
			InstanciaID string `json:"instanciaId" doc:"Nombre técnico de la instancia en evo-weai"`
			QR          string `json:"qr,omitempty" doc:"QR vigente (data URL SVG), si la instancia acaba de crearse"`
			Estado      string `json:"estado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-instancia", Method: http.MethodPost, Path: base + "/instancia", Summary: "Crear la instancia de evo-weai (idempotente) y registrar su webhook", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*instOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			if s.waSimulado(ctx, in.CID) {
				o := &instOut{}
				id := s.simConectando(ctx, in.CID, "")
				o.Body.Instancia, o.Body.InstanciaID, o.Body.QR, o.Body.Estado = s.nombreLegible(ctx, in.CID), id, simQR(id+time.Now().String()), "conectando"
				return o, nil
			}
			cfg, clave := s.waIntegracion(ctx, in.CID)
			if cfg["proveedor"] != "evo-weai" || cfg["url"] == "" || clave == "" {
				return nil, problem.Unprocessable("WHATSAPP_SIN_CONFIGURAR", "Configura antes la integración de WhatsApp (evo-weai: URL y clave) en «Sistema e integraciones».")
			}
			url := strings.TrimRight(cfg["url"], "/")
			nombre := s.instanciaNombre(ctx, in.CID)
			c := waCfg{Modo: "evo-weai", URL: url, Instancia: nombre, Clave: clave}
			var r struct {
				Instance struct {
					State string `json:"state"`
				} `json:"instance"`
				QRCode struct {
					Base64 string `json:"base64"`
					Code   string `json:"code"`
				} `json:"qrcode"`
			}
			err := s.evo(ctx, c, http.MethodPost, "/instance/create", map[string]any{
				"instanceName": nombre, "integration": "WHATSAPP-BAILEYS", "qrcode": true,
			}, &r)
			if err != nil {
				var ew *errWA
				if !errors.As(err, &ew) || !ew.existe {
					s.waLog(ctx, in.CID, "crear la instancia", err)
					return nil, s.waProblema(ctx, in.CID, err)
				}
				// 409: the instance was already there (it is adopted and the webhook is registered again).
				s.a.Log.Info("instancia de whatsapp ya existente", "instancia", nombre)
			}
			if err := s.registrarWebhook(ctx, c, in.CID); err != nil {
				s.waLog(ctx, in.CID, "registrar el webhook", err)
			}
			_, _ = s.a.DB.Exec(ctx, `INSERT INTO whatsapp_instancia (competition_id, instancia, url, estado, updated_at) VALUES ($1,$2,$3,'conectando', now())
				ON CONFLICT (competition_id) DO UPDATE SET instancia = EXCLUDED.instancia, url = EXCLUDED.url, estado = 'conectando', updated_at = now()`, in.CID, nombre, url)
			if err := s.waEvento(ctx, in.CID, "whatsapp.conexion", map[string]any{"estado": "conectando"}); err != nil {
				return nil, err
			}
			o := &instOut{}
			o.Body.Instancia, o.Body.InstanciaID, o.Body.QR, o.Body.Estado = s.nombreLegible(ctx, in.CID), nombre, r.QRCode.Base64, "conectando"
			return o, nil
		})

	type conIn struct {
		CID  uuid.UUID `path:"cid"`
		Body struct {
			Numero string `json:"numero" required:"false" pattern:"^\\+?[0-9 ]{0,16}$" doc:"Número del teléfono que se vincula; vacío ⇒ QR"`
		}
	}
	type conOut struct {
		Body struct {
			Codigo string `json:"codigo,omitempty" doc:"Código de vinculación de 8 caracteres"`
			QR     string `json:"qr,omitempty" doc:"QR en base64 (data URL SVG) para escanear desde el móvil"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-conectar", Method: http.MethodPost, Path: base + "/conectar", Summary: "Vincular el número (QR o código) y registrar el webhook", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *conIn) (*conOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			if s.waSimulado(ctx, in.CID) {
				num := strings.ReplaceAll(strings.TrimSpace(in.Body.Numero), " ", "")
				if num != "" && !strings.HasPrefix(num, "+") {
					num = "+" + num
				}
				id := s.simConectando(ctx, in.CID, num)
				o := &conOut{}
				if num != "" {
					o.Body.Codigo = simCodigo(id + num + time.Now().String())
				} else {
					o.Body.QR = simQR(id + time.Now().String())
				}
				return o, nil
			}
			c := s.waDe(ctx, in.CID)
			if c.Modo != "evo-weai" {
				return nil, problem.Conflict("WHATSAPP_SIN_CONFIGURAR", "Crea antes la instancia de WhatsApp (o configura la integración de evo-weai) en «Sistema e integraciones».")
			}
			num := strings.TrimPrefix(strings.ReplaceAll(strings.TrimSpace(in.Body.Numero), " ", ""), "+")
			var r struct {
				PairingCode string `json:"pairingCode"`
				Code        string `json:"code"`
				Base64      string `json:"base64"`
				Instance    struct {
					State string `json:"state"`
				} `json:"instance"`
			}
			path := "/instance/connect/" + c.Instancia
			if num != "" {
				path += "?number=" + num
			}
			err := s.evo(ctx, c, http.MethodGet, path, nil, &r)
			var ew *errWA
			if errors.As(err, &ew) && ew.codigo == http.StatusNotFound {
				// Disconnected: the instance was deleted in evo-weai (logout + delete). It is created again and linked.
				if err = s.evo(ctx, c, http.MethodPost, "/instance/create", map[string]any{"instanceName": c.Instancia, "integration": "WHATSAPP-BAILEYS", "qrcode": true}, nil); err == nil || (errors.As(err, &ew) && ew.existe) {
					err = s.evo(ctx, c, http.MethodGet, path, nil, &r)
				}
			}
			if err != nil {
				s.waLog(ctx, in.CID, "vincular el número", err)
				return nil, s.waProblema(ctx, in.CID, err)
			}
			if err := s.registrarWebhook(ctx, c, in.CID); err != nil {
				s.waLog(ctx, in.CID, "registrar el webhook", err)
			}
			if num != "" {
				_, _ = s.a.DB.Exec(ctx, `UPDATE whatsapp_instancia SET numero = $2, estado = 'conectando', updated_at = now() WHERE competition_id = $1`, in.CID, "+"+num)
			} else {
				_, _ = s.a.DB.Exec(ctx, `UPDATE whatsapp_instancia SET estado = 'conectando', updated_at = now() WHERE competition_id = $1 AND estado <> 'conectado'`, in.CID)
			}
			if err := s.waEvento(ctx, in.CID, "whatsapp.conexion", map[string]any{"estado": "conectando"}); err != nil {
				return nil, err
			}
			o := &conOut{}
			o.Body.Codigo, o.Body.QR = r.PairingCode, r.Base64
			return o, nil
		})

	type qrOut struct {
		Body struct {
			QR string `json:"qr" doc:"QR vigente (data URL SVG); vacío si ya está conectado o no hay material de enlace"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-qr", Method: http.MethodGet, Path: base + "/qr", Summary: "QR vigente para vincular el número (pull tras «whatsapp.qr_nuevo»)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*qrOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			o := &qrOut{}
			if s.waSimulado(ctx, in.CID) {
				var inst, estado string
				if s.a.DB.QueryRow(ctx, `SELECT instancia, estado FROM whatsapp_instancia WHERE competition_id = $1`, in.CID).Scan(&inst, &estado) == nil && estado == "conectando" {
					o.Body.QR = simQR(inst + time.Now().String())
				}
				return o, nil
			}
			c := s.waDe(ctx, in.CID)
			if c.Modo != "evo-weai" {
				return o, nil
			}
			var r struct {
				Base64   string `json:"base64"`
				Instance struct {
					State string `json:"state"`
				} `json:"instance"`
			}
			// evo-weai returns the QR it already has: it does not break the socket of the session that is linking.
			if err := s.evo(ctx, c, http.MethodGet, "/instance/connect/"+c.Instancia, nil, &r); err != nil {
				s.waLog(ctx, in.CID, "pedir el QR", err)
				return nil, s.waProblema(ctx, in.CID, err)
			}
			o.Body.QR = r.Base64
			return o, nil
		})

	type reinOut struct {
		Body struct {
			Estado string `json:"estado"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-reiniciar", Method: http.MethodPost, Path: base + "/reiniciar", Summary: "Reiniciar la sesión de WhatsApp", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*reinOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			c := s.waDe(ctx, in.CID)
			if s.waSimulado(ctx, in.CID) {
				s.simConectando(ctx, in.CID, "") // publishes «conectando» itself
				o := &reinOut{}
				o.Body.Estado = "conectando"
				return o, nil
			} else if c.Modo != "evo-weai" {
				return nil, problem.Conflict("WHATSAPP_SIN_CONFIGURAR", "No hay ninguna instancia de WhatsApp que reiniciar.")
			} else {
				if err := s.evo(ctx, c, http.MethodPost, "/instance/restart/"+c.Instancia, nil, nil); err != nil {
					s.waLog(ctx, in.CID, "reiniciar la sesión", err)
					return nil, s.waProblema(ctx, in.CID, err)
				}
				s.guardarEstadoInstancia(ctx, in.CID, c.Instancia, "conectando", "")
			}
			if err := s.tx(ctx, func(tx pgx.Tx) error {
				return events.Enqueue(ctx, tx, events.New(ctx, "whatsapp.conexion", map[string]any{"estado": "conectando"},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			}); err != nil {
				return nil, err
			}
			o := &reinOut{}
			o.Body.Estado = "conectando"
			return o, nil
		})

	huma.Register(api, huma.Operation{OperationID: "whatsapp-desconectar", Method: http.MethodPost, Path: base + "/desconectar", Summary: "Desconectar el número (logout + borrado de la instancia)", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{}, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			c := s.waDe(ctx, in.CID)
			if s.waSimulado(ctx, in.CID) {
				return nil, s.waDesconectado(ctx, in.CID, s.instanciaNombre(ctx, in.CID))
			}
			if c.Modo != "evo-weai" {
				return nil, problem.Conflict("WHATSAPP_SIN_CONFIGURAR", "No hay ninguna instancia de WhatsApp que desconectar.")
			}
			// Logout first, then delete: logout alone leaves the socket in «connecting» (Neural does the same).
			if err := s.evo(ctx, c, http.MethodDelete, "/instance/logout/"+c.Instancia, nil, nil); err != nil {
				s.waLog(ctx, in.CID, "desconectar (logout)", err)
				if !waIgnorable(err) {
					return nil, s.waProblema(ctx, in.CID, err)
				}
			}
			if err := s.evo(ctx, c, http.MethodDelete, "/instance/delete/"+c.Instancia, nil, nil); err != nil {
				s.waLog(ctx, in.CID, "desconectar (borrado de la instancia)", err)
				if !waIgnorable(err) {
					return nil, s.waProblema(ctx, in.CID, err)
				}
			}
			// The instance is gone in evo-weai; the row stays «desconectado» and «conectar» creates it again.
			return nil, s.waDesconectado(ctx, in.CID, c.Instancia)
		})

	// Webhook of evo-weai: the session changes, the QR is renewed, the delivery and read receipts update the
	// campaign recipients; a «BAJA» reply unsubscribes that number (crm suppression + consent revoked).
	type hookIn struct {
		C    uuid.UUID `query:"c"`
		T    string    `query:"t" maxLength:"64"`
		Auth string    `header:"Authorization"`
		Body json.RawMessage
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-webhook", Method: http.MethodPost, Path: "/api/webhooks/whatsapp", Summary: "Webhook de evo-weai (estados, QR y respuestas)", Tags: tagCamp, DefaultStatus: http.StatusNoContent, MaxBodyBytes: 1 << 20},
		func(ctx context.Context, in *hookIn) (_ *struct{}, err error) {
			if !hmac.Equal([]byte(s.webhookToken(in.C)), []byte(in.T)) {
				return nil, problem.Forbidden("Firma no válida.")
			}
			tipo := ""
			defer func() {
				code := http.StatusNoContent
				var se huma.StatusError
				if errors.As(err, &se) {
					code = se.GetStatus()
				} else if err != nil {
					code = http.StatusInternalServerError
				}
				events.Webhook(ctx, s.a.Redis, s.a.Stream(), in.C.String(), "whatsapp", tipo, "", code)
			}()
			// Defence in depth: evo-weai always sends the key of the integration as a Bearer header (registrarWebhook);
			// the signed URL alone is not enough.
			_, clave := s.waIntegracion(ctx, in.C)
			if clave == "" || !hmac.Equal([]byte(in.Auth), []byte("Bearer "+clave)) {
				return nil, problem.Forbidden("Credenciales no válidas.")
			}
			var ev struct {
				Event string          `json:"event"`
				Data  json.RawMessage `json:"data"`
			}
			if json.Unmarshal(in.Body, &ev) != nil {
				return nil, nil
			}
			tipo = ev.Event
			switch strings.ToLower(strings.ReplaceAll(ev.Event, "_", ".")) {
			case "connection.update":
				var d struct {
					Instance string `json:"instance"`
					State    string `json:"state"`
				}
				if json.Unmarshal(ev.Data, &d) != nil {
					return nil, nil
				}
				estado := map[string]string{"open": "conectado", "connecting": "conectando", "close": "desconectado"}[d.State]
				if estado == "" {
					estado = "desconectado"
				}
				s.guardarEstadoInstancia(ctx, in.C, d.Instance, estado, "")
				return nil, s.tx(ctx, func(tx pgx.Tx) error {
					return events.Enqueue(ctx, tx, events.New(ctx, "whatsapp.conexion", map[string]any{"estado": estado},
						events.Competition(in.C.String()), events.ForPermission("integraciones.config")))
				})
			case "qrcode.updated":
				// The QR is not published in the event (it would live in the Redis stream): the page pulls it.
				return nil, s.tx(ctx, func(tx pgx.Tx) error {
					return events.Enqueue(ctx, tx, events.New(ctx, "whatsapp.qr_nuevo", map[string]any{},
						events.Competition(in.C.String()), events.ForPermission("integraciones.config")))
				})
			case "message.template.status.update", "message.template.quality.update":
				return nil, s.estadoPlantillaHook(ctx, in.C, ev.Data)
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
				// History sync and groups are not the athlete writing to us: only personal chats.
				if !strings.HasSuffix(d.Key.RemoteJid, "@s.whatsapp.net") {
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

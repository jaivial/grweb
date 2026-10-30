package messaging

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/http"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// smtpCfg is the SMTP server of a competition («Sistema e integraciones» · smtp) or of the platform (env).
type smtpCfg struct {
	Host, Port, User, Pass, TLS, From, FromName string
	Propio                                      bool // from the competition's integration (not the platform's)
}

func (c smtpCfg) servidor() string { return c.Host + ":" + c.Port }

func plataformaSMTP() smtpCfg {
	return smtpCfg{Host: config.Str("SMTP_HOST", "localhost"), Port: config.Str("SMTP_PORT", "1025"), User: config.Str("SMTP_USER", ""), Pass: config.Str("SMTP_PASSWORD", ""),
		TLS: config.Str("SMTP_TLS", "auto"), From: config.Str("MAIL_FROM", "no-responder@grcup.dev"), FromName: config.Str("MAIL_FROM_NAME", "GR Cup")}
}

// smtpDe returns the competition's SMTP integration (cached 1 min) or the platform's when it has none.
func (s *Svc) smtpDe(ctx context.Context, cid uuid.UUID) smtpCfg {
	if cid == uuid.Nil {
		return plataformaSMTP()
	}
	s.smtpMu.Lock()
	if e, ok := s.smtp[cid]; ok && time.Now().Before(e.exp) {
		s.smtpMu.Unlock()
		return e.cfg
	}
	s.smtpMu.Unlock()
	cfg := plataformaSMTP()
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/smtp", nil, &out); err == nil && out.Config["host"] != "" {
		c := out.Config
		cfg = smtpCfg{Host: c["host"], Port: c["puerto"], User: c["usuario"], Pass: out.Secreto, TLS: c["tls"], From: c["remitente"], FromName: c["nombreRemitente"], Propio: true}
		if cfg.Port == "" {
			cfg.Port = "587"
		}
		if cfg.From == "" {
			cfg.From = plataformaSMTP().From
		}
	} else if err != nil {
		var p *problem.Error
		if !errors.As(err, &p) || p.Status != http.StatusNotFound {
			s.a.Log.Warn("integración smtp no disponible; se usa la del sistema", "err", err)
		}
	}
	s.smtpMu.Lock()
	s.smtp[cid] = smtpEntry{cfg: cfg, exp: time.Now().Add(time.Minute)}
	s.smtpMu.Unlock()
	return cfg
}

// errEnvio classifies a delivery error: permanent (the address does not exist → bounce) or temporary (retry).
type errEnvio struct {
	permanente bool
	servidor   bool // the server itself failed (connection, auth): opens the circuit
	msg        string
}

func (e *errEnvio) Error() string { return e.msg }

func clasificar(err error, fase string) *errEnvio {
	var tp *textproto.Error
	if errors.As(err, &tp) {
		return &errEnvio{permanente: tp.Code >= 500 && fase == "rcpt", servidor: fase == "auth", msg: fmt.Sprintf("%d %s", tp.Code, tp.Msg)}
	}
	return &errEnvio{servidor: true, msg: err.Error()}
}

type insecurePlain struct{ user, pass string }

func (a insecurePlain) Start(*smtp.ServerInfo) (string, []byte, error) {
	return "PLAIN", []byte("\x00" + a.user + "\x00" + a.pass), nil
}

func (a insecurePlain) Next(_ []byte, more bool) ([]byte, error) {
	if more {
		return nil, errors.New("respuesta inesperada del servidor")
	}
	return nil, nil
}

// enviarSMTP delivers one email. Port 465 uses implicit TLS; otherwise STARTTLS when offered (unless tls=no, e.g.
// Mailpit in QA). Returns the Message-ID.
func enviarSMTP(ctx context.Context, c smtpCfg, to string, r Render, cabeceras map[string]string) (string, error) {
	d := net.Dialer{Timeout: 10 * time.Second}
	var conn net.Conn
	var err error
	addr := net.JoinHostPort(c.Host, c.Port)
	if c.Port == "465" {
		conn, err = tls.DialWithDialer(&d, "tcp", addr, &tls.Config{ServerName: c.Host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return "", &errEnvio{servidor: true, msg: "no se pudo conectar a " + c.servidor()}
	}
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	cl, err := smtp.NewClient(conn, c.Host)
	if err != nil {
		_ = conn.Close()
		return "", clasificar(err, "hola")
	}
	defer func() { _ = cl.Close() }()
	if ok, _ := cl.Extension("STARTTLS"); ok && c.TLS != "no" && c.Port != "465" {
		if err := cl.StartTLS(&tls.Config{ServerName: c.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return "", &errEnvio{servidor: true, msg: "STARTTLS: " + err.Error()}
		}
	}
	if c.User != "" {
		if ok, _ := cl.Extension("AUTH"); ok {
			var a smtp.Auth = smtp.PlainAuth("", c.User, c.Pass, c.Host)
			if c.TLS == "no" {
				a = insecurePlain{c.User, c.Pass}
			}
			if err := cl.Auth(a); err != nil {
				return "", clasificar(err, "auth")
			}
		}
	}
	if err := cl.Mail(c.From); err != nil {
		return "", clasificar(err, "mail")
	}
	if err := cl.Rcpt(to); err != nil {
		return "", clasificar(err, "rcpt")
	}
	w, err := cl.Data()
	if err != nil {
		return "", clasificar(err, "data")
	}
	id := mensajeID(c.From)
	if _, err := w.Write(mime_(c, to, id, r, cabeceras)); err != nil {
		return "", clasificar(err, "data")
	}
	if err := w.Close(); err != nil {
		return "", clasificar(err, "data")
	}
	_ = cl.Quit()
	return id, nil
}

func mensajeID(from string) string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	dom := from[strings.LastIndex(from, "@")+1:]
	return "<" + hex.EncodeToString(b) + "@" + dom + ">"
}

// mime_ builds a multipart/alternative message (plain text + HTML, quoted-printable, UTF-8 headers).
func mime_(c smtpCfg, to, id string, r Render, cab map[string]string) []byte {
	var b bytes.Buffer
	bound := "gr-" + id[1:13]
	from := c.From
	if c.FromName != "" {
		from = mime.QEncoding.Encode("utf-8", c.FromName) + " <" + c.From + ">"
	}
	h := func(k, v string) { b.WriteString(k + ": " + v + "\r\n") }
	h("From", from)
	h("To", to)
	h("Subject", mime.QEncoding.Encode("utf-8", r.Asunto))
	h("Date", time.Now().Format(time.RFC1123Z))
	h("Message-ID", id)
	h("MIME-Version", "1.0")
	for k, v := range cab {
		h(k, v)
	}
	h("Content-Type", `multipart/alternative; boundary="`+bound+`"`)
	b.WriteString("\r\n")
	part := func(ct, body string) {
		b.WriteString("--" + bound + "\r\nContent-Type: " + ct + "; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n")
		q := quotedprintable.NewWriter(&b)
		_, _ = q.Write([]byte(body))
		_ = q.Close()
		b.WriteString("\r\n")
	}
	part("text/plain", r.Texto)
	part("text/html", r.HTML)
	b.WriteString("--" + bound + "--\r\n")
	return b.Bytes()
}

package competition

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/crypto"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Gmail via Google OAuth («Sistema e integraciones › Integraciones · Gmail»): the organiser authorises the
// competition's Gmail account once; the refresh token is stored sealed as the secret of the «gmail» integration
// and messaging sends with the Gmail API instead of SMTP.

const gmailCallback = "/api/oauth/google/callback"

var gmailScopes = "openid email https://www.googleapis.com/auth/gmail.send"

func googleOAuth() (id, secret string) {
	return config.Str("GOOGLE_CLIENT_ID", ""), config.Str("GOOGLE_CLIENT_SECRET", "")
}

// gmailOrigen validates the BO origin the flow returns to (it also builds the redirect URI registered in Google).
func gmailOrigen(o string) (string, bool) {
	o = strings.TrimRight(o, "/")
	return o, o != "" && slices.Contains(config.List("GOOGLE_OAUTH_ORIGINS"), o)
}

// state = base64(cid|origen|exp).hmac, signed with the internal token so the callback trusts it without storage.
func (s *Svc) gmailState(cid uuid.UUID, origen string) string {
	p := base64.RawURLEncoding.EncodeToString([]byte(cid.String() + "|" + origen + "|" + strconv.FormatInt(time.Now().Add(15*time.Minute).Unix(), 10)))
	return p + "." + s.gmailFirma(p)
}

func (s *Svc) gmailFirma(p string) string {
	m := hmac.New(sha256.New, []byte("gmail-oauth:"+s.a.Cfg.InternalToken))
	m.Write([]byte(p))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

func (s *Svc) gmailLeerState(st string) (uuid.UUID, string, bool) {
	p, firma, ok := strings.Cut(st, ".")
	if !ok || !hmac.Equal([]byte(firma), []byte(s.gmailFirma(p))) {
		return uuid.Nil, "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(p)
	parts := strings.Split(string(raw), "|")
	if err != nil || len(parts) != 3 {
		return uuid.Nil, "", false
	}
	exp, _ := strconv.ParseInt(parts[2], 10, 64)
	cid, err := uuid.Parse(parts[0])
	if err != nil || time.Now().Unix() > exp {
		return uuid.Nil, "", false
	}
	return cid, parts[1], true
}

// gmailStateSinFirma reads cid and origin of a state without trusting it (only to choose where to send the user).
func gmailStateSinFirma(st string) (uuid.UUID, string) {
	p, _, _ := strings.Cut(st, ".")
	raw, err := base64.RawURLEncoding.DecodeString(p)
	parts := strings.Split(string(raw), "|")
	if err != nil || len(parts) != 3 {
		return uuid.Nil, ""
	}
	cid, _ := uuid.Parse(parts[0])
	return cid, parts[1]
}

func (s *Svc) registerGmail() {
	type autIn struct {
		CID    uuid.UUID `path:"cid"`
		Origen string    `query:"origen" doc:"Origen del backoffice al que vuelve el flujo"`
	}
	type autOut struct {
		Body struct {
			URL string `json:"url" doc:"URL de consentimiento de Google"`
		}
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "gmail-autorizar", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/integraciones/gmail/autorizar", Summary: "Iniciar la conexión de Gmail (Google OAuth)", Tags: tagInt, Security: bearer},
		func(ctx context.Context, in *autIn) (*autOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			id, sec := googleOAuth()
			if id == "" || sec == "" {
				return nil, problem.Unprocessable("GOOGLE_SIN_CONFIGURAR", "La plataforma no tiene configurado Google OAuth.")
			}
			origen, ok := gmailOrigen(in.Origen)
			if !ok {
				return nil, problem.Unprocessable("ORIGEN_NO_PERMITIDO", "Este backoffice no está autorizado para conectar Gmail.")
			}
			q := url.Values{"client_id": {id}, "redirect_uri": {origen + gmailCallback}, "response_type": {"code"}, "scope": {gmailScopes},
				"access_type": {"offline"}, "prompt": {"consent"}, "include_granted_scopes": {"true"}, "state": {s.gmailState(in.CID, origen)}}
			o := &autOut{}
			o.Body.URL = "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
			return o, nil
		})

	type desIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "gmail-desconectar", Method: http.MethodDelete, Path: "/api/admin/competiciones/{cid}/integraciones/gmail", Summary: "Desconectar Gmail", Tags: tagInt, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *desIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			return nil, db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `DELETE FROM integraciones WHERE competition_id = $1 AND tipo = 'gmail'`, in.CID); err != nil {
					return err
				}
				return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_actualizada", map[string]any{"tipo": "gmail", "secretoCambiado": true},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			})
		})

	// Google redirects the browser here (no bearer: the signed state identifies the competition).
	s.a.Mux.HandleFunc("GET "+gmailCallback, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		cid, origen, ok := s.gmailLeerState(q.Get("state"))
		valido := ok
		if !ok {
			// Expired or tampered state: never a bare error page. The unsigned payload only chooses where to send the
			// user (an allowed BO origin and a competition that exists); nothing is stored.
			cid, origen = gmailStateSinFirma(q.Get("state"))
		}
		if o, permitido := gmailOrigen(origen); permitido {
			origen = o
		} else if l := config.List("GOOGLE_OAUTH_ORIGINS"); len(l) > 0 {
			origen = strings.TrimRight(l[0], "/")
		} else {
			http.Error(w, "Enlace de autorización no válido. Vuelve a intentarlo desde el backoffice.", http.StatusBadRequest)
			return
		}
		ctx := r.Context()
		var slug string
		if cid != uuid.Nil {
			_ = s.a.DB.QueryRow(ctx, `SELECT slug FROM competiciones WHERE id = $1`, cid).Scan(&slug)
		}
		conectado := func() bool {
			var n int
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM integraciones WHERE competition_id = $1 AND tipo = 'gmail' AND secreto IS NOT NULL`, cid).Scan(&n)
			return n > 0
		}
		// The BO routes live under the competition slug; without it, /oauth/google picks the user's competition.
		volver := func(res string) {
			destino := origen + "/oauth/google?gmail=" + res
			if slug != "" {
				destino = origen + "/" + url.PathEscape(slug) + "/sistema/integraciones?gmail=" + res
			}
			http.Redirect(w, r, destino, http.StatusFound)
		}
		// A reloaded or reopened callback (expired state or code already used) when Gmail is already connected.
		yaOCaducado := func() string {
			if slug != "" && conectado() {
				return "ya_conectado"
			}
			return "caducado"
		}
		if !valido {
			s.a.Log.Info("gmail oauth: state caducado o no válido")
			volver(yaOCaducado())
			return
		}
		if e := q.Get("error"); e != "" || q.Get("code") == "" {
			if e == "" || e == "access_denied" {
				volver("cancelado")
			} else {
				s.a.Log.Warn("gmail oauth: error de Google", "error", e)
				volver("error")
			}
			return
		}
		email, refresh, err := gmailCanjear(ctx, q.Get("code"), origen+gmailCallback)
		if err != nil || refresh == "" {
			s.a.Log.Warn("gmail oauth: canje fallido", "err", err)
			var p *problem.Error
			if errors.As(err, &p) && strings.Contains(p.Code, "INVALID_GRANT") {
				volver(yaOCaducado()) // the code was already used (reload) or expired
				return
			}
			volver("error")
			return
		}
		cfg, _ := json.Marshal(map[string]string{"proveedor": "gmail", "remitente": email})
		err = db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, `INSERT INTO integraciones (competition_id, tipo, config, secreto, secreto_mascara, estado, probado_at) VALUES ($1,'gmail',$2,$3,$4,'ok',now())
				ON CONFLICT (competition_id, tipo) DO UPDATE SET config = EXCLUDED.config, secreto = EXCLUDED.secreto, secreto_mascara = EXCLUDED.secreto_mascara,
				estado = 'ok', error = '', probado_at = now(), updated_at = now(), version = integraciones.version + 1`,
				cid, cfg, s.box.Seal([]byte(refresh), cid.String()+"/gmail"), crypto.Mask(email)); err != nil {
				return err
			}
			return events.Enqueue(ctx, tx, events.New(ctx, "competition.integracion_actualizada", map[string]any{"tipo": "gmail", "secretoCambiado": true},
				events.Competition(cid.String()), events.ForPermission("integraciones.config")))
		})
		if err != nil {
			s.a.Log.Error("gmail oauth: guardar", "err", err)
			volver("error")
			return
		}
		volver("ok")
	})
}

// gmailCanjear exchanges the authorisation code for tokens and reads the account's address from the id_token.
func gmailCanjear(ctx context.Context, code, redirect string) (email, refresh string, err error) {
	id, sec := googleOAuth()
	form := url.Values{"code": {code}, "client_id": {id}, "client_secret": {sec}, "redirect_uri": {redirect}, "grant_type": {"authorization_code"}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", "", err
	}
	defer res.Body.Close()
	var t struct {
		Refresh string `json:"refresh_token"`
		IDToken string `json:"id_token"`
		Error   string `json:"error"`
	}
	if err := json.NewDecoder(res.Body).Decode(&t); err != nil {
		return "", "", err
	}
	if t.Error != "" {
		return "", "", problem.Unprocessable("GOOGLE_"+strings.ToUpper(t.Error), t.Error)
	}
	// The id_token comes straight from Google's token endpoint over TLS: its payload can be read without verifying.
	if parts := strings.Split(t.IDToken, "."); len(parts) == 3 {
		if b, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			var c struct {
				Email string `json:"email"`
			}
			_ = json.Unmarshal(b, &c)
			email = c.Email
		}
	}
	return email, t.Refresh, nil
}

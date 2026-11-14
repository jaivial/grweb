package messaging

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jaivial/grweb/platform/pkg/config"
)

// Access tokens of the Gmail integrations, by refresh token (they last 1 h; renewed 5 min before).
var gmailTokens = struct {
	sync.Mutex
	m map[string]gmailToken
}{m: map[string]gmailToken{}}

type gmailToken struct {
	valor string
	exp   time.Time
}

func gmailAcceso(ctx context.Context, refresh string) (string, error) {
	gmailTokens.Lock()
	t, ok := gmailTokens.m[refresh]
	gmailTokens.Unlock()
	if ok && time.Now().Before(t.exp) {
		return t.valor, nil
	}
	form := url.Values{"client_id": {config.Str("GOOGLE_CLIENT_ID", "")}, "client_secret": {config.Str("GOOGLE_CLIENT_SECRET", "")},
		"refresh_token": {refresh}, "grant_type": {"refresh_token"}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return "", &errEnvio{servidor: true, msg: "Google OAuth: " + err.Error()}
	}
	defer res.Body.Close()
	var r struct {
		Access  string `json:"access_token"`
		Expires int    `json:"expires_in"`
		Error   string `json:"error"`
	}
	_ = json.NewDecoder(res.Body).Decode(&r)
	if r.Access == "" {
		// invalid_grant: the organiser revoked the access; the BO shows it and asks to connect Gmail again.
		return "", &errEnvio{servidor: true, msg: "Google OAuth: " + r.Error + " (vuelve a conectar Gmail en Sistema e integraciones)"}
	}
	gmailTokens.Lock()
	gmailTokens.m[refresh] = gmailToken{r.Access, time.Now().Add(time.Duration(r.Expires)*time.Second - 5*time.Minute)}
	gmailTokens.Unlock()
	return r.Access, nil
}

// enviarGmail sends the same MIME message the SMTP path builds through the Gmail API (users.messages.send).
func enviarGmail(ctx context.Context, c smtpCfg, to string, r Render, cab map[string]string) (string, error) {
	tok, err := gmailAcceso(ctx, c.Gmail)
	if err != nil {
		return "", err
	}
	id := mensajeID(c.From)
	body, _ := json.Marshal(map[string]string{"raw": base64.RawURLEncoding.EncodeToString(mime_(c, to, id, r, cab))})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", &errEnvio{servidor: true, msg: "Gmail API: " + err.Error()}
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.NewDecoder(res.Body).Decode(&e)
		msg := "Gmail API " + res.Status + ": " + e.Error.Message
		// 400 is a bad recipient/message (permanent); 401/403/429/5xx are the account or Google (retry, open circuit).
		return "", &errEnvio{permanente: res.StatusCode == http.StatusBadRequest, servidor: res.StatusCode != http.StatusBadRequest, msg: msg}
	}
	return id, nil
}

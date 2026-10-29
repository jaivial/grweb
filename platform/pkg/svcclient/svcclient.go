// Package svcclient calls other services over the cluster network with a short service token.
package svcclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/httpx"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Client calls one target service.
type Client struct {
	Base   string // e.g. http://identity:8080
	From   string // calling service name
	To     string // target service name (token audience)
	Secret string // INTERNAL_TOKEN_SECRET
	HTTP   *http.Client
}

// New returns a client with a 10 s timeout.
func New(base, from, to, secret string) *Client {
	return &Client{Base: base, From: from, To: to, Secret: secret, HTTP: &http.Client{Timeout: 10 * time.Second}}
}

// Do sends a JSON request and decodes a JSON response into out (if non-nil). Problem responses become *problem.Error.
func (c *Client) Do(ctx context.Context, method, path string, in, out any) error {
	var body io.Reader
	if in != nil {
		b, err := json.Marshal(in)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.Base+path, body)
	if err != nil {
		return err
	}
	tok, err := auth.ServiceToken(c.Secret, c.From, c.To)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")
	if id := httpx.RequestIDFrom(ctx); id != "" {
		req.Header.Set("X-Request-Id", id)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", c.To, path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode >= 400 {
		p := &problem.Error{}
		if json.Unmarshal(data, p) != nil || p.Status == 0 {
			p = problem.New(resp.StatusCode, "", string(data))
		}
		return p
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

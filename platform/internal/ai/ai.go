// Package ai is the assistant of the campaign editor (Figma 61 · «Campaña · Diseño con IA»): MiniMax (Anthropic-compatible
// API) edits the campaign draft through tools (campana.go). It only ever sees the draft and the instruction: never contacts
// or any personal data.
package ai

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/compref"
	"github.com/jaivial/grweb/platform/pkg/config"
	"github.com/jaivial/grweb/platform/pkg/svcclient"
)

var bearer = []map[string][]string{{"bearer": {}}}

// Svc holds the service dependencies.
type Svc struct {
	a         *app.App
	comps     *compref.Resolver
	messaging *svcclient.Client
	key       string
	base      string
	modelo    string
	http      *http.Client
}

// Service returns the ai service definition.
func Service() app.Service {
	s := &Svc{}
	return app.Service{Name: "ai", Title: "GR Cup · ai", NeedsRedis: true, Setup: s.setup}
}

func (s *Svc) setup(_ context.Context, a *app.App) error {
	s.a = a
	comp := svcclient.New(config.Str("UPSTREAM_COMPETITION", "http://competition:8080"), "ai", "competition", a.Cfg.InternalToken)
	s.comps = compref.New(comp, a.Log)
	// WhatsApp of a draft (derived from the design or converted from HTML) for the assistant's tools.
	s.messaging = svcclient.New(config.Str("UPSTREAM_MESSAGING", "http://messaging:8080"), "ai", "messaging", a.Cfg.InternalToken)
	s.key = config.Str("MINIMAX_API_KEY", "")
	s.base = strings.TrimRight(config.Str("MINIMAX_BASE_URL", "https://api.minimax.io/anthropic"), "/")
	s.modelo = config.Str("MINIMAX_MODEL", "MiniMax-M3.1-Flash")
	s.http = &http.Client{Timeout: 90 * time.Second}
	s.register()
	s.registerCampana()
	s.registerFormulario()
	s.registerPadron()
	return nil
}

// Modelo is a model offered in the editor.
type Modelo struct {
	ID          string `json:"id"`
	Nombre      string `json:"nombre"`
	Recomendado bool   `json:"recomendado"`
}

var tipos = map[string]bool{"cabecera": true, "portada": true, "titulo": true, "texto": true, "boton": true, "imagen": true, "lista": true, "dos_columnas": true,
	"cuenta_atras": true, "horario": true, "separador": true, "espacio": true}

type mensaje struct {
	Rol   string `json:"rol" enum:"usuario,asistente"`
	Texto string `json:"texto" maxLength:"2000"`
}

func (s *Svc) register() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/ia"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "ia-modelos", Method: http.MethodGet, Path: base + "/modelos", Summary: "Modelos disponibles", Tags: []string{"IA"}, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body []Modelo }, error) {
			if err := requerirAlguno(ctx, in.CID.String(), "campanas.enviar", "atletas.editar"); err != nil {
				return nil, err
			}
			out := []Modelo{}
			if s.key != "" {
				out = append(out, Modelo{ID: s.modelo, Nombre: s.modelo + " · recomendado", Recomendado: true})
			}
			return &struct{ Body []Modelo }{out}, nil
		})

}

// requerirAlguno lets the caller in when they hold any of the permissions in the competition. An unauthenticated caller
// gets the authentication error; otherwise the error is the one of the last permission asked.
func requerirAlguno(ctx context.Context, cid string, permisos ...string) error {
	if _, err := auth.User(ctx); err != nil {
		return err
	}
	var err error
	for _, perm := range permisos {
		if _, err = auth.Require(ctx, cid, perm); err == nil {
			return nil
		}
	}
	return err
}

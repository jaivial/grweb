package messaging

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

// Avisos: the phones of the organisers that receive the athlete sign-up notice and the two switches of the
// messages of the sign-up («WhatsApp al atleta» and «WhatsApp a los organizadores»), Figma 77 · «Avisos de
// solicitudes». The list is one message per phone (no groups): the consent and the opt-out only work that way.

// AvisoTelefono is a phone of the list of avisos.
type AvisoTelefono struct {
	Numero string `json:"numero" maxLength:"20" doc:"Teléfono en E.164 (p. ej. +34612345678)"`
	Nombre string `json:"nombre,omitempty" maxLength:"80" doc:"Quién es (para el backoffice)"`
}

// Avisos is the configuration of the notices of the athlete sign-up.
type Avisos struct {
	Telefonos      []AvisoTelefono `json:"telefonos" doc:"Teléfonos de los organizadores (máx. 10)"`
	AlAtleta       bool            `json:"alAtleta" doc:"Enviar al atleta el WhatsApp de «solicitud recibida»"`
	AOrganizadores bool            `json:"aOrganizadores" doc:"Enviar a los teléfonos de esta lista el WhatsApp de «nueva solicitud»"`
}

// avisosDe reads the configuration of the competition (by default: the notices go out, the list is empty).
func (s *Svc) avisosDe(ctx context.Context, cid uuid.UUID) Avisos {
	a := Avisos{Telefonos: []AvisoTelefono{}, AlAtleta: true, AOrganizadores: true}
	var tels []AvisoTelefono
	err := s.a.DB.QueryRow(ctx, `SELECT telefonos, al_atleta, a_organizadores FROM whatsapp_avisos WHERE competition_id = $1`, cid).
		Scan(&tels, &a.AlAtleta, &a.AOrganizadores)
	if err != nil {
		return a
	}
	if tels != nil {
		a.Telefonos = tels
	}
	return a
}

// guardarAvisos stores the configuration.
func (s *Svc) guardarAvisos(ctx context.Context, cid uuid.UUID, a Avisos) error {
	_, err := s.a.DB.Exec(ctx, `INSERT INTO whatsapp_avisos (competition_id, telefonos, al_atleta, a_organizadores, updated_at)
		VALUES ($1,$2,$3,$4, now())
		ON CONFLICT (competition_id) DO UPDATE SET telefonos = EXCLUDED.telefonos, al_atleta = EXCLUDED.al_atleta,
		a_organizadores = EXCLUDED.a_organizadores, updated_at = now()`, cid, a.Telefonos, a.AlAtleta, a.AOrganizadores)
	return err
}

// validarAvisos normalises the phones (E.164) and refuses a list that is too long.
func validarAvisos(a Avisos) (Avisos, error) {
	if len(a.Telefonos) > 10 {
		return a, problem.Unprocessable("TELEFONOS_DEMASIADOS", "Como mucho 10 teléfonos en la lista de avisos.")
	}
	vistos := map[string]bool{}
	out := make([]AvisoTelefono, 0, len(a.Telefonos))
	for _, t := range a.Telefonos {
		num := normTel(t.Numero)
		if num == "" {
			return a, problem.Unprocessable("TELEFONO_INVALIDO", "El formato del teléfono no es válido. Ejemplo: +34 612 345 678")
		}
		if vistos[num] {
			continue
		}
		vistos[num] = true
		t.Numero = num
		out = append(out, t)
	}
	a.Telefonos = out
	return a, nil
}

// normTel normalises a phone to E.164 (Spanish numbers without prefix get +34): the same rule as crm's normTel.
func normTel(t string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(t) {
		if (r >= '0' && r <= '9') || (r == '+' && i == 0) {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if out != "" && !strings.HasPrefix(out, "+") {
		if len(out) == 9 {
			out = "+34" + out
		} else {
			out = "+" + out
		}
	}
	if len(out) < 8 || len(out) > 16 {
		return ""
	}
	return out
}

// registerAvisos publishes the endpoints of «Avisos de solicitudes de atleta».
func (s *Svc) registerAvisos() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/whatsapp"
	type cidIn struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-avisos", Method: http.MethodGet, Path: base + "/avisos", Summary: "Teléfonos de aviso e interruptores de los WhatsApp del alta", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*struct{ Body Avisos }, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			return &struct{ Body Avisos }{s.avisosDe(ctx, in.CID)}, nil
		})
	type putIn struct {
		CID  uuid.UUID `path:"cid"`
		Body Avisos
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-avisos-guardar", Method: http.MethodPut, Path: base + "/avisos", Summary: "Guardar los teléfonos de aviso y los interruptores", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *putIn) (*struct{ Body Avisos }, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			a, err := validarAvisos(in.Body)
			if err != nil {
				return nil, err
			}
			if err := s.guardarAvisos(ctx, in.CID, a); err != nil {
				return nil, err
			}
			return &struct{ Body Avisos }{a}, nil
		})
	type pruebaOut struct {
		Body struct {
			Enviados int `json:"enviados"`
			Errores  []struct {
				Numero string `json:"numero"`
				Error  string `json:"error"`
			} `json:"errores"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "whatsapp-avisos-prueba", Method: http.MethodPost, Path: base + "/avisos/prueba", Summary: "Enviar un mensaje de prueba a la lista de avisos", Tags: tagCamp, Security: bearer},
		func(ctx context.Context, in *cidIn) (*pruebaOut, error) {
			if _, err := requireIntegraciones(ctx, in.CID); err != nil {
				return nil, err
			}
			a := s.avisosDe(ctx, in.CID)
			o := &pruebaOut{}
			o.Body.Errores = []struct {
				Numero string `json:"numero"`
				Error  string `json:"error"`
			}{}
			if len(a.Telefonos) == 0 {
				return o, problem.Unprocessable("SIN_TELEFONOS", "Añade al menos un teléfono a la lista de avisos.")
			}
			c := s.waDe(ctx, in.CID)
			texto := "GR Cup · WhatsApp funcionando. Este es un mensaje de prueba del panel «Sistema › WhatsApp»."
			for _, t := range a.Telefonos {
				if _, err := s.enviarWA(ctx, c, t.Numero, WhatsApp{Texto: texto}); err != nil {
					s.waLog(ctx, in.CID, "enviar el mensaje de prueba", err)
					o.Body.Errores = append(o.Body.Errores, struct {
						Numero string `json:"numero"`
						Error  string `json:"error"`
					}{t.Numero, s.waMensaje(ctx, in.CID, err)})
					continue
				}
				o.Body.Enviados++
			}
			if err := s.tx(ctx, func(tx pgx.Tx) error {
				return events.Enqueue(ctx, tx, events.New(ctx, "whatsapp.aviso_prueba", map[string]any{"enviados": o.Body.Enviados, "errores": len(o.Body.Errores)},
					events.Competition(in.CID.String()), events.ForPermission("integraciones.config")))
			}); err != nil {
				return nil, err
			}
			return o, nil
		})
}

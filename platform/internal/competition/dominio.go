package competition

import (
	"context"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/jaivial/grweb/platform/pkg/auth"
)

// Registro is a DNS record of the sending domain.
type Registro struct {
	Estado string `json:"estado" enum:"correcto,falta,revisar"`
	Valor  string `json:"valor,omitempty"`
	Ayuda  string `json:"ayuda"`
}

// Dominio is the check of the email sending domain (Figma 64 · «Sistema · email»): SPF and DMARC are read from
// DNS; DKIM depends on the provider's selector, so only the usual ones are tried.
type Dominio struct {
	Dominio string   `json:"dominio"`
	SPF     Registro `json:"spf"`
	DKIM    Registro `json:"dkim"`
	DMARC   Registro `json:"dmarc"`
}

func revisarDominio(ctx context.Context, dom string) Dominio {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	r := &net.Resolver{}
	o := Dominio{Dominio: dom}
	txt := func(n string) []string { v, _ := r.LookupTXT(ctx, n); return v }
	o.SPF = Registro{Estado: "falta", Ayuda: "Añade un TXT «v=spf1 include:<proveedor> ~all» en " + dom}
	for _, v := range txt(dom) {
		if strings.HasPrefix(v, "v=spf1") {
			o.SPF = Registro{Estado: "correcto", Valor: v, Ayuda: "El proveedor de email debe estar incluido."}
		}
	}
	o.DMARC = Registro{Estado: "falta", Ayuda: "Sin DMARC, más emails acaban en spam. Añade un TXT en _dmarc." + dom + " (p. ej. «v=DMARC1; p=none; rua=mailto:…»)."}
	for _, v := range txt("_dmarc." + dom) {
		if strings.HasPrefix(v, "v=DMARC1") {
			o.DMARC = Registro{Estado: "correcto", Valor: v, Ayuda: "Política publicada."}
		}
	}
	o.DKIM = Registro{Estado: "revisar", Ayuda: "Depende del proveedor: búscalo en su panel (selector._domainkey." + dom + ")."}
	for _, sel := range []string{"google", "default", "mail", "k1", "selector1", "dkim"} {
		for _, v := range txt(sel + "._domainkey." + dom) {
			if strings.Contains(v, "v=DKIM1") || strings.Contains(v, "p=") {
				o.DKIM = Registro{Estado: "correcto", Valor: sel + " · " + v[:min(len(v), 40)] + "…", Ayuda: "Firma DKIM publicada."}
			}
		}
	}
	return o
}

func (s *Svc) registerDominio() {
	type in struct {
		CID uuid.UUID `path:"cid"`
	}
	huma.Register(s.a.API, huma.Operation{OperationID: "integrations-smtp-domain", Method: http.MethodGet, Path: "/api/admin/competiciones/{cid}/integraciones/smtp/dominio", Summary: "Comprobar SPF, DKIM y DMARC del dominio remitente", Tags: []string{"Integraciones"}, Security: bearer},
		func(ctx context.Context, in *in) (*struct{ Body Dominio }, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "integraciones.config"); err != nil {
				return nil, err
			}
			var cfg map[string]string
			_ = s.a.DB.QueryRow(ctx, `SELECT config FROM integraciones WHERE competition_id = $1 AND tipo = 'smtp'`, in.CID).Scan(&cfg)
			from := cfg["remitente"]
			if from == "" {
				from = cfg["usuario"]
			}
			dom := ""
			if i := strings.LastIndexByte(from, '@'); i >= 0 {
				dom = strings.ToLower(strings.Trim(from[i+1:], "> "))
			}
			if dom == "" {
				return &struct{ Body Dominio }{Dominio{Dominio: "", SPF: Registro{Estado: "revisar", Ayuda: "Configura antes el remitente del SMTP."}, DKIM: Registro{Estado: "revisar"}, DMARC: Registro{Estado: "revisar"}}}, nil
			}
			return &struct{ Body Dominio }{revisarDominio(ctx, dom)}, nil
		})
}

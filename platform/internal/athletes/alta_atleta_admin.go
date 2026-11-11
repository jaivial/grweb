package athletes

// Backoffice › Atletas › Solicitudes (Figma 74-78): the team reviews the requests of the public
// form one by one (approve → the athlete and their profile are created or updated and the photo
// is published; reject → the request and its private photo are deleted). Every change is guarded
// with If-Match (version) and a row lock, so two reviewers never overwrite each other.

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/events"
	"github.com/jaivial/grweb/platform/pkg/problem"
	"github.com/jaivial/grweb/platform/pkg/storage"
)

// tiposAutorizacion are the files accepted for the signed authorisation of a guardian.
var tiposAutorizacion = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}

// ItemSolicitud is one row of the list of requests.
type ItemSolicitud struct {
	ID            uuid.UUID  `json:"id"`
	Nombre        string     `json:"nombre"`
	Apellidos     string     `json:"apellidos"`
	Email         string     `json:"email"`
	Club          string     `json:"club"`
	Edad          *int       `json:"edad,omitempty"`
	EsMenor       bool       `json:"esMenor"`
	Autorizacion  bool       `json:"autorizacion"`
	Match         string     `json:"match"`
	AtletaID      *uuid.UUID `json:"atletaId,omitempty"`
	Estado        string     `json:"estado"`
	FotoMiniatura string     `json:"fotoMiniatura"`
	CreatedAt     time.Time  `json:"createdAt"`
	Version       int        `json:"version"`
}

// Contadores are the counts of the tabs of the panel. Every counter is a count of requests and they
// do not overlap: «pendiente» and «revision» are the state of the request, «aprobada» and «rechazada»
// the closed ones and «todas» the sum of the four.
//
// «menor» is NOT a state: it counts the requests of minors that are still pending review (⊂ pendiente ∪
// revision), so it must not be added to «pendiente» + «revision» (the minors are already inside).
type Contadores struct {
	Todas     int `json:"todas"`
	Pendiente int `json:"pendiente"`
	Revision  int `json:"revision"`
	Menor     int `json:"menor"`
	Aprobada  int `json:"aprobada"`
	Rechazada int `json:"rechazada"`
}

// KPIsSolicitud are the cards of the panel.
type KPIsSolicitud struct {
	PendientesHoy int `json:"pendientesHoy"`
	AprobadasHoy  int `json:"aprobadasHoy"`
	RechazadasHoy int `json:"rechazadasHoy"`
}

// ListaSolicitud is the list of requests with its counters.
type ListaSolicitud struct {
	Items      []ItemSolicitud `json:"items"`
	Total      int             `json:"total"`
	Contadores Contadores      `json:"contadores"`
	KPIs       KPIsSolicitud   `json:"kpis"`
}

// Diferencia is one field of the comparison between the declared data and the athlete: «clave» is
// the technical name of the field (the backoffice keys on it) and «campo» its label.
type Diferencia struct {
	Clave  string `json:"clave" doc:"Clave técnica del campo (nombre, apellidos, email…)"`
	Campo  string `json:"campo" doc:"Etiqueta del campo en el panel"`
	Actual string `json:"actual"`
	Nuevo  string `json:"nuevo"`
	Tipo   string `json:"tipo" enum:"igual,distinto,nuevo"`
}

// ConsentimientoItem is the proof of one box, as the panel shows it.
type ConsentimientoItem struct {
	Casilla  string    `json:"casilla"`
	Aceptado bool      `json:"aceptado"`
	Version  string    `json:"version"`
	Hash     string    `json:"hash"`
	At       time.Time `json:"at"`
	IP       string    `json:"ip"`
}

// AtletaEnlace is the athlete the request is linked to (the current data).
type AtletaEnlace struct {
	ID              uuid.UUID `json:"id"`
	Nombre          string    `json:"nombre"`
	Apellidos       string    `json:"apellidos"`
	Email           string    `json:"email"`
	Telefono        string    `json:"telefono"`
	Sexo            string    `json:"sexo"`
	FechaNacimiento string    `json:"fechaNacimiento,omitempty"`
	Licencia        string    `json:"licencia"`
	Club            string    `json:"club"`
	Ciudad          string    `json:"ciudad"`
	Entrenador      string    `json:"entrenador"`
	Frase           string    `json:"frase"`
	Bio             string    `json:"bio"`
	Instagram       string    `json:"instagram"`
	Historial       string    `json:"historial"`
	MarcaSQ         *float64  `json:"marcaSQ,omitempty"`
	MarcaBP         *float64  `json:"marcaBP,omitempty"`
	MarcaDL         *float64  `json:"marcaDL,omitempty"`
	Estado          string    `json:"estado"`
	Categoria       string    `json:"categoria"`
	Division        string    `json:"division"`
	Slug            string    `json:"slug"`
	FotoURL         string    `json:"fotoUrl"`
}

// DetalleSolicitud is everything the review drawer shows.
type DetalleSolicitud struct {
	ItemSolicitud
	Licencia        string               `json:"licencia"`
	Telefono        string               `json:"telefono"`
	Sexo            string               `json:"sexo"`
	FechaNacimiento string               `json:"fechaNacimiento,omitempty"`
	Ciudad          string               `json:"ciudad"`
	Entrenador      string               `json:"entrenador"`
	Prueba          string               `json:"prueba"`
	Frase           string               `json:"frase"`
	Bio             string               `json:"bio"`
	Instagram       string               `json:"instagram"`
	Historial       string               `json:"historial"`
	MarcaSQ         *float64             `json:"marcaSQ,omitempty"`
	MarcaBP         *float64             `json:"marcaBP,omitempty"`
	MarcaDL         *float64             `json:"marcaDL,omitempty"`
	FocalX          int                  `json:"focalX"`
	FocalY          int                  `json:"focalY"`
	MotivoRechazo   string               `json:"motivoRechazo"`
	RevisadoAt      *time.Time           `json:"revisadoAt,omitempty"`
	RevisadoPor     string               `json:"revisadoPor"`
	Atleta          *AtletaEnlace        `json:"atleta"`
	Diferencias     []Diferencia         `json:"diferencias"`
	Consentimientos []ConsentimientoItem `json:"consentimientos"`
}

// Candidato is an athlete the reviewer can link the request to.
type Candidato struct {
	ID       uuid.UUID `json:"id" db:"id"`
	Nombre   string    `json:"nombre" db:"nombre"`
	Licencia string    `json:"licencia" db:"licencia"`
	Club     string    `json:"club" db:"club"`
	Email    string    `json:"email" db:"email"`
	Estado   string    `json:"estado" db:"estado"`
}

// CandidatosOut is the list of athletes to link a request to.
type CandidatosOut struct{ Body []Candidato }

// AprobarOut is the answer of the approval.
type AprobarOut struct {
	Body struct {
		AtletaID uuid.UUID `json:"atletaId"`
		Slug     string    `json:"slug"`
	}
}

// FiltrosLista are the filters of the list of requests.
type FiltrosLista struct {
	CID    uuid.UUID `path:"cid"`
	Estado string    `query:"estado" enum:"pendiente,revision,menor,aprobada,rechazada,todas" default:"todas"`
	Match  string    `query:"match" enum:"licencia,email,nombre,manual,ninguna" default:""`
	Menor  string    `query:"menor" enum:"si,no" default:""`
	Q      string    `query:"q" maxLength:"80"`
	Pagina int       `query:"pagina" minimum:"1" default:"1"`
}

func (s *Svc) registerAltaAtletaAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas/solicitudes"

	type listOut struct{ Body ListaSolicitud }
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-list", Method: http.MethodGet, Path: base,
		Summary: "Solicitudes de atleta (filtros, contadores y KPIs)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *FiltrosLista) (*listOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			l, err := s.listaSolicitudes(ctx, in)
			if err != nil {
				return nil, err
			}
			return &listOut{Body: *l}, nil
		})

	type detalleIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type detalleOut struct {
		ETag string `header:"ETag"`
		Body DetalleSolicitud
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-detalle", Method: http.MethodGet, Path: base + "/{id}",
		Summary: "Detalle de una solicitud (datos declarados, atleta enlazado y diferencias)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *detalleIn) (*detalleOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			d, err := s.detalleSolicitud(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			return &detalleOut{ETag: etag(d.Version), Body: d}, nil
		})

	type fotoIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type fotoOut struct {
		ContentType  string `header:"Content-Type"`
		CacheControl string `header:"Cache-Control"`
		Nosniff      string `header:"X-Content-Type-Options"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-foto", Method: http.MethodGet, Path: base + "/{id}/foto",
		Summary: "Foto privada de la solicitud (solo el equipo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *fotoIn) (*fotoOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			sol, err := getSolicitud(ctx, s.a.DB, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			b, err := s.leerFotoPrivada(sol.FotoClave)
			if err != nil {
				return nil, problem.NotFound("Esta solicitud no tiene foto.")
			}
			return &fotoOut{ContentType: "image/jpeg", CacheControl: "private, no-store", Nosniff: "nosniff", Body: b}, nil
		})

	type candidatosIn struct {
		CID uuid.UUID `path:"cid"`
		Q   string    `query:"q" maxLength:"80"`
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-candidatos", Method: http.MethodGet, Path: base + "/candidatos",
		Summary: "Atletas a los que se puede enlazar una solicitud", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *candidatosIn) (*CandidatosOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return s.candidatos(ctx, in.CID, in.Q)
		})

	type estadoIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Estado string `json:"estado" enum:"revision,pendiente" doc:"Marcar «en revisión» o devolverla a la cola"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-estado", Method: http.MethodPost, Path: base + "/{id}/estado",
		Summary: "Marcar una solicitud como «en revisión»", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *estadoIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "atletas.editar")
			if err != nil {
				return nil, err
			}
			return nil, s.cambiaEstado(ctx, in.CID, in.ID, in.IfMatch, in.Body.Estado, pr.Name)
		})

	type enlazarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			AtletaID *uuid.UUID `json:"atletaId,omitempty" doc:"Atleta al que se enlaza la solicitud"`
			Nuevo    bool       `json:"nuevo,omitempty" doc:"La solicitud creará un atleta nuevo al aprobarse"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-enlazar", Method: http.MethodPost, Path: base + "/{id}/enlazar",
		Summary: "Enlazar una solicitud a un atleta (o a uno nuevo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *enlazarIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return nil, s.enlazaSolicitud(ctx, in.CID, in.ID, in.IfMatch, in.Body.AtletaID, in.Body.Nuevo)
		})

	type aprobarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			AtletaID       *uuid.UUID      `json:"atletaId,omitempty" doc:"Atleta al que se enlaza (si no, el de la coincidencia)"`
			Nuevo          bool            `json:"nuevo,omitempty" doc:"Crear un atleta nuevo (origen «manual»)"`
			Cambios        *cambiosAprobar `json:"cambios,omitempty" doc:"Correcciones del revisor antes de aprobar"`
			AvisarEmail    bool            `json:"avisarEmail,omitempty"`
			AvisarWhatsApp bool            `json:"avisarWhatsApp,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-aprobar", Method: http.MethodPost, Path: base + "/{id}/aprobar",
		Summary: "Aprobar una solicitud (crea o enlaza el atleta, publica la foto y actualiza el perfil)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *aprobarIn) (*AprobarOut, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "atletas.editar")
			if err != nil {
				return nil, err
			}
			var cambios cambiosAprobar
			if in.Body.Cambios != nil {
				cambios = *in.Body.Cambios
			}
			return s.apruebaSolicitud(ctx, in.CID, in.ID, in.IfMatch, in.Body.AtletaID, in.Body.Nuevo, cambios,
				in.Body.AvisarEmail, in.Body.AvisarWhatsApp, pr.Name)
		})

	type rechazarIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    struct {
			Motivo         string `json:"motivo" minLength:"3" maxLength:"400"`
			AvisarEmail    bool   `json:"avisarEmail,omitempty"`
			AvisarWhatsApp bool   `json:"avisarWhatsApp,omitempty"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-rechazar", Method: http.MethodPost, Path: base + "/{id}/rechazar",
		Summary: "Rechazar una solicitud con un motivo", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *rechazarIn) (*struct{}, error) {
			pr, err := auth.Require(ctx, in.CID.String(), "atletas.editar")
			if err != nil {
				return nil, err
			}
			return nil, s.rechazaSolicitud(ctx, in.CID, in.ID, in.IfMatch, in.Body.Motivo, in.Body.AvisarEmail, in.Body.AvisarWhatsApp, pr.Name)
		})

	type autorizacionIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		RawBody multipart.Form
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-autorizacion", Method: http.MethodPost, Path: base + "/{id}/autorizacion",
		Summary: "Subir la autorización firmada del tutor (privada)", Tags: tagAdmin, Security: bearer, MaxBodyBytes: maxFotoAlta,
		DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *autorizacionIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return nil, s.subeAutorizacion(ctx, in.CID, in.ID, in.RawBody)
		})

	type verAutorizacionIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	type verAutorizacionOut struct {
		ContentType  string `header:"Content-Type"`
		Disposition  string `header:"Content-Disposition"`
		CacheControl string `header:"Cache-Control"`
		Nosniff      string `header:"X-Content-Type-Options"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-autorizacion-ver", Method: http.MethodGet, Path: base + "/{id}/autorizacion",
		Summary: "Ver la autorización del tutor (solo el equipo)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *verAutorizacionIn) (*verAutorizacionOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			sol, err := getSolicitud(ctx, s.a.DB, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			if sol.AutorizacionClave == "" {
				return nil, problem.NotFound("No hay autorización subida.")
			}
			b, err := os.ReadFile(s.fotoPrivada(sol.AutorizacionClave))
			if err != nil {
				return nil, problem.NotFound("No hay autorización subida.")
			}
			ext := filepath.Ext(sol.AutorizacionClave)
			tipo := "application/octet-stream"
			for t, e := range tiposAutorizacion {
				if e == ext {
					tipo = t
				}
			}
			return &verAutorizacionOut{ContentType: tipo, Disposition: mime.FormatMediaType("inline", map[string]string{"filename": "autorizacion" + ext}),
				CacheControl: "private, no-store", Nosniff: "nosniff", Body: b}, nil
		})

	type borrarIn struct {
		CID uuid.UUID `path:"cid"`
		ID  uuid.UUID `path:"id"`
	}
	huma.Register(api, huma.Operation{OperationID: "solicitudes-atleta-borrar", Method: http.MethodDelete, Path: base + "/{id}",
		Summary: "Borrar una solicitud rechazada (RGPD)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *borrarIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return nil, s.borraSolicitud(ctx, in.CID, in.ID)
		})
}

// ---- list ----

// listaSolicitudes returns the requests of the competition with its counters and KPIs.
func (s *Svc) listaSolicitudes(ctx context.Context, in *FiltrosLista) (*ListaSolicitud, error) {
	where, args := s.filtrosSolicitud(in.CID, in.Estado, in.Match, in.Menor, in.Q)
	// The counters ignore the state filter (they are the tabs of the panel).
	base, argsBase := s.filtrosSolicitud(in.CID, "", in.Match, in.Menor, in.Q)
	// The counters of the tabs: each state is counted apart (a minor is inside «pendiente» or
	// «revision», not in a group of its own) and «menor» counts the minors still pending review.
	cont := Contadores{}
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE estado='pendiente'), count(*) FILTER (WHERE estado='revision'),
		count(*) FILTER (WHERE es_menor AND estado IN ('pendiente','revision')),
		count(*) FILTER (WHERE estado='aprobada'), count(*) FILTER (WHERE estado='rechazada')
		FROM solicitudes_atleta WHERE `+base, argsBase...).Scan(&cont.Todas, &cont.Pendiente, &cont.Revision, &cont.Menor, &cont.Aprobada, &cont.Rechazada); err != nil {
		return nil, err
	}
	listArgs := append(append([]any{}, args...), (in.Pagina-1)*50)
	rows, err := s.a.DB.Query(ctx, selSolicitud+` WHERE `+where+` ORDER BY created_at DESC LIMIT 50 OFFSET $`+strconv.Itoa(len(listArgs)),
		listArgs...)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[solicitud])
	if err != nil {
		return nil, err
	}
	var total int
	if err := s.a.DB.QueryRow(ctx, `SELECT count(*) FROM solicitudes_atleta WHERE `+where, args...).Scan(&total); err != nil {
		return nil, err
	}
	kpis := KPIsSolicitud{}
	if err := s.a.DB.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE estado IN ('pendiente','revision') AND created_at::date = current_date),
		count(*) FILTER (WHERE estado = 'aprobada' AND revisado_at::date = current_date),
		count(*) FILTER (WHERE estado = 'rechazada' AND revisado_at::date = current_date)
		FROM solicitudes_atleta WHERE competition_id = $1`, in.CID).Scan(&kpis.PendientesHoy, &kpis.AprobadasHoy, &kpis.RechazadasHoy); err != nil {
		return nil, err
	}
	out := &ListaSolicitud{Items: make([]ItemSolicitud, 0, len(list)), Total: total, Contadores: cont, KPIs: kpis}
	for _, sol := range list {
		out.Items = append(out.Items, s.itemSolicitud(in.CID, sol))
	}
	return out, nil
}

// filtrosSolicitud builds the WHERE of the list.
func (s *Svc) filtrosSolicitud(cid uuid.UUID, estado, match string, menor string, q string) (string, []any) {
	where := []string{"competition_id = $1"}
	args := []any{cid}
	switch estado {
	case "pendiente":
		where = append(where, "estado = 'pendiente'")
	case "revision":
		where = append(where, "estado = 'revision'")
	case "aprobada":
		where = append(where, "estado = 'aprobada'")
	case "rechazada":
		where = append(where, "estado = 'rechazada'")
	case "menor":
		// The tab «Menor · sin autorización»: the minors that are still pending review (⊂ pendiente ∪
		// revision), the same ones the counter «menor» counts.
		where = append(where, "es_menor AND estado IN ('pendiente','revision')")
	}
	switch match {
	case "licencia":
		where = append(where, "match_tipo = 'licencia'")
	case "email":
		where = append(where, "match_tipo = 'email'")
	case "nombre":
		where = append(where, "match_tipo = 'nombre'")
	case "manual":
		where = append(where, "match_tipo = 'manual'")
	case "ninguna":
		where = append(where, "match_atleta_id IS NULL")
	}
	switch menor {
	case "si":
		// A free filter: distinguish «only minors» from «exclude minors»; empty means no filter.
		where = append(where, "es_menor")
	case "no":
		where = append(where, "NOT es_menor")
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+q+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(nombre ILIKE $%d OR apellidos ILIKE $%d OR email::text ILIKE $%d OR club ILIKE $%d OR licencia ILIKE $%d)",
			n, n, n, n, n))
	}
	return strings.Join(where, " AND "), args
}

// itemSolicitud is one row of the list.
func (s *Svc) itemSolicitud(cid uuid.UUID, sol solicitud) ItemSolicitud {
	it := ItemSolicitud{
		ID: sol.ID, Nombre: sol.Nombre, Apellidos: sol.Apellidos, Email: sol.Email, Club: sol.Club,
		Edad: sol.edad(), EsMenor: sol.EsMenor, Autorizacion: sol.AutorizacionClave != "", Match: sol.MatchTipo,
		AtletaID: sol.MatchAtletaID, Estado: sol.Estado, CreatedAt: sol.CreatedAt, Version: sol.Version,
	}
	if sol.FotoClave != "" {
		it.FotoMiniatura = "/api/admin/competiciones/" + cid.String() + "/atletas/solicitudes/" + sol.ID.String() + "/foto"
	}
	return it
}

// detalleSolicitud returns everything the review drawer shows.
func (s *Svc) detalleSolicitud(ctx context.Context, cid, id uuid.UUID) (DetalleSolicitud, error) {
	sol, err := getSolicitud(ctx, s.a.DB, cid, id)
	if err != nil {
		return DetalleSolicitud{}, err
	}
	d := DetalleSolicitud{
		ItemSolicitud: s.itemSolicitud(cid, sol),
		Licencia:      sol.Licencia, Telefono: sol.Telefono, Sexo: sol.Sexo, Ciudad: sol.Ciudad, Entrenador: sol.Entrenador, Prueba: sol.Prueba,
		Frase: sol.Frase, Bio: sol.Bio, Instagram: sol.Instagram, Historial: sol.Historial,
		MarcaSQ: sol.MarcaSQ, MarcaBP: sol.MarcaBP, MarcaDL: sol.MarcaDL,
		FocalX: int(sol.FocalX), FocalY: int(sol.FocalY),
		MotivoRechazo: sol.MotivoRechazo, RevisadoAt: sol.RevisadoAt, RevisadoPor: sol.RevisadoPor,
		Diferencias: []Diferencia{}, Consentimientos: []ConsentimientoItem{},
	}
	if sol.FechaNacimiento != nil {
		d.FechaNacimiento = sol.FechaNacimiento.Format("2006-01-02")
	}
	// The consents, in the order of the form.
	cons := sol.consentMap()
	for _, c := range casillasAlta {
		p := cons[c]
		d.Consentimientos = append(d.Consentimientos, ConsentimientoItem{Casilla: c, Aceptado: p.Aceptado, Version: p.Version, Hash: p.Hash, At: p.At, IP: p.IP})
	}
	// The linked athlete and the differences.
	if sol.MatchAtletaID != nil {
		a, err := getRow(ctx, s.a.DB, cid, *sol.MatchAtletaID)
		if err == nil {
			actual := s.enlaceDe(a)
			d.Atleta = &actual
			d.Diferencias = diferencias(actual, sol)
		}
	}
	return d, nil
}

// enlaceDe is the current data of an athlete (for the comparison).
func (s *Svc) enlaceDe(a row) AtletaEnlace {
	e := AtletaEnlace{ID: a.ID, Nombre: a.Nombre, Apellidos: a.Apellidos, Telefono: a.Telefono, Sexo: a.Sexo,
		Licencia: a.Licencia, Club: a.Club, Ciudad: a.Ciudad, Entrenador: a.Entrenador, Frase: a.Frase, Bio: a.Bio,
		Instagram: a.Instagram, Historial: a.Historial, MarcaSQ: a.MarcaSQ, MarcaBP: a.MarcaBP, MarcaDL: a.MarcaDL,
		Estado: a.Estado, Categoria: a.Categoria, Division: a.Division, Slug: a.Slug, FotoURL: a.FotoURL}
	if a.Email != nil {
		e.Email = *a.Email
	}
	if a.FechaNacimiento != nil {
		e.FechaNacimiento = a.FechaNacimiento.Format("2006-01-02")
	}
	return e
}

// diferencias compares the declared data with the athlete (17 fields). «clave» is the technical name
// of the field and «campo» its label.
func diferencias(a AtletaEnlace, sol solicitud) []Diferencia {
	out := []Diferencia{}
	add := func(clave, campo, actual, nuevo string) {
		d := Diferencia{Clave: clave, Campo: campo, Actual: actual, Nuevo: nuevo, Tipo: "igual"}
		switch {
		case actual == nuevo:
			d.Tipo = "igual"
		case actual == "":
			d.Tipo = "nuevo"
		default:
			d.Tipo = "distinto"
		}
		out = append(out, d)
	}
	add("nombre", "Nombre", a.Nombre, sol.Nombre)
	add("apellidos", "Apellidos", a.Apellidos, sol.Apellidos)
	add("email", "Email", a.Email, sol.Email)
	add("telefono", "Teléfono", a.Telefono, sol.Telefono)
	add("sexo", "Sexo", a.Sexo, sol.Sexo)
	add("fechaNacimiento", "Fecha de nacimiento", a.FechaNacimiento, fechaTexto(sol.FechaNacimiento))
	add("licencia", "Licencia AEP", a.Licencia, sol.Licencia)
	add("club", "Club", a.Club, sol.Club)
	add("ciudad", "Ciudad", a.Ciudad, sol.Ciudad)
	add("entrenador", "Entrenador/a", a.Entrenador, sol.Entrenador)
	add("frase", "Frase", a.Frase, sol.Frase)
	add("bio", "Sobre ti", a.Bio, sol.Bio)
	add("instagram", "Instagram", a.Instagram, sol.Instagram)
	add("historial", "Historial", a.Historial, sol.Historial)
	add("marcaSQ", "Marca sentadilla", marca(a.MarcaSQ), marca(sol.MarcaSQ))
	add("marcaBP", "Marca banca", marca(a.MarcaBP), marca(sol.MarcaBP))
	add("marcaDL", "Marca peso muerto", marca(a.MarcaDL), marca(sol.MarcaDL))
	return out
}

func fechaTexto(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func marca(v *float64) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%g", *v)
}

// candidatos are the athletes the reviewer can link the request to.
func (s *Svc) candidatos(ctx context.Context, cid uuid.UUID, q string) (*CandidatosOut, error) {
	where := "a.competition_id = $1 AND a.estado <> 'baja'"
	args := []any{cid}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+q+"%")
		n := len(args)
		where += fmt.Sprintf(" AND (a.nombre ILIKE $%d OR a.apellidos ILIKE $%d OR a.email::text ILIKE $%d OR a.licencia ILIKE $%d OR a.club ILIKE $%d)", n, n, n, n, n)
	}
	rows, err := s.a.DB.Query(ctx, `SELECT a.id, (a.nombre || ' ' || a.apellidos) AS nombre, a.licencia, a.club, COALESCE(a.email::text,'') AS email, a.estado
		FROM atletas a WHERE `+where+` ORDER BY a.apellidos, a.nombre LIMIT 50`, args...)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByName[Candidato])
	if err != nil {
		return nil, err
	}
	if list == nil {
		list = []Candidato{}
	}
	return &CandidatosOut{Body: list}, nil
}

// ---- changes ----

// lockSolicitud reads a request with a row lock and checks the version of the client.
func (s *Svc) lockSolicitud(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ifm string) (solicitud, error) {
	var sol solicitud
	err := tx.QueryRow(ctx, selSolicitud+` WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id).
		Scan(&sol.ID, &sol.CompetitionID, &sol.MatchAtletaID, &sol.MatchTipo, &sol.Licencia, &sol.Nombre, &sol.Apellidos, &sol.Email,
			&sol.Telefono, &sol.Sexo, &sol.FechaNacimiento, &sol.Club, &sol.Ciudad, &sol.Frase, &sol.Bio, &sol.Instagram,
			&sol.Entrenador, &sol.Historial, &sol.MarcaSQ, &sol.MarcaBP, &sol.MarcaDL, &sol.FocalX, &sol.FocalY, &sol.EsMenor,
			&sol.FotoClave, &sol.FotoSHA256, &sol.AutorizacionClave, &sol.Estado, &sol.Notas, &sol.MotivoRechazo, &sol.RevisadoAt,
			&sol.RevisadoPor, &sol.Consentimientos, &sol.ConsentimientoAt, &sol.IP, &sol.UserAgent, &sol.Version, &sol.CreatedAt, &sol.UpdatedAt, &sol.Prueba)
	if err == pgx.ErrNoRows {
		return sol, problem.NotFound("Esa solicitud no existe.")
	}
	if err != nil {
		return sol, err
	}
	if ifm != "" && ifMatch(ifm) != sol.Version {
		return sol, problem.New(http.StatusPreconditionFailed, "CONFLICTO_EDICION",
			"Otra persona ha revisado esta solicitud mientras la tenías abierta. Recarga para ver sus cambios.")
	}
	return sol, nil
}

// yaRevisada is the error of a request that is already closed.
func yaRevisada(sol solicitud) error {
	if sol.Estado == "aprobada" || sol.Estado == "rechazada" {
		return problem.Conflict("YA_REVISADA", "Esta solicitud ya está revisada.")
	}
	return nil
}

// cambiaEstado marks a request as «en revisión» (or puts it back in the queue).
func (s *Svc) cambiaEstado(ctx context.Context, cid, id uuid.UUID, ifm, estado, por string) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = $3, revisado_por = $4, version = version + 1, updated_at = now()
			WHERE competition_id = $1 AND id = $2`, cid, id, estado, por); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_actualizada",
			map[string]any{"id": id, "estado": estado}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
}

// enlazaSolicitud links a request to an athlete (or to a new one).
func (s *Svc) enlazaSolicitud(ctx context.Context, cid, id uuid.UUID, ifm string, atletaID *uuid.UUID, nuevo bool) error {
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		var destino *uuid.UUID
		tipo := ""
		if !nuevo {
			if atletaID == nil {
				return problem.Unprocessable("ATLETA_OBLIGATORIO", "Elige un atleta o marca que se creará uno nuevo.")
			}
			var n int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND id = $2`, cid, *atletaID).Scan(&n); err != nil {
				return err
			}
			if n == 0 {
				return problem.NotFound("Ese atleta no está en esta competición.")
			}
			destino = atletaID
			tipo = "manual" // the reviewer chose the athlete by hand
		}
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET match_atleta_id = $3, match_tipo = $4, version = version + 1, updated_at = now()
			WHERE competition_id = $1 AND id = $2`, cid, id, destino, tipo); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_actualizada",
			map[string]any{"id": id, "estado": sol.Estado}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
}

// ---- approve ----

// cambiosAprobar are the corrections the reviewer applies before approving.
type cambiosAprobar struct {
	Club       string   `json:"club,omitempty"`
	Ciudad     string   `json:"ciudad,omitempty"`
	Entrenador string   `json:"entrenador,omitempty"`
	Frase      string   `json:"frase,omitempty"`
	Bio        string   `json:"bio,omitempty"`
	Instagram  string   `json:"instagram,omitempty"`
	Historial  string   `json:"historial,omitempty"`
	MarcaSQ    *float64 `json:"marcaSQ,omitempty"`
	MarcaBP    *float64 `json:"marcaBP,omitempty"`
	MarcaDL    *float64 `json:"marcaDL,omitempty"`
	FocalX     *int     `json:"focalX,omitempty"`
	FocalY     *int     `json:"focalY,omitempty"`
}

// apruebaSolicitud does everything in one transaction: the athlete is created or linked, the profile
// is updated (without touching the AEP data nor emptying fields), the photo is published and the
// request is closed.
func (s *Svc) apruebaSolicitud(ctx context.Context, cid, id uuid.UUID, ifm string, atletaID *uuid.UUID, nuevo bool,
	cambios cambiosAprobar, avisarEmail, avisarWhatsApp bool, por string) (*AprobarOut, error) {
	out := &AprobarOut{}
	var fotoClave, fotoPublicada, fotoAnterior string
	var anio int
	if c, err := s.comps.ByID(ctx, cid); err == nil {
		anio = c.Year()
	} else {
		anio = time.Now().Year()
	}
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		fotoClave = sol.FotoClave
		cons := sol.consentMap()
		// A minor needs the signed authorisation of their guardian.
		if sol.EsMenor && sol.AutorizacionClave == "" {
			return problem.Unprocessable("AUTORIZACION_OBLIGATORIA",
				"Es menor de edad: sube primero la autorización firmada de su madre, padre o tutor.")
		}
		// The athlete: the one the reviewer chose, the one of the match or a new one.
		destino := atletaID
		if destino == nil && sol.MatchAtletaID != nil && sol.MatchTipo != "nombre" {
			destino = sol.MatchAtletaID
		}
		if destino == nil {
			if !nuevo {
				return problem.Unprocessable("SIN_ATLETA", "Elige un atleta o marca que se cree uno nuevo.")
			}
			nuevoID, err := s.creaAtleta(ctx, tx, cid, anio, sol)
			if err != nil {
				return err
			}
			destino = &nuevoID
		} else {
			var n int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM atletas WHERE competition_id = $1 AND id = $2`, cid, *destino).Scan(&n); err != nil {
				return err
			}
			if n == 0 {
				return problem.NotFound("Ese atleta no está en esta competición.")
			}
		}
		// The profile: the declared data, the corrections of the reviewer and never an empty value.
		// The chosen competition goes to the athlete (an empty one never empties it).
		if sol.Prueba != "" {
			if _, err := tx.Exec(ctx, `UPDATE atletas SET prueba = $3 WHERE competition_id = $1 AND id = $2`, cid, *destino, sol.Prueba); err != nil {
				return err
			}
		}
		slug, err := s.actualizaPerfil(ctx, tx, cid, *destino, sol, cambios)
		if err != nil {
			return err
		}
		// The photo: published only with the consent of the image.
		if sol.FotoClave != "" {
			if c, ok := cons["imagen"]; ok && c.Aceptado {
				// The photo published before (if it came from this flow) is removed after the commit.
				if err := tx.QueryRow(ctx, `SELECT foto_url FROM perfiles WHERE atleta_id = $1`, *destino).Scan(&fotoAnterior); err != nil {
					return err
				}
				url, err := s.publicaFoto(ctx, cid, slug, sol.FotoClave)
				if err != nil {
					return err
				}
				focalX, focalY := int(sol.FocalX), int(sol.FocalY)
				if cambios.FocalX != nil {
					focalX = *cambios.FocalX
				}
				if cambios.FocalY != nil {
					focalY = *cambios.FocalY
				}
				if _, err := tx.Exec(ctx, `UPDATE perfiles SET foto_url = $2, focal_x = $3, focal_y = $4, imagen_at = now(), imagen_version = $5,
					imagen_hash = $6, imagen_origen = '/alta-atleta · formulario', imagen_ip = $7, updated_at = now() WHERE atleta_id = $1`,
					*destino, url, focalX, focalY, c.Version, c.Hash, sol.IP); err != nil {
					return err
				}
				fotoPublicada = url
			}
		}
		// The history of the athlete and the closed request.
		if err := hist(ctx, tx, *destino, "Perfil creado o actualizado desde una solicitud de alta", "revisado por "+por); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = 'aprobada', match_atleta_id = $3,
			revisado_at = now(), revisado_por = $4, version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`,
			cid, id, destino, por); err != nil {
			return err
		}
		// The contact and its consents (crm).
		if err := contacto(ctx, tx, cid, s.eventoContactoSolicitud(sol, cons)); err != nil {
			return err
		}
		// The panel of the team.
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_aprobada",
			map[string]any{"id": id, "atletaId": destino, "nombre": sol.Nombre},
			events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		// The notices to the athlete (optional). WhatsApp requires the consent recorded on submission.
		avisarWA := avisarWhatsApp && sol.Telefono != "" && cons["whatsapp"].Aceptado
		urlArea := s.webURL + "/area-atleta"
		// Without the image consent (or for a minor) the profile is not public: never promise its URL.
		urlFicha, privada := s.webURL+"/atletas/"+slug, ""
		var visible bool
		if err := tx.QueryRow(ctx, `SELECT visible FROM perfiles WHERE atleta_id = $1`, *destino).Scan(&visible); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if !visible {
			urlFicha, privada = "", "Tu ficha aún no es pública: autoriza la publicación de tu nombre, tus datos deportivos y tu foto desde el área de atleta para que aparezca en la web."
		}
		if avisarEmail || avisarWA {
			urlArea, err = s.newAreaLink(ctx, tx, *destino)
			if err != nil {
				return err
			}
		}
		if avisarEmail {
			if err := email(ctx, tx, cid, sol.Email, "atleta-solicitud-aprobada", map[string]string{
				"nombre": sol.Nombre, "prueba": pruebaTexto(sol.Prueba), "urlFicha": urlFicha, "privada": privada, "urlArea": urlArea}); err != nil {
				return err
			}
		}
		if avisarWA {
			if err := whatsapp(ctx, tx, cid, sol.Telefono, false, "atleta-solicitud-aprobada", map[string]string{
				"nombre": sol.Nombre, "urlFicha": urlFicha, "privada": privada, "urlArea": urlArea}, ""); err != nil {
				return err
			}
		}
		out.Body.AtletaID = *destino
		out.Body.Slug = slug
		return nil
	})
	if err != nil {
		return nil, err
	}
	// The private photo is not needed any more (it is published in the CDN).
	s.borraFotoPrivada(fotoClave)
	// The photo published before (if it came from this flow) is removed: no orphan files in the CDN.
	if fotoAnterior != "" && fotoAnterior != fotoPublicada {
		s.borraFotoPublicada(ctx, cid, fotoAnterior)
	}
	// The public list of athletes changed.
	s.bump(ctx, cid)
	s.a.Log.Info("solicitud de atleta aprobada", "id", id.String(), "atleta", out.Body.AtletaID.String(), "revisor", por)
	return out, nil
}

// creaAtleta creates the athlete of an approved request (origen «manual»).
func (s *Svc) creaAtleta(ctx context.Context, tx pgx.Tx, cid uuid.UUID, anio int, sol solicitud) (uuid.UUID, error) {
	id := newID()
	division := "open"
	if sol.FechaNacimiento != nil {
		division = DivisionPorEdad(*sol.FechaNacimiento, anio)
	}
	_, err := tx.Exec(ctx, `INSERT INTO atletas (id, competition_id, licencia, nombre, apellidos, email, telefono, sexo, fecha_nacimiento,
		categoria, division, club, ciudad, estado, origen) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$12,'confirmado','manual')`,
		id, cid, sol.Licencia, sol.Nombre, sol.Apellidos, sol.Email, sol.Telefono, sol.Sexo, sol.FechaNacimiento, division, sol.Club, sol.Ciudad)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return id, problem.Conflict("LICENCIA_DUPLICADA", "Ya hay un atleta con esa licencia: enlázalo a él en lugar de crear uno nuevo.")
		}
		return id, err
	}
	if err := createPerfil(ctx, tx, cid, id, sol.nombreCompleto()); err != nil {
		return id, err
	}
	return id, nil
}

// actualizaPerfil writes the declared data and the corrections in the profile of the athlete (the AEP
// data is never touched and a field is never emptied with an empty value).
func (s *Svc) actualizaPerfil(ctx context.Context, tx pgx.Tx, cid, atleta uuid.UUID, sol solicitud, cambios cambiosAprobar) (string, error) {
	var existe int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM perfiles WHERE atleta_id = $1`, atleta).Scan(&existe); err != nil {
		return "", err
	}
	if existe == 0 {
		if err := createPerfil(ctx, tx, cid, atleta, sol.nombreCompleto()); err != nil {
			return "", err
		}
	}
	// The reviewer's corrections win over the declared data.
	frase, bio, instagram, historial := sol.Frase, sol.Bio, sol.Instagram, sol.Historial
	club, ciudad, entrenador := sol.Club, sol.Ciudad, sol.Entrenador
	if cambios.Frase != "" {
		frase = cambios.Frase
	}
	if cambios.Bio != "" {
		bio = cambios.Bio
	}
	if cambios.Instagram != "" {
		instagram = cambios.Instagram
	}
	if cambios.Historial != "" {
		historial = cambios.Historial
	}
	if cambios.Club != "" {
		club = cambios.Club
	}
	if cambios.Ciudad != "" {
		ciudad = cambios.Ciudad
	}
	if cambios.Entrenador != "" {
		entrenador = cambios.Entrenador
	}
	sq, bp, dl := sol.MarcaSQ, sol.MarcaBP, sol.MarcaDL
	if cambios.MarcaSQ != nil {
		sq = cambios.MarcaSQ
	}
	if cambios.MarcaBP != nil {
		bp = cambios.MarcaBP
	}
	if cambios.MarcaDL != nil {
		dl = cambios.MarcaDL
	}
	instagram = normInstagram(instagram)
	if sol.EsMenor {
		instagram = "" // minors: no social links
	}
	if _, err := tx.Exec(ctx, `UPDATE perfiles SET
		frase = COALESCE(NULLIF($2,''), frase), bio = COALESCE(NULLIF($3,''), bio), instagram = CASE WHEN $9 THEN '' ELSE COALESCE(NULLIF($4,''), instagram) END,
		historial = COALESCE(NULLIF($5,''), historial), entrenador = COALESCE(NULLIF($10,''), entrenador),
		marca_sq = COALESCE($6, marca_sq), marca_bp = COALESCE($7, marca_bp), marca_dl = COALESCE($8, marca_dl),
		visible = CASE WHEN $9 OR NOT $11 THEN false ELSE visible END, updated_at = now() WHERE atleta_id = $1`,
		atleta, frase, bio, instagram, historial, sq, bp, dl, sol.EsMenor, entrenador, sol.consent("imagen").Aceptado); err != nil {
		return "", err
	}
	// The club and the city live in the athlete (the rest of the AEP data is not touched).
	if club != "" || ciudad != "" {
		if _, err := tx.Exec(ctx, `UPDATE atletas SET club = COALESCE(NULLIF($2,''), club), ciudad = COALESCE(NULLIF($3,''), ciudad),
			version = version + 1, updated_at = now() WHERE id = $1`, atleta, club, ciudad); err != nil {
			return "", err
		}
	}
	var slug string
	if err := tx.QueryRow(ctx, `SELECT slug FROM perfiles WHERE atleta_id = $1`, atleta).Scan(&slug); err != nil {
		return "", err
	}
	return slug, nil
}

// publicaFoto uploads the processed photo to the CDN of the competition (Bunny) or to the volume of
// the service (QA without credentials).
func (s *Svc) publicaFoto(ctx context.Context, cid uuid.UUID, slug, clave string) (string, error) {
	datos, err := s.leerFotoPrivada(clave)
	if err != nil {
		return "", problem.NotFound("No hemos podido encontrar la foto de la solicitud.")
	}
	st, err := s.storage(ctx, cid)
	if err != nil {
		s.a.Log.Error("no se ha podido preparar el almacenamiento", "err", err, "competicion", cid.String())
		return "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE",
			"No hemos podido publicar la foto. Inténtalo en unos minutos.")
	}
	sum := sha256.Sum256(datos)
	key := "atletas/" + slug + "-" + hex.EncodeToString(sum[:])[:8] + ".jpg"
	url, err := st.Put(ctx, key, "image/jpeg", datos)
	if err != nil {
		s.a.Log.Error("no se ha podido publicar la foto", "err", err, "key", key)
		return "", problem.New(http.StatusServiceUnavailable, "SERVICIO_NO_DISPONIBLE",
			"No hemos podido publicar la foto. Inténtalo en unos minutos.")
	}
	return url, nil
}

// storage returns where the published photos live: Bunny (production) or the volume of the service.
func (s *Svc) storage(ctx context.Context, cid uuid.UUID) (storage.Storage, error) {
	var out struct {
		Config  map[string]string `json:"config"`
		Secreto string            `json:"secreto"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/"+cid.String()+"/integraciones/bunny", nil, &out); err == nil {
		zona := out.Config["zona"]
		cdn := out.Config["cdnUrl"]
		if zona != "" && out.Secreto != "" {
			return storage.Bunny{Zona: zona, Clave: out.Secreto, CDNURL: cdn, Region: out.Config["region"]}, nil
		}
	}
	// QA without credentials: the volume of the service.
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return nil, err
	}
	return storage.Local{Dir: filepath.Join(s.fotoDir, "publico"), BaseURL: s.webURL + "/api/competiciones/" + c.Slug + "/atletas/foto"}, nil
}

// borraFotoPublicada removes a published photo of this flow (the previous one of the athlete). The
// photos of other sources (the media library of the cms) are never touched.
func (s *Svc) borraFotoPublicada(ctx context.Context, cid uuid.UUID, url string) {
	st, err := s.storage(ctx, cid)
	if err != nil {
		return
	}
	var base string
	switch v := st.(type) {
	case storage.Bunny:
		base = v.CDNURL
	case storage.Local:
		base = v.BaseURL
	}
	key, ok := storage.ClaveDeURL(base, url)
	if !ok {
		return
	}
	// Only the keys of this flow («atletas/…»).
	if !strings.HasPrefix(key, "atletas/") && !strings.HasPrefix(key, "atletas-") {
		return
	}
	if err := st.Delete(ctx, key); err != nil {
		s.a.Log.Warn("no se ha podido borrar la foto anterior", "err", err, "key", key)
		return
	}
	s.a.Log.Info("foto anterior del atleta borrada", "key", key)
}

// ---- reject ----

// rechazaSolicitud closes a request with a reason and deletes its private photo.
func (s *Svc) rechazaSolicitud(ctx context.Context, cid, id uuid.UUID, ifm, motivo string, avisarEmail, avisarWhatsApp bool, por string) error {
	motivo = strings.TrimSpace(motivo)
	if len([]rune(motivo)) < 3 {
		return problem.Unprocessable("MOTIVO_OBLIGATORIO", "Escribe el motivo del rechazo (el atleta lo verá si le avisas).")
	}
	var fotoClave string
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, ifm)
		if err != nil {
			return err
		}
		if err := yaRevisada(sol); err != nil {
			return err
		}
		cons := sol.consentMap()
		fotoClave = sol.FotoClave
		if _, err := tx.Exec(ctx, `UPDATE solicitudes_atleta SET estado = 'rechazada', motivo_rechazo = $3, revisado_at = now(), revisado_por = $4,
			version = version + 1, updated_at = now() WHERE competition_id = $1 AND id = $2`, cid, id, motivo, por); err != nil {
			return err
		}
		if err := events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_rechazada",
			map[string]any{"id": id, "nombre": sol.Nombre}, events.Competition(cid.String()), events.ForPermission("atletas.editar"))); err != nil {
			return err
		}
		if avisarEmail {
			if err := email(ctx, tx, cid, sol.Email, "atleta-solicitud-rechazada", map[string]string{
				"nombre": sol.Nombre, "motivo": motivo, "urlAlta": s.webURL + "/alta-atleta"}); err != nil {
				return err
			}
		}
		if avisarWhatsApp && sol.Telefono != "" && cons["whatsapp"].Aceptado {
			if err := whatsapp(ctx, tx, cid, sol.Telefono, false, "atleta-solicitud-rechazada", map[string]string{
				"nombre": sol.Nombre, "motivo": motivo, "urlAlta": s.webURL + "/alta-atleta"}, ""); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	// The private photo of a rejected request is not kept.
	s.borraFotoPrivada(fotoClave)
	s.a.Log.Info("solicitud de atleta rechazada", "id", id.String(), "revisor", por)
	return nil
}

// borraSolicitud deletes a rejected request (right to erasure).
func (s *Svc) borraSolicitud(ctx context.Context, cid, id uuid.UUID) error {
	var fotoClave, autorizacion string
	err := db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		sol, err := s.lockSolicitud(ctx, tx, cid, id, "")
		if err != nil {
			return err
		}
		if sol.Estado != "rechazada" {
			return problem.Conflict("NO_SE_PUEDE_BORRAR", "Solo se pueden borrar las solicitudes rechazadas.")
		}
		fotoClave, autorizacion = sol.FotoClave, sol.AutorizacionClave
		if _, err := tx.Exec(ctx, `DELETE FROM solicitudes_atleta WHERE competition_id = $1 AND id = $2`, cid, id); err != nil {
			return err
		}
		return events.Enqueue(ctx, tx, events.New(ctx, "athletes.solicitud_actualizada",
			map[string]any{"id": id, "estado": "borrada"}, events.Competition(cid.String()), events.ForPermission("atletas.editar")))
	})
	if err != nil {
		return err
	}
	s.borraFotoPrivada(fotoClave)
	s.borraFotoPrivada(autorizacion)
	return nil
}

// ---- authorisation of a minor ----

// claveAutorizacion is the private path of the authorisation of a request.
func (s *Svc) claveAutorizacion(cid, id uuid.UUID, ext string) string {
	return "privado/solicitudes/" + cid.String() + "/autorizacion-" + id.String() + ext
}

// borraAutorizacion removes the authorisation file of a request (any extension).
func (s *Svc) borraAutorizacion(cid, id uuid.UUID) {
	for _, ext := range tiposAutorizacion {
		_ = os.Remove(s.fotoPrivada(s.claveAutorizacion(cid, id, ext)))
	}
}

// subeAutorizacion stores the signed authorisation of the guardian (a private file).
func (s *Svc) subeAutorizacion(ctx context.Context, cid, id uuid.UUID, form multipart.Form) error {
	files := form.File["archivo"]
	if len(files) != 1 {
		return problem.Unprocessable("ARCHIVO_OBLIGATORIO", "Adjunta un archivo en el campo «archivo».")
	}
	if files[0].Size > maxFotoAlta {
		return problem.Unprocessable("ARCHIVO_GRANDE", "El archivo supera los 8 MB.")
	}
	f, err := files[0].Open()
	if err != nil {
		return problem.Unprocessable("ARCHIVO_INVALIDO", "No hemos podido leer el archivo.")
	}
	defer f.Close()
	datos, err := io.ReadAll(io.LimitReader(f, maxFotoAlta+1))
	if err != nil {
		return problem.Unprocessable("ARCHIVO_INVALIDO", "No hemos podido leer el archivo.")
	}
	ext, ok := tiposAutorizacion[http.DetectContentType(datos)]
	if !ok {
		return problem.Unprocessable("TIPO_NO_PERMITIDO", "Sube una foto (JPG, PNG, WebP) o un PDF.")
	}
	return db.Tx(ctx, s.a.DB, func(tx pgx.Tx) error {
		if _, err := s.lockSolicitud(ctx, tx, cid, id, ""); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(s.fotoPrivada(s.claveAutorizacion(cid, id, ext))), 0o700); err != nil {
			return err
		}
		s.borraAutorizacion(cid, id)
		if err := os.WriteFile(s.fotoPrivada(s.claveAutorizacion(cid, id, ext)), datos, 0o600); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE solicitudes_atleta SET autorizacion_clave = $3, version = version + 1, updated_at = now()
			WHERE competition_id = $1 AND id = $2`, cid, id, s.claveAutorizacion(cid, id, ext))
		return err
	})
}

// eventoContactoSolicitud is the payload of «athletes.contacto» when a request is approved.
func (s *Svc) eventoContactoSolicitud(sol solicitud, cons map[string]Consentimiento) map[string]any {
	var consents []map[string]any
	for _, c := range casillasAlta {
		p, ok := cons[c]
		if !ok || !p.Aceptado {
			continue
		}
		finalidad := map[string]string{"privacidad": "privacidad", "imagen": "imagen", "whatsapp": "avisos_whatsapp", "novedades": "novedades_email"}[c]
		if finalidad == "" {
			continue
		}
		canal := "email"
		estado := "confirmado"
		switch c {
		case "whatsapp":
			canal = "whatsapp"
		case "novedades":
			estado = "pendiente" // double opt-in: the crm sends the confirmation
		}
		consents = append(consents, map[string]any{"finalidad": finalidad, "canal": canal, "estado": estado,
			"version": p.Version, "hash": p.Hash, "origen": "/alta-atleta · formulario", "ip": sol.IP})
	}
	return map[string]any{
		"email": sol.Email, "telefono": sol.Telefono, "nombre": sol.nombreCompleto(), "origen": "/alta-atleta · formulario",
		"consentimientos": consents, "ip": sol.IP, "userAgent": sol.UserAgent,
		"relacion": map[string]any{"atleta": true},
	}
}

// ---- worker ----

// purgaSolicitudes deletes the rejected requests older than 30 days (with their private files).
func (s *Svc) purgaSolicitudes(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.purgaSolicitudesAhora(ctx)
		}
	}
}

// purgaSolicitudesAhora does the purge (only one replica at a time, with the lock of Redis).
func (s *Svc) purgaSolicitudesAhora(ctx context.Context) {
	if ok, _ := s.a.Redis.SetNX(ctx, s.a.Keys.Of("lock", "purga-solicitudes"), "1", 30*time.Minute).Result(); !ok {
		return
	}
	rows, err := s.a.DB.Query(ctx, `SELECT id, foto_clave, autorizacion_clave FROM solicitudes_atleta
		WHERE estado = 'rechazada' AND updated_at < now() - interval '30 days' LIMIT 500`)
	if err != nil {
		if ctx.Err() == nil {
			s.a.Log.Warn("purga de solicitudes rechazadas", "err", err)
		}
		return
	}
	var ids []uuid.UUID
	var archivos [][2]string
	for rows.Next() {
		var id uuid.UUID
		var foto, autorizacion string
		if rows.Scan(&id, &foto, &autorizacion) != nil {
			continue
		}
		ids = append(ids, id)
		archivos = append(archivos, [2]string{foto, autorizacion})
	}
	rows.Close()
	if len(ids) == 0 {
		return
	}
	if _, err := s.a.DB.Exec(ctx, `DELETE FROM solicitudes_atleta WHERE id = ANY($1)`, ids); err != nil {
		s.a.Log.Warn("purga de solicitudes rechazadas", "err", err)
		return
	}
	for _, a := range archivos {
		s.borraFotoPrivada(a[0])
		s.borraFotoPrivada(a[1])
	}
	s.a.Log.Info("solicitudes de atleta purgadas", "n", len(ids))
}

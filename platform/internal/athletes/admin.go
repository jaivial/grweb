package athletes

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/auth"
	"github.com/jaivial/grweb/platform/pkg/db"
	"github.com/jaivial/grweb/platform/pkg/problem"
)

var tagAdmin = []string{"Atletas"}

type cidIn struct {
	CID uuid.UUID `path:"cid"`
}

type idIn struct {
	CID uuid.UUID `path:"cid"`
	ID  uuid.UUID `path:"id"`
}

func etag(v int) string { return `W/"` + strconv.Itoa(v) + `"` }

func ifMatch(h string) int {
	v, _ := strconv.Atoi(strings.Trim(strings.TrimPrefix(strings.TrimSpace(h), "W/"), `"`))
	return v
}

// ItemLista is one row of the backoffice list.
type ItemLista struct {
	ID             uuid.UUID    `json:"id"`
	NombreCompleto string       `json:"nombreCompleto"`
	Licencia       string       `json:"licencia"`
	Club           string       `json:"club"`
	Sexo           string       `json:"sexo"`
	Categoria      string       `json:"categoria"`
	DivisionNombre string       `json:"divisionNombre"`
	Flight         string       `json:"flight"`
	Estado         string       `json:"estado"`
	OrdenReserva   *int         `json:"ordenReserva,omitempty"`
	Completo       int          `json:"completo"`
	Imagen         string       `json:"imagen" enum:"si,pendiente,menor,no" doc:"si: foto con consentimiento · pendiente: foto sin consentimiento · menor: falta autorización · no: sin foto"`
	FotoURL        string       `json:"fotoUrl"`
	Seguidores     int          `json:"seguidores"`
	Incidencias    int          `json:"incidencias"`
	Avisos         []Incidencia `json:"avisos" doc:"Detalle de las incidencias"`
	Edad           *int         `json:"edad,omitempty"`
	Pesaje         string       `json:"pesaje"`
}

// Lista is the backoffice list with tab counts and KPI cards (Figma «Atletas · lista»).
type Lista struct {
	Items      []ItemLista    `json:"items"`
	Total      int            `json:"total"`
	Pagina     int            `json:"pagina"`
	Por        int            `json:"por"`
	Pestanas   map[string]int `json:"pestanas" doc:"todos · confirmados · reserva · bajas · incidencias"`
	KPIs       KPIs           `json:"kpis"`
	Categorias []string       `json:"categorias"`
	Flights    []string       `json:"flights"`
	Importado  *time.Time     `json:"importado,omitempty" doc:"Última importación del acta confirmada"`
}

// KPIs are the cards under the list.
type KPIs struct {
	PerfilesCompletos  int `json:"perfilesCompletos"`
	PctCompletos       int `json:"pctCompletos"`
	SinFoto            int `json:"sinFoto"`
	ConImagen          int `json:"conImagen"`
	ImagenPendiente    int `json:"imagenPendiente"`
	MenoresPendientes  int `json:"menoresPendientes"`
	Seguimientos       int `json:"seguimientos"`
	SeguimientosSemana int `json:"seguimientosSemana"`
}

func imagenEstado(r row, d time.Time) string {
	switch {
	case r.menor(d) && r.AutorizacionURL == "":
		return "menor"
	case r.FotoURL == "":
		return "no"
	case r.ImagenAt == nil:
		return "pendiente"
	}
	return "si"
}

func (s *Svc) registerAdmin() {
	api := s.a.API
	base := "/api/admin/competiciones/{cid}/atletas"

	type listIn struct {
		CID       uuid.UUID `path:"cid"`
		Pestana   string    `query:"pestana" enum:"todos,confirmados,reserva,bajas,incidencias" default:"todos"`
		Sexo      string    `query:"sexo" enum:"F,M,"`
		Categoria string    `query:"categoria"`
		Flight    string    `query:"flight"`
		Perfil    string    `query:"perfil" enum:"incompleto,sin_foto,"`
		Q         string    `query:"q" maxLength:"80"`
		Orden     string    `query:"orden" enum:"nombre,categoria,completo,reserva" default:"nombre"`
		Pagina    int       `query:"pagina" minimum:"1" default:"1"`
		Por       int       `query:"por" minimum:"1" maximum:"500" default:"25"`
	}
	type listOut struct{ Body Lista }
	huma.Register(api, huma.Operation{OperationID: "atletas-list", Method: http.MethodGet, Path: base, Summary: "Atletas (filtros, pestañas y KPIs)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *listIn) (*listOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			d := s.compDate(ctx, in.CID)
			all, err := listRows(ctx, s.a.DB, `a.competition_id = $1`, in.CID)
			if err != nil {
				return nil, err
			}
			out := Lista{Pagina: in.Pagina, Por: in.Por, Pestanas: map[string]int{"todos": 0, "confirmados": 0, "reserva": 0, "bajas": 0, "incidencias": 0}, Items: []ItemLista{}}
			cats, flights := map[string]bool{}, map[string]bool{}
			var filtered []row
			q := fold(in.Q)
			for _, r := range all {
				inc := len(r.incidencias(d))
				out.Pestanas["todos"]++
				switch r.Estado {
				case "confirmado":
					out.Pestanas["confirmados"]++
				case "reserva":
					out.Pestanas["reserva"]++
				case "baja":
					out.Pestanas["bajas"]++
				}
				if inc > 0 {
					out.Pestanas["incidencias"]++
				}
				if r.Estado != "baja" {
					c := r.completo()
					if c >= 70 {
						out.KPIs.PerfilesCompletos++
					}
					if r.FotoURL == "" {
						out.KPIs.SinFoto++
					}
					switch imagenEstado(r, d) {
					case "si":
						out.KPIs.ConImagen++
					case "pendiente":
						out.KPIs.ImagenPendiente++
					case "menor":
						out.KPIs.MenoresPendientes++
					}
					out.KPIs.Seguimientos += r.Seguidores
				}
				if r.Categoria != "" {
					cats[r.Sexo+" "+r.Categoria] = true
				}
				if r.Flight != "" {
					flights[r.Flight] = true
				}
				switch in.Pestana {
				case "confirmados":
					if r.Estado != "confirmado" {
						continue
					}
				case "reserva":
					if r.Estado != "reserva" {
						continue
					}
				case "bajas":
					if r.Estado != "baja" {
						continue
					}
				case "incidencias":
					if inc == 0 {
						continue
					}
				}
				if in.Sexo != "" && r.Sexo != in.Sexo {
					continue
				}
				if in.Categoria != "" && r.Categoria != in.Categoria && r.Sexo+" "+r.Categoria != in.Categoria {
					continue
				}
				if in.Flight != "" && r.Flight != in.Flight {
					continue
				}
				if in.Perfil == "incompleto" && r.completo() >= 70 || in.Perfil == "sin_foto" && r.FotoURL != "" {
					continue
				}
				if q != "" && !strings.Contains(fold(r.nombreCompleto()+" "+r.Club+" "+r.Licencia), q) {
					continue
				}
				filtered = append(filtered, r)
			}
			if n := out.Pestanas["todos"] - out.Pestanas["bajas"]; n > 0 {
				out.KPIs.PctCompletos = out.KPIs.PerfilesCompletos * 100 / n
			}
			_ = s.a.DB.QueryRow(ctx, `SELECT count(*) FROM seguimientos WHERE competition_id = $1 AND confirmado_at > now() - interval '7 days' AND baja_at IS NULL`, in.CID).Scan(&out.KPIs.SeguimientosSemana)
			var imp *time.Time
			_ = s.a.DB.QueryRow(ctx, `SELECT max(updated_at) FROM importaciones WHERE competition_id = $1 AND estado = 'confirmada'`, in.CID).Scan(&imp)
			out.Importado = imp
			sortRows(filtered, in.Orden)
			out.Total = len(filtered)
			from, to := (in.Pagina-1)*in.Por, in.Pagina*in.Por
			for i := from; i < to && i < len(filtered); i++ {
				r := filtered[i]
				out.Items = append(out.Items, ItemLista{ID: r.ID, NombreCompleto: r.nombreCompleto(), Licencia: r.Licencia, Club: r.Club, Sexo: r.Sexo, Categoria: r.Categoria,
					DivisionNombre: DivisionNombre(r.Division), Flight: r.Flight, Estado: r.Estado, OrdenReserva: r.OrdenReserva, Completo: r.completo(),
					Imagen: imagenEstado(r, d), FotoURL: r.FotoURL, Seguidores: r.Seguidores, Incidencias: len(r.incidencias(d)), Avisos: r.incidencias(d), Edad: r.edad(d), Pesaje: r.PesajeEstado})
			}
			out.Categorias = keys(cats)
			out.Flights = keys(flights)
			return &listOut{Body: out}, nil
		})

	type fichaOut struct {
		ETag string `header:"ETag"`
		Body Ficha
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-get", Method: http.MethodGet, Path: base + "/{id}", Summary: "Ficha de un atleta", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*fichaOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID)
			if err != nil {
				return nil, err
			}
			// Data minimisation: weigh-in desk, judges and schedulers do not need contact data.
			if p, _ := auth.FromContext(ctx); !p.Can(in.CID.String(), "atletas.editar") {
				f.Email, f.Telefono = "", ""
			}
			return &fichaOut{ETag: etag(f.Version), Body: f}, nil
		})

	huma.Register(api, huma.Operation{OperationID: "atletas-create", Method: http.MethodPost, Path: base, Summary: "Añadir un atleta a mano", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusCreated},
		func(ctx context.Context, in *struct {
			CID  uuid.UUID `path:"cid"`
			Body DatosIn
		}) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := in.Body.validate(); err != nil {
				return nil, err
			}
			id := newID()
			b := in.Body
			err := s.change(ctx, in.CID, "athletes.atleta_creado", map[string]any{"id": id, "nombre": b.Nombre + " " + b.Apellidos}, func(tx pgx.Tx) error {
				if _, err := tx.Exec(ctx, `INSERT INTO atletas (id, competition_id, licencia, nombre, apellidos, email, telefono, sexo, fecha_nacimiento, categoria, division, club, ciudad, estado, origen)
					VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8,$9,$10,$11,$12,$13,$14,'manual')`, id, in.CID, b.Licencia, b.Nombre, b.Apellidos, b.Email, b.Telefono, b.Sexo, b.fecha(),
					b.Categoria, b.Division, b.Club, b.Ciudad, b.Estado); err != nil {
					if db.IsUniqueViolation(err, "") {
						return problem.Conflict("LICENCIA_DUPLICADA", "Ya hay un atleta con esa licencia en esta competición.")
					}
					return err
				}
				if err := createPerfil(ctx, tx, in.CID, id, b.Nombre+" "+b.Apellidos); err != nil {
					return err
				}
				return hist(ctx, tx, id, "Alta manual", "")
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, id)
			return &fichaOut{ETag: etag(f.Version), Body: f}, err
		})

	type datosIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    DatosIn
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-update", Method: http.MethodPut, Path: base + "/{id}", Summary: "Editar los datos de competición (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *datosIn) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			if err := in.Body.validate(); err != nil {
				return nil, err
			}
			b := in.Body
			err := s.change(ctx, in.CID, "athletes.atleta_actualizado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				prev, err := s.lock(ctx, tx, in.CID, in.ID, in.IfMatch)
				if err != nil {
					return err
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET licencia=$3, nombre=$4, apellidos=$5, email=NULLIF($6,''), telefono=$7, sexo=$8, fecha_nacimiento=$9, categoria=$10,
					division=$11, club=$12, ciudad=$13, estado=$14, orden_reserva = CASE WHEN $14 = 'reserva' THEN orden_reserva ELSE NULL END,
					version = version + 1, updated_at = now() WHERE competition_id=$1 AND id=$2`, in.CID, in.ID, b.Licencia, b.Nombre, b.Apellidos, b.Email, b.Telefono, b.Sexo, b.fecha(),
					b.Categoria, b.Division, b.Club, b.Ciudad, b.Estado); err != nil {
					if db.IsUniqueViolation(err, "") {
						return problem.Conflict("LICENCIA_DUPLICADA", "Ya hay un atleta con esa licencia en esta competición.")
					}
					return err
				}
				if b.Estado == "reserva" && prev.Estado != "reserva" {
					if _, err := tx.Exec(ctx, `UPDATE atletas SET orden_reserva = (SELECT COALESCE(max(orden_reserva), 0) + 1 FROM atletas WHERE competition_id = $1 AND estado = 'reserva' AND id <> $2) WHERE id = $2`, in.CID, in.ID); err != nil {
						return err
					}
				}
				return hist(ctx, tx, in.ID, "Datos de competición editados", cambios(prev, b))
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID)
			return &fichaOut{ETag: etag(f.Version), Body: f}, err
		})

	type perfilIn struct {
		CID     uuid.UUID `path:"cid"`
		ID      uuid.UUID `path:"id"`
		IfMatch string    `header:"If-Match"`
		Body    PerfilIn
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-perfil", Method: http.MethodPut, Path: base + "/{id}/perfil", Summary: "Editar el perfil público y la visibilidad (If-Match)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *perfilIn) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			b := in.Body
			if err := b.validate(); err != nil {
				return nil, err
			}
			err := s.change(ctx, in.CID, "athletes.perfil_actualizado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				prev, err := s.lock(ctx, tx, in.CID, in.ID, in.IfMatch)
				if err != nil {
					return err
				}
				if prev.menor(s.compDate(ctx, in.CID)) {
					b.Instagram = "" // minors: no social links are stored
				}
				if _, err := tx.Exec(ctx, `UPDATE perfiles SET foto_url=$2, focal_x=$3, focal_y=$4, frase=$5, bio=$6, instagram=$7, entrenador=$8, historial=$9,
					marca_sq=$10, marca_bp=$11, marca_dl=$12, visible=$13, mostrar_marcas=$14, permite_seguir=$15, autorizacion_url=$16, updated_at=now() WHERE atleta_id=$1`,
					in.ID, b.FotoURL, b.FocalX, b.FocalY, b.Frase, b.Bio, b.Instagram, b.Entrenador, b.Historial, b.Marcas.SQ, b.Marcas.BP, b.Marcas.DL,
					b.Visible, b.MostrarMarcas, b.PermiteSeguir, b.AutorizacionURL); err != nil {
					return err
				}
				// Image consent recorded by the team (signed form), only when there was none.
				if b.RegistrarConsentimiento && prev.ImagenAt == nil {
					v, h := s.legalVigente(ctx, in.CID, "consentimiento")
					if _, err := tx.Exec(ctx, `UPDATE perfiles SET imagen_at = now(), imagen_version = $2, imagen_hash = $3, imagen_origen = 'backoffice · formulario firmado', imagen_ip = '' WHERE atleta_id = $1`, in.ID, v, h); err != nil {
						return err
					}
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET version = version + 1, updated_at = now() WHERE id = $1`, in.ID); err != nil {
					return err
				}
				return hist(ctx, tx, in.ID, "Perfil público editado", "")
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID)
			return &fichaOut{ETag: etag(f.Version), Body: f}, err
		})

	type promIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Avisar bool `json:"avisar,omitempty" doc:"Email «Tienes plaza» con el enlace a su área"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-promocionar", Method: http.MethodPost, Path: base + "/{id}/promocionar", Summary: "Pasar de reserva a confirmado", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *promIn) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			err := s.change(ctx, in.CID, "athletes.promocionado", map[string]any{"id": in.ID, "avisado": in.Body.Avisar}, func(tx pgx.Tx) error {
				r, err := s.lock(ctx, tx, in.CID, in.ID, "")
				if err != nil {
					return err
				}
				if r.Estado != "reserva" {
					return problem.Conflict("NO_ES_RESERVA", "Solo se puede promocionar a atletas en reserva.")
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET estado = 'confirmado', orden_reserva = NULL, version = version + 1, updated_at = now() WHERE id = $1`, in.ID); err != nil {
					return err
				}
				// Close the gap in the reserve order.
				if _, err := tx.Exec(ctx, `UPDATE atletas SET orden_reserva = orden_reserva - 1 WHERE competition_id = $1 AND estado = 'reserva' AND orden_reserva > $2`, in.CID, r.OrdenReserva); err != nil {
					return err
				}
				if in.Body.Avisar && r.Email != nil {
					link, err := s.newAreaLink(ctx, tx, r.ID)
					if err != nil {
						return err
					}
					if err := email(ctx, tx, in.CID, *r.Email, "atleta-tienes-plaza", map[string]string{"nombre": r.Nombre, "enlace": link}); err != nil {
						return err
					}
				}
				return hist(ctx, tx, in.ID, "Promocionado de reserva a confirmado", map[bool]string{true: "Avisado por email", false: "Sin aviso"}[in.Body.Avisar])
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID)
			return &fichaOut{ETag: etag(f.Version), Body: f}, err
		})

	type pesajeIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body PesajeIn
	}
	type pesajeOut struct {
		Body struct {
			CategoriaOk bool   `json:"categoriaOk"`
			Sugerencia  string `json:"sugerencia" doc:"Categoría que le corresponde por peso"`
			Atleta      Ficha  `json:"atleta"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-pesaje", Method: http.MethodPost, Path: base + "/{id}/pesaje", Summary: "Registrar el pesaje (peso, alturas de rack, primeros intentos)", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *pesajeIn) (*pesajeOut, error) {
			if _, err := requireAny(ctx, in.CID, "checkin.escanear", "atletas.editar"); err != nil {
				return nil, err
			}
			b := in.Body
			out := &pesajeOut{}
			err := s.change(ctx, in.CID, "athletes.pesaje_registrado", map[string]any{"id": in.ID, "peso": b.Peso}, func(tx pgx.Tx) error {
				r, err := s.lock(ctx, tx, in.CID, in.ID, "")
				if err != nil {
					return err
				}
				if r.Estado != "confirmado" {
					return problem.Conflict("NO_CONFIRMADO", "Solo se pesa a atletas confirmados.")
				}
				ok, sug := CheckPesaje(r.Sexo, r.Categoria, r.Division, b.Peso)
				estado := map[bool]string{true: "ok", false: "fuera"}[ok]
				if ok {
					sug = ""
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET peso_corporal=$2, rack_sq=COALESCE($3, rack_sq), rack_bp=COALESCE(NULLIF($4,''), rack_bp), seguros_bp=COALESCE($5, seguros_bp),
					intento_sq=COALESCE($6, intento_sq), intento_bp=COALESCE($7, intento_bp), intento_dl=COALESCE($8, intento_dl), pesaje_estado=$9, pesaje_sugerencia=$10,
					pesado_at=now(), pesado_por=$11, version=version+1, updated_at=now() WHERE id=$1`,
					in.ID, b.Peso, b.RackSQ, b.RackBP, b.SegurosBP, b.Intentos.SQ, b.Intentos.BP, b.Intentos.DL, estado, sug, actor(ctx)); err != nil {
					return err
				}
				out.Body.CategoriaOk, out.Body.Sugerencia = ok, sug
				detalle := fmt.Sprintf("%s kg · %s", kg(&b.Peso), map[bool]string{true: "dentro de " + r.Categoria, false: "fuera de " + r.Categoria + " (le corresponde " + sug + ")"}[ok])
				return hist(ctx, tx, in.ID, "Pesaje registrado", detalle)
			})
			if err != nil {
				return nil, err
			}
			out.Body.Atleta, err = s.ficha(ctx, in.CID, in.ID)
			return out, err
		})

	type decIn struct {
		CID  uuid.UUID `path:"cid"`
		ID   uuid.UUID `path:"id"`
		Body struct {
			Accion string `json:"accion" enum:"cambiar_categoria,no_compite" doc:"cambiar_categoria: pasa a la categoría que le corresponde por peso (la AEP debe confirmarlo)"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-pesaje-decision", Method: http.MethodPost, Path: base + "/{id}/pesaje/decision", Summary: "Decidir un pesaje fuera de categoría", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *decIn) (*fichaOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			err := s.change(ctx, in.CID, "athletes.pesaje_decidido", map[string]any{"id": in.ID, "accion": in.Body.Accion}, func(tx pgx.Tx) error {
				r, err := s.lock(ctx, tx, in.CID, in.ID, "")
				if err != nil {
					return err
				}
				if r.PesajeEstado != "fuera" {
					return problem.Conflict("SIN_DECISION", "El pesaje de este atleta no está fuera de categoría.")
				}
				if in.Body.Accion == "cambiar_categoria" {
					if _, err := tx.Exec(ctx, `UPDATE atletas SET categoria = pesaje_sugerencia, pesaje_estado = 'ok', pesaje_sugerencia = '', version = version + 1, updated_at = now() WHERE id = $1`, in.ID); err != nil {
						return err
					}
					return hist(ctx, tx, in.ID, "Cambio de categoría tras el pesaje", r.Categoria+" → "+r.PesajeSugerencia)
				}
				if _, err := tx.Exec(ctx, `UPDATE atletas SET pesaje_estado = 'no_compite', version = version + 1, updated_at = now() WHERE id = $1`, in.ID); err != nil {
					return err
				}
				return hist(ctx, tx, in.ID, "No compite (pesaje fuera de categoría)", "")
			})
			if err != nil {
				return nil, err
			}
			f, err := s.ficha(ctx, in.CID, in.ID)
			return &fichaOut{ETag: etag(f.Version), Body: f}, err
		})

	type enlaceOut struct {
		Body struct {
			Enviado bool      `json:"enviado"`
			Caduca  time.Time `json:"caduca"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "atletas-enlace-area", Method: http.MethodPost, Path: base + "/{id}/enlace-area", Summary: "Enviar al atleta un enlace a su área", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*enlaceOut, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			out := &enlaceOut{}
			err := s.change(ctx, in.CID, "athletes.enlace_area_enviado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				r, err := getRow(ctx, tx, in.CID, in.ID)
				if err != nil {
					return err
				}
				if r.Email == nil || *r.Email == "" {
					return problem.Unprocessable("SIN_EMAIL", "Este atleta no tiene email: añádelo en «Competición».")
				}
				link, err := s.newAreaLink(ctx, tx, r.ID)
				if err != nil {
					return err
				}
				out.Body.Enviado, out.Body.Caduca = true, time.Now().Add(areaLinkTTL)
				if err := email(ctx, tx, in.CID, *r.Email, "atleta-enlace-area", map[string]string{"nombre": r.Nombre, "enlace": link}); err != nil {
					return err
				}
				return hist(ctx, tx, in.ID, "Enlace al área enviado", "")
			})
			return out, err
		})

	type histOut struct{ Body []HistorialItem }
	huma.Register(api, huma.Operation{OperationID: "atletas-historial", Method: http.MethodGet, Path: base + "/{id}/historial", Summary: "Historial de cambios del atleta", Tags: tagAdmin, Security: bearer},
		func(ctx context.Context, in *idIn) (*histOut, error) {
			if _, err := requireAny(ctx, in.CID, readPerms...); err != nil {
				return nil, err
			}
			if _, err := getRow(ctx, s.a.DB, in.CID, in.ID); err != nil {
				return nil, err
			}
			rows, err := s.a.DB.Query(ctx, `SELECT actor, accion, detalle, at FROM historial WHERE atleta_id = $1 ORDER BY at DESC LIMIT 200`, in.ID)
			if err != nil {
				return nil, err
			}
			list, err := pgx.CollectRows(rows, pgx.RowToStructByName[HistorialItem])
			if list == nil {
				list = []HistorialItem{}
			}
			return &histOut{Body: list}, err
		})

	huma.Register(api, huma.Operation{OperationID: "atletas-delete", Method: http.MethodDelete, Path: base + "/{id}", Summary: "Borrar un atleta y sus datos (derecho de supresión)", Tags: tagAdmin, Security: bearer, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *idIn) (*struct{}, error) {
			if _, err := auth.Require(ctx, in.CID.String(), "atletas.editar"); err != nil {
				return nil, err
			}
			return nil, s.change(ctx, in.CID, "athletes.atleta_borrado", map[string]any{"id": in.ID}, func(tx pgx.Tx) error {
				tag, err := tx.Exec(ctx, `DELETE FROM atletas WHERE competition_id = $1 AND id = $2`, in.CID, in.ID)
				if err == nil && tag.RowsAffected() == 0 {
					return problem.NotFound("Atleta no encontrado.")
				}
				return err
			})
		})

	// CSV export. Emails and phones only with contactos.exportar (personal data).
	s.a.Mux.HandleFunc("GET /api/admin/competiciones/{cid}/atletas/exportar.csv", func(w http.ResponseWriter, r *http.Request) {
		cid, err := uuid.Parse(r.PathValue("cid"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		p, err := auth.Require(r.Context(), cid.String(), "atletas.editar")
		if err != nil {
			problem.Write(w, err.(*problem.Error))
			return
		}
		personal := p.Can(cid.String(), "contactos.exportar")
		list, err := listRows(r.Context(), s.a.DB, `a.competition_id = $1 ORDER BY a.estado, a.sexo, a.categoria, a.apellidos, a.nombre`, cid)
		if err != nil {
			problem.Write(w, problem.Internal())
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="atletas.csv"`)
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte("\ufeff")) // Excel-friendly UTF-8
		cw := csv.NewWriter(w)
		cw.Comma = ';'
		head := []string{"Licencia", "Nombre", "Apellidos", "Sexo", "Categoría", "División", "Club", "Estado", "Flight", "Peso", "Perfil %"}
		if personal {
			head = append(head, "Email", "Teléfono")
		}
		_ = cw.Write(head)
		for _, a := range list {
			// Free-text columns (typed in the AEP list or by athletes) are neutralised against formulas.
			rec := []string{csvSafe(a.Licencia), csvSafe(a.Nombre), csvSafe(a.Apellidos), a.Sexo, a.Categoria, DivisionNombre(a.Division), csvSafe(a.Club), a.Estado, a.Flight, kg(a.PesoCorporal), strconv.Itoa(a.completo())}
			if personal {
				e := ""
				if a.Email != nil {
					e = *a.Email
				}
				rec = append(rec, csvSafe(e), csvSafe(a.Telefono))
			}
			_ = cw.Write(rec)
		}
		cw.Flush()
	})
}

// csvSafe neutralises spreadsheet formulas (CSV injection): club and city can be typed by athletes.
func csvSafe(v string) string {
	if v != "" && strings.ContainsRune("=+-@\t\r", rune(v[0])) {
		return "'" + v
	}
	return v
}

// validMedio accepts media of the library (/api/medios/…) or https URLs.
func validMedio(u string) bool {
	return u == "" || strings.HasPrefix(u, "/api/medios/") || strings.HasPrefix(u, "https://") && len(u) > len("https://x.y")
}

func keys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return catOrder(out[i]) < catOrder(out[j]) })
	return out
}

// catOrder sorts "F -63" before "M -53" and by weight inside a sex ("+" classes last); flights sort as text.
func catOrder(s string) string {
	sexo, cat, ok := strings.Cut(s, " ")
	if !ok {
		return s
	}
	w, _ := strconv.ParseFloat(strings.TrimLeft(cat, "-+"), 64)
	if strings.HasPrefix(cat, "+") {
		w += 0.5
	}
	return fmt.Sprintf("%s%07.1f", sexo, w)
}

func sortRows(list []row, orden string) {
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i], list[j]
		switch orden {
		case "categoria":
			if x, y := catOrder(a.Sexo+" "+a.Categoria), catOrder(b.Sexo+" "+b.Categoria); x != y {
				return x < y
			}
		case "completo":
			if a.completo() != b.completo() {
				return a.completo() < b.completo()
			}
		case "reserva":
			if (a.OrdenReserva == nil) != (b.OrdenReserva == nil) {
				return a.OrdenReserva != nil
			}
			if a.OrdenReserva != nil && *a.OrdenReserva != *b.OrdenReserva {
				return *a.OrdenReserva < *b.OrdenReserva
			}
		}
		return strings.ToLower(a.Apellidos+a.Nombre) < strings.ToLower(b.Apellidos+b.Nombre)
	})
}

// lock reads the athlete FOR UPDATE and checks the optional If-Match version.
func (s *Svc) lock(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, ifm string) (row, error) {
	if _, err := tx.Exec(ctx, `SELECT 1 FROM atletas WHERE competition_id = $1 AND id = $2 FOR UPDATE`, cid, id); err != nil {
		return row{}, err
	}
	r, err := getRow(ctx, tx, cid, id)
	if err != nil {
		return r, err
	}
	if ifm != "" && ifMatch(ifm) != r.Version {
		return r, problem.Conflict("CONFLICTO_EDICION", "Otra persona ha guardado esta ficha mientras la editabas. Recarga para ver sus cambios.")
	}
	return r, nil
}

// DatosIn are the competition data of an athlete.
type DatosIn struct {
	Licencia        string `json:"licencia,omitempty" maxLength:"20"`
	Nombre          string `json:"nombre" minLength:"1" maxLength:"80"`
	Apellidos       string `json:"apellidos,omitempty" maxLength:"120"`
	Email           string `json:"email,omitempty" maxLength:"254"`
	Telefono        string `json:"telefono,omitempty" maxLength:"30"`
	Sexo            string `json:"sexo" enum:"F,M"`
	FechaNacimiento string `json:"fechaNacimiento,omitempty" doc:"AAAA-MM-DD"`
	Categoria       string `json:"categoria" maxLength:"6"`
	Division        string `json:"division" enum:"subjunior,junior,open,master1,master2,master3,master4"`
	Club            string `json:"club,omitempty" maxLength:"120"`
	Ciudad          string `json:"ciudad,omitempty" maxLength:"80"`
	Estado          string `json:"estado" enum:"confirmado,reserva,baja"`
}

func (d *DatosIn) validate() error {
	d.Licencia = NormLicencia(d.Licencia)
	d.Nombre, d.Apellidos, d.Club, d.Ciudad = strings.TrimSpace(d.Nombre), strings.TrimSpace(d.Apellidos), strings.TrimSpace(d.Club), strings.TrimSpace(d.Ciudad)
	d.Email = strings.ToLower(strings.TrimSpace(d.Email))
	d.Categoria = NormCategoria(d.Categoria)
	if d.Email != "" && !strings.Contains(d.Email, "@") {
		return problem.Unprocessable("EMAIL_INVALIDO", "El email no es válido.")
	}
	if d.FechaNacimiento != "" {
		if _, ok := ParseFecha(d.FechaNacimiento); !ok {
			return problem.Unprocessable("FECHA_INVALIDA", "La fecha de nacimiento debe ser AAAA-MM-DD.")
		}
	}
	if err := ValidarCategoria(d.Sexo, d.Categoria, d.Division); err != nil {
		return problem.Unprocessable("CATEGORIA_INVALIDA", "Categoría: "+err.Error()+".")
	}
	return nil
}

func (d DatosIn) fecha() *time.Time {
	if t, ok := ParseFecha(d.FechaNacimiento); ok {
		return &t
	}
	return nil
}

func cambios(prev row, b DatosIn) string {
	var c []string
	add := func(campo, a, z string) {
		if a != z {
			c = append(c, campo+": "+orDash(a)+" → "+orDash(z))
		}
	}
	add("Categoría", prev.Categoria, b.Categoria)
	add("División", DivisionNombre(prev.Division), DivisionNombre(b.Division))
	add("Club", prev.Club, b.Club)
	add("Estado", prev.Estado, b.Estado)
	add("Licencia", prev.Licencia, b.Licencia)
	return strings.Join(c, " · ")
}

func orDash(s string) string {
	if s == "" {
		return "–"
	}
	return s
}

// PerfilIn is the profile as the team saves it.
type PerfilIn struct {
	FotoURL                 string `json:"fotoUrl,omitempty" maxLength:"500"`
	FocalX                  int16  `json:"focalX" minimum:"0" maximum:"100" default:"50"`
	FocalY                  int16  `json:"focalY" minimum:"0" maximum:"100" default:"50"`
	Frase                   string `json:"frase,omitempty" maxLength:"80"`
	Bio                     string `json:"bio,omitempty" maxLength:"280"`
	Instagram               string `json:"instagram,omitempty" maxLength:"60"`
	Entrenador              string `json:"entrenador,omitempty" maxLength:"120"`
	Historial               string `json:"historial,omitempty" maxLength:"300"`
	Marcas                  Marcas `json:"marcas"`
	Visible                 bool   `json:"visible,omitempty"`
	MostrarMarcas           bool   `json:"mostrarMarcas,omitempty"`
	PermiteSeguir           bool   `json:"permiteSeguir,omitempty"`
	AutorizacionURL         string `json:"autorizacionUrl,omitempty" maxLength:"500" doc:"Autorización firmada del tutor (menores)"`
	RegistrarConsentimiento bool   `json:"registrarConsentimiento,omitempty" doc:"Registrar el consentimiento de imagen firmado en papel"`
}

func (p *PerfilIn) validate() error {
	p.Instagram = normInstagram(p.Instagram)
	if !validMedio(p.FotoURL) || !validMedio(p.AutorizacionURL) {
		return problem.Unprocessable("URL_INVALIDA", "La foto y la autorización deben subirse a la biblioteca de medios (o ser un enlace https).")
	}
	for _, v := range []*float64{p.Marcas.SQ, p.Marcas.BP, p.Marcas.DL} {
		if v != nil && (*v < 0 || *v > 600) {
			return problem.Unprocessable("MARCA_INVALIDA", "Las marcas deben estar entre 0 y 600 kg.")
		}
	}
	return nil
}

// normInstagram keeps «@handle».
func normInstagram(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	for _, p := range []string{"https://www.instagram.com/", "https://instagram.com/", "http://instagram.com/", "instagram.com/"} {
		s = strings.TrimPrefix(s, p)
	}
	s = strings.Trim(s, "/ ")
	if i := strings.IndexAny(s, "/?"); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return ""
	}
	return "@" + strings.TrimPrefix(s, "@")
}

// PesajeIn is a weigh-in.
type PesajeIn struct {
	Peso      float64 `json:"peso" minimum:"20" maximum:"300"`
	RackSQ    *int    `json:"rackSq,omitempty" minimum:"1" maximum:"30"`
	RackBP    string  `json:"rackBp,omitempty" maxLength:"10" doc:"Altura / seguros, p. ej. 6/3"`
	SegurosBP *int    `json:"segurosBp,omitempty" minimum:"0" maximum:"20"`
	Intentos  Marcas  `json:"intentos"`
}

// HistorialItem is an entry of the record history.
type HistorialItem struct {
	Actor   string    `json:"actor" db:"actor"`
	Accion  string    `json:"accion" db:"accion"`
	Detalle string    `json:"detalle" db:"detalle"`
	At      time.Time `json:"at" db:"at"`
}

// Ficha is the record plus the athlete-area status.
type Ficha struct {
	Atleta
	Area AreaEstado `json:"area"`
}

// AreaEstado summarises the athlete's use of their area (Figma «Área del atleta»).
type AreaEstado struct {
	UltimoAcceso *time.Time `json:"ultimoAcceso,omitempty"`
	EnlaceEnvio  *time.Time `json:"enlaceEnvio,omitempty"`
	EnlaceUsado  bool       `json:"enlaceUsado"`
}

func (s *Svc) ficha(ctx context.Context, cid, id uuid.UUID) (Ficha, error) {
	r, err := getRow(ctx, s.a.DB, cid, id)
	if err != nil {
		return Ficha{}, err
	}
	f := Ficha{Atleta: r.admin(s.compDate(ctx, cid))}
	_ = s.a.DB.QueryRow(ctx, `SELECT max(last_seen_at) FROM area_sesiones WHERE atleta_id = $1`, id).Scan(&f.Area.UltimoAcceso)
	var used *time.Time
	_ = s.a.DB.QueryRow(ctx, `SELECT created_at, used_at FROM area_tokens WHERE atleta_id = $1 ORDER BY created_at DESC LIMIT 1`, id).Scan(&f.Area.EnlaceEnvio, &used)
	f.Area.EnlaceUsado = used != nil
	return f, nil
}

func createPerfil(ctx context.Context, tx pgx.Tx, cid, id uuid.UUID, name string) error {
	slug, err := uniqueSlug(ctx, tx, cid, name, id)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO perfiles (atleta_id, competition_id, slug) VALUES ($1,$2,$3)`, id, cid, slug)
	return err
}

// legalVigente returns the version and hash of a legal text in force (cms public API), for consent records.
func (s *Svc) legalVigente(ctx context.Context, cid uuid.UUID, tipo string) (string, string) {
	c, err := s.comps.ByID(ctx, cid)
	if err != nil {
		return "", ""
	}
	var l struct {
		Version string `json:"version"`
		Hash    string `json:"hash"`
	}
	if err := s.cms.Do(ctx, http.MethodGet, "/api/competiciones/"+c.Slug+"/legal/"+tipo, nil, &l); err != nil {
		return "", ""
	}
	return l.Version, l.Hash
}

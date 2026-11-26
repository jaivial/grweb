package athletes

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"

	"github.com/jaivial/grweb/platform/pkg/storage"
)

// The accreditation QR is generated once on the server, published to the Bunny CDN and stored in
// `atletas.acreditacion_url`; the area only loads that URL. The payload («A:<cid>:<id>:<hmac>») is exactly the one
// check-in scans: what changes is where the PNG lives, never what it says.
const acreditacionPX = 640

// acreditacionPNG is the image of the accreditation with its white quiet zone (4 modules, the reader needs it).
func acreditacionPNG(contenido string) ([]byte, error) {
	return qrcode.Encode(contenido, qrcode.Medium, acreditacionPX)
}

// acreditacionClave is the Bunny key of the file: «acreditaciones/<competition>/<hmac>.png». The name is derived
// from the signed payload, so it cannot be guessed, it never collides and a new payload gets a new file.
func (s *Svc) acreditacionClave(cid uuid.UUID, contenido string) string {
	m := hmac.New(sha256.New, s.qrKey)
	m.Write([]byte("acreditacion:" + contenido))
	return "acreditaciones/" + cid.String() + "/" + hex.EncodeToString(m.Sum(nil)[:16]) + ".png"
}

// acreditacionCDN returns the public URL of the accreditation PNG, generating and publishing it only when it does
// not exist yet or its payload changed (idempotent). Empty string when it cannot be published: without the «bunny»
// integration (QA) the caller serves the on-the-fly PNG instead.
func (s *Svc) acreditacionCDN(ctx context.Context, r row) string {
	contenido := s.qr(r.CompetitionID, r.ID)
	var url, guardado string
	if err := s.a.DB.QueryRow(ctx, `SELECT acreditacion_url, acreditacion_qr FROM atletas WHERE id = $1`, r.ID).Scan(&url, &guardado); err != nil {
		return ""
	}
	if url != "" && guardado == contenido {
		return url
	}
	st, err := s.storage(ctx, r.CompetitionID)
	if err != nil {
		return ""
	}
	b, ok := st.(storage.Bunny) // sin CDN no se guarda nada: el volumen local serviría el PNG como JPEG
	if !ok || b.CDNURL == "" {
		return ""
	}
	png, err := acreditacionPNG(contenido)
	if err != nil {
		s.a.Log.Warn("acreditación: generar el QR", "atleta", r.ID, "err", err)
		return ""
	}
	nueva, err := b.Put(ctx, s.acreditacionClave(r.CompetitionID, contenido), "image/png", png)
	if err != nil {
		s.a.Log.Warn("acreditación: subir el QR a Bunny", "atleta", r.ID, "err", err)
		return ""
	}
	if _, err := s.a.DB.Exec(ctx, `UPDATE atletas SET acreditacion_url = $2, acreditacion_qr = $3 WHERE id = $1`, r.ID, nueva, contenido); err != nil {
		s.a.Log.Warn("acreditación: guardar la URL del QR", "atleta", r.ID, "err", err) // la URL de esta respuesta vale igual
	}
	return nueva
}

// registerAreaAcreditacion: the PNG lives on the CDN; the URL comes signed out of the area session. While the upload
// is not available (QA, CDN caído) the same image is served on the fly so the athlete always sees the QR.
func (s *Svc) registerAreaAcreditacion() {
	api := s.a.API
	base := "/api/area-atleta"

	type cookieIn struct {
		Session string `cookie:"gr_area"`
	}
	type acredOut struct {
		CacheControl string `header:"Cache-Control"`
		Body         struct {
			URL       string `json:"url" doc:"URL del PNG del QR (CDN de Bunny; si falta, el PNG al vuelo)"`
			Contenido string `json:"contenido" doc:"Contenido del QR: lo que escanea el pesaje"`
		}
	}
	huma.Register(api, huma.Operation{OperationID: "area-acreditacion", Method: http.MethodGet, Path: base + "/acreditacion", Summary: "Mi acreditación: URL del QR en el CDN (se genera y se publica si falta)", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*acredOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			url := s.acreditacionCDN(ctx, r)
			if url == "" {
				url = base + "/acreditacion.png"
			}
			o := &acredOut{CacheControl: "private, max-age=60"}
			o.Body.URL, o.Body.Contenido = url, s.qr(r.CompetitionID, r.ID)
			return o, nil
		})

	type pngOut struct {
		ContentType  string `header:"Content-Type"`
		CacheControl string `header:"Cache-Control"`
		Nosniff      string `header:"X-Content-Type-Options"`
		Body         []byte
	}
	huma.Register(api, huma.Operation{OperationID: "area-acreditacion-png", Method: http.MethodGet, Path: base + "/acreditacion.png", Summary: "Imagen del QR de mi acreditación (respaldo sin CDN)", Tags: tagArea},
		func(ctx context.Context, in *cookieIn) (*pngOut, error) {
			r, err := s.session(ctx, in.Session)
			if err != nil {
				return nil, err
			}
			png, err := acreditacionPNG(s.qr(r.CompetitionID, r.ID))
			if err != nil {
				return nil, err
			}
			return &pngOut{ContentType: "image/png", CacheControl: "private, max-age=3600", Nosniff: "nosniff", Body: png}, nil
		})
}

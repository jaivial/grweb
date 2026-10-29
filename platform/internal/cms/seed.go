package cms

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jaivial/grweb/platform/pkg/app"
	"github.com/jaivial/grweb/platform/pkg/db"
)

const op = "https://openpencil.menustudioai.com/grscup/"
const bcdn = "https://jaimedigitalstudio.b-cdn.net/grcup/"

// Seed content of the GR Cup home (texts from the Figma design, «Datos de ejemplo» where the organiser must confirm).
var seedSecciones = map[string]any{
	"hero":       map[string]any{"titulo": "Los ganadores nunca se rinden"},
	"campeonato": map[string]any{"titulo": "Campeonato de powerlifting", "subtitulo": ""},
	"inscripciones": map[string]any{"titulo": "Inscripciones", "plazas": 150,
		"texto": "La inscripción y la lista de espera las gestiona la AEP. Mientras, conoce a quienes compiten y consulta su horario."},
	"entradas": map[string]any{"eyebrow": "Entrada gratuita · aforo limitado", "titulo": "Ven a vivirlo", "tituloAcento": "en directo",
		"texto": "La entrada es gratis, pero hay que reservarla: te llega un QR al email y entras sin colas. Una reserva sirve para ti y hasta 3 acompañantes.",
		"puntos": []map[string]string{{"titulo": "Gratis con reserva", "texto": "Tu QR llega al momento por email y lo tienes siempre en «Mi entrada»."},
			{"titulo": "Hasta 4 personas", "texto": "Una sola reserva para ti y tus acompañantes. Los menores entran con ella."},
			{"titulo": "Sorteo opcional · 1 € por boleto", "texto": "Súmate al sorteo benéfico al reservar. Se sortea en directo."}}},
	"atletas": map[string]any{"eyebrow": "01 · Los atletas", "titulo": "Una competición", "tituloAcento": "hecha para los atletas", "imagen": bcdn + "atheltephotos/f7efa2c624614a66b35f6ab01980e09e.webp"},
	"dia":     map[string]any{"eyebrow": "02 · El día de la competición", "titulo": "El día en el que", "tituloAcento": "todo el esfuerzo da sus frutos", "imagen": op + "atheltephotos--t-image-22-mar-2026-23-40-58.jpg"},
	"premios": map[string]any{"eyebrow": "03 · Premios", "titulo": "Premio para los mejores en", "tituloAcento": "cada movimiento", "lema": "¡Demuestra quién manda en cada movimiento!",
		"items": []map[string]string{{"titulo": "Sentadilla", "imagen": op + "alfonso-fernandez--img-3276.jpg"}, {"titulo": "Press de banca", "imagen": op + "alfonso-fernandez--img-3363.jpg"}, {"titulo": "Peso muerto", "imagen": op + "alfonso-fernandez--img-3364.jpg"}}},
	"organizacion": map[string]any{"eyebrow": "04 · La competición", "titulo": "Organización", "tituloAcento": "y equipamiento",
		"texto":    "Una competición diseñada para ofrecer la mejor experiencia tanto a atletas como a entrenadores, con jueces certificados y equipamiento de primera categoría.",
		"imagenes": []map[string]string{{"imagen": op + "30--central-pavello-almussafes-2.jpg", "alt": "Pabellón de Almussafes durante la competición"}, {"imagen": op + "alfonso-fernandez--img-3365.jpg", "alt": "Atletas celebrando"}}},
	"cifras":         map[string]any{"items": []map[string]string{{"valor": "150", "etiqueta": "Atletas inscritos"}, {"valor": "16", "etiqueta": "Categorías de peso IPF"}, {"valor": "3", "etiqueta": "Movimientos: S · B · D"}, {"valor": "AEP", "etiqueta": "Jueces oficiales"}}},
	"patrocinadores": map[string]any{"titulo": "Patrocinadores y colaboradores"},
	"faq":            map[string]any{"eyebrow": "Dudas", "titulo": "Preguntas frecuentes", "texto": "Lo que más nos preguntáis sobre entradas, horarios y la competición."},
	"localizacion":   map[string]any{"eyebrow": "Localización", "titulo": "Cómo llegar", "texto": "Pabellón con aparcamiento cercano. Revisa los avisos antes de venir."},
}

var seedFAQ = []faqIn{
	{"Entradas", "¿La entrada es gratuita?", "Sí. La entrada es gratuita, pero hay que **reservarla** para controlar el aforo. Recibirás un QR por email.", true, true},
	{"Entradas", "¿Cuántas personas puedo incluir en una reserva?", "Hasta 4 personas por reserva (tú y 3 acompañantes). Los menores entran con la reserva de un adulto.", true, true},
	{"Entradas", "¿Puedo entrar y salir del pabellón?", "Sí, conserva tu QR en el móvil: se puede volver a mostrar en la puerta. *Datos de ejemplo: pendiente de confirmar por la organización.*", false, true},
	{"Competición", "¿Cómo me inscribo como atleta?", "La inscripción y la lista de espera las gestiona la **AEP** desde su web. Desde aquí te enlazamos a su formulario.", true, true},
	{"Competición", "¿Qué categorías de peso hay?", "Las categorías IPF masculinas y femeninas. Consulta la página de categorías de peso.", false, true},
	{"Sorteo", "¿Cuánto cuesta un boleto del sorteo?", "1 € por boleto. El sorteo es benéfico y se celebra en directo con lista cerrada y semilla publicada.", true, true},
	{"Llegar", "¿Hay aparcamiento?", "Sí, hay aparcamiento junto al pabellón. *Datos de ejemplo.*", false, true},
}

var seedPatro = []patroIn{
	{"AEP", "institucional", bcdn + "sponsors/compressedAEP.webp", "https://aep-powerlifting.com/", true},
	{"A7", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp", "", true},
	{"Maniak Fitness", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_06_35.webp", "", true},
	{"Valkyria Powerlifting Center", "plata", logoValkyria, "", true},
	{"PHED", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_21.webp", "", true},
}

const logoValkyria = bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_18.webp"

// /publico (Figma page 29).
var seedPublico = map[string]any{
	"intro": map[string]any{"eyebrow": "Ven a verlo", "titulo": "Ven a ver", "tituloAcento": "la competición",
		"texto": "La plataforma está abierta al público. Te contamos qué vas a ver, cómo se juzga un intento y cómo seguirlo desde la grada."},
	"datos": map[string]any{"items": []map[string]string{{"icono": "ticket", "etiqueta": "Entrada", "valor": "Gratis con reserva"}, {"icono": "clock", "etiqueta": "Horario", "valor": "Según los bloques"},
		{"icono": "map-pin", "etiqueta": "Sede", "valor": "Almussafes"}, {"icono": "users", "etiqueta": "Aforo", "valor": "600 por sesión (ejemplo)"}}},
	"movimientos": map[string]any{"eyebrow": "01 · Qué verás", "titulo": "Tres", "tituloAcento": "movimientos",
		"texto": "Cada bloque compite en sentadilla, después en press de banca y por último en peso muerto, con tres intentos por atleta.",
		"items": []map[string]string{{"titulo": "Sentadilla", "imagen": op + "alfonso-fernandez--img-3276.jpg"}, {"titulo": "Press de banca", "imagen": op + "alfonso-fernandez--img-3363.jpg"}, {"titulo": "Peso muerto", "imagen": op + "alfonso-fernandez--img-3364.jpg"}}},
	"juicio": map[string]any{"eyebrow": "02 · Cómo se juzga", "titulo": "Sigue un intento", "tituloAcento": "paso a paso",
		"pasos": []map[string]string{{"titulo": "El atleta pide su peso", "texto": "Se anuncia el nombre, el intento y los kilos en el marcador."}, {"titulo": "Los cargadores preparan la barra", "texto": "Comprueban el peso y los cierres."},
			{"titulo": "Órdenes del juez", "texto": "«Squat», «Press», «Down»… el atleta espera cada voz."}, {"titulo": "Luces", "texto": "Válido con al menos 2 de 3 luces blancas."}}},
	"normas": map[string]any{"eyebrow": "03 · Normas", "titulo": "En la", "tituloAcento": "grada",
		"items": []map[string]string{{"texto": "Anima todo lo que quieras, pero guarda silencio cuando el atleta prepara el intento."}, {"texto": "No accedas a la zona de calentamiento ni a la plataforma."},
			{"texto": "Foto y vídeo sin flash."}, {"texto": "Respeta los pasillos y salidas de emergencia."}}},
	"interesar": map[string]any{"titulo": "Te puede interesar", "items": []map[string]string{{"titulo": "Cómo llegar", "texto": "Pabellón de Almussafes", "ruta": "/como-llegar"},
		{"titulo": "Horarios", "texto": "Bloques por categoría", "ruta": "/horarios"}, {"titulo": "En directo", "texto": "Si no puedes venir", "ruta": "/en-directo"}}},
}

// /en (Figma page 35). The raffle follows the user decision: Spanish law, €1 per ticket (no «open worldwide»).
var seedEN = map[string]any{
	"hero": map[string]any{"eyebrow": "Powerlifting · Valencia, Spain", "titulo": "GRStrength Cup", "tituloAcento": "2026",
		"texto":  "A regional powerlifting championship of the Spanish Powerlifting Association (AEP), held in Almussafes, 20 km south of Valencia.",
		"plazas": 150, "cta": "Register", "ctaSorteo": "Enter the raffle"},
	"compete": map[string]any{"eyebrow": "01 · Compete", "titulo": "How to", "tituloAcento": "register",
		"texto": "Registration is managed by the Spanish Powerlifting Association (AEP). A valid AEP licence is required to compete.",
		"items": []map[string]string{{"titulo": "Weight classes", "texto": "Men 59 kg to +120 kg · Women 47 kg to +84 kg (IPF open classes)."},
			{"titulo": "Equipment", "texto": "Classic (raw): IPF-approved belt, wrist wraps and knee sleeves."}, {"titulo": "Weigh-in", "texto": "Starts 2 hours before your session and lasts 1.5 hours."}}},
	"raffle": map[string]any{"eyebrow": "02 · Raffle", "titulo": "Win an", "tituloAcento": "SBD belt", "subtitulo": "Charity raffle",
		"texto":  "€1 per ticket. The winner is drawn live at the venue on the last day of competition. Who can take part is set out in the raffle terms, under Spanish law.",
		"imagen": bcdn + "frames/belt_output_webp/frame_000001.webp", "cta": "Buy tickets"},
	"travel": map[string]any{"eyebrow": "03 · Travel", "titulo": "Getting", "tituloAcento": "there",
		"items": []map[string]string{{"icono": "plane", "titulo": "By plane", "texto": "Valencia Airport (VLC) is about 35 km away.", "nota": "≈ 35 min by car"},
			{"icono": "train", "titulo": "By train", "texto": "Cercanías line C-2, Benifaió-Almussafes station.", "nota": "Check Renfe timetables"},
			{"icono": "car", "titulo": "By car", "texto": "About 20 km south of Valencia via the V-31.", "nota": "≈ 25 min"}}},
	"faq": map[string]any{"eyebrow": "04 · FAQ", "titulo": "Frequently asked", "tituloAcento": "questions",
		"items": []map[string]string{{"pregunta": "Can international lifters compete?", "respuesta": "Registration goes through the AEP and requires a valid AEP licence. Write to us and we will help you with the process."},
			{"pregunta": "Is the event open to spectators?", "respuesta": "Yes. Entry is free with a booking: you get a QR code by email for you and up to 3 companions."},
			{"pregunta": "Can I enter the raffle from abroad?", "respuesta": "The raffle follows Spanish law. Check who can take part in the raffle terms before buying a ticket."}}},
}

// Club directory (Figma page 32): clubs on the 2025 poster; locations to be confirmed («Datos de ejemplo»).
var seedClubs = []clubIn{
	{Nombre: "GRStrength", Ciudad: "Valencia", Provincia: "Valencia", LogoURL: bcdn + "logos/grcuplogo.png", Web: "https://www.instagram.com/grstrengthclub/", Etiquetas: "Powerlifting, Organizador", Rol: "organizador", AfiliadoAEP: true, Estado: "publicado"},
	{Nombre: "CF Isabel Atlas", Ciudad: "Valencia · por confirmar", Provincia: "Valencia", Etiquetas: "Powerlifting, AEP", Rol: "colaborador", AfiliadoAEP: true, Estado: "publicado"},
	{Nombre: "Gym Mediterrani", Ciudad: "Alcoy", Provincia: "Alicante", Etiquetas: "Powerlifting, Fuerza", Rol: "colaborador", Estado: "publicado"},
	{Nombre: "Valkyria Powerlifting Center", Ciudad: "Por confirmar", Provincia: "Valencia", LogoURL: logoValkyria, Etiquetas: "Powerlifting", Rol: "colaborador", Estado: "publicado"},
}

const ejemplo = "> **Datos de ejemplo.** Texto provisional pendiente de revisión por la asesoría legal antes de publicar la web.\n\n"

var seedLegal = map[string][2]string{
	"privacidad":     {"Política de privacidad", ejemplo + "## Responsable\nGR Strength (organizador de la GR Strength Cup).\n\n## Finalidades\n- Gestionar tu reserva de entradas y el acceso.\n- Enviarte avisos de la competición si lo aceptas expresamente (email o WhatsApp, por separado).\n- Gestionar el sorteo benéfico.\n\n## Base jurídica\nEjecución de la reserva y tu consentimiento, que puedes retirar en cualquier momento.\n\n## Conservación\nHasta 12 meses después del evento, salvo obligación legal.\n\n## Derechos\nAcceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a admin@grstrength.com. Puedes reclamar ante la AEPD."},
	"terminos":       {"Términos y condiciones", ejemplo + "## Entradas\nLas entradas son gratuitas y personales. La organización puede reasignar plazas no utilizadas.\n\n## Acceso\nSe valida el QR en la puerta. El aforo es limitado por sesión."},
	"cookies":        {"Política de cookies", ejemplo + "Solo usamos cookies técnicas necesarias para el funcionamiento de la web y de la sesión del backoffice."},
	"consentimiento": {"Consentimiento de datos e imagen", ejemplo + "Durante el evento se tomarán fotografías y vídeos que podrán publicarse en la web y redes de la competición. Los menores necesitan la autorización de su tutor."},
	"bases-sorteo":   {"Bases del sorteo benéfico", ejemplo + "## Organizador\nGR Strength.\n\n## Precio\n1 € por boleto.\n\n## Legalidad\nSorteo benéfico sujeto a la normativa española de juego y, en su caso, a la autorización autonómica correspondiente (Comunitat Valenciana). La venta no se activa hasta completar la checklist legal.\n\n## Mecánica\nLista de boletos cerrada antes del sorteo, semilla publicada y sorteo en directo.\n\n## Premio\nSegún se anuncie en la web. Los premios pueden estar sujetos a retención fiscal según la normativa vigente."},
}

var seedPaginas = []paginaIn{
	{Slug: "reglamento", Titulo: "Reglamento", Resumen: "Normas de competición (IPF/AEP).", Publicada: true, Cuerpo: "La competición sigue el reglamento técnico de la **IPF** adaptado por la **AEP**.\n\n- Tres intentos por movimiento: sentadilla, press de banca y peso muerto.\n- Tres jueces por intento; dos luces blancas validan el intento.\n- Clasificación por puntos IPF GL.\n\n*Datos de ejemplo: consulta el reglamento oficial de la AEP.*"},
	{Slug: "categorias-de-peso", Titulo: "Categorías de peso", Resumen: "Categorías IPF por sexo.", Publicada: true, Cuerpo: "| Mujeres | Hombres |\n|---|---|\n| 47 kg | 59 kg |\n| 52 kg | 66 kg |\n| 57 kg | 74 kg |\n| 63 kg | 83 kg |\n| 69 kg | 93 kg |\n| 76 kg | 105 kg |\n| 84 kg | 120 kg |\n| +84 kg | +120 kg |"},
	{Slug: "marcas-minimas", Titulo: "Marcas mínimas", Resumen: "Totales mínimos por categoría.", Publicada: true, Cuerpo: "Las marcas mínimas de participación las fija la AEP para cada temporada. *Datos de ejemplo: pendiente de publicar las de 2026.*"},
}

// seedGRCup fills the GR Cup content (idempotent: only collections that are still empty).
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, _ []string) error {
	if err := db.Migrate(ctx, a.DB, mustMigrations(), a.Log); err != nil {
		return err
	}
	s.init(a)
	var c struct {
		ID uuid.UUID `json:"id"`
	}
	if err := s.comp.Do(ctx, http.MethodGet, "/internal/competiciones/slug/grcup", nil, &c); err != nil {
		return errors.New("la competición grcup no existe todavía (ejecuta antes el seed de competition)")
	}
	cid := c.ID
	empty := func(tx pgx.Tx, table string) bool {
		var n int
		_ = tx.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE competition_id = $1`, cid).Scan(&n)
		return n == 0
	}
	err := db.Tx(ctx, a.DB, func(tx pgx.Tx) error {
		for pagina, contenido := range map[string]map[string]any{"home": seedSecciones, "publico": seedPublico, "en": seedEN} {
			var n int
			_ = tx.QueryRow(ctx, `SELECT count(*) FROM secciones WHERE competition_id = $1 AND pagina = $2`, cid, pagina).Scan(&n)
			if n > 0 {
				continue
			}
			if err := ensureSecciones(ctx, tx, cid, pagina); err != nil {
				return err
			}
			for k, v := range contenido {
				b, _ := json.Marshal(v)
				if _, err := tx.Exec(ctx, `UPDATE secciones SET borrador = $4, publicado = $4, publicado_at = now() WHERE competition_id = $1 AND pagina = $2 AND clave = $3`, cid, pagina, k, b); err != nil {
					return err
				}
			}
		}
		if empty(tx, "clubs") {
			for i, c := range seedClubs {
				if _, err := tx.Exec(ctx, `INSERT INTO clubs (id, competition_id, nombre, ciudad, provincia, logo_url, web, etiquetas, rol, afiliado_aep, estado, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
					newID(), cid, c.Nombre, c.Ciudad, c.Provincia, c.LogoURL, c.Web, c.Etiquetas, c.Rol, c.AfiliadoAEP, c.Estado, i+1); err != nil {
					return err
				}
			}
		}
		if empty(tx, "faq") {
			for i, f := range seedFAQ {
				if _, err := tx.Exec(ctx, `INSERT INTO faq (id, competition_id, categoria, pregunta, respuesta, destacada, publicada, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					newID(), cid, f.Categoria, f.Pregunta, f.Respuesta, f.Destacada, f.Publicada, i+1); err != nil {
					return err
				}
			}
		}
		if empty(tx, "patrocinadores") {
			for i, p := range seedPatro {
				if _, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
					newID(), cid, p.Nombre, p.Nivel, p.LogoURL, p.URL, p.Activo, i+1); err != nil {
					return err
				}
			}
		}
		if empty(tx, "legal") {
			for tipo, v := range seedLegal {
				if _, err := tx.Exec(ctx, `INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at) VALUES ($1,$2,$3,'2026-10',$4,$5,$6,now())`,
					newID(), cid, tipo, v[0], v[1], hashText(v[1])); err != nil {
					return err
				}
			}
		}
		if empty(tx, "paginas") {
			for i, p := range seedPaginas {
				if _, err := tx.Exec(ctx, `INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, publicada, orden) VALUES ($1,$2,'pagina',$3,$4,$5,$6,$7,$8)`,
					newID(), cid, p.Slug, p.Titulo, p.Resumen, p.Cuerpo, p.Publicada, i+1); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, portada_url, publicada) VALUES ($1,$2,'blog','abren-las-reservas',$3,$4,$5,$6,true)`,
				newID(), cid, "Abren las reservas de entradas", "La entrada es gratuita con reserva: así funciona.", "Ya puedes reservar tu entrada gratuita para la GR Strength Cup. *Datos de ejemplo.*", op+"30--central-pavello-almussafes-2.jpg"); err != nil {
				return err
			}
		}
		if empty(tx, "albumes") {
			fotos := []foto{{URL: op + "alfonso-fernandez--img-3276.jpg", Alt: "Sentadilla", FocalX: 50, FocalY: 40}, {URL: op + "alfonso-fernandez--img-3363.jpg", Alt: "Press de banca", FocalX: 50, FocalY: 50},
				{URL: op + "alfonso-fernandez--img-3364.jpg", Alt: "Peso muerto", FocalX: 50, FocalY: 45}, {URL: op + "30--central-pavello-almussafes-2.jpg", Alt: "El pabellón", FocalX: 50, FocalY: 50}}
			if _, err := tx.Exec(ctx, `INSERT INTO albumes (id, competition_id, titulo, slug, fotos, publicado) VALUES ($1,$2,'GR Cup 2025','gr-cup-2025',$3,true)`, newID(), cid, fotos); err != nil {
				return err
			}
		}
		{ // per route, so new routes reach existing environments
			for _, r := range [][3]string{{"/", "GR Strength Cup 2026 · Campeonato de powerlifting en Almussafes", "Campeonato de powerlifting AEP en Almussafes (Valencia). Entradas gratuitas con reserva, atletas, horarios y directo."},
				{"/preguntas-frecuentes", "Preguntas frecuentes · GR Strength Cup", "Entradas gratuitas, horarios, sorteo y cómo llegar al pabellón de Almussafes."},
				{"/patrocinadores", "Patrocinadores · GR Strength Cup", "Marcas y entidades que hacen posible la GR Strength Cup."},
				{"/publico", "Ver la competición · GR Strength Cup", "Entrada gratuita con reserva: qué verás, cómo se juzga un intento y normas de la grada en Almussafes."},
				{"/clubs", "Clubs de powerlifting en Valencia · GR Strength Cup", "Clubs y gimnasios de la Comunitat Valenciana, Murcia y Baleares donde entrenar powerlifting."},
				{"/en", "GRStrength Cup 2026 · Powerlifting competition in Valencia, Spain", "AEP powerlifting championship in Almussafes, 20 km south of Valencia. Free spectator entry, raffle and travel tips."}} {
				if _, err := tx.Exec(ctx, `INSERT INTO seo (id, competition_id, ruta, title, description, indexable) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (competition_id, ruta) DO NOTHING`, newID(), cid, r[0], r[1], r[2]); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err == nil {
		s.bump(ctx, cid)
		a.Log.Info("contenido de la GR Cup listo (Datos de ejemplo)", "competicion", cid)
	}
	return err
}

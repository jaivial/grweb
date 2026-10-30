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

// Seed content of the GR Cup home: the texts and photos of Figma page 05 («Datos de ejemplo» where the organiser must
// confirm). Photos are optimised copies under the public web (/img/home); logos and the belt come from the CDN.
const img = "/img/home/"

var seedSecciones = map[string]any{
	"hero":       map[string]any{"titulo": "Los ganadores nunca se rinden"},
	"campeonato": map[string]any{"titulo": "Campeonato de powerlifting", "subtitulo": "", "aviso": "Fecha por confirmar"},
	"cifras": map[string]any{"items": []map[string]string{{"valor": "150", "etiqueta": "Atletas inscritos"}, {"valor": "18", "etiqueta": "Categorías de peso"},
		{"valor": "3", "etiqueta": "Movimientos: S · B · D"}, {"valor": "AEP", "etiqueta": "Jueces oficiales"}}},
	"inscripciones": map[string]any{"titulo": "Inscripciones", "plazas": 150,
		"texto": "La inscripción y la lista de espera las gestiona la AEP. Mientras, conoce a quienes compiten y consulta su horario."},
	"entradas": map[string]any{"eyebrow": "Entrada gratuita · aforo limitado", "titulo": "Ven a vivirlo *en directo*", "tituloAcento": "",
		"texto": "La entrada es gratis, pero hay que reservarla: te llega un QR al email y entras sin colas. Una reserva sirve para ti y hasta 3 acompañantes.",
		"puntos": []map[string]string{{"titulo": "Gratis con reserva", "texto": "Tu QR llega al momento por email y lo tienes siempre en «Mi entrada»."},
			{"titulo": "Hasta 4 personas", "texto": "Una sola reserva para ti y tus acompañantes. Los menores entran con ella."},
			{"titulo": "Sorteo opcional · 1 € por boleto", "texto": "Súmate al sorteo del cinturón SBD al reservar. Se sortea en directo."}}},
	"atletas": map[string]any{"eyebrow": "01 · Los atletas", "titulo": "*Una competición*|hecha para|los atletas", "tituloAcento": "",
		"imagen": img + "atletas-1-l.webp", "alt": "Atleta compitiendo en powerlifting"},
	"dia": map[string]any{"eyebrow": "02 · El día de la competición", "titulo": "El día en el que|*todo el esfuerzo*|da sus frutos", "tituloAcento": "",
		"imagen": img + "atletas-2-l.webp", "alt": "Atleta concentrada antes de su intento"},
	"premios": map[string]any{"eyebrow": "02 · Premios", "titulo": "Premio para los mejores en *cada movimiento*", "tituloAcento": "", "lema": "¡Demuestra quién manda en cada movimiento!",
		"items": []map[string]string{{"titulo": "Sentadilla", "imagen": img + "premio-sentadilla.webp"}, {"titulo": "Press de banca", "imagen": img + "premio-banca.webp"},
			{"titulo": "Peso muerto", "imagen": img + "premio-muerto.webp"}}},
	"organizacion": map[string]any{"eyebrow": "03 · La competición", "titulo": "*Organización* y equipamiento", "tituloAcento": "",
		"texto": "Una competición diseñada para ofrecer la mejor experiencia tanto a atletas como a entrenadores, con jueces certificados y equipamiento de primera categoría.",
		"imagenes": []map[string]string{
			{"imagen": img + "org-aep-l.webp", "titulo": "Profesionalidad AEP", "texto": "Jueces y cargadores certificados AEP con equipamiento profesional de élite", "alt": "Plataforma de competición con público"},
			{"imagen": img + "org-entrenadores-l.webp", "titulo": "Entrenadores y atletas", "texto": "Estructura pensada para que cada entrenador pueda seguir de cerca a sus atletas", "alt": "Entrenador abrazando a su atleta"},
			{"imagen": img + "org-publico-l.webp", "titulo": "Abierto al público", "texto": "Plataforma y rack de competición con acceso para todo el público", "alt": "Grada llena durante la competición"},
			{"imagen": img + "org-carga-l.webp", "titulo": "Sesiones de carga", "texto": "Sesiones de carga donde la relación entrenador-atleta es fundamental", "alt": "Atleta concentrada en la sesión de carga"}}},
	"afiliaciones": map[string]any{"eyebrow": "04 · Organiza y avala", "titulo": "*Organizadores* y afiliaciones", "tituloAcento": "",
		"tarjetas": []map[string]string{
			{"tipo": "logo", "imagen": bcdn + "sponsors/compressedAEP.webp", "titulo": "AEP", "texto": "Afiliada a la Asociación Española de Powerlifting. Jueces oficiales garantizan el cumplimiento de las reglas en cada intento."},
			{"tipo": "foto", "imagen": img + "organizador.webp", "titulo": "GRStrength", "texto": "Organizado por el club GRStrength, reúne a la comunidad de powerlifting en un evento de alto nivel competitivo."}},
		"eyebrow2": "Material", "titulo2": "*Equipamiento* de competición",
		"texto2": "Equipamiento profesional de SBD y A7, marcas líderes en powerlifting con homologación internacional.",
		"marcas": []map[string]string{{"nombre": "SBD", "logo": ""}, {"nombre": "A7", "logo": bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp"}}},
	"sorteo": map[string]any{"eyebrow": "Sorteo benéfico", "titulo": "Sorteo", "subtitulo": "Entra en el sorteo de un cinturón SBD",
		"texto": "Cuantos más boletos, más oportunidades de ganar. Se sortea en directo durante la competición.", "imagen": bcdn + "frames/belt_output_webp/frame_000090.webp"},
	"categorias": map[string]any{"eyebrow": "05 · Competición", "titulo": "Categorías *de peso*", "tituloAcento": "", "texto": "Categorías oficiales de la AEP para hombres y mujeres.",
		"imagen": img + "categorias.webp", "ctaTitulo": "Consulta las marcas mínimas", "ctaTexto": "Para clasificar para otras competiciones AEP (PDF oficial)."},
	"horarios": map[string]any{"eyebrow": "06 · Programa", "titulo": "Horarios", "tituloAcento": "", "imagen": img + "horarios.webp"},
	"localizacion": map[string]any{"eyebrow": "07 · Sede", "titulo": "Localización", "tituloAcento": "", "texto": "Pabellón Municipal de Almussafes (Valencia).",
		"imagenes": []map[string]string{{"imagen": img + "sede-exterior-l.webp", "alt": "Entrada del pabellón de Almussafes"}, {"imagen": img + "sede-grada.webp", "alt": "Grada del pabellón"},
			{"imagen": img + "sede-instalaciones.webp", "alt": "Instalaciones del pabellón"}, {"imagen": img + "sede-pista.webp", "alt": "Pista central del pabellón"}},
		"mapa": img + "mapa.webp"},
	"faq":            map[string]any{"eyebrow": "08 · Preguntas frecuentes", "titulo": "Todo lo que *necesitas saber*", "tituloAcento": ""},
	"patrocinadores": map[string]any{"titulo": "Patrocinadores y colaboradores"},
}

var seedFAQ = []faqIn{
	{"Llegar", "¿Dónde se celebra la competición?", "En el Pabellón Municipal de Almussafes (Pavelló Poliesportiu, Avda. Laura Méndez s/n, 46440 Almussafes, Valencia). En la sección Localización tienes el mapa y el enlace a Google Maps.", true, true},
	{"Competición", "¿Cómo me inscribo?", "La inscripción y la lista de espera las gestiona la **AEP** desde su web. Desde aquí te enlazamos a su formulario.", true, true},
	{"Competición", "¿Qué categorías de peso hay?", "Las categorías oficiales de la AEP para hombres y mujeres. Consulta la página de [categorías de peso](/categorias-de-peso).", true, true},
	{"Competición", "¿Necesito una marca mínima?", "Para esta competición no hace falta marca mínima. Las [marcas mínimas](/marcas-minimas) sirven para clasificar a otras competiciones AEP.", true, true},
	{"Entradas", "¿Puede venir público? ¿Cuánto cuesta?", "Sí. La entrada es **gratuita**, pero hay que reservarla para controlar el aforo: te llega un QR por email para ti y hasta 3 acompañantes.", true, true},
	{"Sorteo", "¿Cómo funciona el sorteo?", "1 € por boleto. El sorteo es benéfico y se celebra en directo con lista cerrada y semilla publicada: cualquiera puede comprobar el resultado.", true, true},
	{"Entradas", "¿Cuántas personas puedo incluir en una reserva?", "Hasta 4 personas por reserva (tú y 3 acompañantes). Los menores entran con la reserva de un adulto.", false, true},
	{"Entradas", "¿Puedo entrar y salir del pabellón?", "Sí, conserva tu QR en el móvil: se puede volver a mostrar en la puerta. *Datos de ejemplo: pendiente de confirmar por la organización.*", false, true},
	{"Llegar", "¿Hay aparcamiento?", "Sí, hay aparcamiento junto al pabellón. *Datos de ejemplo.*", false, true},
}

var seedPatro = []patroIn{
	{"AEP", "institucional", bcdn + "sponsors/compressedAEP.webp", "https://powerliftingspain.es/", true, "Asociación Española de Powerlifting: avala la competición y aporta los jueces."},
	{"A7", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp", "", true, ""},
	{"Maniak Fitness", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_06_35.webp", "", true, ""},
	{"Valkyria Powerlifting Center", "plata", logoValkyria, "", true, ""},
	{"PHED", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_21.webp", "", true, ""},
	{"CF Isabel Atlas", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_25.webp", "", true, ""},
	{"Gym Mediterrani", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_27.webp", "", true, ""},
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
		// Figma 29: the 2025 photos, served by the public web (/img/edicion-2025)
		"items": []map[string]string{{"titulo": "Sentadilla", "imagen": "/img/edicion-2025/foto-3.webp", "alt": "Sentadilla en la plataforma, con los cargadores a los lados"},
			{"titulo": "Press de banca", "imagen": "/img/edicion-2025/foto-4.webp", "alt": "Atleta en el press de banca bajo el cartel de la competición"},
			{"titulo": "Peso muerto", "imagen": "/img/edicion-2025/foto-5.webp", "alt": "Peso muerto bloqueado bajo los focos del escenario"}}},
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
	{Nombre: "CF Isabel Atlas", Ciudad: "Valencia · por confirmar", Provincia: "Valencia", LogoURL: bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_25.webp", Etiquetas: "Powerlifting, AEP", Rol: "colaborador", AfiliadoAEP: true, Estado: "publicado"},
	{Nombre: "Gym Mediterrani", Ciudad: "Alcoy", Provincia: "Alicante", LogoURL: bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_27.webp", Etiquetas: "Powerlifting, Fuerza", Rol: "colaborador", Estado: "publicado"},
	{Nombre: "Valkyria Powerlifting Center", Ciudad: "Por confirmar", Provincia: "Valencia", LogoURL: logoValkyria, Etiquetas: "Powerlifting", Rol: "colaborador", Estado: "publicado"},
}

// SEO of the routes added after the first seed, inserted when their content is seeded.
var seedSeoRutas = map[string][3]string{
	"/publico": {"/publico", "Ver la competición · GR Strength Cup", "Entrada gratuita con reserva: qué verás, cómo se juzga un intento y normas de la grada en Almussafes."},
	"/clubs":   {"/clubs", "Clubs de powerlifting en Valencia · GR Strength Cup", "Clubs y gimnasios de la Comunitat Valenciana, Murcia y Baleares donde entrenar powerlifting."},
	"/en":      {"/en", "GRStrength Cup 2026 · Powerlifting competition in Valencia, Spain", "AEP powerlifting championship in Almussafes, 20 km south of Valencia. Free spectator entry, raffle and travel tips."},
}

func seedSeo(ctx context.Context, tx pgx.Tx, cid uuid.UUID, r [3]string) error {
	_, err := tx.Exec(ctx, `INSERT INTO seo (id, competition_id, ruta, title, description, indexable) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (competition_id, ruta) DO NOTHING`, newID(), cid, r[0], r[1], r[2])
	return err
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
	{Slug: "reglamento", Titulo: "Reglamento de powerlifting", Resumen: "Niveles AEP, intentos y jueces, los tres movimientos y el equipamiento raw.", Publicada: true, Cuerpo: "Página con diseño propio (Figma 23): el contenido lo pone la web. Aquí solo se usan el título, el resumen y el SEO."},
	{Slug: "categorias-de-peso", Titulo: "Categorías de peso y edad", Resumen: "Las 18 categorías de peso de la AEP, las divisiones por edad y el pesaje.", Publicada: true, Cuerpo: "Página con diseño propio (Figma 21–22): el contenido lo pone la web. Aquí solo se usan el título, el resumen y el SEO."},
	{Slug: "marcas-minimas", Titulo: "Marcas mínimas AEP-1", Resumen: "Totales mínimos AEP-1 por categoría y división, y cómo se acreditan.", Publicada: true, Cuerpo: "Página con diseño propio (Figma 21–22): el contenido lo pone la web. Aquí solo se usan el título, el resumen y el SEO."},
}

// seedGRCup fills the GR Cup content (idempotent: only collections that are still empty). With «--home-v2» it also
// rewrites the home of an existing edition with the Figma content (sections, order and visibility, the featured
// FAQ and the missing sponsors): used once to bring an edition seeded before the fidelity review up to date.
func (s *Svc) seedGRCup(ctx context.Context, a *app.App, args []string) error {
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
			// The SEO entry of a landing is seeded together with its content (only once: a deleted entry stays deleted).
			if r, ok := seedSeoRutas["/"+pagina]; ok {
				if err := seedSeo(ctx, tx, cid, r); err != nil {
					return err
				}
			}
			for k, v := range contenido {
				b, _ := json.Marshal(v)
				if _, err := tx.Exec(ctx, `UPDATE secciones SET borrador = $4, publicado = $4, publicado_at = now() WHERE competition_id = $1 AND pagina = $2 AND clave = $3`, cid, pagina, k, b); err != nil {
					return err
				}
			}
		}
		if len(args) > 0 && args[0] == "--home-v2" {
			if err := homeV2(ctx, tx, cid); err != nil {
				return err
			}
			a.Log.Info("home reescrita con el contenido de Figma (v2)", "competicion", cid)
		}
		if empty(tx, "clubs") {
			if err := seedSeo(ctx, tx, cid, seedSeoRutas["/clubs"]); err != nil {
				return err
			}
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
				if _, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, descripcion, orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
					newID(), cid, p.Nombre, p.Nivel, p.LogoURL, p.URL, p.Activo, p.Descripcion, i+1); err != nil {
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
			// The 2025 photos served by the public web (Figma 28); the real album is uploaded from the backoffice.
			fotos := []foto{
				{URL: "/img/edicion-2025/foto-1.webp", Alt: "Atleta delante de la barra antes de su peso muerto", FocalX: 50, FocalY: 35, Etiqueta: "plataforma"},
				{URL: "/img/edicion-2025/foto-2.webp", Alt: "Atleta concentrada con cascos antes de su intento", FocalX: 50, FocalY: 35, Etiqueta: "calentamiento"},
				{URL: "/img/edicion-2025/foto-3.webp", Alt: "Sentadilla en la plataforma, con los cargadores a los lados", FocalX: 50, FocalY: 35, Etiqueta: "plataforma"},
				{URL: "/img/edicion-2025/foto-4.webp", Alt: "Atleta en el press de banca bajo el cartel de la competición", FocalX: 50, FocalY: 35, Etiqueta: "plataforma"},
				{URL: "/img/edicion-2025/foto-5.webp", Alt: "Peso muerto bloqueado bajo los focos del escenario", FocalX: 50, FocalY: 35, Etiqueta: "plataforma"},
				{URL: "/img/edicion-2025/foto-6.webp", Alt: "Cinturón y muñequeras colgados de una barra en la zona de calentamiento", FocalX: 50, FocalY: 35, Etiqueta: "calentamiento"},
				{URL: "/img/edicion-2025/foto-7.webp", Alt: "Un compañero ajusta el cinturón de un atleta antes de salir", FocalX: 50, FocalY: 35, Etiqueta: "calentamiento"},
				{URL: "/img/edicion-2025/foto-8.webp", Alt: "Atleta concentrado antes de salir a la plataforma", FocalX: 50, FocalY: 35, Etiqueta: "ambiente"},
			}
			if _, err := tx.Exec(ctx, `INSERT INTO albumes (id, competition_id, titulo, slug, fotos, publicado) VALUES ($1,$2,'GR Cup 2025','gr-cup-2025',$3,true)`, newID(), cid, fotos); err != nil {
				return err
			}
		}
		if empty(tx, "seo") {
			for _, r := range [][3]string{{"/", "GR Strength Cup 2026 · Campeonato de powerlifting en Almussafes", "Campeonato de powerlifting AEP en Almussafes (Valencia). Entradas gratuitas con reserva, atletas, horarios y directo."},
				{"/preguntas-frecuentes", "Preguntas frecuentes · GR Strength Cup", "Entradas gratuitas, horarios, sorteo y cómo llegar al pabellón de Almussafes."},
				{"/patrocinadores", "Patrocinadores · GR Strength Cup", "Marcas y entidades que hacen posible la GR Strength Cup."}} {
				if err := seedSeo(ctx, tx, cid, r); err != nil {
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

// homeV2 rewrites the home of an edition with the content of Figma page 05: every section (draft and published),
// the default order and visibility, the six featured questions and the sponsors that are missing.
func homeV2(ctx context.Context, tx pgx.Tx, cid uuid.UUID) error {
	if err := ensureSecciones(ctx, tx, cid, "home"); err != nil {
		return err
	}
	for i, d := range Secciones {
		b, _ := json.Marshal(seedSecciones[d.Clave])
		if _, err := tx.Exec(ctx, `UPDATE secciones SET borrador = $4, publicado = $4, orden = $5, pub_orden = $5, visible = true, pub_visible = true, publicado_at = now(), version = version + 1
			WHERE competition_id = $1 AND pagina = $2 AND clave = $3`, cid, "home", d.Clave, b, i+1); err != nil {
			return err
		}
	}
	// FAQ: the featured ones are exactly those of Figma (added when missing); the rest stay but are not featured
	if _, err := tx.Exec(ctx, `UPDATE faq SET destacada = false WHERE competition_id = $1`, cid); err != nil {
		return err
	}
	for i, f := range seedFAQ {
		tag, err := tx.Exec(ctx, `UPDATE faq SET destacada = $3, publicada = true, orden = $4 WHERE competition_id = $1 AND pregunta = $2`, cid, f.Pregunta, f.Destacada, i+1)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO faq (id, competition_id, categoria, pregunta, respuesta, destacada, publicada, orden) VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
				newID(), cid, f.Categoria, f.Pregunta, f.Respuesta, f.Destacada, i+1); err != nil {
				return err
			}
		}
	}
	for i, p := range seedPatro {
		if _, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, orden)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE NOT EXISTS (SELECT 1 FROM patrocinadores WHERE competition_id = $2 AND nombre = $3)`,
			newID(), cid, p.Nombre, p.Nivel, p.LogoURL, p.URL, p.Activo, i+1); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE patrocinadores SET orden = $3 WHERE competition_id = $1 AND nombre = $2`, cid, p.Nombre, i+1); err != nil {
			return err
		}
	}
	return nil
}

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

const bcdn = "https://jaimedigitalstudio.b-cdn.net/grcup/"

// Seed content of the GR Cup home: the texts and photos of Figma page 05 («Datos de ejemplo» where the organiser must
// confirm). Photos are optimised copies under the public web (/img/home); logos and the belt come from the CDN.
const img = "/img/home/"

var seedSecciones = map[string]any{
	"hero":       map[string]any{"titulo": "Los ganadores nunca se rinden"},
	"campeonato": map[string]any{"titulo": "Campeonato de powerlifting", "subtitulo": "", "aviso": ""},
	"cifras": map[string]any{"items": []map[string]string{{"valor": "150", "etiqueta": "Atletas en competición"}, {"valor": "18", "etiqueta": "Categorías de peso"},
		{"valor": "3", "etiqueta": "Movimientos: S · B · D"}, {"valor": "AEP", "etiqueta": "Jueces oficiales"}}},
	"alta-atleta": map[string]any{"eyebrow": "GR Cup 2026 · Alta de atleta", "titulo": "Crea tu perfil de atleta",
		"texto": "Si compites en la GR Cup 2026, crea tu perfil de atleta: foto, club y mejores marcas. Lo revisamos a mano y lo publicamos en la lista de atletas.",
		"cta":   "Dar de alta mi atleta"},
	"entradas": map[string]any{"eyebrow": "Entrada gratuita · aforo limitado", "titulo": "Ven a vivirlo *en directo*", "tituloAcento": "",
		"texto": "La entrada es gratis, pero hay que reservarla: te llega un QR al email y entras sin colas. Una reserva sirve para ti y hasta 3 acompañantes.",
		"puntos": []map[string]string{{"titulo": "Gratis con reserva", "texto": "Tu QR llega al momento por email y lo tienes siempre en «Mi entrada»."},
			{"titulo": "Hasta 4 personas", "texto": "Una sola reserva para ti y tus acompañantes. Los menores entran con ella."},
			{"titulo": "Rifa presencial", "texto": "Durante el evento hay rifa de material: boletos solo en efectivo en el recinto."}}},
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
	"sorteo": map[string]any{"titulo": "Rifa de *material* en el recinto",
		"texto": "Durante la competición rifamos material y premios donados. Los boletos se compran en el stand de la rifa, solo en efectivo.", "imagen": bcdn + "frames/belt_output_webp/frame_000090.webp"},
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
	{"Atletas", "¿Cómo completo mi ficha de atleta?", "Rellena el [formulario de alta de atleta](/alta-atleta) con tu nombre, el email con el que te inscribiste en la AEP, tu club y tus mejores marcas. Añade una foto si quieres: se publica en blanco y negro y recortada. El equipo revisa cada solicitud a mano y, cuando la aprueba, tu ficha aparece en la [lista de atletas](/atletas).", true, true},
	{"Competición", "¿Cómo participo en la GR Cup?", "La inscripción y la lista de espera las gestiona la **AEP** y la plantilla está completa. Si compites en esta edición, lo que te falta es la ficha: [da de alta tu atleta](/alta-atleta) y te la revisamos a mano.", true, true},
	{"Competición", "¿Qué categorías de peso hay?", "Las categorías oficiales de la AEP para hombres y mujeres. Consulta la página de [categorías de peso](/categorias-de-peso).", true, true},
	{"Competición", "¿Necesito una marca mínima?", "Para esta competición no hace falta marca mínima. Las [marcas mínimas](/marcas-minimas) sirven para clasificar a otras competiciones AEP.", true, true},
	{"Entradas", "¿Puede venir público? ¿Cuánto cuesta?", "Sí. La entrada es **gratuita**, pero hay que reservarla para controlar el aforo: te llega un QR por email para ti y hasta 3 acompañantes.", true, true},
	{"Sorteo", "¿Cómo funciona la rifa?", "La rifa es presencial: los boletos se compran en efectivo en el stand de la rifa durante el evento. No hay venta online. Consulta los objetos en la [página de la rifa](/sorteo).", true, true},
	{"Entradas", "¿Cuántas personas puedo incluir en una reserva?", "Hasta 4 personas por reserva (tú y 3 acompañantes). Los menores entran con la reserva de un adulto.", false, true},
	{"Entradas", "¿Puedo entrar y salir del pabellón?", "Sí, conserva tu QR en el móvil: se puede volver a mostrar en la puerta. *Datos de ejemplo: pendiente de confirmar por la organización.*", false, true},
	{"Llegar", "¿Hay aparcamiento?", "Sí, hay aparcamiento junto al pabellón. *Datos de ejemplo.*", false, true},
}

var seedPatro = []patroIn{
	{"AEP", "institucional", bcdn + "sponsors/compressedAEP.webp", "https://powerliftingspain.es/", true, "Asociación Española de Powerlifting: avala la competición y aporta los jueces.", nil},
	{"A7", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_05_00.webp", "", true, "", nil},
	{"Maniak Fitness", "oro", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_06_35.webp", "", true, "", nil},
	{"Valkyria Powerlifting Center", "plata", logoValkyria, "", true, "", nil},
	{"PHED", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_21.webp", "", true, "", nil},
	{"CF Isabel Atlas", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_25.webp", "", true, "", nil},
	{"Gym Mediterrani", "colaborador", bcdn + "sponsors/ChatGPT%20Image%2029%20mar%202026%2C%2020_15_27.webp", "", true, "", nil},
	// BIZ-144: the three logos of the hero row (Figma 199:100283), the only ones with «Mostrar en hero» on.
	{"GRStrength", "principal", "/img/home/patro-str.webp", "https://grstrength.com", true, "", &enHero},
	{"GRS Powerlifting Coaching", "principal", "/img/home/patro-coa.webp", "", true, "", &enHero},
	{"Ajuntament d'Almussafes", "institucional", "/img/home/patro-alm.webp", "https://www.almussafes.net", true, "", &enHero},
}

var enHero = true

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
		"plazas": 150, "ctaSorteo": "Enter the raffle"},
	"compete": map[string]any{"eyebrow": "01 · Compete", "titulo": "How to", "tituloAcento": "compete",
		"texto": "Registration was managed by the Spanish Powerlifting Association (AEP) and the field is complete. If you compete in this edition, complete your athlete profile (in Spanish): the team reviews it by hand and publishes it in the athlete list.",
		"cta":   "Athlete sign-up (Spanish)",
		"items": []map[string]string{{"titulo": "Weight classes", "texto": "Men −53 to +120 kg · Women −43 to +84 kg (IPF classes, −53 and −43 for sub-juniors and juniors)."},
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

// seedSeoAltaAtleta is the SEO row of the public athlete sign-up page (indexable).
var seedSeoAltaAtleta = [3]string{"/alta-atleta", "Alta de atleta de powerlifting | GR Strength Cup",
	"Date de alta como atleta de la GR Strength Cup: crea tu perfil, sube tu foto y tus marcas AEP y compite con tu ficha lista para el pesaje."}

func seedSeo(ctx context.Context, tx pgx.Tx, cid uuid.UUID, r [3]string) error {
	_, err := tx.Exec(ctx, `INSERT INTO seo (id, competition_id, ruta, title, description, indexable) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (competition_id, ruta) DO NOTHING`, newID(), cid, r[0], r[1], r[2])
	return err
}

const ejemplo = "> **Datos de ejemplo.** Texto provisional pendiente de revisión por la asesoría legal antes de publicar la web.\n\n"

// seedLegal: the exact texts of Figma 12–15 (dated 1 April 2026); cookies has no Figma page yet.
var seedLegal = map[string][2]string{
	"cookies": {"Política de cookies", ejemplo + "Solo usamos cookies técnicas necesarias para el funcionamiento de la web y de la sesión del backoffice."},
	"privacidad": {"Política de Privacidad", `## Responsable del Tratamiento

GR Strength Sitio web: https://www.grteam.net Email de contacto: admin@grstrength.com

## Datos que Recopilamos

Recopilamos únicamente los datos necesarios para participar en el sorteo del GR Cup:

- Email: Para enviar confirmación de compra y notificaciones del sorteo
- Nombre y Apellido: Para identificar al ganador del premio
- Instagram: Para seguimiento y comunicación con los participantes (opcional)
- Datos de pago: Procesados directamente por Stripe, no almacenamos datos de tarjetas

## Finalidad del Tratamiento

Utilizamos tus datos exclusivamente para:

- Procesar tu compra de tickets del sorteo
- Enviar confirmaciones y actualizaciones sobre el sorteo
- Contactar al ganador para organizar la entrega del premio
- Cumplir con las obligaciones legales aplicables

## Procesamiento de Pagos

Todos los pagos son procesados por Stripe, un proveedor de pagos externo certificado PCI-DSS. GR Cup no almacena ningún dato de tarjeta de crédito o débito. Los datos de pago se transfieren directamente entre tu banco y Stripe de forma segura.

## Retención de Datos

Conservamos tus datos personales durante el tiempo necesario para completar el sorteo y cumplir con nuestras obligaciones legales. Los datos de participantes se eliminan 30 días después de la celebración del sorteo, excepto los datos del ganador que se conservan para cumplimiento fiscal.

## Tus Derechos

Tienes los siguientes derechos sobre tus datos personales:

- Acceso: Solicitar una copia de tus datos
- Rectificación: Corregir datos inexactos
- Supresión: Solicitar la eliminación de tus datos
- Oposición: Oponerte al tratamiento
- Portabilidad: Recibir tus datos en formato estructurado

Para ejercer cualquiera de estos derechos, contacta con nosotros en admin@grstrength.com.

## Cookies

No utilizamos cookies de seguimiento o publicidad. Nuestro sitio solo usa cookies técnicas esenciales para el funcionamiento del carrito de compras y el proceso de pago, las cuales son necesarias para prestar el servicio solicitado.

## Seguridad

Implementamos medidas de seguridad técnicas y organizativa apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Toda la comunicación con nuestro sitio está cifrada mediante TLS/SSL.

## Cambios a esta Política

Podemos actualizar esta Política de Privacidad periódicamente. Cualquier cambio será publicado en esta página con una fecha de "última actualización" revisada. Te recomendamos revisar esta política regularmente.

## Contacto

Si tienes preguntas sobre esta Política de Privacidad, contacta con nosotros:

admin@grstrength.com`},
	"terminos": {"Términos de Servicio", `## Aceptación de los Términos

Al acceder y participar en el sorteo del GR Cup, aceptas estos Términos de Servicio en su totalidad. Si no estás de acuerdo con alguno de estos términos, por favor no participes en el sorteo.

## El Sorteo

El GR Cup 2026 es un sorteo organizado por GR Strength. Cada ticket tiene un precio de 0,50 € (cincuenta céntimos de euro).

- El premio consiste en productos y experiencias relacionadas con powerlifting
- El sorteo se realizará de forma aleatoria
- Los fondos obtenidos se destinan a cubrir los costes del evento y los premios

## Elegibilidad

Para participar en el sorteo debes:

- Tener al menos 18 años de edad
- Proporcionar información veraz y completa durante la compra
- Disponer de un método de pago válido
- No estar empleado por GR Strength ni ser familiar directo de los organizadores

## Compra de Tickets

Al comprar tickets aceptas lo siguiente:

- Cada entrada adquirida representa una entrada válida para el sorteo
- Los tickets no son reembolsables una vez comprado
- El precio del ticket es de 0,50 € por unidad
- Puedes comprar múltiples tickets para aumentar tus probabilidades
- Los entradas adquiridas se confirmarán mediante email

## Selección del Ganador

El ganador del sorteo será seleccionado de forma completamente aleatoria utilizando un sistema de selección aleatoria certificado. El proceso se realizará en directo y se publicará en nuestras redes sociales.

- Se seleccionará un (1) ganador principal
- El ganador será contactado por email en un plazo de 48 horas
- Si el ganador no responde en 7 días, se seleccionará un nuevo ganador
- La decisión es final y no admite apelación

## Pago y Procesamiento

Los pagos son procesados por Stripe, nuestro proveedor de servicios de pago externo. GR Cup no almacena datos de tu tarjeta de crédito o débito. Al realizar una compra, aceptas los términos y condiciones de Stripe.

## Entrega del Premio

Una vez confirmado el ganador, nos pondremos en contacto para coordinar la entrega del premio. El premio es intransferible y no puede canjearse por dinero en efectivo. Los costes de envío o recogida varierán según la ubicación del ganador.

## Limitación de Responsabilidad

GR Strength no será responsable de cualquier pérdida, daño o inconveniente causado por la participación en el sorteo, excepto en casos de negligencia grave o incumplimiento contractual. Nuestra responsabilidad total no excederá en ningún caso el valor del entrada adquirida.

## Modificaciones

GR Strength se reserva el derecho de modificar estos términos en cualquier momento. Los cambios significativos serán comunicados mediante email a los participantes. La participación continuada tras los cambios implica la aceptación de los nuevos términos.

## Ley Aplicable

Estos Términos de Servicio se rigen por las leyes de España. Cualquier controversia derivada de estos términos será resuelta en los tribunales competentes de España.

## Contacto

Si tienes preguntas sobre estos Términos de Servicio, contacta con nosotros:

admin@grstrength.com`},
	"consentimiento": {"Consentimiento de Datos", `## Información sobre el Tratamiento de Datos

En cumplimiento del Reglamento General de Protección de Datos (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), te informamos sobre cómo tratamos tus datos personales.

GR Strength, como responsable del tratamiento, necesita tu consentimiento explícito para recopilar y procesar tus datos personales con la finalidad de participar en el sorteo del GR Cup 2026.

## Responsable del Tratamiento

GR Strength Sitio web: https://www.grteam.net Email de contacto: admin@grstrength.com

## Datos Personales que Recopilamos

Con tu consentimiento, recopilamos los siguientes datos personales:

- Nombre completo: Para identificarte como participante y, en caso de ganar, para hacer efectivo el premio
- Correo electrónico: Para enviarte la confirmación de tu participación y notificaciones importantes sobre el sorteo
- Número de teléfono: Para contactarte en caso de resultar ganador
- Confirmación de seguimiento en Instagram: Para verificar el cumplimiento de los requisitos de participación
- Cantidad de entradas adquiridas: Para procesar tu participación en el sorteo

## Finalidad del Tratamiento

Tratamos tus datos personales con las siguientes finalidades:

- Gestionar tu inscripción y participación en el sorteo del GR Cup 2026
- Procesar el pago de los tickets adquiridos a través de Stripe
- Enviar confirmaciones de compra y actualizaciones sobre el estado del sorteo
- Contactar al ganador para organizar la entrega del premio
- Cumplir con las obligaciones legales aplicables en materia fiscal y de consumo

## Base Legal del Tratamiento

El tratamiento de tus datos personales se realiza bajo la siguiente base legal:

- Tu consentimiento explícito (Art. 6.1.a RGPD): Al marcar la casilla de aceptación de este consentimiento, autorizas expresamente a GR Strength a tratar tus datos personales para los fines descritos.

El suministro de datos es voluntario, pero necesario para participar en el sorteo. Si no proporcionas los datos requeridos, no podrás participar en el sorteo del GR Cup 2026.

## Destinatarios de los Datos

Tus datos personales pueden ser comunicados a los siguientes terceros:

- Stripe: Para el procesamiento de pagos. Los datos de tu tarjeta de crédito/débito son tratados directamente por Stripe bajo su propia política de privacidad.
- Proveedores de servicios técnicos: Empresas que nos ayudan a operar nuestro sitio web y sistemas de manera segura.
- Autoridades legales: Cuando sea requerido por ley o para proteger nuestros derechos legales.

No vendemos, alquilamos ni cedemos tus datos personales a terceros con fines de marketing.

## Plazo de Conservación

Conservamos tus datos personales durante el tiempo necesario para cumplir con los fines para los que fueron recopilados. Concretamente:

- Datos de participantes: Se eliminarán 30 días después de la celebración del sorteo, salvo los datos del ganador que se conservan durante 5 años para cumplimiento fiscal.
- Datos de pago: Conservamos los registros de transacción durante el periodo requerido por la normativa fiscal española (mínimo 5 años).

## Tus Derechos

Tienes los siguientes derechos sobre tus datos personales:

- Acceso: Obtener confirmación de si estamos tratando tus datos y acceder a los mismos.
- Rectificación: Corregir datos inexactos o incompletos.
- Supresión: Solicitar la eliminación de tus datos cuando ya no sean necesarios para los fines iniciales.
- Limitación: Solicitar que limitemos el tratamiento de tus datos en determinadas circunstancias.
- Oposición: Oponerte al tratamiento de tus datos.
- Portabilidad: Recibir tus datos en un formato estructurado y transferirlos a otro responsable.
- Revocación: Retirar tu consentimiento en cualquier momento, sin afectar a la licitud del tratamiento previo.

Para ejercer cualquiera de estos derechos, contacta con nosotros en admin@grstrength.com. Responderemos a tu solicitud en el plazo máximo de un mes.

## Medidas de Seguridad

Implementamos medidas de seguridad técnicas y organizativa apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:

- Cifrado de datos en tránsito mediante TLS/SSL
- Acceso restringido a datos personales solo para personal autorizado
- Monitoreo continuo de nuestros sistemas para detectar vulnerabilidades
- Respaldo periódico de datos

## Transferencias Internacionales

Algunos de nuestros proveedores de servicios (como Stripe) pueden transferir tus datos a países fuera del Espacio Económico Europeo (EEE). En tales casos, nos aseguramos de que existen garantías adecuadas, como cláusulas contractuales tipo aprobadas por la Comisión Europea.

## Derecho a Reclamar

Sin perjuicio de cualquier otro recurso administrativo o judicial, tienes derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) si consideras que el tratamiento de tus datos personales vulnera la normativa de protección de datos.

Más información: https://www.aepd.es

## Contacto

Si tienes preguntas sobre este Consentimiento de Datos o sobre cómo tratamos tus datos personales, contacta con nosotros:

admin@grstrength.com`},
	"bases-sorteo": {"Política del Concurso", `## Aceptación de las Bases

Al participar en el sorteo del GR Cup 2026, aceptas íntegramente estas bases y condiciones. Si no estás de acuerdo con alguno de los términos aquí establecidos, por favor no participes en el sorteo. La participación implica la aceptación plena de estas condiciones.

## Organizador del Concurso

El sorteo del GR Cup 2026 está organizado por GR Strength, con domicilio en España y dirección de contacto admin@grstrength.com.

## Periodo de Participación

El periodo de participación en el sorteo del GR Cup 2026 comprende desde la fecha de inicio hasta la fecha de cierre indicadas en la página oficial del sorteo. Las fechas específicas serán comunicadas a través de:

- La página web oficial del sorteo
- Las redes sociales de GR Strength (Instagram: @grstrength)
- Comunicados por correo electrónico a los participantes registrados

## Elegibilidad para Participar

Requisitos obligatorios:

- Tener al menos 18 años de edad en el momento de la participación
- Disponer de un documento de identidad válido (DNI, NIE, pasaporte o equivalente)
- Tener capacidad legal para celebrar contratos
- Proporcionar información veraz, completa y actualizada durante el registro
- Disponer de una cuenta de correo electrónico válida
- Disponer de un número de teléfono móvil para recibir notificaciones

Requisitos adicionales para ser elegible:

- Seguir la cuenta oficial de Instagram de GR Strength (@grstrength) durante todo el periodo del sorteo
- Completar correctamente todos los campos del formulario de inscripción
- Aceptar el presente política del concurso
- Aceptar el tratamiento de sus datos personales conforme al consentimiento informado

No pueden participar: Empleados de GR Strength ni sus familiares directos (hasta primer grado de consanguinidad o afinidad), ni personas involucradas en la organización técnica del sorteo.

## Precio y Compra de Tickets

Cada ticket de participación tiene un precio de 0,50 € (cincuenta céntimos de euro), IVA incluido.

- Puedes comprar tantos tickets como desees para aumentar tus probabilidades de ganar
- Cada entrada adquirida genera una entrada única en el sorteo
- Los tickets no son transferibles ni canjeables por dinero en efectivo
- Los tickets no son reembolsables una vez completada la compra
- El pago se realiza exclusivamente a través de Stripe Checkout con tarjeta de crédito o débito
- Métodos de pago aceptados: Visa, Mastercard, American Express, y otros según disponibilidad de Stripe

La compra de tickets se confirmará mediante un correo electrónico de confirmación enviado a la dirección proporcionada durante el registro.

## Premio

El premio del sorteo del GR Cup 2026 consiste en:

- [Descripción del premio] - Un cinturón SBD de alta calidad
- El premio es intransferible
- El premio no puede canjearse por dinero en efectivo o cualquier otro producto
- GR Strength se reserva el derecho de substituir el premio por otro de valor equivalente en caso de indisponibilidad

El valor total del premio no excederá los 500 €.

## Selección del Ganador

El ganador del sorteo será seleccionado mediante selección aleatoria pura utilizando un sistema de generación de números aleatorios certificado.

- Se realizará un único sorteo para determinar al ganador del premio principal
- El sorteo se realizará en la fecha indicada, públicamente a través de redes sociales
- El proceso de selección será grabado en video para garantizar la transparencia
- Se generará un registro digital del resultado del sorteo

Probabilidades de ganar: Las probabilidades de ganar son proporcionales al número de entradas adquiridas. Si compras 1 ticket de un total de 100 tickets vendidos, tu probabilidad de ganar es de 1%.

## Notificación y Entrega del Premio

El ganador será notificado de la siguiente manera:

- Correo electrónico: Se enviará un email a la dirección proporcionada durante la compra
- Publicación en redes sociales: Se anunciará el ganador (solo el nombre de pila) en Instagram y en la web oficial
- Plazo de respuesta: El ganador dispone de 7 días naturales para responder y confirmar sus datos

Si el ganador no responde en el plazo indicado, no es elegible, o renuncia al premio, se procederá a seleccionar un ganador alternativo siguiendo el mismo procedimiento aleatorio.

La entrega del premio se coordinará directamente con el ganador. Los costes de envío corren a cargo de GR Strength para destinos en España. Para destinos internacionales, pueden aplicarse costes adicionales de envío que serán comunicados previamente.

## Prevención de Fraude

GR Strength se compromete a garantizar la integridad del sorteo. Está estrictamente prohibido:

- Utilizar cuentas de Instagram falsas o múltiplos para inflar las probabilidades
- Proporcionar información falsa o identidad ajena durante el registro
- Realizar compras de tickets mediante tarjetas de crédito robadas o fraudulentas
- Manipular el proceso de selección del ganador
- Cualquier otra acción que infrinja la legislación vigente

Consecuencias: Si se detecta cualquier intento de fraude, GR Strength se reserva el derecho de descalificar al participante infractor, cancelar sus tickets sin reembolso, y emprender las acciones legales pertinentes.

## Limitación de Responsabilidad

GR Strength no será responsable de:

- Fallos técnicos, errores de software o hardware que puedan afectar al proceso de compra o al sorteo
- Inscripciones perdidas, retrasadas, incompletas o defectuosas por causas técnicas
- Interrupciones del servicio de Internet o de la plataforma de pago
- Datos proporcionados incorrectamente por el participante
- Cualquier daño indirecto, incidental o consecuente derivados de la participación en el sorteo

La responsabilidad total de GR Strength en relación con este sorteo no excederá, en ningún caso, el valor total de los entradas adquiridas por el participante afectado.

## Modificaciones y Cancelación

GR Strength se reserva el derecho de:

- Modificar estas bases: Cualquier cambio será comunicado con antelación razonable a través de la página web y correo electrónico a los participantes registrados
- Cancelar el sorteo: En caso de circunstancias imprevistas, fuerza mayor, o problemas técnicos graves, GR Strength puede cancelar el sorteo. En tal caso, se reembolsará el importe de los entradas adquiridas a todos los participantes
- Suspender temporalmente: El sorteo puede ser suspendido temporalmente para resolver problemas técnicos

La participación continuada tras la comunicación de modificaciones implica la aceptación de las nuevas bases.

## Ley Aplicable y Jurisdicción

Este concurso se rige por las leyes de España.

Para cualquier controversia derivada de la interpretación o ejecución de estas bases, las partes se someten a los tribunales competentes de España, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.

Antes de iniciar cualquier acción legal, el participante se compromete a contactar con GR Strength para intentar resolver cualquier dispute de manera amistosa.

## Información sobre el Premio y DISCLAIMER

El premio se describe en la sección 6 de este documento. Las imágenes utilizadas en el material promocional son orientativas y pueden no corresponder exactamente con el premio real.

GR Strength no ofrece ninguna garantía, explícita o implícita, sobre el premio, incluyendo garantías de comerciabilidad o idoneidad para un propósito particular.

## Contacto

Si tienes preguntas sobre esta Política del Concurso, contacta con nosotros:

admin@grstrength.com`},
}

// legalBorrador is a version of a legal text that is not published: the organiser reviews it and publishes it.
type legalBorrador struct {
	Version   string
	Titulo    string
	Contenido string
}

// seedLegalBorrador: texts of the athlete sign-up (the public form /alta-atleta): the consent to publish the photo
// and the sports data (web, screen and live stream) and the WhatsApp consent. They are seeded as DRAFTS: the
// organiser has to review them with the legal advice before publishing them.
var seedLegalBorrador = map[string]legalBorrador{
	"consentimiento": {Version: "2026-11", Titulo: "Consentimiento de datos e imagen", Contenido: ejemplo + `## Qué autorizas
Al marcar esta casilla autorizas a GR Strength (organizador de la GR Strength Cup) a publicar tu nombre, tus datos deportivos (club, categoría, división y marcas) y tu foto en la web de la competición, en la pantalla del pabellón y en la retransmisión en directo de la GR Cup.

## Quién ve esos datos
El público que visite la web o la pantalla del pabellón y los espectadores de la retransmisión en directo. Tu email y tu teléfono no se publican.

## La foto
Se publica en blanco y negro, recortada y comprimida para que todas las fichas sean uniformes. Puedes pedir que se retire en cualquier momento.

## Menores
Si tienes menos de 18 años, necesitaremos la autorización firmada de tu madre, padre o tutor antes de publicar tu ficha.

## Retirada
Escribe a admin@grstrength.com para pedir que retiremos tu foto y tu ficha de la web y del CDN.`},
	"whatsapp": {Version: "whatsapp-2026-11", Titulo: "Consentimiento de WhatsApp", Contenido: ejemplo + `## Qué mensajes recibes
Si marcas esta casilla, GR Strength te escribe por WhatsApp para avisarte de tu alta de atleta (recibida, aprobada o rechazada) y de los avisos de la competición (pesaje, horarios y cambios de última hora).

## Quién recibe los mensajes
Tú y, si tu solicitud se acepta, el equipo de la organización. No hay grupos ni terceros.

## Tu número
Guardamos tu número solo para estos avisos, junto con la fecha en que aceptaste y la versión de este texto.

## Cómo darte de baja
Responde BAJA a cualquiera de nuestros mensajes: dejamos de escribirte y retiramos el consentimiento. También puedes escribir a admin@grstrength.com.`},
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
				if _, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, descripcion, orden, mostrar_en_hero) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
					newID(), cid, p.Nombre, p.Nivel, p.LogoURL, p.URL, p.Activo, p.Descripcion, i+1, p.MostrarEnHero != nil && *p.MostrarEnHero); err != nil {
					return err
				}
			}
		}
		if empty(tx, "legal") {
			for tipo, v := range seedLegal {
				if _, err := tx.Exec(ctx, `INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash, publicado_at) VALUES ($1,$2,$3,'2026-04',$4,$5,$6,'2026-04-01 10:00:00+02')`,
					newID(), cid, tipo, v[0], v[1], hashText(v[1])); err != nil {
					return err
				}
			}
		}
		// Los textos legales nuevos del alta de atleta se siembran como borrador (los publica la organización).
		for tipo, v := range seedLegalBorrador {
			if _, err := tx.Exec(ctx, `INSERT INTO legal (id, competition_id, tipo, version, titulo, contenido, hash) VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT (competition_id, tipo, version) DO NOTHING`,
				newID(), cid, tipo, v.Version, v.Titulo, v.Contenido, hashText(v.Contenido)); err != nil {
				return err
			}
		}
		// SEO de la página pública de alta de atleta (indexable).
		if err := seedSeo(ctx, tx, cid, seedSeoAltaAtleta); err != nil {
			return err
		}
		if empty(tx, "paginas") {
			for i, p := range seedPaginas {
				if _, err := tx.Exec(ctx, `INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, publicada, orden) VALUES ($1,$2,'pagina',$3,$4,$5,$6,$7,$8)`,
					newID(), cid, p.Slug, p.Titulo, p.Resumen, p.Cuerpo, p.Publicada, i+1); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `INSERT INTO paginas (id, competition_id, tipo, slug, titulo, resumen, cuerpo, portada_url, publicada, categoria) VALUES ($1,$2,'blog','abren-las-reservas',$3,$4,$5,$6,true,'noticias')`,
				newID(), cid, "Abren las reservas de entradas", "La entrada es gratuita con reserva: así funciona.", "Ya puedes reservar tu entrada gratuita para la GR Strength Cup. *Datos de ejemplo.*", "/img/home/sede-exterior-l.webp"); err != nil {
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
		if _, err := tx.Exec(ctx, `INSERT INTO patrocinadores (id, competition_id, nombre, nivel, logo_url, url, activo, orden, mostrar_en_hero)
			SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9 WHERE NOT EXISTS (SELECT 1 FROM patrocinadores WHERE competition_id = $2 AND nombre = $3)`,
			newID(), cid, p.Nombre, p.Nivel, p.LogoURL, p.URL, p.Activo, i+1, p.MostrarEnHero != nil && *p.MostrarEnHero); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE patrocinadores SET orden = $3 WHERE competition_id = $1 AND nombre = $2`, cid, p.Nombre, i+1); err != nil {
			return err
		}
	}
	return nil
}

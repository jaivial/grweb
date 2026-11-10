/* Generated from Figma «02 · Componentes» (11:75), GRSCup tzKtC31ZXYMlGMh7vAuFTq: label copy and variant positions
 * (x, y inside each component set) for the /_componentes QA sheet. Regenerate from Figma, do not edit by hand. */

/** [nodeId, section heading | null, label title | null, label description | null] in page order. */
export const ETIQUETAS: [string, string | null, string | null, string | null][] = [
[
"80:155152",
null,
"Button",
"Variant × State × Size. Primary = CTA \"Inscribirse\" (gradiente accent → accent-deep, radio 8). Display = \"Participa ya\" (Contrail One, accent-deep 85 %, radio 12). Pill = \"Compra ya\"."
],
[
"80:155408",
null,
"Logo",
"logos/grcuplogo.png del CDN. La web enlaza /grcuplogo.png (no existe → imagen rota en todas las rutas)."
],
[
"80:155418",
null,
"Navbar",
"Glass (rgba 10,10,10,.7 + blur 20), borde rojo de acento 35 %, línea inferior rojo de acento. Fija; en la home aparece al salir del hero. Tablet conserva los enlaces (md = 540px); móvil: logo + CTA + hamburguesa."
],
[
"80:155489",
null,
"Mobile menu",
"Panel lateral 288px (max 80vw), fondo rgba 10,10,10,.95 + blur, backdrop negro 60 %. Cierra con X o tocando fuera."
],
[
"80:155513",
null,
"Footer",
"v3: fondo profundo #0E0C0D con grano, columnas Evento / Legal / Contacto, las 4 páginas legales, patrocinadores en monocromo. Móvil: grupos en acordeón (Cerrado / Abierto)."
],
[
"80:155864",
null,
"Form fields",
"Input / Select / Teléfono / Checkbox con estados. Campos: fondo #141414, borde #374151, foco rojo de acento con halo, error rojo de acento + mensaje."
],
[
"80:156017",
null,
"Chips y badges",
"Categoría de peso (Contrail, viñeta crimson) · Estado de inscripción/sorteo · Paso numerado."
],
[
"80:156035",
null,
"Cards",
"Regla (Normas del sorteo) · Paso (Cómo participar) · Info (Resultados) · Precio. Propuesta: tarjetas sobre #1E1E1E (hoy azul marino #1F2937/#111827 solo en /raffle)."
],
[
"80:156061",
null,
"Section heading",
"Titular Contrail One en mayúsculas con palabra destacada en crimson + regla corta degradada. Escala por breakpoint (RAMP.h2)."
],
[
"80:156083",
null,
"Schedule row",
"Fila de horario (Categoría · Peso · Horario). Desktop en 3 columnas; móvil apila categoría y pesos."
],
[
"80:156099",
null,
"Feedback",
"Toast (react-hot-toast, arriba-derecha) · Loader de página · Overlay de precarga del hero (barra de progreso de frames) · Spinner."
],
[
"80:156123",
"Navegación",
null,
null
],
[
"80:156124",
null,
"Icon",
"Set lucide (24 px, trazo 2). Instancias intercambiables (swap) en botones, tarjetas y metadatos."
],
[
"80:156509",
null,
"Icon button",
"Kind × State × Size. Área táctil mínima 44 px en móvil (Size=L = 48)."
],
[
"80:156633",
null,
"Nav link",
"Estados del enlace de la navbar. Active = ruta actual (subrayado rojo de acento 2 px)."
],
[
"80:156649",
null,
"Navbar / Estados",
"Ruta activa (desktop) y menú abierto (móvil: el icono pasa a X). En la home la navbar está oculta mientras el hero es visible."
],
[
"80:156725",
null,
"Mobile menu v3",
"Hoja a pantalla completa con scroll: accesos directos grandes (56 px) + grupos en acordeón con todas las páginas (enlazado interno para SEO), datos del evento, idioma y CTA fija abajo. Grupo abierto: Ninguno | Competición | El evento."
],
[
"80:156963",
null,
"Navbar / Mega menú",
"Desplegable \"Competición ▾\" (desktop/tablet): 3 columnas con todas las páginas + tarjeta destacada del sorteo. Abre con clic y teclado, se cierra con Esc."
],
[
"80:157030",
null,
"Bottom CTA bar",
"Barra fija inferior en móvil (zona del pulgar, safe-area iOS). Aparece al pasar el hero; Variant por página."
],
[
"80:157066",
null,
"Breadcrumbs · Carousel controls · Back to top · Skip intro",
"Migas (páginas nuevas SEO), controles de carrusel móvil, volver arriba y \"Saltar intro\" del hero."
],
[
"80:157103",
"Contenido y datos del evento",
null,
null
],
[
"80:157104",
null,
"Section header",
"Eyebrow numerado + titular Contrail bicolor + entradilla opcional. Align × Lead × Breakpoint."
],
[
"80:157168",
null,
"Event meta",
"Dato clave del evento con icono. Valores de la API (/api/competiciones/grcup); la fecha se marca \"por confirmar\" (ver QA: no figura en el calendario AEP 2026)."
],
[
"80:157214",
null,
"Countdown",
"Size × State. Cuenta atrás hasta el evento; \"Hoy\" el día de competición; \"Finalizado\" enlaza a resultados (hoy la fecha de la API ya ha pasado)."
],
[
"80:157268",
null,
"Stats band",
"Cifras clave: aforo (API aforoMaximo 100), 18 categorías (9 + 9, API), 3 movimientos, jueces AEP."
],
[
"80:157317",
null,
"Sponsor logo",
"Style=Mono (tira de patrocinadores: escala de grises 60 %, unifica logos heterogéneos) | Color (hover / página de patrocinadores)."
],
[
"80:157327",
null,
"Photo card",
"Ratio × Caption. Radio 14, filete blanco 8 %, scrim inferior para pies superpuestos. Sustituye al viñeteado ovalado."
],
[
"80:157358",
null,
"Movement card",
"Premio por movimiento: Movement × State. Inclinación −4° / 0 / 4° aplicada en la sección (desktop)."
],
[
"80:157398",
null,
"Partner card · Brand tile",
"Organizadores y afiliaciones (Kind=Logo | Foto) y marcas de equipamiento."
],
[
"80:157423",
null,
"Map card",
"Mapa real (teselas © OpenStreetMap, tratadas en oscuro) + dirección de la sede (OSM: Pavelló Poliesportiu, C/ Ausiàs March, 46440 Almussafes) + acciones."
],
[
"80:157469",
null,
"Badge",
"Estados de disponibilidad para inscripción / sorteo / evento."
],
[
"80:157487",
"Formularios y casos límite",
null,
null
],
[
"80:157488",
null,
"Segmented control",
"Hombres / Mujeres en Categorías (móvil) y Sexo en el formulario. Selected × State."
],
[
"80:157520",
null,
"Day tabs",
"Selector de jornada para Horarios: 1 día (hoy), 2 días (formato sábado/domingo) y desbordamiento con scroll horizontal en móvil."
],
[
"80:157552",
null,
"Weight chip",
"Categoría de peso: Default · Hover · Selected (filtro / formulario) · Disabled (categoría completa)."
],
[
"80:157568",
null,
"Schedule card · Schedule / Edge",
"Horario en móvil como tarjeta (sustituye a la tabla de 3 columnas a 12 px). Casos: lista de pesos larga, jornada sin categorías."
],
[
"80:157626",
null,
"Field / Edge",
"Texto de ayuda · Válido · Solo lectura · Etiqueta larga (2 líneas) · Comprobando (async) · Área de texto."
],
[
"80:157665",
null,
"Phone country menu",
"Desplegables abiertos: categoría de peso (con opción seleccionada y hover) y prefijo telefónico."
],
[
"80:157733",
null,
"Checkbox / Edge",
"Error (aceptación obligatoria) · Focus · Disabled · Texto largo (2 líneas)."
],
[
"80:157805",
null,
"Step progress",
"Flujo de compra en móvil dividido en 3 pasos (Boletos → Datos → Pago) para no enseñar un formulario de 1.400 px de golpe."
],
[
"80:157857",
"Datos, feedback y overlays",
null,
null
],
[
"80:157858",
null,
"Accordion item",
"FAQ (página nueva y sección de la home, con schema FAQPage). State × Breakpoint + respuesta larga."
],
[
"80:157910",
null,
"Alert · Form error summary",
"Avisos en línea Tone × Action (sorteo cerrado, fecha por confirmar, pago OK, error de API) y resumen de errores al enviar un formulario."
],
[
"80:157997",
null,
"Toast / Edge",
"Info · Warning · Con acción (deshacer/reintentar) · Texto largo (2–3 líneas, ancho máx. 360)."
],
[
"80:158028",
null,
"Progress · Order summary",
"Boletos vendidos (API ticketsVendidos / ticketsTotal) y resumen del pedido (Default para checkout desktop, Compact para la barra móvil)."
],
[
"80:158079",
null,
"Skeleton · Empty state · Error state",
"Carga de datos de la API (config, horarios, sorteo), estados vacíos con copy real del código y caída de la API."
],
[
"80:158159",
null,
"Modal · Lightbox",
"Diálogo (confirmar compra / información) y visor de fotos de la sede y la galería."
],
[
"80:158207",
null,
"Tarjeta item rifa (antes Product card) · Winner card OBSOLETO",
"Tarjeta item rifa: foto, nombre, descripción, unidades, valor estimado (opcional), donante (opcional), ganador (opcional). Datos: raffle GET /api/competiciones/{slug}/rifa/items. Winner card OBSOLETO."
],
[
"80:158254",
null,
"Share buttons · Tooltip",
"Compartir participación (X, Facebook, WhatsApp, copiar enlace) y tooltip informativo."
],
[
"80:158297",
null,
"Legal TOC · Legal section",
"Índice lateral fijo en desktop (sección activa resaltada) y desplegable en móvil; bloque de sección numerada."
],
[
"80:158344",
"Páginas SEO y contenido",
null,
null
],
[
"80:158345",
null,
"Breadcrumbs v2 · Updated stamp · Language switch",
"Migas con schema BreadcrumbList (Levels=2|3), sello de actualización con fuente (E-E-A-T) y selector de idioma ES/EN (hreflang)."
],
[
"80:158378",
null,
"Anchor chips",
"Navegación interna fija bajo la navbar en móvil/tablet (scroll horizontal, sección activa resaltada, degradado de \"hay más\"). En desktop se usa el índice lateral (Legal TOC)."
],
[
"80:158418",
null,
"Search field",
"Búsqueda en FAQ, participantes y resultados. Estados: Vacío · Foco · Escribiendo (con borrar) · Sin resultados."
],
[
"80:158459",
null,
"Filter chip · Filter bar · Bottom sheet / Filtros",
"Filtros de participantes, resultados y galería. Móvil: búsqueda + botón de filtros con contador que abre una hoja inferior (pulgar)."
],
[
"80:158650",
null,
"Attempt pill · Referee lights",
"Intentos (válido · nulo · pendiente · en curso) y luces de los 3 jueces (válido con 2 blancas)."
],
[
"80:158689",
null,
"Result row · Result card · Podium",
"Clasificación: fila de tabla (desktop), tarjeta desplegable con los 9 intentos (móvil) y podio por categoría."
],
[
"80:158850",
null,
"Live player · Lifter now · Up next row",
"En directo: reproductor (Antes · En directo · Finalizado) para desktop y móvil (16:9 a ancho completo), atleta en plataforma y orden de salida."
],
[
"80:158995",
null,
"Edition card · Article card · Article meta",
"Ediciones (Próxima · Celebrada) y blog (Destacado · Default · Compacto para móvil y relacionados)."
],
[
"80:159090",
null,
"Callout · Key facts · Related links",
"Bloques editoriales: aviso (Consejo · Importante · Dato), \"En resumen\" (respuesta directa para fragmentos destacados de Google) y enlazado interno \"Te puede interesar\"."
],
[
"80:159204",
null,
"Category finder · Total checker",
"Herramientas para móvil: \"¿En qué categoría compito?\" (Vacío · Resultado · Fuera de rango) y \"¿Me falta mucho para la marca mínima?\"."
],
[
"80:159411",
null,
"Club card · Sponsor card · Role card · Transport card · Gallery tile",
"Tarjetas de directorio (clubs, patrocinadores), voluntariado (seleccionable), transporte y galería."
],
[
"80:159588",
null,
"Pagination · CTA band",
"Paginación (numérica en desktop, \"Cargar más\" en móvil) y banda de llamada a la acción con panel rojo granulado."
],
[
"80:159738",
"v6 · Público, atletas y backoffice",
null,
null
],
[
"80:159739",
null,
"API method · API tag",
"Para los paneles \"Backend · notas\" de cada página: método (GET · POST · PUT · PATCH · DELETE · SSE) y estado del endpoint o tabla respecto al repo grweb (Existe · Nuevo · Cambia · Deprecar)."
],
[
"80:159764",
null,
"Ticket",
"Entrada digital (gratuita) con QR firmado: payload \"E:{competicionId}:{entradaId}:{hmac}\" con Competicion.QrSecret, como el QR de Inscripciones. Estado=Reservada | Con sorteo | Usada | Cancelada. Va en el email, en /entradas/confirmacion y en /mi-entrada."
],
[
"80:159958",
null,
"Aforo meter",
"Disponibilidad de una sesión de público. Datos: GET /api/competiciones/{slug}/entradas/config (aforo, reservadas) y evento SSE \"aforo\". Estado=Disponible | Últimas (≤ 10 %) | Agotado."
],
[
"80:160012",
null,
"Session option",
"Selector de sesión (radio card). EntradaSesiones: nombre, fecha, horario de puertas y bloques. Estado=Default | Seleccionada | Últimas | Agotada (deshabilitada, ofrece lista de espera)."
],
[
"80:160049",
null,
"People stepper",
"Nº de personas en la reserva (1–4: tú + 3 acompañantes). Entradas.Personas. Los menores entran con su reserva: no se piden datos de menores."
],
[
"80:160095",
null,
"Raffle upsell",
"Sorteo opcional dentro de la reserva: 2 € por boleto (RifaConfig.PrecioTicket, configurable 2–3 €), máx. 10. Si hay boletos, el POST /entradas devuelve un Stripe Checkout. Estado=Sin boletos | Con boletos."
],
[
"80:160145",
null,
"Consent group",
"RGPD: casillas separadas y desmarcadas por defecto. Privacidad (obligatoria) ≠ novedades/comercial (opcional, doble opt-in) ≠ bases del sorteo (si hay boletos). Primera capa informativa debajo. Se guarda cada aceptación en Consentimientos con la versión del texto. Estado=Default | Con sorteo | Error."
],
[
"80:160199",
null,
"Social proof",
"Prueba social del hero de /entradas y la home: total de reservas (GET /entradas/config → totalReservadas) refrescado por SSE."
],
[
"80:160222",
null,
"Follow button",
"Seguir a un atleta → \"Mi horario\". Se guarda en el navegador (localStorage, sin cuenta); opcionalmente aviso por email (Recordatorios). Estado=Seguir | Siguiendo · Tamaño=Icono | Texto."
],
[
"80:160240",
null,
"Live status",
"Estado de la conexión en tiempo real (EventSource sobre GET /api/competiciones/{slug}/stream). Sin punto: icono de emisión. Estado=En directo | Reconectando | Sin conexión."
],
[
"80:160265",
null,
"Entrada form",
"Formulario de reserva de /entradas (mobile-first). POST /api/competiciones/{slug}/entradas. Datos mínimos (nombre, apellidos, email; teléfono y CP opcionales), sesión, personas, sorteo opcional y consentimientos separados. Breakpoint=Desktop | Mobile · Estado=Default | Con sorteo | Error | Enviando."
],
[
"80:161557",
null,
"Athlete card",
"Tarjeta de /atletas. GET /api/competiciones/{slug}/atletas (campos públicos). Sin perfil público → iniciales y solo nombre, club, categoría y horario. Foto=Sí | No · Seguido=No | Sí."
],
[
"80:161639",
null,
"Athlete row",
"Fila de atleta para móvil, flights y \"Mi horario\". Estado=Default | Seguido | En directo (evento SSE \"turno\": está en la plataforma)."
],
[
"80:161680",
null,
"Flight block",
"Bloque de /horarios v2: un flight (tanda) con pesaje, plataforma, estado en directo (SSE \"flight\") y sus atletas. Flights + FlightAtletas. Breakpoint=Desktop | Mobile · Estado=Programado | En curso | Retraso | Finalizado · Abierto=No | Sí."
],
[
"80:162384",
null,
"Reminder card",
"\"Avísame cuando compita\": email 30 min antes del flight (incluye el retraso). POST /api/competiciones/{slug}/recordatorios. Consentimiento solo para ese aviso; newsletter aparte. Estado=Default | Activado."
],
[
"80:162424",
null,
"KPI tile",
"Backoffice · campaña: GET /api/admin/competiciones/{id}/entradas/stats. Tendencia=Sube | Baja | Neutra."
],
[
"80:162461",
null,
"Scan result",
"Check-in de público (rol registrador, móvil): POST /api/admin/competiciones/{id}/entradas/checkin { qr }. Resultado=Válida | Ya usada | No válida | Otra sesión."
],
[
"80:162564",
null,
"Newsletter signup",
"Alta independiente (footer, blog, horarios no publicados): POST /api/competiciones/{slug}/newsletter → email de doble opt-in. Breakpoint=Desktop | Mobile · Estado=Default | Enviado."
],
[
"138:66754",
null,
"Select (gr-select)",
"Un único desplegable para toda la web: formularios (Campo), filtros de listados (Filtro, 44 px) y hoja inferior en móvil. Sustituye a Field · Select y Select menu. En el backoffice el equivalente es «BO / Select»."
]
];

/** Component sets: size and [variant name, x, y]. */
export const SETS: Record<string, { w: number; h: number; v: [string, number, number][] }> = {"button": {"w": 2384, "h": 544, "v": [["Variant=Primary, State=Default, Size=M", 32, 32], ["Variant=Primary, State=Default, Size=L", 168, 32], ["Variant=Primary, State=Hover, Size=M", 322, 32], ["Variant=Primary, State=Hover, Size=L", 458, 32], ["Variant=Primary, State=Disabled, Size=M", 612, 32], ["Variant=Primary, State=Disabled, Size=L", 748, 32], ["Variant=Primary, State=Loading, Size=M", 902, 32], ["Variant=Primary, State=Loading, Size=L", 1038, 32], ["Variant=Glass, State=Default, Size=M", 32, 104], ["Variant=Glass, State=Default, Size=L", 199, 104], ["Variant=Glass, State=Hover, Size=M", 385, 104], ["Variant=Glass, State=Hover, Size=L", 552, 104], ["Variant=Glass, State=Disabled, Size=M", 738, 104], ["Variant=Glass, State=Disabled, Size=L", 905, 104], ["Variant=Glass, State=Loading, Size=M", 1091, 104], ["Variant=Glass, State=Loading, Size=L", 1258, 104], ["Variant=Outline, State=Default, Size=M", 32, 176], ["Variant=Outline, State=Default, Size=L", 196, 176], ["Variant=Outline, State=Hover, Size=M", 382, 176], ["Variant=Outline, State=Hover, Size=L", 546, 176], ["Variant=Outline, State=Disabled, Size=M", 732, 176], ["Variant=Outline, State=Disabled, Size=L", 896, 176], ["Variant=Outline, State=Loading, Size=M", 1082, 176], ["Variant=Outline, State=Loading, Size=L", 1246, 176], ["Variant=Display, State=Default, Size=M", 32, 248], ["Variant=Display, State=Default, Size=L", 199, 248], ["Variant=Display, State=Hover, Size=M", 395, 248], ["Variant=Display, State=Hover, Size=L", 562, 248], ["Variant=Display, State=Disabled, Size=M", 758, 248], ["Variant=Display, State=Disabled, Size=L", 925, 248], ["Variant=Display, State=Loading, Size=M", 1121, 248], ["Variant=Display, State=Loading, Size=L", 1288, 248], ["Variant=DisplayGradient, State=Default, Size=M", 32, 320], ["Variant=DisplayGradient, State=Default, Size=L", 301, 320], ["Variant=DisplayGradient, State=Hover, Size=M", 618, 320], ["Variant=DisplayGradient, State=Hover, Size=L", 887, 320], ["Variant=DisplayGradient, State=Disabled, Size=M", 1204, 320], ["Variant=DisplayGradient, State=Disabled, Size=L", 1473, 320], ["Variant=DisplayGradient, State=Loading, Size=M", 1790, 320], ["Variant=DisplayGradient, State=Loading, Size=L", 2059, 320], ["Variant=Pill, State=Default, Size=M", 32, 392], ["Variant=Pill, State=Default, Size=L", 170, 392], ["Variant=Pill, State=Hover, Size=M", 316, 392], ["Variant=Pill, State=Hover, Size=L", 454, 392], ["Variant=Pill, State=Disabled, Size=M", 600, 392], ["Variant=Pill, State=Disabled, Size=L", 738, 392], ["Variant=Pill, State=Loading, Size=M", 884, 392], ["Variant=Pill, State=Loading, Size=L", 1022, 392], ["Variant=Instagram, State=Default, Size=M", 32, 464], ["Variant=Instagram, State=Default, Size=L", 277, 464], ["Variant=Instagram, State=Hover, Size=M", 553, 464], ["Variant=Instagram, State=Hover, Size=L", 798, 464], ["Variant=Instagram, State=Disabled, Size=M", 1074, 464], ["Variant=Instagram, State=Disabled, Size=L", 1319, 464], ["Variant=Instagram, State=Loading, Size=M", 1595, 464], ["Variant=Instagram, State=Loading, Size=L", 1840, 464]]}, "field": {"w": 1792, "h": 397, "v": [["Type=Text, State=Default", 32, 32], ["Type=Text, State=Focus", 384, 32], ["Type=Text, State=Filled", 736, 32], ["Type=Text, State=Error", 1088, 32], ["Type=Text, State=Disabled", 1440, 32], ["Type=Phone, State=Default", 1440, 162], ["Type=Phone, State=Filled", 32, 292]]}, "checkbox": {"w": 816, "h": 190, "v": [["Checked=Off, Kind=Instagram", 32, 32], ["Checked=Off, Kind=Legal", 424, 32], ["Checked=On, Kind=Instagram", 32, 111], ["Checked=On, Kind=Legal", 424, 111]]}, "chip": {"w": 884, "h": 108, "v": [["Type=Weight", 32, 32], ["Type=Weight active", 130, 32], ["Type=Status open", 230, 32], ["Type=Status soon", 444, 32], ["Type=Status closed", 597, 32], ["Type=Step 1", 764, 32], ["Type=Step 2", 820, 32]]}, "toast": {"w": 808, "h": 136, "v": [["Type=Success", 32, 32], ["Type=Error", 416, 32]]}, "icon": {"w": 616, "h": 376, "v": [["Name=instagram", 32, 32], ["Name=mail", 80, 32], ["Name=mapPin", 128, 32], ["Name=hourglass", 176, 32], ["Name=arrowRight", 224, 32], ["Name=arrowDown", 272, 32], ["Name=menu", 320, 32], ["Name=x", 368, 32], ["Name=check", 416, 32], ["Name=checkCircle", 464, 32], ["Name=alert", 512, 32], ["Name=lock", 560, 32], ["Name=ticket", 32, 80], ["Name=infinity", 80, 80], ["Name=user", 128, 80], ["Name=shield", 176, 80], ["Name=shuffle", 224, 80], ["Name=globe", 272, 80], ["Name=creditCard", 320, 80], ["Name=trophy", 368, 80], ["Name=calendar", 416, 80], ["Name=clock", 464, 80], ["Name=minus", 512, 80], ["Name=plus", 560, 80], ["Name=chevronDown", 32, 128], ["Name=external", 80, 128], ["Name=share", 128, 128], ["Name=loader", 176, 128], ["Name=search", 224, 128], ["Name=sliders", 272, 128], ["Name=car", 320, 128], ["Name=train", 368, 128], ["Name=plane", 416, 128], ["Name=bus", 464, 128], ["Name=image", 512, 128], ["Name=play", 560, 128], ["Name=users", 32, 176], ["Name=heart", 80, 176], ["Name=book", 128, 176], ["Name=medal", 176, 176], ["Name=dumbbell", 224, 176], ["Name=eye", 272, 176], ["Name=download", 320, 176], ["Name=scale", 368, 176], ["Name=radio", 416, 176], ["Name=list", 464, 176], ["Name=parking", 512, 176], ["Name=bed", 560, 176], ["Name=copy", 32, 224], ["Name=chevronRight", 80, 224], ["Name=zap", 128, 224], ["Name=star", 176, 224], ["Name=news", 224, 224], ["Name=bell", 272, 224], ["Name=qr", 320, 224], ["Name=database", 368, 224], ["Name=server", 416, 224], ["Name=code", 464, 224], ["Name=layout", 512, 224], ["Name=settings", 560, 224], ["Name=barChart", 32, 272], ["Name=upload", 80, 272], ["Name=camera", 128, 272], ["Name=edit", 176, 272], ["Name=logout", 224, 272], ["Name=refresh", 272, 272], ["Name=filter", 320, 272], ["Name=grip", 368, 272], ["Name=timer", 416, 272], ["Name=send", 464, 272], ["Name=link", 512, 272], ["Name=tv", 560, 272], ["Name=cloud", 32, 320], ["Name=key", 80, 320], ["Name=fileText", 128, 320], ["Name=wrench", 176, 320], ["Name=braces", 224, 320]]}, "iconButton": {"w": 572, "h": 248, "v": [["Kind=Ghost, State=Default, Size=M", 32, 32], ["Kind=Ghost, State=Default, Size=L", 96, 32], ["Kind=Ghost, State=Hover, Size=M", 164, 32], ["Kind=Ghost, State=Hover, Size=L", 228, 32], ["Kind=Ghost, State=Focus, Size=M", 296, 32], ["Kind=Ghost, State=Focus, Size=L", 360, 32], ["Kind=Ghost, State=Disabled, Size=M", 428, 32], ["Kind=Ghost, State=Disabled, Size=L", 492, 32], ["Kind=Glass, State=Default, Size=M", 32, 100], ["Kind=Glass, State=Default, Size=L", 96, 100], ["Kind=Glass, State=Hover, Size=M", 164, 100], ["Kind=Glass, State=Hover, Size=L", 228, 100], ["Kind=Glass, State=Focus, Size=M", 296, 100], ["Kind=Glass, State=Focus, Size=L", 360, 100], ["Kind=Glass, State=Disabled, Size=M", 428, 100], ["Kind=Glass, State=Disabled, Size=L", 492, 100], ["Kind=Primary, State=Default, Size=M", 32, 168], ["Kind=Primary, State=Default, Size=L", 96, 168], ["Kind=Primary, State=Hover, Size=M", 164, 168], ["Kind=Primary, State=Hover, Size=L", 228, 168], ["Kind=Primary, State=Focus, Size=M", 296, 168], ["Kind=Primary, State=Focus, Size=L", 360, 168], ["Kind=Primary, State=Disabled, Size=M", 428, 168], ["Kind=Primary, State=Disabled, Size=L", 492, 168]]}, "countdown": {"w": 1388, "h": 269, "v": [["Size=L, State=Cuenta atrás", 32, 32], ["Size=L, State=Hoy", 484, 32], ["Size=L, State=Finalizado", 936, 32], ["Size=S, State=Cuenta atrás", 32, 163], ["Size=S, State=Hoy", 376, 163], ["Size=S, State=Finalizado", 720, 163]]}, "badge": {"w": 1188, "h": 92, "v": [["Tone=Abierto", 32, 32], ["Tone=Próximamente", 242, 32], ["Tone=Últimas plazas", 391, 32], ["Tone=Agotado", 564, 32], ["Tone=En directo", 733, 32], ["Tone=Finalizado", 856, 32], ["Tone=Por confirmar", 978, 32]]}, "alert": {"w": 1124, "h": 412, "v": [["Tone=Info, Action=No", 32, 32], ["Tone=Info, Action=Sí", 572, 32], ["Tone=Success, Action=No", 32, 124], ["Tone=Success, Action=Sí", 572, 124], ["Tone=Warning, Action=No", 32, 216], ["Tone=Warning, Action=Sí", 572, 216], ["Tone=Error, Action=No", 32, 308], ["Tone=Error, Action=Sí", 572, 308]]}, "rifa": {"w": 736, "h": 435, "v": [["Kind=Con imagen", 32, 32], ["Kind=Sin foto", 384, 32]]}, "ticket": {"w": 1584, "h": 667, "v": [["Estado=Reservada", 32, 32], ["Estado=Con sorteo", 422, 32], ["Estado=Usada", 812, 32], ["Estado=Cancelada", 1202, 32]]}, "live": {"w": 646, "h": 92, "v": [["Estado=En directo", 32, 32], ["Estado=Reconectando", 179, 32], ["Estado=Sin conexión", 365, 32]]}, "select": {"w": 2144, "h": 763, "v": [["Tipo=Campo, Estado=Vacío", 32, 32], ["Tipo=Campo, Estado=Valor", 384, 32], ["Tipo=Campo, Estado=Foco", 736, 32], ["Tipo=Campo, Estado=Abierto", 1088, 32], ["Tipo=Campo, Estado=Error", 1440, 32], ["Tipo=Campo, Estado=Deshabilitado", 1792, 32], ["Tipo=Filtro, Estado=Vacío", 32, 387], ["Tipo=Filtro, Estado=Valor", 185, 387], ["Tipo=Filtro, Estado=Abierto", 396, 387], ["Tipo=Hoja móvil, Estado=Abierto", 668, 387]]}, "logo": {"w": 900, "h": 209, "v": [["Size=L", 32, 32], ["Size=M", 456, 32], ["Size=S", 752, 32]]}};

package messaging

// Plantilla is the default design of a transactional email. Competitions can override subject and texts from the
// backoffice («Emails y avisos» · editor); variables are only those its producer sends.
type Plantilla struct {
	Clave      string            `json:"clave"`
	Nombre     string            `json:"nombre"`
	Disparador string            `json:"disparador" doc:"Cuándo se envía"`
	Servicio   string            `json:"servicio"`
	Esencial   bool              `json:"esencial" doc:"Operativo: no se pausa durante el evento"`
	Auto       string            `json:"automatizacion" doc:"Automatización a la que pertenece"`
	Variables  []string          `json:"variables"`
	QR         bool              `json:"qr" doc:"Incluye la imagen del QR ({{qr}}) bajo el título"`
	Ejemplo    map[string]string `json:"ejemplo" doc:"Datos de prueba para la vista previa"`
	Contenido
	WA *ContenidoWA `json:"wa,omitempty" doc:"Versión de WhatsApp del mensaje (si la plantilla se envía también por WhatsApp)"`
}

// Contenido is the editable part of a template.
type Contenido struct {
	Asunto     string `json:"asunto" minLength:"1" maxLength:"160"`
	Preheader  string `json:"preheader" maxLength:"160" doc:"Texto de previsualización en la bandeja"`
	Titulo     string `json:"titulo" minLength:"1" maxLength:"120"`
	Cuerpo     string `json:"cuerpo" minLength:"1" maxLength:"4000" doc:"Párrafos separados por una línea en blanco; **negrita**; {{variable}}. Un párrafo con una variable vacía no se muestra."`
	BotonTexto string `json:"botonTexto" maxLength:"40"`
	BotonURL   string `json:"botonUrl" maxLength:"300" doc:"Normalmente una variable, p. ej. {{enlace}}"`
	Pie        string `json:"pie" maxLength:"400"`
	Nota       string `json:"nota,omitempty" maxLength:"300" doc:"Nota del pie (por defecto, la de la plataforma: por qué recibe este email)"`
	Imagen     string `json:"imagen,omitempty" maxLength:"500" doc:"URL de una imagen (normalmente una variable, p. ej. {{foto}}) que se muestra sobre el texto"`
}

// ContenidoWA is the WhatsApp version of a transactional template: plain text with the WhatsApp formatting
// (*negrita*), the same paragraphs as the email and the same rule (a paragraph with an empty variable is not shown).
type ContenidoWA struct {
	Texto  string `json:"texto" minLength:"1" maxLength:"2000"`
	Imagen bool   `json:"imagen,omitempty" doc:"El mensaje lleva una imagen (la foto de la solicitud)"`
	// ImagenURL is a fixed image of the message (or a variable such as {{foto}}): evo-weai sends it as media.
	ImagenURL string `json:"imagenUrl,omitempty" maxLength:"500"`
	// Botones are evo-weai interactive URL buttons (max 3) instead of links pasted in the text; the URL may be a
	// variable. A button whose URL ends up empty is not sent.
	Botones []BotonWA `json:"botones,omitempty" maxItems:"3"`
}

// BotonWA is an interactive URL button of a WhatsApp message.
type BotonWA struct {
	Texto string `json:"texto" maxLength:"25"`
	URL   string `json:"url" maxLength:"300"`
}

// Automatizacion groups templates the organiser can switch on or off (Figma 62 · «Automatizaciones»).
type Automatizacion struct {
	Clave    string   `json:"clave"`
	Nombre   string   `json:"nombre"`
	Cuando   string   `json:"cuando"`
	Publico  string   `json:"publico"`
	Canales  []string `json:"canales"`
	Esencial bool     `json:"esencial"`
}

var automatizaciones = []Automatizacion{
	{Clave: "accesos", Nombre: "Enlaces de acceso y confirmaciones", Cuando: "al pedirlo", Publico: "Quien lo solicita", Canales: []string{"email"}, Esencial: true},
	{Clave: "inscripcion", Nombre: "Inscripción, reserva, pagos y acciones necesarias", Cuando: "al pagar o cambiar · al pedirlo la organización", Publico: "Atletas inscritos", Canales: []string{"email", "whatsapp"}, Esencial: true},
	{Clave: "horarios", Nombre: "Tu fecha y horario", Cuando: "al publicar horarios", Publico: "Atletas afectados", Canales: []string{"email", "whatsapp"}, Esencial: true},
	{Clave: "seguidores", Nombre: "Avisos a seguidores", Cuando: "al publicar horarios", Publico: "Seguidores con aviso confirmado", Canales: []string{"email"}},
	{Clave: "salida30", Nombre: "Tu atleta sale en 30 min", Cuando: "−30 min del inicio de su día", Publico: "Seguidores con aviso confirmado", Canales: []string{"email"}},
	{Clave: "resultados", Nombre: "Resultados publicados", Cuando: "al publicar cada categoría", Publico: "Atletas de la categoría y sus seguidores", Canales: []string{"email"}},
	{Clave: "plaza", Nombre: "Plaza libre en la reserva", Cuando: "al liberarse plaza", Publico: "Lista de reserva", Canales: []string{"email"}},
	{Clave: "novedades", Nombre: "Novedades: doble opt-in", Cuando: "al suscribirse · recordatorio a las 48 h", Publico: "Suscripciones pendientes", Canales: []string{"email"}},
	{Clave: "proximas", Nombre: "Avísame de la próxima competición", Cuando: "al dejar el email en «Avísame»", Publico: "Quien se apunta a la lista de aviso", Canales: []string{"email"}},
	{Clave: "entradas", Nombre: "Entradas: confirmación, cambios y anulación", Cuando: "al reservar o cambiar", Publico: "Reservas", Canales: []string{"email"}, Esencial: true},
	{Clave: "espera", Nombre: "Lista de espera: alta y oferta de plaza", Cuando: "al apuntarse · al liberarse plaza", Publico: "Lista de espera", Canales: []string{"email"}, Esencial: true},
	{Clave: "recordatorios", Nombre: "Recordatorios de la entrada", Cuando: "T−7 · T−1 (con QR)", Publico: "Reservas activas", Canales: []string{"email"}},
	{Clave: "voluntarios", Nombre: "Voluntariado recibido", Cuando: "al enviar la solicitud", Publico: "Voluntarios", Canales: []string{"email"}},
	{Clave: "clubs", Nombre: "Directorio de clubs", Cuando: "al aprobar o rechazar una solicitud (si se marca «Avisar»)", Publico: "Quien propone un club", Canales: []string{"email"}},
	{Clave: "publico", Nombre: "Avisos al público", Cuando: "al publicar horarios · al empezar el directo · el día antes", Publico: "Cuentas de público del directo", Canales: []string{"email", "whatsapp"}},
	{Clave: "anuncios", Nombre: "Anuncios de juegos y chat", Cuando: "40 min después de crear la cuenta (una vez)", Publico: "Cuentas de público del directo", Canales: []string{"email", "whatsapp"}},
	{Clave: "solicitudes-atleta", Nombre: "Solicitudes de atleta", Cuando: "al enviar el alta y al aprobar o rechazarla", Publico: "Atletas que se dan de alta y el equipo", Canales: []string{"email", "whatsapp"}},
	{Clave: "fantasy-salas", Nombre: "Solicitudes de sala (GRS Fantasy)", Cuando: "al pedir alguien unirse a una sala (una vez por jugador y sala)", Publico: "Anfitriones de salas de GRS Fantasy", Canales: []string{"email", "whatsapp"}},
}

func p(clave, nombre, disparador, servicio, auto string, esencial bool, vars []string, ej map[string]string, c Contenido) Plantilla {
	return Plantilla{Clave: clave, Nombre: nombre, Disparador: disparador, Servicio: servicio, Auto: auto, Esencial: esencial, Variables: vars, Ejemplo: ej, Contenido: c}
}

// pwa is a template that also travels by WhatsApp (the transactional worker sends its WhatsApp text).
func pwa(clave, nombre, disparador, servicio, auto string, esencial bool, vars []string, ej map[string]string, c Contenido, w ContenidoWA) Plantilla {
	t := p(clave, nombre, disparador, servicio, auto, esencial, vars, ej, c)
	t.WA = &w
	return t
}

var ejEntrada = map[string]string{"nombre": "Laura", "titular": "Laura Gómez Ruiz + 2 acompañantes", "sesion": "Sábado mañana", "dia": "sábado 25 jul", "puertas": "08:30", "hasta": "14:00",
	"personas": "3", "codigo": "GRC-7K3P", "qr": "https://grcup.example/api/competiciones/grcup/entradas/GRC-7K3P/qr.png?s=…", "enlace": "https://grcup.example/mi-entrada?t=…",
	"lugar": "Pavelló Poliesportiu d'Almussafes, Almussafes", "cuando": "mañana", "caduca": "sábado 19 dic a las 10:00", "entradas": "https://grcup.example/entradas"}

var ejResultado = map[string]string{"nombre": "Laura", "atleta": "Laura Gómez Ruiz", "categoria": "Femenino −63 kg", "puesto": "2.ª", "total": "367,5 kg",
	"resultado": "2.ª con 367,5 kg", "enlace": "https://grcup.example/resultados/2026", "baja": "https://grcup.example/atletas/laura-gomez-ruiz?baja=…"}

var ejHorario = map[string]string{"nombre": "Laura", "atleta": "Laura Gómez Ruiz", "lote": "12", "dia": "sábado 19/12", "hora": "10:30", "pesaje": "08:30–10:00", "sesion": "Femenino −57 / −63 kg", "nivel": "AEP-2", "antes": "vie 18/12 17:00 · pesaje 15:00–16:30 · Femenino −57 kg · AEP-2",
	"enlace": "https://grcup.example/area-atleta", "horarios": "https://grcup.example/horarios", "version": "2", "baja": "https://grcup.example/atletas/laura-gomez-ruiz?baja=…"}

// catalogo has every template the services queue today (key → default design). Platform templates (identity)
// are sent with the platform SMTP and are not editable per competition.
var catalogo = []Plantilla{
	p("acceso-enlace-magico", "Enlace de acceso al backoffice", "Al pedir un enlace mágico", "identity", "accesos", true, []string{"nombre", "url"},
		map[string]string{"nombre": "Nico", "url": "https://bo.grcup.example/api/auth/magic/…"},
		Contenido{Asunto: "Tu enlace para entrar al backoffice", Titulo: "Entra al backoffice", Cuerpo: "Hola {{nombre}}, pulsa el botón para entrar. El enlace caduca en 15 minutos y solo funciona una vez.\n\nSi no lo has pedido tú, ignora este email.", BotonTexto: "Entrar", BotonURL: "{{url}}"}),
	p("equipo-invitacion", "Invitación al equipo", "Al invitar a alguien al equipo", "identity", "accesos", true, []string{"invita", "url"},
		map[string]string{"invita": "Nico García", "url": "https://bo.grcup.example/invitacion/…"},
		Contenido{Asunto: "{{invita}} te invita al equipo de la GR Cup", Titulo: "Te han invitado al equipo", Cuerpo: "**{{invita}}** te ha invitado a gestionar la GR Strength Cup.\n\nAcepta la invitación para crear tu acceso. Caduca en 7 días.", BotonTexto: "Aceptar invitación", BotonURL: "{{url}}"}),
	p("atleta-enlace-area", "Acceso a tu área de atleta", "Al pedir el enlace del área", "athletes", "accesos", true, []string{"nombre", "enlace"},
		map[string]string{"nombre": "Laura", "enlace": "https://grcup.example/area-atleta?t=…"},
		Contenido{Asunto: "Tu acceso al área de atleta", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{nombre}}", Cuerpo: "Aquí tienes tu enlace para entrar al área de atleta: tu QR de acreditación, tu horario y la previa del pesaje.\n\nCaduca en 30 minutos.", BotonTexto: "Entrar a mi área", BotonURL: "{{enlace}}"}),
	p("fans-acceso", "Acceso al directo (chat, porra y fantasy)", "Al pedir el enlace en /en-directo", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…"},
		Contenido{Asunto: "Tu enlace para entrar al directo", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para entrar al directo de la GR Cup: chatea, dona y juega a la porra y a GRS Fantasy.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Entrar al directo", BotonURL: "{{enlace}}"}),
	p("fans-acceso-contrasena", "Crear o cambiar la contraseña del directo", "Al pulsar «¿Has olvidado tu contraseña?»", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…"},
		Contenido{Asunto: "Crea tu nueva contraseña", Preheader: "Enlace válido 30 minutos", Titulo: "Tu contraseña de la GRS Cup", Cuerpo: "Has pedido crear o cambiar la contraseña de tu cuenta del directo. Pulsa el botón y elige la nueva.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email: tu contraseña no cambia.", BotonTexto: "Crear mi contraseña", BotonURL: "{{enlace}}"}),
	p("fans-acceso-inscripcion", "Acceso para inscribirse", "Al pedir el enlace desde /inscripcion", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…&next=%2Finscripcion"},
		Contenido{Asunto: "Tu enlace para continuar con la inscripción", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para volver a la inscripción de la GR Cup con tu cuenta y terminarla.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Continuar la inscripción", BotonURL: "{{enlace}}"}),
	p("fans-acceso-voluntarios", "Acceso para apuntarse como voluntario", "Al pedir el enlace desde /voluntarios", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…&next=%2Fvoluntarios"},
		Contenido{Asunto: "Tu enlace para enviar tu solicitud de voluntario", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para volver al formulario de voluntarios de la GR Cup con tu cuenta y enviar tu solicitud.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Volver al formulario", BotonURL: "{{enlace}}"}),
	p("fans-acceso-clubs", "Acceso para proponer un club", "Al pedir el enlace desde /clubs", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…&next=%2Fclubs"},
		Contenido{Asunto: "Tu enlace para enviar la solicitud de tu club", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para volver al directorio de clubs de la GR Cup con tu cuenta y enviar la solicitud de tu club.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Volver al formulario", BotonURL: "{{enlace}}"}),
	p("seguimiento-confirmar", "Confirma tu aviso", "Al pulsar «Avísame cuando compita»", "athletes", "accesos", true, []string{"atleta", "enlace"},
		map[string]string{"atleta": "Laura Gómez Ruiz", "enlace": "https://grcup.example/atletas/laura-gomez-ruiz?aviso=…"},
		Contenido{Asunto: "Confirma tu aviso de {{atleta}}", Titulo: "¿Te avisamos?", Cuerpo: "Has pedido que te escribamos 30 minutos antes de que **{{atleta}}** salga a la plataforma.\n\nConfirma con el botón. Si no lo has pedido tú, ignora este email y no te escribiremos.", BotonTexto: "Confirmar aviso", BotonURL: "{{enlace}}"}),
	p("atleta-tienes-plaza", "Tienes plaza", "Al pasar de la reserva a confirmado", "athletes", "plaza", true, []string{"nombre", "enlace"},
		map[string]string{"nombre": "Marta", "enlace": "https://grcup.example/area-atleta"},
		Contenido{Asunto: "¡Tienes plaza en la GR Cup!", Titulo: "¡Tienes plaza, {{nombre}}!", Cuerpo: "Se ha liberado una plaza y ya estás confirmada en la competición.\n\nCompleta tu perfil y la previa del pesaje desde tu área.", BotonTexto: "Ir a mi área", BotonURL: "{{enlace}}"}),
	p("inscripcion-confirmada", "Inscripción confirmada", "Al pagar la inscripción", "athletes", "inscripcion", true, []string{"nombre", "total", "codigoReferido"},
		map[string]string{"nombre": "Laura", "total": "26,25 €", "codigoReferido": "LAURA412"},
		Contenido{Asunto: "Inscripción confirmada · GR Strength Cup", Preheader: "Pagado {{total}}", Titulo: "¡Ya estás dentro, {{nombre}}!", Cuerpo: "Hemos recibido tu pago de **{{total}}**. Tu inscripción está confirmada.\n\nTu código para invitar: **{{codigoReferido}}**. Quien se inscriba con él tiene descuento y a ti te devolvemos parte de tu cuota.\n\nTe avisaremos cuando publiquemos los horarios."}),
	p("inscripcion-reserva", "En la lista de reserva", "Al inscribirse con las plazas completas", "athletes", "inscripcion", true, []string{"nombre", "total", "codigoReferido"},
		map[string]string{"nombre": "Ana", "total": "35,00 €"},
		Contenido{Asunto: "Estás en la lista de reserva", Titulo: "Estás en la reserva, {{nombre}}", Cuerpo: "Las plazas están completas y te hemos apuntado a la lista de reserva. No te hemos cobrado nada.\n\nSi se libera una plaza te enviaremos un enlace para pagar ({{total}}) y confirmarla."}),
	p("inscripcion-plaza-libre", "Plaza libre: paga para confirmarla", "Al ofrecer una plaza a la reserva", "athletes", "plaza", true, []string{"nombre", "enlace", "total"},
		map[string]string{"nombre": "Ana", "enlace": "https://grcup.example/pago/…", "total": "25,00 €"},
		Contenido{Asunto: "Se ha liberado una plaza para ti", Titulo: "Hay plaza para ti, {{nombre}}", Cuerpo: "Se ha liberado una plaza en la GR Strength Cup. Págala ({{total}}) en las próximas 24 horas para confirmarla; después pasará a la siguiente persona.", BotonTexto: "Pagar y confirmar", BotonURL: "{{enlace}}"}),
	p("referido-recompensa", "Recompensa de referido", "Al inscribirse alguien con tu código", "athletes", "inscripcion", true, []string{"nombre", "importe"},
		map[string]string{"nombre": "Laura", "importe": "5,00 €"},
		Contenido{Asunto: "Te hemos devuelto {{importe}}", Titulo: "¡Gracias por invitar, {{nombre}}!", Cuerpo: "Alguien se ha inscrito con tu código. Te hemos devuelto **{{importe}}** a la tarjeta con la que pagaste (puede tardar unos días en verse)."}),
	p("reembolso", "Reembolso", "Al devolver un pago desde el backoffice", "athletes", "inscripcion", true, []string{"nombre", "importe"},
		map[string]string{"nombre": "Laura", "importe": "35,00 €"},
		Contenido{Asunto: "Reembolso de {{importe}}", Titulo: "Te hemos devuelto {{importe}}", Cuerpo: "Hola {{nombre}}, hemos tramitado un reembolso de **{{importe}}** a la tarjeta con la que pagaste. Puede tardar entre 5 y 10 días en aparecer."}),
	pwa("horario-publicado", "Tu fecha y horario", "Al publicar los horarios por primera vez", "athletes", "horarios", true, []string{"nombre", "atleta", "dia", "hora", "lote", "pesaje", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Tu horario: {{dia}} a las {{hora}}", Preheader: "Pesaje {{pesaje}}", Titulo: "Ya tienes horario, {{nombre}}", Cuerpo: "Compites el **{{dia}}**: la competición empieza a las **{{hora}}** y sales en el lote {{lote}}.\n\nPesaje: **{{pesaje}}** en la Sala 2.\n\nRellena la previa del pesaje en tu área y el día irá más rápido.", BotonTexto: "Ir a mi área", BotonURL: "{{enlace}}"}, ContenidoWA{Texto: "*Ya tienes horario, {{nombre}}* 🗓\n\nCompites el *{{dia}}*: la competición empieza a las *{{hora}}* (lote {{lote}}).\nPesaje: *{{pesaje}}*.\n\nRellena la previa del pesaje en tu área y el día irá más rápido.", ImagenURL: logoURL, Botones: []BotonWA{{Texto: "Ir a mi área", URL: "{{enlace}}"}, {Texto: "Ver los horarios", URL: "{{horarios}}"}}}),
	pwa("horario-cambio", "Cambio en tu horario", "Al publicar una versión que cambia tu fecha, hora, pesaje, categoría o nivel", "athletes", "horarios", true, []string{"nombre", "atleta", "dia", "hora", "lote", "pesaje", "sesion", "nivel", "antes", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Cambio en tu horario: {{dia}} a las {{hora}}", Preheader: "Pesaje {{pesaje}}", Titulo: "Ha cambiado tu horario", Cuerpo: "Hola {{nombre}}, hemos publicado una nueva versión de los horarios.\n\nAntes: {{antes}}.\n\nAhora compites el **{{dia}}**, empieza a las **{{hora}}** (lote {{lote}}). Pesaje: **{{pesaje}}**.\n\nSesión: **{{sesion}}** · Nivel: **{{nivel}}**.", BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}"}, ContenidoWA{Texto: "*Ha cambiado tu horario*\n\nHola {{nombre}}.\nAntes: {{antes}}.\nAhora compites el *{{dia}}*: empieza a las *{{hora}}* (lote {{lote}}).\nPesaje: *{{pesaje}}*.\nSesión: *{{sesion}}* · Nivel: *{{nivel}}*.", Botones: []BotonWA{{Texto: "Ver los horarios", URL: "{{horarios}}"}, {Texto: "Ir a mi área", URL: "{{enlace}}"}}}),
	pwa("horario-sin-fecha", "Sin fecha asignada", "Al quedarte fuera de los horarios publicados", "athletes", "horarios", true, []string{"nombre", "atleta", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Tu horario está pendiente", Titulo: "Tu horario está pendiente", Cuerpo: "Hola {{nombre}}, en la última versión de los horarios no tienes fecha de competición asignada. Te escribiremos en cuanto lo tengamos.\n\nSi crees que es un error, responde a este email."}, ContenidoWA{Texto: "*Tu horario está pendiente*\n\nHola {{nombre}}, en la última versión de los horarios no tienes fecha asignada. Te escribiremos en cuanto la tengamos.", Botones: []BotonWA{{Texto: "Ver los horarios", URL: "{{horarios}}"}}}),
	p("horario-seguidor", "Horario de un atleta que sigues", "Al publicar los horarios (avisos de seguidores)", "athletes", "seguidores", false, []string{"atleta", "lote", "dia", "hora", "enlace", "horarios", "baja"}, ejHorario,
		Contenido{Asunto: "{{atleta}} compite el {{dia}} a las {{hora}}", Titulo: "{{atleta}} ya tiene horario", Cuerpo: "**{{atleta}}** compite el **{{dia}}**; la competición empieza a las **{{hora}}** (lote {{lote}}).\n\nTe escribiremos también 30 minutos antes de que salga.", BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("atleta-sale-30min", "Tu atleta sale en 30 min", "30 minutos antes de que empiece su día", "athletes", "salida30", false, []string{"atleta", "hora", "enlace", "horarios", "baja"}, ejHorario,
		Contenido{Asunto: "{{atleta}} sale en 30 minutos", Titulo: "¡{{atleta}} sale en 30 minutos!", Cuerpo: "La competición de {{atleta}} empieza a las **{{hora}}**. Si vas a verlo, ya es hora de ir al pabellón; si no, síguelo en directo.", BotonTexto: "Horarios en directo", BotonURL: "{{horarios}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("resultados-atleta", "Tus resultados", "Al publicar los resultados de su categoría", "athletes", "resultados", false, []string{"nombre", "atleta", "categoria", "puesto", "total", "resultado", "enlace"}, ejResultado,
		Contenido{Asunto: "Tus resultados · {{categoria}}", Preheader: "{{resultado}}", Titulo: "¡Gracias por competir, {{nombre}}!", Cuerpo: "Ya están publicados los resultados de **{{categoria}}**: terminaste **{{resultado}}**.\n\nEl acta oficial la valida la AEP. En unos días subiremos las fotos a la galería.", BotonTexto: "Ver la clasificación", BotonURL: "{{enlace}}"}),
	p("resultados-seguidor", "Resultados de un atleta que sigues", "Al publicar los resultados de su categoría", "athletes", "resultados", false, []string{"atleta", "categoria", "puesto", "total", "resultado", "enlace", "baja"}, ejResultado,
		Contenido{Asunto: "Resultados de {{atleta}} · {{categoria}}", Titulo: "{{atleta}}: {{resultado}}", Cuerpo: "Ya están publicados los resultados de **{{categoria}}**. **{{atleta}}** terminó **{{resultado}}**.", BotonTexto: "Ver la clasificación", BotonURL: "{{enlace}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("voluntario-recibido", "Solicitud de voluntariado recibida", "Al enviar el formulario de voluntarios", "cms", "voluntarios", true, []string{"nombre"},
		map[string]string{"nombre": "Pablo"},
		Contenido{Asunto: "Hemos recibido tu solicitud de voluntariado", Titulo: "¡Gracias, {{nombre}}!", Cuerpo: "Hemos recibido tu solicitud para ser voluntario en la GR Strength Cup. Te escribiremos en unos días con el puesto y los turnos."}),
	p("voluntario-aceptado", "Bienvenida al equipo de voluntarios", "Al aceptar a un voluntario en el backoffice", "cms", "voluntarios", true, []string{"nombre", "puesto", "turno", "responsable"},
		map[string]string{"nombre": "Pablo", "puesto": "Cargadores", "turno": "Mañana", "responsable": "Nico García"},
		Contenido{Asunto: "¡Ya eres parte del equipo, {{nombre}}!", Titulo: "¡Bienvenido al equipo, {{nombre}}!", Cuerpo: "Te esperamos como voluntario en **{{puesto}}** · turno **{{turno}}**.\n\nTe coordina **{{responsable}}**. Unos días antes te enviaremos el briefing con la hora de llegada y lo que necesitas.\n\nSi no puedes venir, responde a este email cuanto antes."}),
	p("voluntario-rechazado", "Solicitud de voluntariado no aceptada", "Al rechazar una solicitud de voluntariado", "cms", "voluntarios", true, []string{"nombre", "motivo"},
		map[string]string{"nombre": "Pablo", "motivo": "Ya tenemos cubiertos todos los puestos."},
		Contenido{Asunto: "Sobre tu solicitud de voluntariado", Titulo: "Gracias, {{nombre}}", Cuerpo: "Gracias por ofrecerte como voluntario en la GR Strength Cup. Esta vez no podemos contar contigo:\n\n{{motivo}}\n\nTe tendremos en cuenta para la próxima edición."}),
	p("voluntario-briefing", "Briefing a los voluntarios", "Al escribir al equipo o a un rol desde el backoffice", "cms", "voluntarios", true, []string{"nombre", "asunto", "mensaje", "puesto", "turno"},
		map[string]string{"nombre": "Pablo", "asunto": "Briefing del sábado", "mensaje": "Llega a las 7:30 por la puerta lateral.", "puesto": "Cargadores", "turno": "Sábado mañana"},
		Contenido{Asunto: "{{asunto}}", Titulo: "Hola, {{nombre}}", Cuerpo: "{{mensaje}}\n\nTu puesto: **{{puesto}}** · turno **{{turno}}**."}),
	p("club-aprobado", "Club publicado en el directorio", "Al aprobar una solicitud de /clubs", "cms", "clubs", true, []string{"nombre", "club", "enlace"},
		map[string]string{"nombre": "Marta", "club": "Fuerza Isabel", "enlace": "https://grcup.example/clubs"},
		Contenido{Asunto: "Tu club ya está en el directorio de la GR Strength Cup", Titulo: "¡Bienvenidos, {{nombre}}!", Cuerpo: "Hemos revisado la solicitud y **{{club}}** ya aparece en el directorio de clubs de la GR Strength Cup.\n\nSi quieres cambiar algún dato o el logo, responde a este email.", BotonTexto: "Ver el directorio", BotonURL: "{{enlace}}"}),
	p("club-recibido", "Solicitud de club recibida", "Al enviar el formulario de /clubs", "cms", "clubs", true, []string{"nombre", "club"},
		map[string]string{"nombre": "Marta", "club": "Fuerza Isabel"},
		Contenido{Asunto: "Hemos recibido la solicitud de {{club}}", Titulo: "¡Gracias, {{nombre}}!", Cuerpo: "Hemos recibido la solicitud para añadir **{{club}}** al directorio de clubs de la GR Strength Cup.\n\nLa revisamos en 2–3 días y te avisamos por email cuando esté publicada."}),
	p("club-rechazado", "Solicitud de club no aprobada", "Al rechazar una solicitud de /clubs", "cms", "clubs", true, []string{"nombre", "club", "motivo"},
		map[string]string{"nombre": "Marta", "club": "Fuerza Isabel", "motivo": "No hemos podido verificar el club con la web ni las redes."},
		Contenido{Asunto: "Sobre la solicitud de {{club}}", Titulo: "Hola, {{nombre}}", Cuerpo: "Gracias por proponer **{{club}}** para el directorio de clubs. De momento no podemos añadirlo:\n\n{{motivo}}\n\nSi algo ha cambiado, responde a este email y lo revisamos de nuevo."}),
	withQR(p("entrada-confirmada", "Tu entrada", "Al reservar (y al reenviarla)", "ticketing", "entradas", true, []string{"nombre", "titular", "sesion", "dia", "puertas", "hasta", "personas", "codigo", "qr", "enlace", "lugar"}, ejEntrada,
		Contenido{Asunto: "Tu entrada · {{sesion}} · {{codigo}}", Preheader: "Enseña el QR en la puerta", Titulo: "¡Tienes entrada, {{nombre}}!", Cuerpo: "**{{titular}}** · {{sesion}}, {{dia}}. Puertas a las **{{puertas}}** (hasta las {{hasta}}).\n\n{{lugar}}\n\nEnseña este QR en la puerta desde el móvil: no hace falta imprimirlo. Si cambia algo, gestiona tu entrada con el botón.", BotonTexto: "Gestionar mi entrada", BotonURL: "{{enlace}}"})),
	p("entrada-enlace", "Enlace de «Mi entrada»", "Al pedir de nuevo el enlace", "ticketing", "entradas", true, []string{"nombre", "codigo", "sesion", "enlace"}, ejEntrada,
		Contenido{Asunto: "Tu enlace para gestionar la entrada {{codigo}}", Titulo: "Gestiona tu entrada", Cuerpo: "Hola {{nombre}}, aquí tienes el enlace de tu entrada {{codigo}} ({{sesion}}): ver el QR, cambiar cuántas personas venís o anularla.", BotonTexto: "Ver mi entrada", BotonURL: "{{enlace}}"}),
	p("entrada-anulada", "Entrada anulada", "Al anularla (titular u organización)", "ticketing", "entradas", true, []string{"nombre", "codigo", "sesion", "entradas"}, ejEntrada,
		Contenido{Asunto: "Entrada {{codigo}} anulada", Titulo: "Tu entrada está anulada", Cuerpo: "Hola {{nombre}}, la entrada {{codigo}} ({{sesion}}) está anulada y su QR ya no vale.\n\nSi fue un error, reserva de nuevo mientras queden plazas.", BotonTexto: "Ver entradas", BotonURL: "{{entradas}}"}),
	p("entrada-espera", "En la lista de espera", "Al apuntarse a la lista de espera", "ticketing", "espera", true, []string{"sesion", "personas"}, ejEntrada,
		Contenido{Asunto: "Estás en la lista de espera · {{sesion}}", Titulo: "Te avisamos si se libera plaza", Cuerpo: "Te hemos apuntado a la lista de espera de **{{sesion}}** para {{personas}} persona(s).\n\nSi alguien anula, te enviaremos un enlace y tendrás un plazo para confirmar tu entrada."}),
	p("entrada-oferta", "Plaza libre en la lista de espera", "Al liberarse plaza", "ticketing", "espera", true, []string{"nombre", "sesion", "dia", "personas", "caduca", "enlace"}, ejEntrada,
		Contenido{Asunto: "Hay plaza para ti · {{sesion}}", Titulo: "¡Se ha liberado una plaza!", Cuerpo: "Tienes **{{personas}} plaza(s)** para {{sesion}} ({{dia}}).\n\nConfírmala antes del **{{caduca}}**; después pasará a la siguiente persona.", BotonTexto: "Confirmar mi entrada", BotonURL: "{{enlace}}"}),
	withQR(p("entrada-recordatorio", "Recordatorio de la entrada", "Una semana y un día antes", "ticketing", "recordatorios", false, []string{"nombre", "titular", "sesion", "dia", "puertas", "hasta", "personas", "codigo", "qr", "enlace", "lugar", "cuando"}, ejEntrada,
		Contenido{Asunto: "{{sesion}} es {{cuando}} · tu entrada {{codigo}}", Titulo: "Nos vemos {{cuando}}, {{nombre}}", Cuerpo: "{{sesion}}, {{dia}}. Puertas a las **{{puertas}}**.\n\n{{lugar}}\n\nTen a mano este QR (o el email de tu entrada) para entrar sin colas.", BotonTexto: "Gestionar mi entrada", BotonURL: "{{enlace}}"})),
	p("novedades-confirmar", "Confirma tu suscripción", "Al suscribirse a las novedades (doble opt-in)", "crm", "novedades", true, []string{"enlace", "baja"},
		map[string]string{"enlace": "https://grcup.example/novedades/confirmar?t=…", "baja": "https://grcup.example/baja?t=…"},
		Contenido{Asunto: "Confirma que quieres recibir novedades", Titulo: "Confirma tu suscripción", Cuerpo: "Has pedido recibir las novedades de la GRS Cup 2: fechas, horarios, sorteo y próximas competiciones. Un email al mes como mucho.\n\nConfirma con el botón. Si no lo has pedido tú, ignora este email.", BotonTexto: "Confirmar suscripción", BotonURL: "{{enlace}}"}),
	// GRS3 «Avísame»: una sola confirmación, solo la primera vez que se apunta ese email (nunca en los repetidos).
	p("aviso-evento-confirmado", "Avísame: estás en la lista", "Al dejar el email en «Avísame» de una próxima competición (solo la primera vez)", "crm", "proximas", false, []string{"evento", "enlace"},
		map[string]string{"evento": "GRS Cup 3", "enlace": "https://grcup.example"},
		Contenido{Asunto: "Te avisaremos cuando abra la {{evento}}", Preheader: "Ya estás en la lista", Titulo: "Ya estás en la lista",
			Cuerpo: "Hemos apuntado tu email: te escribiremos en cuanto abramos las inscripciones de la **{{evento}}**, con las fechas y cómo reservar tu plaza.\n\nNo hace falta que hagas nada más. Si no lo has pedido tú, responde a este email y te quitamos de la lista.",
			BotonTexto: "Ver la web", BotonURL: "{{enlace}}"}),
	p("novedades-recordatorio", "Recordatorio: confirma tu suscripción", "48 h después sin confirmar", "crm", "novedades", false, []string{"enlace", "baja"},
		map[string]string{"enlace": "https://grcup.example/novedades/confirmar?t=…", "baja": "https://grcup.example/baja?t=…"},
		Contenido{Asunto: "¿Sigues queriendo novedades?", Titulo: "Te falta un paso", Cuerpo: "Hace dos días pediste recibir las novedades de la GRS Cup 2, pero no confirmaste. Si sigues queriendo, pulsa el botón; si no, no te escribiremos más.", BotonTexto: "Confirmar suscripción", BotonURL: "{{enlace}}"}),
	// ---- Alta de atleta (Figma 78 · «Emails y avisos» del alta). «foto» es la URL firmada de la foto de la
	// solicitud: caduca en 7 días y solo la ven los administradores. «match» es una frase corta («sugerida
	// (nombre y fecha de nacimiento)», «licencia», «email», «sin coincidencia»). «menor» es el aviso de menor de
	// edad (vacío si es mayor de edad). ----
	pwa("atleta-solicitud-recibida", "Solicitud de alta recibida", "Al enviar el formulario de alta de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "apellidos", "email", "telefono", "club", "ciudad", "marcas", "foto", "pasos", "urlAtletas"},
		map[string]string{"nombre": "Carlos", "apellidos": "García Molina", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456", "club": "Club Halter Valencia",
			"ciudad": "Valencia", "marcas": "180 / 120 / 220 kg", "foto": "blanco y negro · recortada", "pasos": "1. Revisamos a mano los datos de tu alta y tu foto.\n\n2. Te avisamos por email con el resultado y el acceso a tu área de atleta.\n\n3. Tu ficha queda privada: no aparece en /atletas hasta que actives su publicación desde el área de atleta.", "urlAtletas": "https://grcup.example/atletas"},
		Contenido{Asunto: "Hemos recibido tu solicitud de alta", Preheader: "Revisamos tu ficha a mano y te avisamos por email", Titulo: "{{nombre}}, hemos recibido tu solicitud de alta",
			Cuerpo:     "Tu solicitud para la ficha de atleta ya está en revisión. El equipo revisa cada solicitud a mano; te avisamos por email con el resultado.\n\n**Qué pasa ahora**\n\n{{pasos}}\n\n**Resumen de lo enviado**\n\n**Nombre:** {{nombre}} {{apellidos}}\n\n**Email:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Club · ciudad:** {{club}} · {{ciudad}}\n\n**Mejores marcas:** {{marcas}}\n\n**Foto:** {{foto}}\n\nSi algo no cuadra, escríbenos a admin@grstrength.com.",
			BotonTexto: "Ver la lista de atletas", BotonURL: "{{urlAtletas}}",
			Nota: "Recibes este email porque has enviado una solicitud de alta de atleta en la GR Cup 2026."},
		ContenidoWA{Texto: "¡Hola {{nombre}}! Hemos recibido tu solicitud de alta para la GR Cup 2026 ✍\n\nEl equipo revisa a mano. Cuando la revisemos te avisamos por aquí y por email.", Botones: []BotonWA{{Texto: "Ver atletas", URL: "{{urlAtletas}}"}}}),
	pwa("atleta-solicitud-nueva", "Nueva solicitud de alta", "Al enviar el formulario de alta de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "apellidos", "email", "telefono", "licencia", "club", "ciudad", "sexo", "edad", "fechaNacimiento", "marcas", "frase", "match", "menor", "coincidencia", "prueba", "foto", "urlRevisar"},
		map[string]string{"nombre": "Carlos", "apellidos": "García Molina", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456",
			"licencia": "AEP-2026-04512", "club": "Club Halter Valencia", "ciudad": "Valencia", "sexo": "M", "edad": "17 años (menor)", "fechaNacimiento": "12/03/2009",
			"marcas": "180 / 120 / 220 kg · total 520 kg", "frase": "«Primera temporada en juveniles»", "match": "sugerida (nombre y fecha de nacimiento)", "prueba": "AEP-2",
			"menor":        "⚠ Menor de edad · falta autorización. 17 años: la foto no se publica sin la autorización firmada de madre, padre o tutor. Súbela desde el panel de solicitudes; aprobar queda bloqueado hasta tenerla.",
			"coincidencia": "ℹ Coincidencia sugerida. Encaja con el atleta inscrito Carlos García (AEP-2026-04512) por nombre y fecha de nacimiento. Revisa las diferencias antes de aprobar.",
			"foto":         "https://grcup.example/api/competiciones/grcup/alta-atleta/foto/…?e=…&s=…", "urlRevisar": "https://grcup-bo.example/grcup/atletas/solicitudes"},
		Contenido{Asunto: "Nueva solicitud de alta · {{nombre}} {{apellidos}}", Preheader: "Revisa los datos antes de aprobar o rechazar", Titulo: "Nueva solicitud de alta · {{nombre}} {{apellidos}}",
			Imagen:     "{{foto}}",
			Cuerpo:     "Un atleta ha enviado el formulario de /alta-atleta. Revisa los datos declarados frente al atleta enlazado antes de aprobar o rechazar.\n\n**Nombre:** {{nombre}} {{apellidos}}\n\n**Email de la inscripción AEP:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Licencia AEP:** {{licencia}}\n\n**Club · ciudad:** {{club}} · {{ciudad}}\n\n**Sexo · edad:** {{sexo}} · {{edad}}\n\n**Fecha de nacimiento:** {{fechaNacimiento}}\n\n**Marcas SQ · BP · DL:** {{marcas}}\n\n**Competición:** {{prueba}}\n\n**Frase:** {{frase}}\n\n**Coincidencia:** {{match}}\n\n{{menor}}\n\n{{coincidencia}}",
			BotonTexto: "Revisar solicitud", BotonURL: "{{urlRevisar}}",
			Pie:  "Este email contiene datos personales: no lo reenvíes.",
			Nota: "Email automático del panel de solicitudes de atleta. La organización puede desactivar estos avisos en Backoffice › Emails y avisos."},
		ContenidoWA{Texto: "*Nueva solicitud de alta · {{nombre}} {{apellidos}}*\n\n{{sexo}} · {{edad}} · {{club}} · {{ciudad}}\n\n{{menor}}\n\n**Coincidencia:** {{match}}", Imagen: true, Botones: []BotonWA{{Texto: "Revisar la solicitud", URL: "{{urlRevisar}}"}}}),
	// ---- Solicitud de handler (GRS Coaching): llega a contactogr8@gmail.com y al WhatsApp +34 644 17 93 95. ----
	pwa("handler-solicitud", "Solicitud de handler", "Al marcar «No tengo handler / Asignadme uno» en el alta de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "apellidos", "email", "telefono", "edad", "prueba", "entrenador", "origen"},
		map[string]string{"nombre": "Carlos", "apellidos": "García Molina", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456", "edad": "24 años",
			"prueba": "AEP-2", "entrenador": "No", "origen": "Alta de atleta (casilla «No tengo handler / Asignadme uno»)"},
		Contenido{Asunto: "Solicitud de handler · {{nombre}} {{apellidos}}", Preheader: "Un atleta pide que le asignemos handler", Titulo: "Solicitud de handler · {{nombre}} {{apellidos}}",
			Cuerpo: "Un atleta pide que le asignemos un handler.\n\n**Nombre:** {{nombre}} {{apellidos}}\n\n**Email:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Edad:** {{edad}}\n\n**Competición:** {{prueba}}\n\n**¿Tiene entrenador?:** {{entrenador}}\n\n**Origen:** {{origen}}",
			Pie:    "Este email contiene datos personales: no lo reenvíes."},
		ContenidoWA{Texto: "*Solicitud de handler · {{nombre}} {{apellidos}}*\n\n{{telefono}} · {{email}}\n{{edad}} · {{prueba}}\n¿Entrenador?: {{entrenador}}\n\n{{origen}}"}),
	pwa("atleta-solicitud-aprobada", "Solicitud de alta aprobada", "Al aprobar una solicitud de alta (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "prueba", "urlFicha", "privada", "foto", "urlArea"},
		map[string]string{"nombre": "Carlos", "prueba": "AEP-2", "urlFicha": "https://grcup.example/atletas/carlos-garcia-molina", "privada": "✓ Tu ficha aún no es pública: actívala desde el área de atleta cuando quieras que aparezca en la lista de atletas.", "foto": "✓ Tu foto en blanco y negro ya está en tu ficha.", "urlArea": "https://grcup.example/area-atleta?t=…"},
		Contenido{Asunto: "Tu ficha de atleta ya está aprobada", Preheader: "Ya puedes entrar en tu área de atleta de la GR Cup 2026", Titulo: "{{nombre}}, tu ficha de atleta ya está aprobada",
			Cuerpo:     "Tu solicitud de alta está aprobada. Tu ficha queda lista con tu club y tus mejores marcas.\n\n{{foto}}\n\n✓ Competición: {{prueba}}.\n\n{{privada}}\n\n✓ Desde el área de atleta podrás editar tu foto, tus marcas y tu frase cuando quieras.",
			BotonTexto: "Entrar en mi área de atleta", BotonURL: "{{urlArea}}",
			Pie:  "Enlace personal: caduca en 7 días; luego puedes pedir otro desde el área de atleta.",
			Nota: "Recibes este email porque tu solicitud de alta en la GR Cup 2026 ha sido aprobada."},
		ContenidoWA{Texto: "¡Buenas, {{nombre}}! Tu ficha de atleta ya está aprobada ✓\n\n{{privada}}\n\nEntra en tu área de atleta para editar tu foto, tus marcas y tu frase.", Botones: []BotonWA{{Texto: "Ir a mi área", URL: "{{urlArea}}"}}}),
	pwa("atleta-solicitud-rechazada", "Solicitud de alta rechazada", "Al rechazar una solicitud de alta (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "motivo", "urlAlta"},
		map[string]string{"nombre": "Carlos", "motivo": "Tus datos no coinciden con los de tu inscripción: la fecha de nacimiento que has enviado (12/03/2009) no es la que figura en tu licencia.",
			"urlAlta": "https://grcup.example/alta-atleta"},
		Contenido{Asunto: "Tu solicitud de alta no se ha podido aprobar", Titulo: "{{nombre}}, tu solicitud de alta no se ha podido aprobar",
			Cuerpo:     "Hemos revisado tu solicitud de alta y, por ahora, no podemos publicar tu ficha. Tu inscripción en la competición sigue en vigor: esto no afecta a tu participación.\n\n**Motivo del rechazo**\n\n{{motivo}}\n\n✓ Puedes volver a enviar el formulario con los datos corregidos en cualquier momento.\n\n✓ Si crees que es un error, escríbenos a admin@grstrength.com y lo revisamos a mano.\n\n✓ Tu foto y los datos de la solicitud se borrarán de forma segura (las rechazadas se purgan a los 30 días).",
			BotonTexto: "Volver a enviar mi alta", BotonURL: "{{urlAlta}}",
			Pie:  "No es un bloqueo permanente: corrige el motivo indicado arriba y envía de nuevo.",
			Nota: "Recibes este email porque tu solicitud de alta en la GR Cup 2026 no ha podido ser aprobada."},
		ContenidoWA{Texto: "Hola {{nombre}}, tu solicitud de alta no se ha podido aprobar.\n\n{{motivo}}\n\nTu inscripción en la competición sigue en vigor: esto no afecta a tu participación.\n\nPuedes volver a enviarla con los datos corregidos.", Botones: []BotonWA{{Texto: "Volver a enviar", URL: "{{urlAlta}}"}}}),

	// ---- Cambio de perfil desde el área de atleta: el atleta propone y el equipo revisa antes de aplicar nada. ----
	pwa("atleta-cambio-perfil-nueva", "Cambio de perfil pendiente", "Al pedir un cambio en «Editar mi perfil» del área de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "apellidos", "email", "telefono", "club", "cambios", "cambiosWA", "urlRevisar"},
		map[string]string{"nombre": "Carlos", "apellidos": "García Molina", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456", "club": "Club Halter Valencia",
			"cambios":    "**Club:** Club Halter Manises (antes: Club Halter Valencia)\n\n**Sobre ti:** Primera temporada en juveniles, entrenando para el autonómico. (antes: Primera temporada en juveniles.)",
			"cambiosWA":  "• Club: *Club Halter Manises* (antes: Club Halter Valencia)\n• Sobre ti: *Primera temporada en juveniles, entrenando para el autonómico.*",
			"urlRevisar": "https://grcup-bo.example/grcup/atletas/solicitudes"},
		Contenido{Asunto: "Cambio de perfil · {{nombre}} {{apellidos}}", Preheader: "Revisa los cambios antes de aplicarlos", Titulo: "Cambio de perfil · {{nombre}} {{apellidos}}",
			Cuerpo:     "Un atleta ha pedido cambiar los datos de su ficha desde su área. Nada cambia hasta que apruebes la solicitud.\n\n**Email de contacto:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Club:** {{club}}\n\n**Cambios propuestos**\n\n{{cambios}}\n\n⚠ Los cambios solo se aplican al aprobar. Si la rechazas, la ficha se queda como está.",
			BotonTexto: "Revisar el cambio", BotonURL: "{{urlRevisar}}",
			Pie:  "Este email contiene datos personales: no lo reenvíes.",
			Nota: "Email automático del panel de solicitudes de atleta. La organización puede desactivar estos avisos en Backoffice › Emails y avisos."},
		ContenidoWA{Texto: "*Cambio de perfil · {{nombre}} {{apellidos}}*\n\n{{cambiosWA}}\n\nRevísalo en el panel: nada cambia hasta que lo apruebes.", Botones: []BotonWA{{Texto: "Revisar el cambio", URL: "{{urlRevisar}}"}}}),
	pwa("atleta-cambio-perfil-aprobado", "Cambios de perfil aprobados", "Al aprobar un cambio de perfil (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "cambios", "urlArea"},
		map[string]string{"nombre": "Carlos", "cambios": "**Club:** Club Halter Manises (antes: Club Halter Valencia)", "urlArea": "https://grcup.example/area-atleta"},
		Contenido{Asunto: "Hemos aplicado los cambios de tu ficha", Preheader: "Tu perfil ya está actualizado", Titulo: "{{nombre}}, tu ficha ya está actualizada",
			Cuerpo:     "Hemos revisado y aplicado los cambios que pediste desde tu área de atleta.\n\n**Cambios aplicados**\n\n{{cambios}}\n\n✓ Tu ficha ya muestra los datos nuevos.",
			BotonTexto: "Ir a mi área", BotonURL: "{{urlArea}}",
			Nota: "Recibes este email porque pediste cambiar los datos de tu ficha de atleta."},
		ContenidoWA{Texto: "¡Hola {{nombre}}! Ya hemos aplicado los cambios de tu ficha ✓\n\n{{cambios}}", Botones: []BotonWA{{Texto: "Ir a mi área", URL: "{{urlArea}}"}}}),
	pwa("atleta-cambio-perfil-rechazado", "Cambios de perfil rechazados", "Al rechazar un cambio de perfil (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "motivo", "urlArea"},
		map[string]string{"nombre": "Carlos", "motivo": "El nuevo club no consta en el directorio: escríbenos con el nombre completo y lo revisamos.",
			"urlArea": "https://grcup.example/area-atleta"},
		Contenido{Asunto: "No hemos podido aplicar los cambios de tu ficha", Titulo: "{{nombre}}, tus datos siguen como estaban",
			Cuerpo:     "Hemos revisado los cambios que pediste y no los hemos aplicado. Tu ficha sigue exactamente como estaba: no has perdido nada.\n\n**Motivo:** {{motivo}}\n\n✓ Puedes volver a pedir el cambio desde el área de atleta con los datos corregidos, o escribirnos si crees que es un error.",
			BotonTexto: "Ir a mi área", BotonURL: "{{urlArea}}",
			Nota: "Recibes este email porque pediste cambiar los datos de tu ficha de atleta."},
		ContenidoWA{Texto: "Hola {{nombre}}, no hemos aplicado los cambios de tu ficha: tus datos siguen como estaban.\n\n*Motivo:* {{motivo}}\n\nPuedes volver a pedir el cambio desde el área de atleta.", Botones: []BotonWA{{Texto: "Ir a mi área", URL: "{{urlArea}}"}}}),

	// ---- Autorización de madre, padre o tutor (atletas menores): el formulario va adjunto (PNG) y se sube firmado
	// desde un enlace personal; el equipo la revisa como una solicitud más. ----
	pwa("atleta-autorizacion-pedida", "Autorización del tutor: petición", "Al pulsar «Pedir autorización al tutor» en la ficha de un atleta menor", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "competicion", "enlace", "formulario"},
		map[string]string{"nombre": "Lucía", "competicion": "GRS Cup 2", "enlace": "https://grcup.example/autorizacion/…", "formulario": "https://cdn.grcup.example/autorizaciones/…/formulario-….png"},
		Contenido{Asunto: "Autorización de tu madre, padre o tutor · {{competicion}}", Preheader: "Fírmala y súbela desde tu enlace", Titulo: "{{nombre}}, necesitamos la autorización de tu tutor",
			Imagen:     "{{formulario}}",
			Cuerpo:     "Como eres menor de edad, para competir en la **{{competicion}}** (campeonato de powerlifting) necesitamos la autorización firmada de tu madre, padre o tutor legal. También autoriza el uso de tus datos y de tu imagen (fotos, vídeos, tu ficha pública de atleta, los resultados, el directo y los juegos como la porra o el fantasy).\n\n**Qué tenéis que hacer**\n\n1. Abrid el formulario adjunto (ya lleva tus datos).\n\n2. Tu madre, padre o tutor escribe su nombre, su DNI o NIE, la fecha y firma.\n\n3. Haced una foto o un escaneo y subidlo con el botón.\n\nHasta que la revisemos, tu ficha no es pública.",
			BotonTexto: "Subir la autorización", BotonURL: "{{enlace}}",
			Pie:  "Si no puedes abrir el adjunto, descarga el formulario desde el mismo enlace.",
			Nota: "Recibes este email porque estás inscrito como atleta menor de edad en la {{competicion}}."},
		ContenidoWA{Texto: "*Autorización de tu tutor · {{competicion}}*\n\nHola {{nombre}}. Como eres menor de edad, necesitamos la autorización firmada de tu madre, padre o tutor para competir en la {{competicion}} y para usar tus datos y tu imagen.\n\nRellenad la fecha y la firma en este formulario y subidlo aquí:\n{{enlace}}", ImagenURL: "{{formulario}}"}),
	pwa("atleta-autorizacion-nueva", "Autorización del tutor: nueva para revisar", "Al subir un atleta menor la autorización firmada", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "edad", "urlRevisar"},
		map[string]string{"nombre": "Lucía Pérez Gil", "edad": "16 años", "urlRevisar": "https://grcup-bo.example/grcup/atletas/solicitudes/…"},
		Contenido{Asunto: "Autorización de tutor para revisar · {{nombre}}", Preheader: "Revisa la firma antes de aprobarla", Titulo: "Autorización de tutor · {{nombre}}",
			Cuerpo:     "Ha llegado la autorización firmada del tutor de un atleta menor de edad.\n\n**Atleta:** {{nombre}}\n\n**Edad:** {{edad}}\n\nRevísala: al aprobarla su ficha pasa a ser pública (atletas, horarios, directo y juegos).",
			BotonTexto: "Revisar la autorización", BotonURL: "{{urlRevisar}}",
			Pie:  "Este email contiene datos personales: no lo reenvíes.",
			Nota: "Email automático del panel de solicitudes de atleta. La organización puede desactivar estos avisos en Backoffice › Emails y avisos."},
		ContenidoWA{Texto: "*Autorización de tutor para revisar*\n\n{{nombre}} · {{edad}}", Botones: []BotonWA{{Texto: "Revisar la autorización", URL: "{{urlRevisar}}"}}}),
	pwa("atleta-autorizacion-aprobada", "Autorización del tutor aprobada", "Al aprobar la autorización del tutor (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "competicion", "urlPerfil"},
		map[string]string{"nombre": "Lucía", "competicion": "GRS Cup 2", "urlPerfil": "https://grcup.example/atletas/lucia-perez-gil"},
		Contenido{Asunto: "Autorización aprobada · {{competicion}}", Preheader: "Tu ficha ya es pública", Titulo: "¡Todo listo, {{nombre}}!",
			Cuerpo:     "Hemos revisado y aprobado la autorización de tu madre, padre o tutor.\n\n✓ Ya puedes competir en la **{{competicion}}**.\n\n✓ Tu ficha de atleta ya aparece en la web, en los horarios, en el directo y en los juegos.",
			BotonTexto: "Ver mi ficha", BotonURL: "{{urlPerfil}}",
			Nota: "Recibes este email porque enviaste la autorización de tu tutor para la {{competicion}}."},
		ContenidoWA{Texto: "¡Hola {{nombre}}! Hemos aprobado la autorización de tu tutor ✓\n\nYa puedes competir en la {{competicion}} y tu ficha ya es pública.", Botones: []BotonWA{{Texto: "Ver mi ficha", URL: "{{urlPerfil}}"}}}),
	pwa("atleta-autorizacion-rechazada", "Autorización del tutor rechazada", "Al rechazar la autorización del tutor (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "motivo", "enlace"},
		map[string]string{"nombre": "Lucía", "motivo": "Falta la firma del tutor en la parte de abajo.", "enlace": "https://grcup.example/autorizacion/…"},
		Contenido{Asunto: "Necesitamos una nueva autorización firmada", Preheader: "Corrígela y súbela de nuevo con el mismo enlace", Titulo: "{{nombre}}, falta algo en la autorización",
			Cuerpo:     "Hemos revisado la autorización de tu madre, padre o tutor y no la hemos podido aprobar.\n\n**Motivo**\n\n{{motivo}}\n\n✓ Corrígelo y súbela de nuevo con el mismo enlace.",
			BotonTexto: "Subirla de nuevo", BotonURL: "{{enlace}}",
			Nota: "Recibes este email porque estás inscrito como atleta menor de edad."},
		ContenidoWA{Texto: "Hola {{nombre}}, necesitamos una nueva autorización firmada de tu tutor: no hemos podido aprobar la que enviaste.\n\n*Motivo:* {{motivo}}\n\nCorrígelo y súbela de nuevo aquí:\n{{enlace}}"}),

	// ---- Cuentas, contraseña y acción necesaria (Jaime 15-nov: avisos que faltaban) ----
	pwa("publico-cuenta-creada", "Cuenta de público creada", "Al crear la cuenta del directo como público", "fans", "accesos", true, []string{"alias", "competicion", "enlace", "fantasy", "porra"}, ejPublico,
		Contenido{Asunto: "Bienvenido al directo de la {{competicion}}", Preheader: "Chat, GRS Fantasy y GRS Porra con tu cuenta", Titulo: "¡Ya tienes cuenta, {{alias}}!",
			Cuerpo:     "Con tu cuenta puedes chatear en el directo, jugar a **GRS Fantasy** y participar en la **GRS Porra**.\n\nEntra cuando quieras con tu email y tu contraseña, o pide un enlace desde el directo.",
			BotonTexto: "Ir al directo", BotonURL: "{{enlace}}"}, ContenidoWA{Texto: "*¡Ya tienes cuenta, {{alias}}!* 🎉\n\nCon tu cuenta puedes chatear en el directo, jugar a *GRS Fantasy* y participar en la *GRS Porra*.", ImagenURL: logoURL, Botones: []BotonWA{{Texto: "Ir al directo", URL: "{{enlace}}"}, {Texto: "GRS Fantasy", URL: "{{fantasy}}"}, {Texto: "GRS Porra", URL: "{{porra}}"}}}),
	pwa("atleta-cuenta-creada", "Cuenta de atleta creada", "Al crear la cuenta del directo como atleta", "fans", "accesos", true, []string{"alias", "competicion", "enlace", "area"}, ejPublico,
		Contenido{Asunto: "Tu cuenta de atleta en la {{competicion}} está lista", Preheader: "Insignia de atleta en el chat y acceso a tu área", Titulo: "¡Bienvenido, {{alias}}!",
			Cuerpo:     "Tu cuenta del directo ya está vinculada a tu inscripción: en el chat aparecerás con la **insignia de atleta**.\n\nEn tu **área de atleta** tienes tu horario, tu QR de acreditación y la previa del pesaje.",
			BotonTexto: "Ir a mi área", BotonURL: "{{area}}"}, ContenidoWA{Texto: "*¡Bienvenido, {{alias}}!*\n\nTu cuenta del directo ya está vinculada a tu inscripción: en el chat aparecerás con la insignia de atleta.", Botones: []BotonWA{{Texto: "Ir a mi área", URL: "{{area}}"}, {Texto: "Ir al directo", URL: "{{enlace}}"}}}),
	p("atleta-contrasena", "Cambiar la contraseña del área de atleta", "Al pulsar «¿Has olvidado tu contraseña?» en el área de atleta", "athletes", "accesos", true, []string{"nombre", "enlace"},
		map[string]string{"nombre": "Laura", "enlace": "https://grcup.example/area-atleta?t=…"},
		Contenido{Asunto: "Cambia tu contraseña del área de atleta", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{nombre}}",
			Cuerpo:     "Has pedido cambiar la contraseña de tu área de atleta. Entra con este enlace y escribe la nueva en **«Cambiar contraseña»**.\n\nCaduca en 30 minutos. Si no lo has pedido tú, ignora este email: tu contraseña sigue igual.",
			BotonTexto: "Cambiar mi contraseña", BotonURL: "{{enlace}}"}),
	pwa("atleta-accion-necesaria", "Acción necesaria", "Cuando la organización pide algo al atleta desde el backoffice", "athletes", "inscripcion", true, []string{"nombre", "accion", "detalle", "fecha", "enlace"},
		map[string]string{"nombre": "Laura", "accion": "Sube tu licencia AEP", "detalle": "Necesitamos una foto de tu licencia en vigor para validar tu inscripción.", "fecha": "viernes 11 de diciembre", "enlace": "https://grcup.example/area-atleta?t=…"},
		Contenido{Asunto: "Acción necesaria: {{accion}}", Preheader: "{{detalle}}", Titulo: "{{nombre}}, necesitamos algo de ti",
			Cuerpo:     "**{{accion}}**\n\n{{detalle}}\n\nHazlo antes del **{{fecha}}** para no perder tu plaza.",
			BotonTexto: "Resolverlo ahora", BotonURL: "{{enlace}}"},
		ContenidoWA{Texto: "*Acción necesaria · {{accion}}*\n\nHola {{nombre}}. {{detalle}}\n\nHazlo antes del *{{fecha}}* para no perder tu plaza.", Botones: []BotonWA{{Texto: "Resolverlo ahora", URL: "{{enlace}}"}}}),
	// ---- Perfil de atleta creado por la organización: acceso con email y contraseña inicial (Jaime 25-nov). «password»
	// viaja sellada (pkg/crypto.SellarVar): solo se abre al renderizar el mensaje que se envía. ----
	pwa("atleta-perfil-existe", "Tu perfil de atleta ya existe", "Al pulsar «Enviar acceso al perfil» en Atletas (backoffice)", "athletes", "inscripcion", true, []string{"nombre", "enlace", "email", "password"},
		map[string]string{"nombre": "Jaime", "enlace": "https://grscup.com/area-atleta", "email": "jaime@example.com", "password": "jaime4589"},
		Contenido{Asunto: "{{nombre}}, bienvenido a la GRS Cup 2", Preheader: "Entra con tu email y tu contraseña y complétalo", Titulo: "{{nombre}}, bienvenido a la GRS Cup 2",
			Cuerpo:     "Ya hemos creado tu perfil de atleta en la **GRS Cup 2**. Entra en tu área de atleta y complétalo para que tu ficha esté lista antes de la competición.\n\n**Qué puedes completar**\n\n✓ Tus datos de contacto: email y teléfono.\n\n✓ Tu foto de perfil.\n\n✓ Tus mejores marcas y tu frase.\n\n**Tus datos de acceso**\n\n**Página de acceso:** {{enlace}}\n\n**Email:** {{email}}\n\n**Contraseña inicial:** {{password}}\n\n⚠ Cambia la contraseña al entrar. Es una contraseña inicial: al entrar por primera vez te pediremos que elijas una tuya de al menos 10 caracteres.",
			BotonTexto: "Entrar en mi área de atleta", BotonURL: "{{enlace}}",
			Pie:  "¿No puedes entrar? En la misma página puedes pedir un enlace por email, o escríbenos a admin@grstrength.com.",
			Nota: "Recibes este email porque tienes un perfil de atleta en la GRS Cup 2."},
		ContenidoWA{Texto: "*{{nombre}}, bienvenido a la GRS Cup 2* 🏋️\n\nEntra en tu área de atleta y complétalo: datos de contacto, foto, marcas y frase.\n\nEmail: {{email}}\nContraseña inicial: *{{password}}*\n\nAl entrar por primera vez te pediremos que la cambies.", Botones: []BotonWA{{Texto: "Entrar en mi área", URL: "{{enlace}}"}}}),
	// ---- Avisos al público (cuentas del directo de tipo público; baja con {{baja}}) ----
	pwa("publico-horarios-publicados", "Horarios publicados (público)", "Al publicar los horarios por primera vez", "fans", "publico", false, []string{"alias", "competicion", "horarios", "baja"}, ejPublico,
		Contenido{Asunto: "Ya están los horarios de la {{competicion}}", Preheader: "Qué día y a qué hora compite cada atleta", Titulo: "Ya hay horarios",
			Cuerpo:     "Hola {{alias}}, hemos publicado los horarios: consulta qué día y a qué hora compite cada atleta.\n\nActiva el aviso de los atletas que quieras seguir y te escribiremos 30 minutos antes de que salgan.",
			BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}"}, ContenidoWA{Texto: "*Ya están los horarios de la {{competicion}}* 🗓\n\nConsulta qué día y a qué hora compite cada atleta y activa el aviso de los que quieras seguir.\n\n_Responde BAJA si no quieres más avisos._", Botones: []BotonWA{{Texto: "Ver los horarios", URL: "{{horarios}}"}}}),
	pwa("publico-directo-iniciado", "Directo iniciado (público)", "Al empezar la retransmisión de cada día", "fans", "publico", false, []string{"alias", "competicion", "dia", "enlace", "baja"}, ejPublico,
		Contenido{Asunto: "Empieza el directo · {{dia}}", Preheader: "Streaming, marcador y chat", Titulo: "¡Estamos en directo!",
			Cuerpo:     "Arranca la competición del **{{dia}}**. Míralo en streaming, sigue el marcador y entra al chat: participar te da monedas para **GRS Fantasy** y la **GRS Porra**.",
			BotonTexto: "Ver el directo", BotonURL: "{{enlace}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}"}, ContenidoWA{Texto: "*🔴 ¡Estamos en directo!*\n\nArranca la competición del *{{dia}}*. Streaming, marcador y chat: participar te da monedas para GRS Fantasy y la GRS Porra.", Botones: []BotonWA{{Texto: "Ver el directo", URL: "{{enlace}}"}}}),
	pwa("publico-competicion-cerca", "La competición se acerca", "El día antes de que empiece la competición", "fans", "publico", false, []string{"alias", "competicion", "dia", "lugar", "horarios", "entradas", "baja"}, ejPublico,
		Contenido{Asunto: "Mañana empieza la {{competicion}}", Preheader: "{{dia}} · {{lugar}}", Titulo: "¡Es mañana!",
			Cuerpo:     "La {{competicion}} empieza el **{{dia}}** en {{lugar}}.\n\nSi vienes, reserva tu entrada gratis: {{entradas}}\n\nSi no puedes venir, síguela en directo y juega a GRS Fantasy y la GRS Porra.",
			BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}"}, ContenidoWA{Texto: "*¡Mañana empieza la {{competicion}}!*\n\n{{dia}} · {{lugar}}.\n\nSi vienes, reserva tu entrada gratis; si no, síguela en directo.", ImagenURL: logoURL, Botones: []BotonWA{{Texto: "Entrada gratis", URL: "{{entradas}}"}, {Texto: "Ver los horarios", URL: "{{horarios}}"}}}),
	// ---- Anuncios (uno por cuenta de público, 40 minutos después de crearla) ----
	pwa("publico-anuncio-juegos", "Anuncio: GRS Fantasy y GRS Porra", "40 minutos después de crear la cuenta de público (una vez)", "fans", "anuncios", false, []string{"alias", "competicion", "fantasy", "porra", "baja"}, ejPublico,
		Contenido{Asunto: "Juega a GRS Fantasy y la GRS Porra", Preheader: "Gratis y con tu cuenta del directo", Titulo: "Demuestra cuánto sabes de powerlifting",
			Cuerpo:     "**GRS Fantasy**: ficha a tus atletas, gestiona tu equipo y suma puntos con cada levantamiento.\n\n**GRS Porra**: acierta quién gana cada categoría y escala en la clasificación: {{porra}}\n\nEs gratis y ya puedes jugar con tu cuenta.",
			BotonTexto: "Jugar a GRS Fantasy", BotonURL: "{{fantasy}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}"}, ContenidoWA{Texto: "*Demuestra cuánto sabes de powerlifting* 🏋️\n\n*GRS Fantasy*: ficha a tus atletas y suma puntos con cada levantamiento.\n*GRS Porra*: acierta quién gana cada categoría.\n\nEs gratis con tu cuenta.", Botones: []BotonWA{{Texto: "Jugar a GRS Fantasy", URL: "{{fantasy}}"}, {Texto: "Jugar a la GRS Porra", URL: "{{porra}}"}}}),
	pwa("publico-anuncio-chat", "Anuncio: chat del directo y monedas", "40 minutos después de crear la cuenta de público (una vez)", "fans", "anuncios", false, []string{"alias", "competicion", "enlace", "baja"}, ejPublico,
		Contenido{Asunto: "Entra al chat del directo y gana monedas", Preheader: "Monedas para GRS Fantasy y la GRS Porra", Titulo: "El chat te da monedas",
			Cuerpo:     "Durante el directo, comentar y participar en el chat te da **monedas** para **GRS Fantasy** y la **GRS Porra**.\n\nCuanto más participes, más monedas.",
			BotonTexto: "Ir al directo", BotonURL: "{{enlace}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}"}, ContenidoWA{Texto: "*El chat del directo te da monedas* 💬\n\nComenta y participa durante el directo y gana monedas para GRS Fantasy y la GRS Porra.", Botones: []BotonWA{{Texto: "Ir al directo", URL: "{{enlace}}"}}}),
	// ---- GRS Fantasy: solicitud para unirse a una sala (al anfitrión; una vez por jugador y sala; esencial: el día
	// empieza con la primera sesión, no puede esperar al final del evento) ----
	pwa("fantasy-sala-solicitud", "GRS Fantasy: solicitud para tu sala", "Cuando alguien pide unirse a tu sala de GRS Fantasy (una vez por jugador y sala)", "juegos", "fantasy-salas", true,
		[]string{"alias", "sala", "enlace", "baja"},
		map[string]string{"alias": "laurafit", "sala": "LOS DEL BANCO", "enlace": "https://grcup.example/fantasy/salas/…#solicitudes", "baja": "https://grcup.example/api/competiciones/grcup/fans/avisos/baja?t=…"},
		Contenido{Asunto: "{{alias}} quiere unirse a tu sala {{sala}}", Preheader: "Acepta o rechaza su solicitud en GRS Fantasy", Titulo: "Nueva solicitud para tu sala",
			Cuerpo:     "**{{alias}}** quiere unirse a tu sala **{{sala}}** de GRS Fantasy.\n\nEntra en la sala para aceptarla o rechazarla antes de que empiece el día.",
			BotonTexto: "Ver la solicitud", BotonURL: "{{enlace}}", Pie: "¿No quieres más avisos del directo? Date de baja aquí: {{baja}}",
			Nota: "Recibes este email porque eres el anfitrión de la sala {{sala}} de GRS Fantasy."},
		ContenidoWA{Texto: "*{{alias}} quiere unirse a tu sala {{sala}} de GRS Fantasy* 🏋️\n\nAcepta o rechaza su solicitud desde la sala.\n\n_Responde BAJA si no quieres más avisos._", Botones: []BotonWA{{Texto: "Ver la solicitud", URL: "{{enlace}}"}}}),
}

var ejPublico = map[string]string{"alias": "laurafit", "competicion": "GRS Cup 2", "enlace": "https://grcup.example/en-directo", "area": "https://grcup.example/area-atleta",
	"fantasy": "https://grcup.example/fantasy", "porra": "https://grcup.example/porra", "horarios": "https://grcup.example/horarios", "entradas": "https://grcup.example/entradas",
	"dia": "sábado 19 de diciembre", "lugar": "Pavelló Municipal d'Almussafes", "baja": "https://grcup.example/api/competiciones/grcup/fans/avisos/baja?t=…"}

var porClave = func() map[string]Plantilla {
	m := map[string]Plantilla{}
	for _, t := range catalogo {
		m[t.Clave] = t
	}
	return m
}()

func autoDe(clave string) (Automatizacion, bool) {
	for _, a := range automatizaciones {
		if a.Clave == clave {
			return a, true
		}
	}
	return Automatizacion{}, false
}

func withQR(t Plantilla) Plantilla {
	t.QR = true
	return t
}

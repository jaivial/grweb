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
	{Clave: "inscripcion", Nombre: "Inscripción, reserva y pagos", Cuando: "al pagar o cambiar", Publico: "Atletas inscritos", Canales: []string{"email"}, Esencial: true},
	{Clave: "horarios", Nombre: "Tu flight y horario", Cuando: "al publicar horarios", Publico: "Atletas afectados", Canales: []string{"email"}, Esencial: true},
	{Clave: "seguidores", Nombre: "Avisos a seguidores", Cuando: "al publicar horarios", Publico: "Seguidores con aviso confirmado", Canales: []string{"email"}},
	{Clave: "salida30", Nombre: "Tu atleta sale en 30 min", Cuando: "−30 min del flight", Publico: "Seguidores con aviso confirmado", Canales: []string{"email"}},
	{Clave: "resultados", Nombre: "Resultados publicados", Cuando: "al publicar cada categoría", Publico: "Atletas de la categoría y sus seguidores", Canales: []string{"email"}},
	{Clave: "sorteo", Nombre: "Sorteo: boletos, reembolsos y ganador", Cuando: "al pagar · reembolsar · confirmar el ganador", Publico: "Compradores de boletos", Canales: []string{"email"}, Esencial: true},
	{Clave: "plaza", Nombre: "Plaza libre en la reserva", Cuando: "al liberarse plaza", Publico: "Lista de reserva", Canales: []string{"email"}},
	{Clave: "novedades", Nombre: "Novedades: doble opt-in", Cuando: "al suscribirse · recordatorio a las 48 h", Publico: "Suscripciones pendientes", Canales: []string{"email"}},
	{Clave: "entradas", Nombre: "Entradas: confirmación, cambios y anulación", Cuando: "al reservar o cambiar", Publico: "Reservas", Canales: []string{"email"}, Esencial: true},
	{Clave: "espera", Nombre: "Lista de espera: alta y oferta de plaza", Cuando: "al apuntarse · al liberarse plaza", Publico: "Lista de espera", Canales: []string{"email"}, Esencial: true},
	{Clave: "recordatorios", Nombre: "Recordatorios de la entrada", Cuando: "T−7 · T−1 (con QR)", Publico: "Reservas activas", Canales: []string{"email"}},
	{Clave: "voluntarios", Nombre: "Voluntariado recibido", Cuando: "al enviar la solicitud", Publico: "Voluntarios", Canales: []string{"email"}},
	{Clave: "clubs", Nombre: "Directorio de clubs", Cuando: "al aprobar o rechazar una solicitud (si se marca «Avisar»)", Publico: "Quien propone un club", Canales: []string{"email"}},
	{Clave: "solicitudes-atleta", Nombre: "Solicitudes de atleta", Cuando: "al enviar el alta y al aprobar o rechazarla", Publico: "Atletas que se dan de alta y el equipo", Canales: []string{"email", "whatsapp"}},
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

var ejSorteo = map[string]string{"nombre": "Laura", "boletos": "0427, 0428", "cantidad": "2", "importe": "2,00 €", "premio": "Cinturón SBD 13 mm", "fechaSorteo": "19/12 21:00",
	"enlace": "https://grcup.example/sorteo/confirmacion?compra=…", "numero": "0427", "motivo": "Compra duplicada"}

var ejHorario = map[string]string{"nombre": "Laura", "atleta": "Laura Gómez Ruiz", "flight": "B", "plataforma": "1", "dia": "sábado 19/12", "hora": "10:30", "pesaje": "08:30–10:00",
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
		Contenido{Asunto: "Tu acceso al área de atleta", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{nombre}}", Cuerpo: "Aquí tienes tu enlace para entrar al área de atleta: tu QR de acreditación, tu flight y la previa del pesaje.\n\nCaduca en 30 minutos.", BotonTexto: "Entrar a mi área", BotonURL: "{{enlace}}"}),
	p("fans-acceso", "Acceso al directo (chat, porra y fantasy)", "Al pedir el enlace en /en-directo", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…"},
		Contenido{Asunto: "Tu enlace para entrar al directo", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para entrar al directo de la GR Cup: chatea, dona y juega a la porra y a GRS Fantasy.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Entrar al directo", BotonURL: "{{enlace}}"}),
	p("fans-acceso-inscripcion", "Acceso para inscribirse", "Al pedir el enlace desde /inscripcion", "fans", "accesos", true, []string{"alias", "tipo", "enlace"},
		map[string]string{"alias": "Laura_PL", "tipo": "publico", "enlace": "https://grcup.example/acceso?acceso=…&next=%2Finscripcion"},
		Contenido{Asunto: "Tu enlace para continuar con la inscripción", Preheader: "Enlace válido 30 minutos", Titulo: "Hola, {{alias}}", Cuerpo: "Pulsa el botón para volver a la inscripción de la GR Cup con tu cuenta y terminarla.\n\nEl enlace caduca en 30 minutos y solo funciona una vez. Si no lo has pedido tú, ignora este email.", BotonTexto: "Continuar la inscripción", BotonURL: "{{enlace}}"}),
	p("seguimiento-confirmar", "Confirma tu aviso", "Al pulsar «Avísame cuando compita»", "athletes", "accesos", true, []string{"atleta", "enlace"},
		map[string]string{"atleta": "Laura Gómez Ruiz", "enlace": "https://grcup.example/atletas/laura-gomez-ruiz?aviso=…"},
		Contenido{Asunto: "Confirma tu aviso de {{atleta}}", Titulo: "¿Te avisamos?", Cuerpo: "Has pedido que te escribamos 30 minutos antes de que **{{atleta}}** salga a la plataforma.\n\nConfirma con el botón. Si no lo has pedido tú, ignora este email y no te escribiremos.", BotonTexto: "Confirmar aviso", BotonURL: "{{enlace}}"}),
	p("atleta-tienes-plaza", "Tienes plaza", "Al pasar de la reserva a confirmado", "athletes", "plaza", true, []string{"nombre", "enlace"},
		map[string]string{"nombre": "Marta", "enlace": "https://grcup.example/area-atleta"},
		Contenido{Asunto: "¡Tienes plaza en la GR Cup!", Titulo: "¡Tienes plaza, {{nombre}}!", Cuerpo: "Se ha liberado una plaza y ya estás confirmada en la competición.\n\nCompleta tu perfil y la previa del pesaje desde tu área.", BotonTexto: "Ir a mi área", BotonURL: "{{enlace}}"}),
	p("inscripcion-confirmada", "Inscripción confirmada", "Al pagar la inscripción", "athletes", "inscripcion", true, []string{"nombre", "total", "codigoReferido"},
		map[string]string{"nombre": "Laura", "total": "26,25 €", "codigoReferido": "LAURA412"},
		Contenido{Asunto: "Inscripción confirmada · GR Strength Cup", Preheader: "Pagado {{total}}", Titulo: "¡Ya estás dentro, {{nombre}}!", Cuerpo: "Hemos recibido tu pago de **{{total}}**. Tu inscripción está confirmada.\n\nTu código para invitar: **{{codigoReferido}}**. Quien se inscriba con él tiene descuento y a ti te devolvemos parte de tu cuota.\n\nTe avisaremos cuando publiquemos los flights y horarios."}),
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
	p("horario-publicado", "Tu flight y horario", "Al publicar los horarios por primera vez", "athletes", "horarios", true, []string{"nombre", "atleta", "flight", "plataforma", "dia", "hora", "pesaje", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Tu horario: Flight {{flight}} · {{dia}} {{hora}}", Preheader: "Pesaje {{pesaje}}", Titulo: "Ya tienes horario, {{nombre}}", Cuerpo: "Compites en el **Flight {{flight}}** (plataforma {{plataforma}}) el {{dia}} a las **{{hora}}**.\n\nPesaje: **{{pesaje}}** en la Sala 2.\n\nRellena la previa del pesaje en tu área y el día irá más rápido.", BotonTexto: "Ir a mi área", BotonURL: "{{enlace}}"}),
	p("horario-cambio", "Cambio en tu horario", "Al publicar una versión que cambia tu flight u hora", "athletes", "horarios", true, []string{"nombre", "atleta", "flight", "plataforma", "dia", "hora", "pesaje", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Cambio en tu horario: Flight {{flight}} · {{hora}}", Preheader: "Pesaje {{pesaje}}", Titulo: "Ha cambiado tu horario", Cuerpo: "Hola {{nombre}}, hemos publicado una nueva versión de los horarios.\n\nAhora compites en el **Flight {{flight}}** (plataforma {{plataforma}}) el {{dia}} a las **{{hora}}**. Pesaje: **{{pesaje}}**.", BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}"}),
	p("horario-sin-flight", "Sin flight asignado", "Al quedarte fuera de los flights publicados", "athletes", "horarios", true, []string{"nombre", "atleta", "enlace", "horarios", "version"}, ejHorario,
		Contenido{Asunto: "Tu horario está pendiente", Titulo: "Tu horario está pendiente", Cuerpo: "Hola {{nombre}}, en la última versión de los horarios no apareces en ningún flight. Te escribiremos en cuanto lo tengamos.\n\nSi crees que es un error, responde a este email."}),
	p("horario-seguidor", "Horario de un atleta que sigues", "Al publicar los horarios (avisos de seguidores)", "athletes", "seguidores", false, []string{"atleta", "flight", "dia", "hora", "enlace", "horarios", "baja"}, ejHorario,
		Contenido{Asunto: "{{atleta}} compite el {{dia}} a las {{hora}}", Titulo: "{{atleta}} ya tiene horario", Cuerpo: "**{{atleta}}** compite en el **Flight {{flight}}** el {{dia}} a las **{{hora}}**.\n\nTe escribiremos también 30 minutos antes de que salga.", BotonTexto: "Ver los horarios", BotonURL: "{{horarios}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("atleta-sale-30min", "Tu atleta sale en 30 min", "30 minutos antes de su flight", "athletes", "salida30", false, []string{"atleta", "flight", "hora", "enlace", "horarios", "baja"}, ejHorario,
		Contenido{Asunto: "{{atleta}} sale en 30 minutos", Titulo: "¡{{atleta}} sale en 30 minutos!", Cuerpo: "El **Flight {{flight}}** empieza a las **{{hora}}**. Si vas a verlo, ya es hora de ir al pabellón; si no, síguelo en directo.", BotonTexto: "Horarios en directo", BotonURL: "{{horarios}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("resultados-atleta", "Tus resultados", "Al publicar los resultados de su categoría", "athletes", "resultados", false, []string{"nombre", "atleta", "categoria", "puesto", "total", "resultado", "enlace"}, ejResultado,
		Contenido{Asunto: "Tus resultados · {{categoria}}", Preheader: "{{resultado}}", Titulo: "¡Gracias por competir, {{nombre}}!", Cuerpo: "Ya están publicados los resultados de **{{categoria}}**: terminaste **{{resultado}}**.\n\nEl acta oficial la valida la AEP. En unos días subiremos las fotos a la galería.", BotonTexto: "Ver la clasificación", BotonURL: "{{enlace}}"}),
	p("resultados-seguidor", "Resultados de un atleta que sigues", "Al publicar los resultados de su categoría", "athletes", "resultados", false, []string{"atleta", "categoria", "puesto", "total", "resultado", "enlace", "baja"}, ejResultado,
		Contenido{Asunto: "Resultados de {{atleta}} · {{categoria}}", Titulo: "{{atleta}}: {{resultado}}", Cuerpo: "Ya están publicados los resultados de **{{categoria}}**. **{{atleta}}** terminó **{{resultado}}**.", BotonTexto: "Ver la clasificación", BotonURL: "{{enlace}}", Pie: "Recibes este email porque activaste el aviso de {{atleta}}. Desactívalo aquí: {{baja}}"}),
	p("sorteo-boletos", "Tus boletos del sorteo", "Al pagar los boletos (y al reenviarlos)", "raffle", "sorteo", true, []string{"nombre", "boletos", "cantidad", "importe", "premio", "fechaSorteo", "enlace"}, ejSorteo,
		Contenido{Asunto: "Tus boletos del sorteo: {{boletos}}", Preheader: "Guarda este email: el número es tu boleto", Titulo: "¡Ya participas, {{nombre}}!", Cuerpo: "Tus boletos: **{{boletos}}** ({{cantidad}} · {{importe}}).\n\nEl sorteo del **{{premio}}** es el {{fechaSorteo}}, en directo.\n\nGuarda este email: el número es tu boleto.", BotonTexto: "Ver mis boletos", BotonURL: "{{enlace}}"}),
	p("sorteo-reembolso", "Reembolso del sorteo", "Al reembolsar una compra", "raffle", "sorteo", true, []string{"nombre", "importe", "boletos", "motivo"}, ejSorteo,
		Contenido{Asunto: "Te hemos devuelto {{importe}}", Titulo: "Reembolso del sorteo", Cuerpo: "Hola {{nombre}}, te hemos devuelto **{{importe}}** de los boletos {{boletos}}, que quedan anulados.\n\nMotivo: {{motivo}}\n\nEl banco puede tardar de 5 a 10 días en mostrarlo."}),
	p("sorteo-ganador", "Has ganado el sorteo", "Al confirmar el ganador", "raffle", "sorteo", true, []string{"nombre", "numero", "premio", "enlace"}, ejSorteo,
		Contenido{Asunto: "¡Has ganado el {{premio}}!", Titulo: "¡Enhorabuena, {{nombre}}!", Cuerpo: "Tu boleto **{{numero}}** ha ganado el **{{premio}}** en el sorteo de la GR Strength Cup.\n\nTe escribiremos para la entrega. Si estás en el pabellón, pásate por la mesa de la organización.", BotonTexto: "Ver el sorteo", BotonURL: "{{enlace}}"}),
	p("voluntario-recibido", "Solicitud de voluntariado recibida", "Al enviar el formulario de voluntarios", "cms", "voluntarios", true, []string{"nombre"},
		map[string]string{"nombre": "Pablo"},
		Contenido{Asunto: "Hemos recibido tu solicitud de voluntariado", Titulo: "¡Gracias, {{nombre}}!", Cuerpo: "Hemos recibido tu solicitud para ser voluntario en la GR Strength Cup. Te escribiremos en unos días con el puesto y los turnos."}),
	p("voluntario-aceptado", "Bienvenida al equipo de voluntarios", "Al aceptar a un voluntario en el backoffice", "cms", "voluntarios", true, []string{"nombre", "puesto", "turno", "responsable"},
		map[string]string{"nombre": "Pablo", "puesto": "Cargadores", "turno": "Mañana", "responsable": "Nico García"},
		Contenido{Asunto: "¡Ya eres parte del equipo, {{nombre}}!", Titulo: "¡Bienvenido al equipo, {{nombre}}!", Cuerpo: "Te esperamos como voluntario en **{{puesto}}** · turno **{{turno}}**.\n\nTe coordina **{{responsable}}**. Unos días antes te enviaremos el briefing con la hora de llegada y lo que necesitas.\n\nSi no puedes venir, responde a este email cuanto antes."}),
	p("voluntario-rechazado", "Solicitud de voluntariado no aceptada", "Al rechazar una solicitud de voluntariado", "cms", "voluntarios", true, []string{"nombre", "motivo"},
		map[string]string{"nombre": "Pablo", "motivo": "Ya tenemos cubiertos todos los puestos."},
		Contenido{Asunto: "Sobre tu solicitud de voluntariado", Titulo: "Gracias, {{nombre}}", Cuerpo: "Gracias por ofrecerte como voluntario en la GR Strength Cup. Esta vez no podemos contar contigo:\n\n{{motivo}}\n\nTe tendremos en cuenta para la próxima edición."}),
	p("club-aprobado", "Club publicado en el directorio", "Al aprobar una solicitud de /clubs", "cms", "clubs", true, []string{"nombre", "club", "enlace"},
		map[string]string{"nombre": "Marta", "club": "Fuerza Isabel", "enlace": "https://grcup.example/clubs"},
		Contenido{Asunto: "{{club}} ya está en el directorio", Titulo: "¡Bienvenidos, {{nombre}}!", Cuerpo: "Hemos revisado la solicitud y **{{club}}** ya aparece en el directorio de clubs de la GR Strength Cup.\n\nSi quieres cambiar algún dato o el logo, responde a este email.", BotonTexto: "Ver el directorio", BotonURL: "{{enlace}}"}),
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
		Contenido{Asunto: "Confirma que quieres recibir novedades", Titulo: "Confirma tu suscripción", Cuerpo: "Has pedido recibir las novedades de la GRStrength Cup: fechas, horarios, sorteo y próximas competiciones. Un email al mes como mucho.\n\nConfirma con el botón. Si no lo has pedido tú, ignora este email.", BotonTexto: "Confirmar suscripción", BotonURL: "{{enlace}}"}),
	p("novedades-recordatorio", "Recordatorio: confirma tu suscripción", "48 h después sin confirmar", "crm", "novedades", false, []string{"enlace", "baja"},
		map[string]string{"enlace": "https://grcup.example/novedades/confirmar?t=…", "baja": "https://grcup.example/baja?t=…"},
		Contenido{Asunto: "¿Sigues queriendo novedades?", Titulo: "Te falta un paso", Cuerpo: "Hace dos días pediste recibir las novedades de la GRStrength Cup, pero no confirmaste. Si sigues queriendo, pulsa el botón; si no, no te escribiremos más.", BotonTexto: "Confirmar suscripción", BotonURL: "{{enlace}}"}),
	// ---- Alta de atleta (Figma 78 · «Emails y avisos» del alta). «foto» es la URL firmada de la foto de la
	// solicitud: caduca en 7 días y solo la ven los administradores. «match» es una frase corta («sugerida
	// (nombre y fecha de nacimiento)», «licencia», «email», «sin coincidencia»). «menor» es el aviso de menor de
	// edad (vacío si es mayor de edad). ----
	pwa("atleta-solicitud-recibida", "Solicitud de alta recibida", "Al enviar el formulario de alta de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "email", "telefono", "club", "ciudad", "marcas", "foto", "pasos", "urlAtletas"},
		map[string]string{"nombre": "Carlos", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456", "club": "Club Halter Valencia",
			"ciudad": "Valencia", "marcas": "180 / 120 / 220 kg", "foto": "Sí, en blanco y negro", "pasos": "1. Comprobamos tus datos y tu foto con la lista de inscritos de la AEP.\n\n2. Te avisamos por email con el resultado y el acceso a tu área de atleta.\n\n3. Publicamos tu ficha en /atletas.", "urlAtletas": "https://grcup.example/atletas"},
		Contenido{Asunto: "Hemos recibido tu solicitud de alta", Preheader: "Revisamos tu ficha a mano y te avisamos por email", Titulo: "{{nombre}}, hemos recibido tu solicitud de alta",
			Cuerpo:     "Tu solicitud para la ficha de atleta ya está en revisión. El equipo revisa cada solicitud a mano; te avisamos por email con el resultado.\n\n**Qué pasa ahora**\n\n{{pasos}}\n\n**Resumen de lo enviado**\n\n**Nombre:** {{nombre}}\n\n**Email:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Club · ciudad:** {{club}} · {{ciudad}}\n\n**Mejores marcas:** {{marcas}}\n\n**Foto:** {{foto}}\n\nSi algo no cuadra, escríbenos a admin@grstrength.com.",
			BotonTexto: "Ver la lista de atletas", BotonURL: "{{urlAtletas}}",
			Nota: "Recibes este email porque has enviado una solicitud de alta de atleta en la GR Cup 2026."},
		ContenidoWA{Texto: "¡Hola {{nombre}}! Hemos recibido tu solicitud de alta para la GR Cup 2026 ✍\n\nEl equipo revisa a mano. Cuando la revisemos te avisamos por aquí y por email.\n\nConsulta las fichas publicadas:\n{{urlAtletas}}"}),
	pwa("atleta-solicitud-nueva", "Nueva solicitud de alta", "Al enviar el formulario de alta de atleta", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "apellidos", "email", "telefono", "licencia", "club", "ciudad", "sexo", "edad", "fechaNacimiento", "marcas", "frase", "match", "menor", "prueba", "foto", "urlRevisar"},
		map[string]string{"nombre": "Carlos", "apellidos": "García Molina", "email": "carlos.garcia@example.com", "telefono": "+34 600 123 456",
			"licencia": "AEP-2026-04512", "club": "Club Halter Valencia", "ciudad": "Valencia", "sexo": "M", "edad": "17", "fechaNacimiento": "12/03/2009",
			"marcas": "180 / 120 / 220 kg · total 520 kg", "frase": "«Primera temporada en juveniles»", "match": "sugerida (nombre y fecha de nacimiento)", "prueba": "AEP-2",
			"menor": "⚠ Menor de edad · falta la autorización firmada de madre, padre o tutor. Súbela desde el panel de solicitudes; aprobar queda bloqueado hasta tenerla.",
			"foto":  "https://grcup.example/api/competiciones/grcup/alta-atleta/foto/…?e=…&s=…", "urlRevisar": "https://grcup-bo.example/grcup/atletas/solicitudes"},
		Contenido{Asunto: "Nueva solicitud de alta · {{nombre}} {{apellidos}}", Preheader: "Revisa los datos antes de aprobar o rechazar", Titulo: "Nueva solicitud de alta · {{nombre}} {{apellidos}}",
			Imagen:     "{{foto}}",
			Cuerpo:     "Un atleta ha enviado el formulario de /alta-atleta. Revisa los datos declarados frente al atleta enlazado antes de aprobar o rechazar.\n\n**Nombre:** {{nombre}} {{apellidos}}\n\n**Email de la inscripción AEP:** {{email}}\n\n**Teléfono:** {{telefono}}\n\n**Licencia AEP:** {{licencia}}\n\n**Club · ciudad:** {{club}} · {{ciudad}}\n\n**Sexo · edad:** {{sexo}} · {{edad}} años\n\n**Fecha de nacimiento:** {{fechaNacimiento}}\n\n**Marcas SQ · BP · DL:** {{marcas}}\n\n**Competición:** {{prueba}}\n\n**Frase:** {{frase}}\n\n**Coincidencia:** {{match}}\n\n{{menor}}",
			BotonTexto: "Revisar solicitud", BotonURL: "{{urlRevisar}}",
			Pie:  "Este email contiene datos personales: no lo reenvíes.",
			Nota: "Email automático del panel de solicitudes de atleta. La organización puede desactivar estos avisos en Backoffice › Emails y avisos."},
		ContenidoWA{Texto: "*Nueva solicitud de alta · {{nombre}} {{apellidos}}*\n\n{{sexo}} · {{edad}} años · {{club}} · {{ciudad}}\n\n{{menor}}\n\n**Coincidencia:** {{match}}\n\nRevisar la solicitud: {{urlRevisar}}", Imagen: true}),
	pwa("atleta-solicitud-aprobada", "Solicitud de alta aprobada", "Al aprobar una solicitud de alta (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "prueba", "urlFicha", "privada", "foto", "urlArea"},
		map[string]string{"nombre": "Carlos", "prueba": "AEP-2", "urlFicha": "https://grcup.example/atletas/carlos-garcia-molina", "privada": "", "foto": "✓ Tu foto en blanco y negro ya está en tu ficha.", "urlArea": "https://grcup.example/area-atleta?t=…"},
		Contenido{Asunto: "Tu ficha de atleta ya está aprobada", Preheader: "Ya puedes ver tu ficha en la GR Cup 2026", Titulo: "{{nombre}}, tu ficha de atleta ya está aprobada",
			Cuerpo:     "Tu solicitud de alta está aprobada. Tu ficha queda lista con tu club y tus mejores marcas.\n\n{{foto}}\n\n✓ Competición: {{prueba}}.\n\n{{privada}}\n\n✓ Desde el área de atleta podrás editar tu foto, tus marcas y tu frase cuando quieras.",
			BotonTexto: "Entrar en mi área de atleta", BotonURL: "{{urlArea}}",
			Pie:  "Enlace personal: caduca en 30 minutos; luego puedes pedir otro desde el área de atleta.",
			Nota: "Recibes este email porque tu solicitud de alta en la GR Cup 2026 ha sido aprobada."},
		ContenidoWA{Texto: "¡Buenas, {{nombre}}! Tu ficha de atleta ya está aprobada ✓\n\n{{privada}}\n\nEntra en tu área de atleta para editar tu foto, tus marcas y tu frase:\n{{urlArea}}"}),
	pwa("atleta-solicitud-rechazada", "Solicitud de alta rechazada", "Al rechazar una solicitud de alta (si se marca «Avisar»)", "athletes", "solicitudes-atleta", true,
		[]string{"nombre", "motivo", "urlAlta"},
		map[string]string{"nombre": "Carlos", "motivo": "Tus datos no coinciden con tu inscripción en la AEP: la fecha de nacimiento que has enviado (12/03/2009) no es la que figura en tu licencia.",
			"urlAlta": "https://grcup.example/alta-atleta"},
		Contenido{Asunto: "Tu solicitud de alta no se ha podido aprobar", Titulo: "{{nombre}}, tu solicitud de alta no se ha podido aprobar",
			Cuerpo:     "Hemos revisado tu solicitud de alta y, por ahora, no podemos publicar tu ficha. Tu inscripción en la AEP sigue en vigor: esto no afecta a tu participación.\n\n**Motivo del rechazo**\n\n{{motivo}}\n\n✓ Puedes volver a enviar el formulario con los datos corregidos en cualquier momento.\n\n✓ Si crees que es un error, escríbenos a admin@grstrength.com y lo revisamos a mano.\n\n✓ Tu foto y los datos de la solicitud se borrarán de forma segura (las rechazadas se purgan a los 30 días).",
			BotonTexto: "Volver a enviar mi alta", BotonURL: "{{urlAlta}}",
			Pie:  "No es un bloqueo permanente: corrige el motivo indicado arriba y envía de nuevo.",
			Nota: "Recibes este email porque tu solicitud de alta en la GR Cup 2026 no ha podido ser aprobada."},
		ContenidoWA{Texto: "Hola {{nombre}}, tu solicitud de alta no se ha podido aprobar.\n\n{{motivo}}\n\nTu inscripción en la AEP sigue en vigor: esto no afecta a tu participación.\n\nPuedes volver a enviarla con los datos corregidos:\n{{urlAlta}}"}),
}

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

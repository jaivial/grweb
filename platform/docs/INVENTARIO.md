# Inventario · GR Cup Platform (v8)

> Generado por `inventario.mjs` (fuera del repo) a partir de la API .NET actual (`backend/GrCup.Api`, rama dev @ 5e9b413), las entidades EF, el contrato del backoffice v7 (anotaciones de Figma, `bo_data.js`) y las notas de backend de las páginas públicas. Cada elemento tiene un servicio dueño; lo que no tiene dueño aparece como **SIN DUEÑO**.

## 1. Servicios

| Servicio | Responsabilidad |
|---|---|
| `gateway` | Borde: enrutado, JWT, CORS, rate-limit, búsqueda federada, OpenAPI agregado, salud |
| `identity` | Usuarios, sesiones, login (contraseña, enlace mágico, dispositivo), tokens, roles y permisos, equipo |
| `competition` | Competiciones (tenant), evento, estado, módulos, checklist, inscripción AEP, integraciones cifradas |
| `cms` | Web y contenidos: secciones, FAQ, patrocinadores, SEO, redirecciones, blog, galería, legal, voluntarios, medios |
| `athletes` | Perfiles de atleta, importación AEP, pesaje, openers, acreditación, área del atleta, seguidores |
| `schedule` | Flights, horarios (borrador/publicado, versiones, diff), generador |
| `live` | Directo: intentos, jueces, correcciones, estado de plataforma, resultados, récords, acta, pantalla |
| `ticketing` | Sesiones y aforo, entradas con QR firmado, lista de espera, check-in (puestos, escaneos, lote offline) |
| `raffle` | Sorteo: configuración, premios, checklist legal, compras Stripe, boletos, reembolsos, sorteo auditable |
| `crm` | Contactos, consentimientos por finalidad/canal, segmentos, supresiones, RGPD |
| `messaging` | Campañas email+WhatsApp (diseño único), plantillas, automatizaciones, outbox, SMTP, WhatsApp Cloud API |
| `ai` | Pasarela MiniMax (MiniMax-M3.1-Flash): asistente de diseño, textos, SEO; presupuesto y registro |
| `realtime` | SSE: stream público, admin y pantalla desde Redis Streams con Last-Event-ID |
| `audit` | Auditoría, actividad, notificaciones, KPIs del Inicio, exportaciones y trabajos |

## 2. API actual (.NET) → servicio (174 endpoints: 118 migran, 43 se retiran, 13 por decidir)

Destino según la clasificación del plan de CLI (`LEGACY` en `cli/spec.mjs`):
- **migra:** pasa al servicio indicado, con la ruta v7 si cambia.
- **retira:** formulario de inscripción propio, sorteo v1, newsletter y subida antigua; solo se exporta su histórico en el PR 16.
- **DECIDIR:** cupones y referidos.

| Servicio | Migran | Se retiran | Por decidir | Endpoints actuales (destino) |
|---|---|---|---|---|
| `athletes` | 27 | 21 | 3 | `GET /api/admin/athletes` · migra<br>`GET /api/admin/athletes/{id}` · migra<br>`POST /api/admin/athletes` · migra<br>`PUT /api/admin/athletes/{id}` · migra<br>`DELETE /api/admin/athletes/{id}` · migra<br>`GET /api/admin/athletes/stats` · migra<br>`GET /api/admin/athletes/clubs` · migra<br>`GET /api/admin/athletes/export` · migra<br>`POST /api/admin/competiciones/{cid}/athletes/raffle` · migra<br>`GET /api/admin/checkin/{athleteId}` · migra<br>`GET /api/admin/checkin/qr/{qrCode}` · migra<br>`POST /api/admin/checkin/{athleteId}/qr` · migra<br>`GET /api/admin/checkin/{athleteId}/qr-image` · migra<br>`POST /api/admin/checkin/{athleteId}/confirm` · migra<br>`GET /api/checkin/validate/{qrCode}` · migra<br>`PUT /api/admin/competiciones/{id:int}/inscripciones-abiertas` · migra<br>`GET /api/admin/competiciones/{cid}/cupones/inscripcion-costo` · DECIDIR<br>`GET /api/admin/inscripcion-config` · retira<br>`PUT /api/admin/inscripcion-config` · retira<br>`POST /api/competiciones/{slug}/inscripcion` · migra<br>`POST /api/competiciones/{slug}/inscripcion/stripe-checkout` · migra<br>`GET /api/competiciones/{slug}/inscripcion/config-snapshot` · migra<br>`POST /api/competiciones/{slug}/inscripcion/pago-online` · migra<br>`GET /api/competiciones/{slug}/inscripcion/stripe-session/{sessionId}` · migra<br>`POST /api/competiciones/{slug}/inscripcion/{id:int}/peak-program` · migra<br>`GET /api/competiciones/{slug}/inscripcion/{id:int}/qr` · migra<br>`GET /api/competiciones/{slug}/checkin/{id:int}` · retira<br>`GET /api/competiciones/{slug}/checkin/buscar` · retira<br>`POST /api/competiciones/{slug}/checkin/{id:int}/confirmar` · retira<br>`POST /api/competiciones/{slug}/checkin/{id:int}/asistio` · retira<br>`GET /api/competiciones/{slug}/checkin/{id:int}/estado` · retira<br>`POST /api/competiciones/{slug}/checkin/{id:int}/confirmar-participacion` · retira<br>`POST /api/competiciones/{slug}/checkin/{id:int}/confirmar-pago-efectivo` · retira<br>`GET /api/admin/competiciones/{cid}/inscripciones/` · retira<br>`POST /api/admin/competiciones/{cid}/inscripciones/` · retira<br>`GET /api/admin/competiciones/{cid}/inscripciones/export` · retira<br>`GET /api/admin/competiciones/{cid}/inscripciones/export-json` · retira<br>`GET /api/admin/competiciones/{cid}/inscripciones/stats` · retira<br>`POST /api/admin/competiciones/{cid}/inscripciones/raffle` · retira<br>`GET /api/admin/competiciones/{cid}/inscripciones/{id:int}` · retira<br>`POST /api/admin/competiciones/{cid}/inscripciones/{id:int}/reenviar-confirmacion` · retira<br>`PUT /api/admin/competiciones/{cid}/inscripciones/{id:int}` · retira<br>`DELETE /api/admin/competiciones/{cid}/inscripciones/{id:int}` · retira<br>`GET /api/admin/inscripcion-preparada` · retira<br>`PUT /api/admin/inscripcion-preparada` · retira<br>`GET /api/admin/athletes/{athleteId}/audit` · migra<br>`GET /api/inscripcion-config` · migra<br>`GET /api/inscripcion-preparada` · migra<br>`POST /api/athletes` · migra<br>`GET /api/admin/competiciones/{cid}/referidos/inscripciones` · DECIDIR<br>`PUT /api/admin/competiciones/{cid}/referidos/inscripciones/{inscripcionId:int}` · DECIDIR |
| `raffle` | 23 | 9 | 0 | `GET /api/admin/participants` · retira<br>`GET /api/admin/participants/{id}` · retira<br>`POST /api/admin/participants/manual` · retira<br>`PUT /api/admin/participants/{id}` · retira<br>`DELETE /api/admin/participants/{id}` · retira<br>`POST /api/admin/draw` · retira<br>`POST /api/admin/draw/{id}/confirm` · retira<br>`GET /api/admin/draws` · retira<br>`DELETE /api/admin/draw/{id}` · retira<br>`POST /api/tickets/buy` · migra<br>`GET /api/tickets/session/{sessionId}` · migra<br>`GET /api/participants/count` · migra<br>`GET /api/config/stripe` · migra<br>`GET /api/winner` · migra<br>`GET /api/raffle/config` · migra<br>`PUT /api/admin/raffle-config` · migra<br>`GET /api/admin/raffle-config` · migra<br>`GET /api/raffle/products` · migra<br>`GET /api/admin/raffle-products` · migra<br>`POST /api/admin/raffle-products` · migra<br>`PUT /api/admin/raffle-products/{id}` · migra<br>`PATCH /api/admin/raffle-products/{id}/toggle-status` · migra<br>`DELETE /api/admin/raffle-products/{id}` · migra<br>`POST /api/admin/raffle-products/reorder` · migra<br>`GET /api/competiciones/{slug}/rifa/` · migra<br>`GET /api/admin/competiciones/{cid}/rifa/` · migra<br>`PUT /api/admin/competiciones/{cid}/rifa/` · migra<br>`GET /api/admin/competiciones/{cid}/rifa/tickets` · migra<br>`POST /api/admin/competiciones/{cid}/rifa/tickets` · migra<br>`POST /api/admin/competiciones/{cid}/rifa/sorteo` · migra<br>`POST /api/admin/competiciones/{cid}/rifa/{ticketId:int}/confirmar` · migra<br>`POST /api/webhooks/stripe` · migra |
| `competition` | 23 | 0 | 0 | `GET /api/competiciones/` · migra<br>`GET /api/competiciones/{slug}` · migra<br>`GET /api/admin/competiciones/` · migra<br>`GET /api/admin/competiciones/{id:int}` · migra<br>`POST /api/admin/competiciones/` · migra<br>`PUT /api/admin/competiciones/{id:int}` · migra<br>`DELETE /api/admin/competiciones/{id:int}` · migra<br>`PUT /api/admin/competiciones/{id:int}/landing-config` · migra<br>`PUT /api/admin/competiciones/{id:int}/evento-config` · migra<br>`POST /api/admin/competiciones/{id:int}/logo` · migra<br>`GET /api/admin/email-config` · migra<br>`PUT /api/admin/email-config` · migra<br>`DELETE /api/admin/email-config` · migra<br>`GET /api/competiciones/{slug}/config` · migra<br>`GET /api/admin/responsable-url-inscripciones` · migra<br>`PUT /api/admin/responsable-url-inscripciones` · migra<br>`GET /api/admin/stripe-config` · migra<br>`PUT /api/admin/stripe-config` · migra<br>`PUT /api/admin/stripe-config/active` · migra<br>`DELETE /api/admin/stripe-config` · migra<br>`GET /api/admin/workspaces/` · migra<br>`GET /api/admin/workspaces/{competitionId:int}` · migra<br>`PUT /api/admin/workspaces/{competitionId:int}/modules` · migra |
| `identity` | 20 | 2 | 0 | `POST /api/admin/login` · retira<br>`POST /api/admin/logout` · retira<br>`GET /api/competition/{cid}/users/` · migra<br>`GET /api/competition/{cid}/roles/` · migra<br>`GET /api/competition/{cid}/roles/{roleSlug}/members` · migra<br>`GET /api/competition/{cid}/users/{usuarioId:int}` · migra<br>`POST /api/competition/{cid}/users/` · migra<br>`PUT /api/competition/{cid}/users/{usuarioId:int}/role` · migra<br>`DELETE /api/competition/{cid}/users/{usuarioId:int}` · migra<br>`POST /api/auth/login` · migra<br>`POST /api/auth/logout` · migra<br>`GET /api/auth/me` · migra<br>`GET /api/admin/users/` · migra<br>`GET /api/admin/users/{id:int}` · migra<br>`POST /api/admin/users/` · migra<br>`PUT /api/admin/users/{id:int}` · migra<br>`DELETE /api/admin/users/{id:int}` · migra<br>`POST /api/admin/users/{id:int}/competiciones` · migra<br>`DELETE /api/admin/users/{id:int}/competiciones/{cid}` · migra<br>`PUT /api/admin/users/{id:int}/permissions` · migra<br>`PATCH /api/admin/workspaces/{competitionId:int}/members/{usuarioId:int}` · migra<br>`DELETE /api/admin/workspaces/{competitionId:int}/members/{usuarioId:int}` · migra |
| `schedule` | 10 | 0 | 0 | `PUT /api/admin/competiciones/{id:int}/horarios-ready` · migra<br>`GET /api/schedules` · migra<br>`GET /api/schedules/published` · migra<br>`GET /api/admin/schedules` · migra<br>`GET /api/admin/schedules/published-config` · migra<br>`PUT /api/admin/schedules/published-config` · migra<br>`POST /api/admin/schedules` · migra<br>`GET /api/admin/schedules/{id}` · migra<br>`PUT /api/admin/schedules/{id}` · migra<br>`DELETE /api/admin/schedules/{id}` · migra |
| `DECIDIR (legado)` | 0 | 0 | 10 | `GET /api/admin/competiciones/{cid}/cupones/` · DECIDIR<br>`POST /api/admin/competiciones/{cid}/cupones/` · DECIDIR<br>`PUT /api/admin/competiciones/{cid}/cupones/{id:int}` · DECIDIR<br>`PATCH /api/admin/competiciones/{cid}/cupones/{id:int}/active` · DECIDIR<br>`POST /api/competiciones/{slug}/cupones/validar` · DECIDIR<br>`POST /api/competiciones/{slug}/referidos/validar` · DECIDIR<br>`GET /api/admin/competiciones/{cid}/referidos/config` · DECIDIR<br>`POST /api/admin/competiciones/{cid}/referidos/config` · DECIDIR<br>`POST /api/admin/competiciones/{cid}/referidos/backfill` · DECIDIR<br>`POST /api/admin/competiciones/{cid}/referidos/activate-all` · DECIDIR |
| `live` | 10 | 0 | 0 | `POST /api/competiciones/{slug}/checkin/{inscripcionId:int}/openers` · migra<br>`GET /api/competiciones/{slug}/checkin/{inscripcionId:int}/openers` · migra<br>`PUT /api/competiciones/{slug}/checkin/{inscripcionId:int}/attempt/{liftType}/{attemptNumber:int}/weight` · migra<br>`PUT /api/competiciones/{slug}/checkin/{inscripcionId:int}/attempt/{liftType}/{attemptNumber:int}/juez` · migra<br>`GET /api/competiciones/{slug}/attempts` · migra<br>`POST /api/admin/athletes/{athleteId}/openers` · migra<br>`GET /api/admin/athletes/{athleteId}/openers` · migra<br>`PUT /api/admin/athletes/{athleteId}/attempts/{liftType}/{attemptNumber}` · migra<br>`GET /api/admin/athletes/{athleteId}/attempts` · migra<br>`GET /api/admin/attempts` · migra |
| `messaging` | 0 | 7 | 0 | `GET /api/admin/competiciones/{cid}/newsletters/` · retira<br>`GET /api/admin/competiciones/{cid}/newsletters/{id:int}` · retira<br>`POST /api/admin/competiciones/{cid}/newsletters/` · retira<br>`PUT /api/admin/competiciones/{cid}/newsletters/{id:int}` · retira<br>`DELETE /api/admin/competiciones/{cid}/newsletters/{id:int}` · retira<br>`POST /api/admin/competiciones/{cid}/newsletters/{id:int}/send` · retira<br>`POST /api/admin/competiciones/{cid}/newsletters/{id:int}/test` · retira |
| `cms` | 5 | 1 | 0 | `POST /api/admin/upload-image` · retira<br>`GET /api/sitemap` · migra<br>`GET /api/tutorials/{videoId}` · migra<br>`POST /api/tutorials/{videoId}/like` · migra<br>`GET /api/tutorials/{videoId}/liked` · migra<br>`POST /api/tutorials/{videoId}/comment` · migra |
| `audit` | 0 | 3 | 0 | `GET /api/admin/verify` · retira<br>`GET /api/admin/statistics` · retira<br>`GET /api/admin/export/csv` · retira |

## 3. Entidades EF actuales (33) → servicio

| Entidad | Servicio / destino |
|---|---|
| `Participants` | raffle (retira) |
| `Draws` | raffle (retira) |
| `Athletes` | athletes |
| `Schedules` | schedule |
| `InscripcionConfig` | competition (retira) |
| `InscripcionesPreparadas` | athletes (retira) |
| `ResponsableInscripcion` | competition |
| `UrlInscripcion` | competition |
| `SchedulePublishedConfig` | schedule |
| `EmailConfig` | competition → Integraciones |
| `StripeConfig` | competition → Integraciones |
| `RaffleConfig` | raffle (unifica con RifaConfigs) |
| `RaffleProducts` | raffle → RifaPremios |
| `LiftEntries` | live |
| `LiftEntriesInscripcion` | live |
| `Competiciones` | competition |
| `Usuarios` | identity |
| `UsuariosCompeticiones` | identity |
| `UsuariosPermissions` | identity → RolPermisos |
| `Inscripciones` | athletes (archivo) |
| `CuponesDescuento` | DECIDIR (legado) |
| `RifaTickets` | raffle |
| `RifaConfigs` | raffle |
| `SorteosInscripcion` | raffle (retira) |
| `InscripcionEstados` | athletes (retira) |
| `ReferidosConfig` | DECIDIR (legado) |
| `CodigosReferido` | DECIDIR (legado) |
| `ReferidosUserSetting` | DECIDIR (legado) |
| `NewUserReferrals` | DECIDIR (legado) |
| `TutorialInteractions` | cms (ayuda) |
| `NewsletterEmails` | messaging → Campanas |
| `NewsletterEmailMedia` | messaging → CampanaDisenoRevisiones/medios |
| `NewsletterSendProgress` | messaging → CampanaDestinatarios |

## 4. Tablas del diseño v7 (70) → base de datos del servicio

Cada servicio tiene **su propia base de datos PostgreSQL** (`grcup_<servicio>`); las referencias entre servicios son por UUID sin claves foráneas cruzadas.

| Tabla v7 | Estado v7 | Servicio | Páginas | Columnas |
|---|---|---|---|---|
| `Competiciones` | Cambia | `competition` | 47, 53, 64, 65 | Id, Slug, EventoConfig, LandingConfig, ModulesConfig, Estado, EstadoProgramado |
| `Usuarios` | Existe | `identity` | 47, 48, 49, 51, 63, 65 | Id, Email, PasswordHash, TotpSecret, IsRoot |
| `Roles` | Nuevo | `identity` | 47, 63, 65 | Id, CompeticionId, Slug, Nombre, EsSistema |
| `AuditLog` | Nuevo | `audit` | 47, 49, 53, 63, 65 | Id, CompeticionId, UsuarioId, Accion, Entidad, EntidadId, Cambios, Ip, CreatedAt |
| `Entradas` | Nuevo | `ticketing` | 47, 52, 58, 59, 65 | Id, SesionId, ContactoId, Codigo, Personas, Estado |
| `Contactos` | Nuevo | `crm` | 47, 58, 61, 65 | Id, CompeticionId, Email, Nombre, Origen |
| `PerfilesAtleta` | Nuevo | `athletes` | 47, 55 | Id, InscripcionId, Slug, FotoMedioId, Visible |
| `Medios` | Nuevo | `cms` | 47, 48 | Id, CompeticionId, Url, FocalX, FocalY, Alt |
| `VistasGuardadas` | Nuevo | `identity` | 48 | Id, UsuarioId, Recurso, Nombre, Filtros, Columnas, Compartida |
| `PreferenciasUsuario` | Nuevo | `identity` | 48 | UsuarioId, SidebarColapsada, Densidad, Idioma |
| `Notificaciones` | Nuevo | `audit` | 49, 51 | Id, CompeticionId, UsuarioId, Tipo, Titulo, Datos, Accion, LeidaAt, CreatedAt |
| `Exportaciones` | Nuevo | `audit` | 49, 64 | Id, CompeticionId, UsuarioId, Recurso, Filtros, Estado, Url, ExpiraAt |
| `EntradaSesiones` | Nuevo | `ticketing` | 50, 58 | Id, CompeticionId, Nombre, Inicio, Fin, Aforo, MaxPorReserva, AperturaAt, CierreAt, Estado |
| `Flights` | Nuevo | `schedule` | 50, 56, 65 | Id, CompeticionId, Codigo, Plataforma, Inicio, PesajeInicio, Version |
| `LiftEntriesInscripcion` | Cambia | `live` | 50, 57, 65 | Id, InscripcionId, LiftType, AttemptNumber, Weight, Juez1Voto, Juez2Voto, Juez3Voto, Estado, CorregidoPor, Motivo |
| `CheckinEscaneos` | Nuevo | `ticketing` | 50, 52, 58, 59 | Id, EntradaId, Puesto, Resultado, IdempotencyKey, Offline, EscaneadoAt |
| `Consentimientos` | Nuevo | `crm` | 50, 52, 55, 58, 61, 65 | Id, ContactoId, Finalidad, TextoLegalId, Estado, DoiAt, RevocadoAt, Ip |
| `PlantillasEmail` | Nuevo | `messaging` | 50, 62 | Id, CompeticionId, Clave, Asunto, Cuerpo, Estado |
| `RifaSorteos` | Nuevo | `raffle` | 50, 60 | Id, CompeticionId, Semilla, HashLista, NumeroGanador, Estado, Motivo |
| `ContenidoSecciones` | Nuevo | `cms` | 50, 54 | Id, CompeticionId, Clave, Orden, Visible, Borrador, Publicado, Estado |
| `SesionesUsuario` | Nuevo | `identity` | 51, 63 | Id, UsuarioId, RefreshHash, Dispositivo, Ip, CreatedAt, ExpiraAt, RevocadaAt |
| `TokensAcceso` | Nuevo | `identity` | 51 | Id, UsuarioId, ContactoId, Proposito, TokenHash, ExpiraAt, UsadoAt |
| `LoginIntentos` | Nuevo | `identity` | 51 | Id, Email, Ip, Exito, CreatedAt |
| `UsuariosCompeticiones` | Existe | `identity` | 51, 63 | UsuarioId, CompeticionId, Role |
| `RifaTickets` | Cambia | `raffle` | 52, 60 | Id, CompeticionId, CompraId, NumeroTicket, Confirmado |
| `ChecklistPuestaEnMarcha` | Nuevo | `competition` | 52 | CompeticionId, Paso, Estado, CompletadoAt |
| `DirectoEventos` | Nuevo | `live` | 52, 57, 65 | Id, CompeticionId, Tipo, Datos, CreatedAt |
| `UrlInscripcion` | Existe | `competition` | 53 | Id, CompeticionId, Url, Activa |
| `ResponsableInscripcion` | Existe | `competition` | 53 | Id, CompeticionId, Nombre, Email |
| `inscripcion_estado` | Existe | `competition` | 53 | CompeticionId, Estado |
| `ContenidoVersiones` | Nuevo | `cms` | 54 | Id, SeccionId, Datos, PublicadoPor, PublicadoAt |
| `FaqItems` | Nuevo | `cms` | 54 | Id, CompeticionId, Categoria, Pregunta, Respuesta, Orden, Destacada, Estado |
| `Patrocinadores` | Nuevo | `cms` | 54 | Id, CompeticionId, Nombre, Nivel, LogoMedioId, FotoMedioId, Url, Orden |
| `PaginasSeo` | Nuevo | `cms` | 54 | Id, CompeticionId, Ruta, Title, Description, OgMedioId, Indexable |
| `Redirecciones` | Nuevo | `cms` | 54 | Id, Desde, Hacia, Codigo, Visitas30d |
| `TextosLegales` | Nuevo | `cms` | 54 | Id, CompeticionId, Tipo, Version, Contenido, Hash, PublicadoAt |
| `Voluntarios` | Nuevo | `cms` | 54 | Id, CompeticionId, ContactoId, Disponibilidad, Puesto, Estado, EsMenor, AutorizacionMedioId |
| `Inscripciones` | Cambia | `athletes` | 55, 56, 59, 65 | Id, CompeticionId, Nombre, Apellido1, Email, Sexo, CategoriaPeso, Licencia, FechaNacimiento, Division, EstadoAep, OrdenReserva, PesoCorporal |
| `Seguimientos` | Nuevo | `athletes` | 55 | Id, PerfilId, ContactoId, CreatedAt, AvisosActivos |
| `Importaciones` | Nuevo | `athletes` | 55 | Id, CompeticionId, Archivo, Estado, Mapeo, Resumen, CreadoPor |
| `ImportacionFilas` | Nuevo | `athletes` | 55 | Id, ImportacionId, Fila, Datos, Accion, Error |
| `FlightAtletas` | Nuevo | `schedule` | 56 | FlightId, InscripcionId, Lote, TotalPrevisto |
| `HorarioVersiones` | Nuevo | `schedule` | 56 | Id, CompeticionId, Numero, Snapshot, Estado, PublicadoPor, PublicadoAt |
| `Schedules` | Deprecar | `schedule` | 56 | Id, SexCategory, WeightCategory, Date, StartTime |
| `SchedulePublishedConfig` | Cambia | `schedule` | 56 | Id, Published, VersionPublicadaId |
| `DirectoEstado` | Nuevo | `live` | 57 | CompeticionId, FlightActualId, Ronda, RetrasoMin, Pausa, ActualizadoAt |
| `ResultadosPublicados` | Nuevo | `live` | 57 | Id, CompeticionId, Categoria, Datos, Version, PublicadoAt |
| `Records` | Nuevo | `live` | 57 | Id, Ambito, Categoria, Movimiento, Peso, InscripcionId |
| `ListaEspera` | Nuevo | `ticketing` | 58 | Id, SesionId, ContactoId, Personas, Orden, Estado, OfertaExpiraAt |
| `CheckinPuestos` | Nuevo | `ticketing` | 59 | Id, CompeticionId, Nombre, Tipo, DispositivoId, UltimoPingAt, ColaOffline |
| `RifaConfigs` | Cambia | `raffle` | 60 | Id, CompeticionId, NombrePremio, PrecioTicket, MaxPorPersona, Presets, VentaDesde, VentaHasta, FechaSorteo, Activo, DestinoBenefico, BasesTextoLegalId |
| `RifaCompras` | Nuevo | `raffle` | 60, 65 | Id, CompeticionId, ContactoId, Cantidad, Importe, StripeSessionId, Estado, ReembolsoId |
| `ChecklistLegal` | Nuevo | `raffle` | 60 | CompeticionId, Clave, Estado, Nota |
| `Participants · Draws` | Deprecar | `raffle` | 60 | Id, TicketCount, TotalPaid |
| `Segmentos` | Nuevo | `crm` | 61 | Id, CompeticionId, Nombre, Condiciones, Dinamico |
| `Supresiones` | Nuevo | `crm` | 61 | Id, CompeticionId, Canal, Destino, Tipo, Motivo, Origen, CreatedAt |
| `CampanaDestinatarios` | Nuevo | `messaging` | 61 | Id, CampanaId, ContactoId, Canal, Destino, Estado, ProveedorId, Error, EnviadoAt, EntregadoAt, LeidoAt |
| `Campanas` | Cambia | `messaging` | 61 | Id, CompeticionId, Nombre, Asunto, Canales, Estado, DisenoHtml, EmailHtml, WhatsAppTexto, PlantillaWaId, SegmentoId, EmailPorMinuto, WaPorMinuto, ProgramadaAt, RowVersion |
| `CampanaDisenoRevisiones` | Nuevo | `messaging` | 61 | Id, CampanaId, Html, Autor, UsuarioId, Modelo, CreatedAt |
| `PlantillasWhatsApp` | Nuevo | `messaging` | 61, 62 | Id, CompeticionId, Nombre, Categoria, Idioma, Cuerpo, Variables, Botones, Estado, Calidad, MetaId, Version |
| `MensajesPendientes` | Cambia | `messaging` | 62 | Id, CompeticionId, Canal, PlantillaClave, Destino, Datos, Estado, Intentos, ProximoIntentoAt, ProveedorId, Error |
| `Automatizaciones` | Nuevo | `messaging` | 62 | Id, Nombre, Disparador, Canales, PlantillaEmailId, PlantillaWaId, Activa, PausarEnEvento, ProximaAt |
| `EmailConfig` | Existe | `competition` | 62 | Id, Provider, Host, Port, FromEmail |
| `Integraciones` | Nuevo | `competition` | 62, 64 | Id, Tipo, ConfigEnc, Estado |
| `WebhookEventos` | Nuevo | `raffle + messaging` | 62, 64 | Id, Proveedor, EventoId, Tipo, Payload, RecibidoAt |
| `RolPermisos` | Nuevo | `identity` | 63 | RolId, Permiso |
| `Invitaciones` | Nuevo | `identity` | 63 | Id, CompeticionId, Email, RolId, TokenHash, ExpiraAt, AceptadaAt |
| `UsuariosPermissions` | Deprecar | `identity` | 63 | Id, UsuarioId, Permission |
| `StripeConfig` | Existe | `competition` | 64 | Id, PublicKey, SecretKeyEnc, WebhookSecretEnc, Activo |
| `TrabajosEstado` | Nuevo | `audit` | 64 | Nombre, UltimoCicloAt, Estado, Detalle |

## 5. Endpoints del contrato v7 (150 únicos) → servicio

| Servicio | Nº | Endpoints (tipo · estado · página) |
|---|---|---|
| `messaging` | 26 | `GET C/campanas?estado=` REST · Nuevo · 61<br>`POST/PUT C/campanas[/{id}]` REST · Nuevo · 61<br>`GET C/campanas/plantilla-base` REST · Nuevo · 61<br>`POST C/campanas/diseno/css` REST · Nuevo · 61<br>`POST C/campanas/{id}/previsualizar` REST · Nuevo · 61<br>`POST C/campanas/{id}/imagenes` REST · Nuevo · 61<br>`GET/POST C/campanas/ia/{modelos\|chat}` REST · Nuevo · 61<br>`GET C/campanas/{id}/audiencia` REST · Nuevo · 61<br>`POST C/campanas/{id}/prueba` REST · Nuevo · 61<br>`POST C/campanas/{id}/enviar` JOB · Nuevo · 61<br>`POST C/campanas/{id}/{pausar\|reanudar}` REST · Nuevo · 61<br>`GET C/campanas/{id}/destinatarios?canal=&estado=` REST · Nuevo · 61<br>`POST C/campanas/{id}/whatsapp/plantilla` JOB · Nuevo · 61<br>`POST /api/webhooks/whatsapp` WEBHOOK · Nuevo · 61<br>`GET/POST C/newsletters[/{id}/send]` REST · Deprecar · 61<br>`HUB /hubs/newsletter` HUB · Deprecar · 61<br>`GET/PUT C/emails/plantillas[/{clave}]` REST · Nuevo · 62<br>`POST C/emails/plantillas/{clave}/{previsualizar\|prueba}` REST · Nuevo · 62<br>`GET C/whatsapp/plantillas` REST · Nuevo · 62<br>`POST C/whatsapp/plantillas[/{nombre}/revision]` JOB · Nuevo · 62<br>`POST C/whatsapp/sincronizar` REST · Nuevo · 62<br>`GET C/mensajes/salida?canal=&estado=` REST · Nuevo · 62<br>`POST C/mensajes/salida/bulk` REST · Nuevo · 62<br>`GET/PUT C/automatizaciones[/{id}]` REST · Nuevo · 62<br>`GET/POST /api/webhooks/whatsapp` WEBHOOK · Nuevo · 64<br>`POST C/integraciones/whatsapp/probar` REST · Nuevo · 64 |
| `athletes` | 16 | `PUT C/flights/{id}/atletas` REST · Nuevo · 50<br>`POST /api/competiciones/{slug}/inscripcion` REST · Cambia · 53<br>`GET C/atletas?sexo=&categoria=&flight=&perfil=incompleto` REST · Nuevo · 55<br>`GET /api/admin/athletes` REST · Deprecar · 55<br>`POST C/atletas/importaciones` REST · Nuevo · 55<br>`PUT C/atletas/importaciones/{id}/mapeo` REST · Nuevo · 55<br>`POST C/atletas/importaciones/{id}/confirmar` JOB · Nuevo · 55<br>`GET/PUT C/atletas/{id}/perfil` REST · Nuevo · 55<br>`POST C/atletas/{id}/promocionar` REST · Nuevo · 55<br>`POST C/atletas/{id}/pesaje` REST · Nuevo · 55<br>`POST C/atletas/{id}/enlace-area` REST · Nuevo · 55<br>`GET /api/competiciones/{slug}/atletas` REST · Nuevo · 55<br>`PUT C/horarios/flights/{id}/atletas` REST · Nuevo · 56<br>`GET C/checkin/buscar?q=gomez` REST · Nuevo · 59<br>`GET /api/checkin/validate/{qrCode}` REST · Existe · 59<br>`POST /api/competiciones/{slug}/checkin/{id}/confirmar` REST · Existe · 59 |
| `identity` | 14 | `GET /api/auth/me` REST · Cambia · 47<br>`GET /api/admin/me/vistas?recurso=entradas` REST · Nuevo · 48<br>`POST /api/admin/me/vistas` REST · Nuevo · 48<br>`PUT /api/admin/me/preferencias` REST · Nuevo · 48<br>`POST /api/auth/login` REST · Existe · 51<br>`POST /api/auth/magic-link` REST · Nuevo · 51<br>`GET /api/auth/magic/{token}` REST · Nuevo · 51<br>`POST /api/auth/refresh` REST · Nuevo · 51<br>`POST /api/auth/logout` REST · Existe · 51<br>`GET /api/competition/{cid}/users` REST · Cambia · 63<br>`POST C/equipo/invitaciones` REST · Nuevo · 63<br>`PATCH /api/competition/{cid}/users/{usuarioId}` REST · Cambia · 63<br>`GET/PUT /api/competition/{cid}/roles[/{slug}]` REST · Cambia · 63<br>`DELETE C/equipo/{usuarioId}/sesiones/{id}` REST · Nuevo · 63 |
| `cms` | 14 | `POST C/medios` REST · Cambia · 48<br>`PATCH C/medios/{id}` REST · Nuevo · 48<br>`POST /api/admin/upload-image` REST · Deprecar · 48<br>`GET C/web/secciones` REST · Nuevo · 54<br>`PUT C/web/secciones/orden` REST · Nuevo · 54<br>`PUT C/web/secciones/{id}` REST · Nuevo · 54<br>`POST C/web/publicar` REST · Nuevo · 54<br>`GET/POST/PUT C/web/faq[/{id}]` REST · Nuevo · 54<br>`GET/POST/PUT C/web/patrocinadores[/{id}]` REST · Nuevo · 54<br>`GET/PUT C/web/seo/paginas[/{ruta}]` REST · Nuevo · 54<br>`GET /api/sitemap` REST · Cambia · 54<br>`POST C/legal/{tipo}/versiones` REST · Nuevo · 54<br>`GET/PUT C/voluntarios[/{id}]` REST · Nuevo · 54<br>`GET /api/competiciones/{slug}/web` REST · Nuevo · 54 |
| `ticketing` | 13 | `GET C/entradas/sesiones` REST · Nuevo · 50<br>`POST C/checkin/escaneos` REST · Nuevo · 50<br>`GET C/checkin/dispositivos` REST · Nuevo · 52<br>`GET/POST C/entradas/sesiones` REST · Nuevo · 58<br>`PATCH C/entradas/sesiones/{id}` REST · Nuevo · 58<br>`GET C/entradas?sesion=&estado=&origen=&q=` REST · Nuevo · 58<br>`POST C/entradas` REST · Nuevo · 58<br>`POST C/entradas/bulk` REST · Nuevo · 58<br>`POST C/entradas/{id}/reenviar` REST · Nuevo · 58<br>`GET/PUT C/entradas/lista-espera` REST · Nuevo · 58<br>`POST /api/competiciones/{slug}/entradas` REST · Nuevo · 58<br>`GET C/checkin/bootstrap?puesto=A` REST · Nuevo · 59<br>`POST C/checkin/escaneos/lote` REST · Nuevo · 59 |
| `competition` | 13 | `PUT C/checklist/{paso}` REST · Nuevo · 52<br>`GET /api/admin/competiciones/{id}` REST · Existe · 53<br>`PUT /api/admin/competiciones/{id}/evento-config` REST · Cambia · 53<br>`PUT /api/admin/competiciones/{id}/landing-config` REST · Existe · 53<br>`PUT C/estado` REST · Nuevo · 53<br>`PUT /api/admin/workspaces/{cid}/modules` REST · Cambia · 53<br>`PUT /api/admin/responsable-url-inscripciones` REST · Existe · 53<br>`GET /api/admin/workspaces` REST · Existe · 64<br>`POST /api/admin/workspaces` JOB · Cambia · 64<br>`GET C/integraciones` REST · Nuevo · 64<br>`POST C/integraciones/{tipo}/probar` REST · Nuevo · 64<br>`POST C/archivar \| anonimizar \| exportar` REST · Nuevo · 64<br>`DELETE /api/admin/workspaces/{id}` REST · Nuevo · 64 |
| `audit` | 10 | `POST C/exportaciones` JOB · Nuevo · 47<br>`GET C/notificaciones?noLeidas=true` REST · Nuevo · 49<br>`POST C/notificaciones/leer` REST · Nuevo · 49<br>`GET C/dashboard/kpis?periodo=7d` REST · Nuevo · 49<br>`GET C/actividad?limit=20` REST · Nuevo · 49<br>`GET /api/admin/statistics` REST · Deprecar · 49<br>`GET C/dashboard?modo=campana\|evento` REST · Nuevo · 52<br>`GET C/dashboard/serie?metrica=reservas&desde=2026-06-01` REST · Nuevo · 52<br>`GET C/auditoria?usuario=&entidad=&desde=` REST · Nuevo · 63<br>`GET C/auditoria/{id}` REST · Nuevo · 63 |
| `raffle` | 9 | `GET/PUT C/rifa` REST · Cambia · 60<br>`PUT C/rifa/checklist/{clave}` REST · Nuevo · 60<br>`GET C/rifa/compras?estado=` REST · Nuevo · 60<br>`POST C/rifa/compras/{id}/reembolso` REST · Nuevo · 60<br>`POST C/rifa/sorteos` REST · Nuevo · 60<br>`POST C/rifa/sorteos/{id}/ejecutar` REST · Nuevo · 60<br>`POST C/rifa/sorteos/{id}/confirmar \| repetir` REST · Nuevo · 60<br>`POST /api/webhooks/stripe` WEBHOOK · Cambia · 60<br>`POST /api/tickets/buy` REST · Deprecar · 60 |
| `live` | 8 | `PUT /api/competiciones/{slug}/checkin/{id}/attempt/{lift}/{n}/juez` REST · Existe · 50<br>`GET C/directo/estado` REST · Nuevo · 57<br>`PUT /api/competiciones/{slug}/checkin/{id}/attempt/{lift}/{n}/weight` REST · Existe · 57<br>`POST C/directo/intentos/{id}/correccion` REST · Nuevo · 57<br>`PUT C/directo/estado` REST · Nuevo · 57<br>`GET C/resultados?categoria=F-63` REST · Nuevo · 57<br>`POST C/resultados/publicar` REST · Nuevo · 57<br>`GET C/resultados/acta.pdf` REST · Nuevo · 57 |
| `schedule` | 6 | `GET C/horarios?dia=2026-12-19&version=borrador` REST · Nuevo · 56<br>`POST C/horarios/generar` JOB · Nuevo · 56<br>`GET C/horarios/diff?desde=v3` REST · Nuevo · 56<br>`POST C/horarios/publicar` REST · Nuevo · 56<br>`POST C/horarios/versiones/{n}/restaurar` REST · Nuevo · 56<br>`GET /api/schedules/published` REST · Deprecar · 56 |
| `crm` | 5 | `GET C/contactos?canal=&consentimiento=&q=` REST · Nuevo · 61<br>`POST C/contactos/{id}/rgpd/{acceso\|rectificacion\|supresion}` REST · Nuevo · 61<br>`GET/POST/PUT C/segmentos[/{id}]` REST · Nuevo · 61<br>`GET C/supresiones?tipo=baja\|email_invalido\|whatsapp_invalido\|rebote` REST · Nuevo · 61<br>`GET /api/baja/{token}` REST · Nuevo · 61 |
| `todos (convención)` | 4 | `GET C/{recurso}?q=&filtro[estado]=&sort=-createdAt&page=1&pageSize=50` REST · Nuevo · 47<br>`GET C/{recurso}/{id}` REST · Nuevo · 47<br>`PUT C/{recurso}/{id}` REST · Nuevo · 47<br>`POST C/{recurso}/bulk` REST · Nuevo · 47 |
| `realtime` | 4 | `GET C/stream` SSE · Nuevo · 47<br>`GET /api/competiciones/{slug}/stream` SSE · Nuevo · 47<br>`GET /api/pantalla/{slug}/stream?token=` SSE · Nuevo · 57<br>`HUB /hubs/participants · /hubs/newsletter` HUB · Deprecar · 65 |
| `gateway` | 4 | `GET /api/admin/search?q=lau&cid=1` REST · Nuevo · 49<br>`GET /api/admin/search?q=` REST · Nuevo · 51<br>`GET /api/health` REST · Cambia · 64<br>`GET /api/admin/health` REST · Nuevo · 64 |
| `messaging (worker)` | 2 | `POST EmailOutboxWorker` JOB · Nuevo · 65<br>`POST NewsletterSendWorker` JOB · Cambia · 65 |
| `ticketing / competition (workers)` | 1 | `POST RecordatoriosWorker · ListaEsperaWorker · EstadoProgramadoWorker` JOB · Nuevo · 65 |
| `crm (job)` | 1 | `POST AnonimizacionJob (diario 03:00)` JOB · Nuevo · 65 |

## 6. Eventos de tiempo real (28) → productor

Todos viajan por el bus `grcup:events` (Redis Streams, Redis de kraken) y los entrega `realtime` por SSE, con el id del stream como `Last-Event-ID`.

| Evento | Productor | Página | Payload |
|---|---|---|---|
| `entrada.creada` | `ticketing` | 47 | { id, codigo, sesionId, personas, aforo: { usado, total } } |
| `audit.nuevo` | `audit` | 47 | { accion, entidad, usuario, at } |
| `presencia` | `identity` | 47 | { ruta, usuarios: [{ id, nombre }] } |
| `export.listo` | `audit` | 47 | { jobId, url, expira } |
| `notificacion.nueva` | `audit` | 49 | { id, tipo, titulo, accion } |
| `kpi.delta` | `audit` | 49 | { clave: "entradas", valor: 1249, delta: +1 } |
| `aforo.actualizado` | `ticketing` | 50 | { sesionId, usado, total, estado } |
| `directo.intento` | `live` | 50 | { intentoId, estado, jueces: [1,1,0] } |
| `sesion.revocada` | `identity` | 51 | { sesionId, motivo } |
| `dispositivo.estado` | `ticketing` | 52 | { puesto, online, cola, ultimoPing } |
| `directo.plataforma` | `live` | 52 | { flight, atleta, intento, retraso } |
| `evento.estado` | `competition` | 53 | { estado: "hoy", desde } |
| `web.publicada` | `cms` | 54 | { secciones[], version } |
| `import.progreso` | `athletes` | 55 | { importacionId, hechas, total, errores } |
| `atleta.actualizado` | `athletes` | 55 | { id, campos[] } |
| `horarios.publicados` | `schedule` | 56 | { version: 4, cambios: 2 } |
| `horarios.generados` | `schedule` | 56 | { flights: 11, conflictos: 0 } |
| `directo.correccion` | `live` | 57 | { intentoId, antes, despues, motivo } |
| `directo.estado` | `live` | 57 | { flight, ronda, retrasoMin, pausa } |
| `checkin.escaneo` | `ticketing` | 59 | { codigo, resultado, puesto, personas, at } |
| `checkin.duplicado` | `ticketing` | 59 | { codigo, puestos: ["A", "B"], segundos: 120 } |
| `rifa.estado` | `raffle` | 60 | { sorteoId, estado: "sorteando" } |
| `rifa.ganador` | `raffle` | 60 | { numero: "0427", nombre: "Laura G." } |
| `campana.progreso` | `messaging` | 61 | { campanaId: 12, email: { enviados: 1040, total: 1388, fallidos: 2 }, whatsapp: { enviados: 210, total: 612, leidos: 148 } } |
| `campana.destinatario` | `messaging` | 61 | { id, canal: "whatsapp", estado: "read", wamid } |
| `plantilla_wa.estado` | `messaging` | 61 | { nombre, estado: "REJECTED", motivo } |
| `mensaje.fallo` | `messaging` | 62 | { id, canal, destino, codigo: "131047" } |
| `salud` | `gateway` | 64 | { apiP95, sse, colaEmails, workers[] } |

## 7. Web pública (Figma 05–45) → rutas Angular y servicios

| Página Figma | Ruta | Endpoints | Servicios |
|---|---|---|---|
| 05 | `/ — Home` | 6 | `competition` `athletes` `ticketing` `raffle` `schedule` `messaging` |
| 06 | `/inscripcion` | 6 | `athletes` `competition` |
| 07 | `/sorteo` | 6 | `raffle` |
| 08 | `/checkout` | 4 | `raffle` `ticketing` |
| 09 | `/success` | 2 | `raffle` `ticketing` |
| 10 | `/horarios (v5)` | 3 | `schedule` |
| 11 | `/como-llegar` | 1 | `competition` |
| 12 | `/privacidad` | 1 | `cms` |
| 13 | `/terminos` | 0 | — (estática / cms) |
| 14 | `/consentimiento-datos` | 0 | — (estática / cms) |
| 15 | `/politica-concurso` | 0 | — (estática / cms) |
| 16 | `/backoffice/login` | 3 | `identity` |
| 21 | `/categorias-de-peso` | 1 | `competition` |
| 22 | `/marcas-minimas` | 0 | — (estática / cms) |
| 23 | `/reglamento` | 0 | — (estática / cms) |
| 24 | `/preguntas-frecuentes` | 0 | — (estática / cms) |
| 25 | `/resultados` | 2 | `live` |
| 26 | `/participantes` | 1 | `athletes` |
| 27 | `/en-directo` | 4 | `live` `realtime` |
| 28 | `/ediciones/2025` | 1 | `competition` |
| 29 | `/publico` | 1 | `ticketing` |
| 30 | `/galeria` | 0 | — (estática / cms) |
| 31 | `/patrocinadores` | 0 | — (estática / cms) |
| 32 | `/clubs` | 1 | `?` |
| 33 | `/voluntarios` | 2 | `cms` |
| 34 | `/blog` | 0 | — (estática / cms) |
| 35 | `/en` | 0 | — (estática / cms) |
| 37 | `/entradas` | 4 | `ticketing` `schedule` |
| 38 | `/entradas/confirmacion · /mi-entrada` | 8 | `ticketing` `?` `messaging` |
| 39 | `/atletas` | 3 | `athletes` `?` |
| 40 | `/atletas/:slug` | 3 | `athletes` `?` `schedule` |
| 41 | `/horarios (v2)` | 4 | `schedule` `messaging` |
| 42 | `/area-atleta` | 7 | `?` `live` |

## 8. Rutas de las apps actuales

- **frontend (web pública GR Cup, Preact):** `/` `/backoffice` `/backoffice/:competicionSlug` `/backoffice/:competicionSlug/qr` `/backoffice/:competicionSlug/users` `/backoffice/:competicionSlug/users/members/:usuarioId` `/backoffice/:competicionSlug/users/new` `/backoffice/:competicionSlug/users/roles/:roleSlug` `/backoffice/login` `/checkout` `/como-llegar` `/consentimiento-datos` `/horarios` `/inscripcion` `/politica-concurso` `/privacy` `/raffle` `/success` `/terms`
- **backoffice (React):** `/` `/backoffice` `/backoffice/checkin` `/backoffice/:competicionSlug` `/backoffice/:competicionSlug/checkin` `/backoffice/:competicionSlug/configuracion` `/backoffice/:competicionSlug/cupones` `/backoffice/:competicionSlug/horarios` `/backoffice/:competicionSlug/inscripcion-config` `/backoffice/:competicionSlug/inscripciones` `/backoffice/:competicionSlug/judge-table` `/backoffice/:competicionSlug/members` `/backoffice/:competicionSlug/newsletter/:id?` `/backoffice/:competicionSlug/participantes` `/backoffice/:competicionSlug/qr-reader` `/backoffice/:competicionSlug/raffle-config` `/backoffice/:competicionSlug/sorteo` `/backoffice/:competicionSlug/users` `/backoffice/:competicionSlug/users/members/:usuarioId` `/backoffice/:competicionSlug/users/new` `/backoffice/:competicionSlug/users/roles/:roleSlug` `/backoffice/configuracion` `/backoffice/cupones` `/backoffice/horarios` `/backoffice/inscripcion-config` `/backoffice/inscripciones` `/backoffice/judge-table` `/backoffice/login` `/backoffice/members` `/backoffice/newsletter/:id?` `/backoffice/participantes` `/backoffice/qr-reader` `/backoffice/raffle-config` `/backoffice/sorteo` `/backoffice/users` `/backoffice/users/members/:usuarioId` `/backoffice/users/new` `/backoffice/users/roles/:roleSlug` `/backoffice/workspaces` `/backoffice/workspaces/:competitionId`
- **ferweb (web FER Cup, React):** `/` `/faq` `/galeria` `/horarios` `/inscripcion` `/inscripcion/pagar` `/inscripcion/success` `/modalidades` `/privacy` `/sobre-nosotros` `/terms` `/tutoriales` `/ubicacion`

`ferweb` es otra competición (FER Cup) sobre la misma API: en v8 es otro tenant (`competition`), y su web pública queda fuera de la primera entrega (ver ROADMAP).

## 9. Comprobación

- Endpoints actuales sin dueño: **0**
- Endpoints v7 sin dueño: **0**
- Tablas v7 sin dueño: **0**
- Entidades EF sin destino: **0**

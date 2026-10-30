# GR Cup Platform (v8)

Nueva plataforma de la GR Strength Cup:
- **Backend:** microservicios en Go con PostgreSQL y Redis.
- **Despliegue:** Docker y Kubernetes (k3s).
- **Frontend:** Angular + Tailwind, construido sobre el diseño de Figma «GRSCup 2026 - UI Kit & Rutas».

Convive con el sistema actual (`backend/`, `frontend/`, `backoffice/`), que sigue en producción hasta el corte.

- [Arquitectura](docs/ARQUITECTURA.md)
- [Inventario: features, endpoints y tablas con su servicio](docs/INVENTARIO.md)
- [Roadmap por PRs](docs/ROADMAP.md)

## Desarrollo local

Requisitos: Go 1.26 y Docker.

```bash
cd platform
make verify      # gofmt + go vet + go build de todos los servicios
make dev-up      # PostgreSQL 17 + Redis 6.0 + Mailpit + identity, competition, audit, realtime y gateway (con seed de la GR Cup)
```

- **Gateway:** http://127.0.0.1:18300
  - salud: `GET /api/health`
  - contrato: `GET /openapi/v1.json`
  - documentación de cada servicio: `/docs`
- **Mailpit:** http://127.0.0.1:18325
- **Usuario Root de desarrollo:** `root@grcup.local` / `root-dev-password`. Lo crea el servicio `identity-bootstrap`.

Cada servicio es un binario con subcomandos:
- `serve` (por defecto);
- `migrate`, que aplica las migraciones embebidas y se usa en el `initContainer` de Kubernetes;
- otros propios, por ejemplo `identity bootstrap-root` o `identity genkey`.

| Servicio | Estado |
|---|---|
| `gateway` | Enrutado por prefijo (tabla del inventario), JWT, tokens `grc_` canjeados por JWT, límite por IP, CORS, `/api/health`, OpenAPI agregado |
| `identity` | Login (contraseña, enlace mágico, dispositivo), refresh rotatorio, tokens personales, roles y permisos (17 claves), equipo, invitaciones, sesiones, usuarios Root |
| `competition` | Competición (tenant), evento y sede con If-Match, estado programable (worker), módulos con bloqueo, checklist automática, inscripción AEP, cómo llegar, integraciones cifradas (AES-GCM) con prueba SMTP, endpoints internos, `seed-grcup` |
| `audit` | Consume todos los eventos (grupo desde `0`): auditoría con cursor y filtros, actividad con frases en español, notificaciones por permiso, KPIs y series |
| `realtime` | SSE público (`/api/competiciones/{slug}/stream`) y admin (`/api/admin/competiciones/{cid}/stream`, filtrado por permisos), `Last-Event-ID` con XRANGE, latidos de 15 s |
| `athletes` | Atletas: importación del acta AEP (diff + lotes con progreso SSE), fichas y perfiles públicos (consentimiento de imagen, menores), pesaje, reserva, avisos «Avísame cuando compita», área de atleta con enlace mágico; inscripción propia con pago (Stripe o pasarela simulada), cupones, referidos con devolución al referente, pagos y reembolsos |
| `cms` | Páginas por secciones (home, `/publico`, `/en`: borrador → publicar, versiones), FAQ, patrocinadores, SEO y redirecciones, páginas y blog (con publicación programada), galería, textos legales versionados e inmutables, voluntarios (menores con autorización), directorio de clubs con propuestas moderadas, medios con punto focal; API pública con caché versionada |
| `schedule` | Horarios: planificador de flights (generación automática, arrastrar y soltar, pesajes, conflictos), versiones publicadas con diff y avisos, estado en directo por flight, `/horarios` público y `.ics` |
| `crm` | Contactos con la prueba de cada consentimiento (doble opt-in de novedades), bajas y supresiones por hash, segmentos con audiencia por canal, actividad, derechos RGPD (acceso, rectificación, supresión), exportación CSV; suscripción pública y baja en un clic (RFC 8058) |
| `messaging` | Emails transaccionales: consume `*.email_solicitado`, plantillas editables con variables validadas, bandeja de salida con reintentos, rebotes y circuit breaker por SMTP, automatizaciones con pausa durante el evento, ritmo por minuto |
| `web` (Angular SSR) | Web pública: navbar de cristal, hero con la animación del trofeo (313 frames del CDN en canvas, «Saltar intro», movimiento reducido), campeonato con cuenta atrás y datos de la API, patrocinadores, cifras, footer, SEO (title, meta, canonical, Open Graph, JSON-LD `SportsEvent`), 404 real |
| `backoffice` (Angular SPA) | Acceso (login, enlace mágico, sesión caducada, autorizar dispositivo, invitación), shell (sidebar por permisos, selector de competición, ⌘K, notificaciones en vivo, barra inferior móvil), Inicio (KPIs, puesta en marcha, pendientes, actividad SSE, vista Taquilla), errores 403/404/500 |
| resto | Pendientes según el roadmap |

## Manifiestos de Kubernetes

Los servicios Go (`identity`, `competition`, `audit`, `realtime`) se generan desde una sola plantilla:

```bash
cd platform/deploy/k8s && python3 generar.py
```

El gateway se mantiene a mano. Despliegue y operación de QA: [runbook](docs/runbooks/QA.md).

## Frontend (Angular 22 + Tailwind v4)

```bash
cd platform/web
pnpm install
pnpm ng build public && pnpm ng build backoffice
pnpm start:backoffice     # http://localhost:4200 (necesita la API en el mismo origen o un proxy)
```

- `projects/ui`: librería `@grcup/ui` con los tokens de Figma (`styles/tokens.css`: colores, radios, 23 estilos de texto, grano, brillos) y los componentes base (botón, icono, badge, card, field, segmented, KPI, alert, empty, toast…).
- `projects/public`: web pública con SSR (`node dist/public/server/server.mjs`; `API_INTERNAL_URL`, `NG_ALLOWED_HOSTS`).
- `projects/backoffice`: SPA servida por nginx-unprivileged.
- Imágenes: `docker build --target public|backoffice platform/web` (lo hace `deploy/scripts/desplegar-qa.sh`).

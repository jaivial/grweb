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
| resto | Pendientes según el roadmap |

## Manifiestos de Kubernetes

Los servicios Go (`identity`, `competition`, `audit`, `realtime`) se generan desde una sola plantilla:

```bash
cd platform/deploy/k8s && python3 generar.py
```

El gateway se mantiene a mano. Despliegue y operación de QA: [runbook](docs/runbooks/QA.md).

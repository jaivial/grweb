# Roadmap · GR Cup Platform (v8)

**Flujo de cada paso:**
1. Worktree `~/projects/grweb-wt/<NN-slug>` con rama `platform/<NN-slug>` desde `origin/dev`.
2. PR a `dev` con su cuerpo según el formato de `pr-body`.
3. `pr-fix-loop`: revisión publicada como comentario, se corrige todo lo crítico, importante y medio, y se repite hasta que quede limpio (máximo 5 vueltas).
4. *Squash merge*, borrado del worktree y de la rama, y siguiente paso.

**Verificación de cada PR:** `make verify` + despliegue en `grcup-qa` + recorrido con `cu` por la tailnet. No se escriben tests (regla del proyecto).

| # | Paso | Entrega | QA |
|---|---|---|---|
| 01 | Arquitectura | `ARQUITECTURA.md`, `INVENTARIO.md` (todo lo actual y lo diseñado, con servicio dueño), este roadmap | Revisión del documento |
| 02 | Base Go + identidad | Módulo `platform`, `pkg/*` (app, httpx/huma, problem, db/goose, redisx, events/outbox, auth/JWKS, idem, ratelimit, sse, crypto), servicios `gateway` e `identity` (login, refresh, enlace mágico, dispositivo, tokens, roles, permisos, equipo), Dockerfile, Makefile, docker compose de desarrollo | `make verify`, compose local, login por curl |
| 03 | Kubernetes QA | Kustomize (namespace, Postgres, puente Redis + ACL, Mailpit, gateway e identity con HPA, PDB y NetworkPolicy), scripts de imágenes y despliegue, DNS de Cloudflare, nginx y certificados | `https://grcup-qa-api…/api/health` y login desde la tailnet |
| 04 | Núcleo de eventos | `competition`, `audit`, `realtime` (bus, SSE con `Last-Event-ID`), seed de la GR Cup 2026 («Datos de ejemplo») | Eventos que llegan por SSE, auditoría |
| 05 | Frontend base | Workspace Angular + Tailwind v4 + tokens de Figma, librería `ui` (componentes base), backoffice (shell, login, ⌘K, notificaciones, errores, Inicio) y web pública (navbar, footer, home con hero animado), imágenes y despliegue | `cu` en `grcup-qa` y `grcup-qa-bo` (D/T/M) |
| 06 | Web y contenidos | `cms` + backoffice 54 + páginas públicas de contenido (FAQ, legales, patrocinadores, reglamento, categorías, marcas mínimas, galería, blog, voluntarios, cómo llegar, ediciones, público, clubs, `/en`, SEO, sitemap) | `cu` + SEO (title, meta, sitemap) |
| 07 | Atletas | `athletes` + backoffice 55 (importar AEP, ficha, pesaje) + `/atletas`, `/atletas/:slug`, `/participantes`, `/area-atleta` | `cu` |
| 08 | Horarios | `schedule` + backoffice 56 (planificador con drag & drop, generar, diff, publicar) + `/horarios` | `cu` |
| 09 | Contactos y emails | `crm` + `messaging` transaccional (plantillas, outbox, SMTP → Mailpit, automatizaciones) + backoffice 61 (contactos) y 62 | `cu` + Mailpit |
| 10 | Entradas y check-in | `ticketing` + backoffice 58 y 59 (PWA, cámara, cola sin red) + `/entradas`, confirmación, `/mi-entrada` | `cu` (reserva → email → escaneo) |
| 11 | Directo y resultados | `live` + backoffice 57 (mesa, corrección, pantalla) + `/en-directo`, `/resultados` | `cu` con SSE |
| 12 | Campañas e IA | `ai` (MiniMax-M3.1-Flash) + campañas email+WhatsApp (editor tipo Figma, IA, previsualización, envío) + backoffice 61 (campañas) y 62 (WhatsApp) | `cu` + Mailpit + IA real |
| 13 | Sorteo | `raffle` + backoffice 60 + `/sorteo`, `/checkout`, `/success` (Stripe en modo test o simulado) | `cu` |
| 14 | Backoffice completo | Backoffice 53, 63 y 64 (evento y módulos, equipo, permisos y auditoría, sistema, integraciones y salud), búsqueda federada | `cu` en todas las rutas del backoffice |
| 15 | Listo para producción | HPA afinado, NetworkPolicies estrictas, copias `pg_dump` (CronJob), límites, observabilidad, runbooks | Prueba de escalado (`kubectl get hpa`) y de caída de pods |
| 16 | Migración y corte | ETL MySQL → PostgreSQL por servicio (sin datos personales en QA) y plan de corte con vuelta atrás | ETL sobre la BD local sintética |

**Pendiente de decisión del organizador o de la asesoría** (no bloquea los pasos 01 a 15):
- cupones y referidos;
- proveedor y número de WhatsApp;
- claves de prueba de Stripe;
- precio y legalidad del sorteo;
- retención de datos personales;
- autorizaciones de menores.

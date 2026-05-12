# GR Cup + FER — Mono-repo Multi-Frontend

Dos webs públicas que comparten el mismo backend y backoffice:

```
┌─────────────────┐    ┌─────────────────┐
│  GR Cup Web      │    │  FER Web         │
│  frontend/       │    │  ferweb/         │
│  Preact + Vite   │    │  React 18 + Vite │
│  :5173           │    │  :5174           │
│  grcup.es        │    │  fer.menustudioai│
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         │  /api/*  /hubs/*      │  /api/*
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │  Backend              │
         │  backend/GrCup.Api/   │
         │  ASP.NET Core 8       │
         │  :5006                │
         └───────────────────────┘

Backoffice: vive dentro de frontend/ (/backoffice/*)
Ambas webs usan el mismo backend API y los mismos datos.
```

- `frontend/`: GR Cup — Preact 10 + Vite + TypeScript + Tailwind v3.4 + backoffice
- `ferweb/`: FER Powerlifting — React 18 + Vite + TypeScript + Tailwind v3.4 (solo landing, sin backoffice)
- `backend/GrCup.Api/`: ASP.NET Core 8 Minimal API + C# + MySQL/EF Core (compartido)
- `Plans/`: Tareas y planes de implementación

---

## Orquestación: Project Manager (REGLA SUPREMA)

Toda tarea DEBE procesarse a través del agente **project-manager** + skill **project-management**. No se permite ejecución directa.

### Cadena de invocación

```
[Usuario solicita tarea]
        ↓
[prompt-enhancer + prompt-architect]  ← OBLIGATORIO: siempre primero
        ↓ (mejora y estructura el prompt)
[project-manager + project-management]
        ↓ (descompone y delega usando el prompt mejorado)
[Agente dedicado + skill(es) correspondiente(s)]
        ↓ (si es frontend)
[frontend-qa + ui-ux-pro-max] → [qa-tester + quality-auditor + qa-browser-testing]
        ↓
[PM recibe resultados → reporte final]
```

### Reglas del Project Manager
- NUNCA ejecuta tareas directamente — solo delega
- Cada agente delegado DEBE cargar al menos una skill
- Valida resultados antes de reportar al usuario

### Regla del Prompt Enhancer (PASO CERO)
- **TODO prompt de usuario DEBE pasar por `prompt-enhancer` + `prompt-architect` ANTES de llegar al Project Manager**
- El prompt-enhancer analiza, estructura y mejora el prompt original
- El Project Manager recibe el prompt mejorado como si fuera la instrucción original del usuario
- Si el prompt ya es claro y completo, el prompt-enhancer lo reproduce con solo adiciones mínimas (acceptance criteria, scope boundaries)

---

## Agentes del Proyecto

| Agente | Rol | Skills obligatorias | Cuándo usarlo |
|--------|-----|---------------------|---------------|
| `prompt-enhancer` | Pre-procesa prompts del usuario. NUNCA ejecuta tareas | `prompt-architect` | Siempre (PRIMER paso antes de cualquier tarea) |
| `project-manager` | Orquestador. NUNCA ejecuta directamente | `project-management` | Siempre (después de prompt-enhancer) |
| `front-developer` | Desarrollo frontend React/Preact | `frontenac` + `front-design` + `frontend-design` + `impeccable` | Toda creación/modificación frontend |
| `frontend-qa` | QA UI/UX con design intelligence | `ui-ux-pro-max` | Toda validación visual y UX |
| `qa-tester` | QA con browser headless | `quality-auditor` + `qa-browser-testing` | Testing E2E y regresión visual |
| `bunny-image` | Descarga, comprime y sube imágenes a BunnyCDN | `bunnycdn` (obligatoria) | Imágenes desde Google Drive → WebP → CDN |
| `bunnycdn-manager` | Operaciones generales BunnyCDN (list, upload, delete, purge) | `bunnycdn` (obligatoria) | Storage browsing, bulk ops, cache purge |
| `canvas-animation` | Animaciones HTML5 Canvas para scroll frames | (automática) | FrameAnimator, scroll-driven video |
| `hyperframes-developer` | Composiciones video con HyperFrames HTML | `hyperframes` + `hyperframes-cli` | Animaciones GSAP, title cards, overlays |
| `Explore` | Exploración rápida de codebase | (automática) | Búsquedas, preguntas sobre el código |
| `Plan` | Diseño de planes de implementación | (automática) | Planificación antes de implementar |
| `gr-devops-agent` | DevOps: Docker, systemctl, tunnels, nginx, deploys | `gr-dev-ops` (obligatoria) | Reinicios, rebuilds, migraciones, health checks |
| `general-purpose` | Investigación multi-paso, búsquedas complejas | (automática) | Tareas que no encajan en otros agentes |

---

## Skills del Proyecto

### Orquestación
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `prompt-architect` | Transforma prompts vagos en instrucciones claras y accionables | `prompt-enhancer` (siempre) |
| `project-management` | Orquestación de tareas y delegación a agentes | `project-manager` (siempre) |

### Frontend — Desarrollo
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `frontenac` | Arquitectura: folder-per-component, Jotai atoms, useMemo estricto | `front-developer` (siempre) |
| `front-design` | UI mobile-first, accesible, moderna | `front-developer` (siempre) |
| `frontend-design` | Estética production-grade: tipografía, color, composición | `front-developer` (siempre) |
| `impeccable` | Iteración de color/diseño, critique, polish | `front-developer` (siempre) |
| `frontend-organizer` | Plan y auditoría de organización de código frontend | Antes de refactor frontend |
| `frontend-components` | Extracción de sub-componentes desde JSX inline | Cuando un componente es demasiado grande |
| `frontend-hooks` | Extracción y refactor de custom hooks | Cuando hay lógica acoplada en componentes |
| `frontend-constants` | Extracción y deduplicación de constantes y config | Cuando hay valores hardcoded |
| `frontend-refactor` | Orquestación de refactors frontend (hooks + constantes + componentes) | Refactors grandes que cruzan múltiples áreas |

### Frontend — Calidad
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `ui-ux-pro-max` | Inteligencia diseño: 50+ estilos, 161 paletas, 99 UX guidelines | `frontend-qa` (siempre) |
| `quality-auditor` | Auditoría calidad frontend completa | `qa-tester` (siempre) |
| `qa-browser-testing` | Testing con Chrome headless (agent-browser) | `qa-tester` (siempre) |
| `datatestid-skill` | Enforce atributos data-testid únicos en HTML | Cuando se añaden nuevos componentes |
| `test-helper` | Generación de tests, mocks, fixtures | Cuando se necesitan nuevos tests |

### Animación y Video
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `hyperframes` | Composiciones video HTML, GSAP, escenas, title cards | `hyperframes-developer` |
| `hyperframes-cli` | CLI dev loop para scaffold HyperFrames | `hyperframes-developer` |
| `hyperframes-registry` | Instalación de blocks y componentes registry | `hyperframes-developer` |
| `hyperframes-media` | Preprocessing assets: TTS, audio, imágenes | `hyperframes-developer` |
| `website-to-hyperframes` | Captura website → composición HyperFrames | Conversión de páginas a video |
| `remotion-to-hyperframes` | Traducción Remotion → HyperFrames | Migración de composiciones |
| `gsap` | Referencia GSAP: gsap.to(), from(), timeline | Animaciones GSAP |
| `animejs` | Patrones adapter Anime.js | Animaciones Anime.js |
| `css-animations` | Patrones adapter CSS animations | Animaciones CSS puras |
| `waapi` | Patrones adapter Web Animations API | Animaciones WAAPI |
| `lottie` | Patrones adapter Lottie/dotLottie | Animaciones Lottie |
| `tailwind` | Tailwind CSS v4.2 browser-runtime patterns | Estilos en HyperFrames |
| `three` | Three.js y WebGL adapter patterns | 3D y WebGL |

### CDN — BunnyCDN (MCP Tools)
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `bunnycdn` | Gestión de assets en BunnyCDN via MCP tools (upload, list, delete, purge) | `bunny-image` + `bunnycdn-manager` (obligatoria) |

**MCP Server**: `.claude/mcp/bunnycdn/server.js` — configurado en `.claude/settings.local.json`

**MCP Tools disponibles**:
| Tool | Descripción |
|------|-------------|
| `bunny_list_files` | Listar archivos en un path del storage |
| `bunny_upload_file` | Subir archivo local al storage |
| `bunny_upload_buffer` | Subir datos base64 al storage |
| `bunny_download_file` | Descargar archivo como base64 |
| `bunny_delete_file` | Eliminar archivo del storage |
| `bunny_get_url` | Obtener URL pública CDN |
| `bunny_list_pullzones` | Listar pull zones |
| `bunny_purge_cache` | Purgar caché de un pull zone |
| `bunny_storage_usage` | Auditoría de uso por carpeta |

### DevOps — Infraestructura
| Skill | Propósito | Usada por |
|-------|-----------|-----------|
| `gr-dev-ops` | Gestión Docker, systemctl, Cloudflare tunnels, nginx, migraciones, deploys | `gr-devops-agent` (obligatoria) |

### Backend y API
| Skill | Propósito | Cuándo usarla |
|-------|-----------|---------------|
| `api-design` | Patrones REST API, versioning, OpenAPI | Diseño de nuevos endpoints |

### Seguridad y Git
| Skill | Propósito | Cuándo usarla |
|-------|-----------|---------------|
| `security-audit` | Auditoría rápida OWASP top 10, secrets | Cambios en auth, pagos, input handling |
| `security-review` | Security review completa de cambios pendientes | Antes de merge/PR |
| `git-workflow` | Commits atómicos, naming semántico | Operaciones de git |

### Utilidades
| Skill | Propósito | Cuándo usarla |
|-------|-----------|---------------|
| `simplify` | Revisión de código cambiado: reutilización, calidad, eficiencia | Post-implementación |
| `review` | Review de PR | Al revisar pull requests |
| `init` | Inicializar CLAUDE.md en un proyecto | Solo inicialización |
| `fewer-permission-prompts` | Escanea transcripts y genera allowlist | Reducir prompts de permisos |

---

## Reglas de Precedencia

1. **Prompt Enhancer** + `prompt-architect` → procesa TODO prompt de usuario antes de cualquier otra acción
2. **Project Manager** + `project-management` → orquesta todo (con el prompt mejorado)
3. Seguridad/contratos > AGENTS específico de carpeta > reglas globales
4. Toda creación/modificación frontend → `front-developer` + 4 skills obligatorias
5. Toda validación UI/UX → `frontend-qa` + `ui-ux-pro-max`
6. Toda validación técnica → `qa-tester` + `quality-auditor` + `qa-browser-testing`
7. Toda operación BunnyCDN → `bunny-image` o `bunnycdn-manager` + skill `bunnycdn` (obligatoria)
8. Toda operación DevOps → `gr-devops-agent` + skill `gr-dev-ops` (obligatoria)
9. Ningún agente puede omitir sus skills obligatorias

---

## Jerarquía de Config por Carpeta

- Este `CLAUDE.md` = reglas globales (siempre aplica).
- Cada operación de `read`/`edit`/`update` debe cargar el `AGENTS.md` de la carpeta del archivo objetivo.

| Ruta del archivo | AGENTS específico |
|-----------------|-------------------|
| `backend/GrCup.Api/*` | `backend/GrCup.Api/AGENTS.md` (no existe aún) |
| `frontend/*` | `frontend/AGENTS.md` |
| `ferweb/*` | `ferweb/AGENTS.md` |
| `Plans/*` | Solo lectura/referencia |

- Si la tarea cruza proyectos → aplicar el AGENTS de cada carpeta en su bloque.
- No mezclar reglas entre proyectos salvo reglas globales.

---

## Objetivo Principal

- Máxima velocidad percibida y real: HTML/CSS/JS mínimos, assets optimizados.
- Mantener contratos de datos usados por la UI (API responses, SignalR messages).
- UX fluida con animaciones de scroll (video frames).
- Dos webs (GR Cup + FER) con un solo backend y backoffice compartido.

---

## GR Cup Web — `frontend/`

Web principal del proyecto. Contiene la SPA pública + backoffice completo.

### Tech
- Preact 10 + TypeScript + Vite
- TailwindCSS v3.4
- Scroll-driven frames con Canvas
- SignalR client para real-time
- Wouter para routing
- Jotai para estado global

### Estructura
```
frontend/src/
├── components/        # Componentes UI reutilizables
├── pages/             # Páginas públicas y backoffice
│   ├── home/          # Home + Inscripción
│   ├── checkout/      # Checkout Stripe
│   ├── success/       # Confirmación de compra
│   ├── raffle/        # Sorteo público
│   ├── legal/         # Privacy, Terms, DataConsent, ContestPolicy
│   ├── backoffice/    # Panel admin (ver sección Backoffice)
│   ├── Checkout.tsx   # Checkout standalone
│   ├── Success.tsx    # Success standalone
│   ├── Schedules.tsx  # Horarios
│   └── Location.tsx   # Ubicación
├── hooks/             # Custom hooks
├── utils/             # Funciones utilitarias
├── stores/            # Estado global (Jotai atoms)
├── layouts/           # Layout wrappers
├── constants/         # Constantes
├── types/             # Tipos TypeScript
├── lib/               # Lógica de negocio
├── admin/             # Login y auth (JWT)
└── styles/            # Estilos adicionales
```

### Rutas públicas
| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/` | Home | Landing con hero animado |
| `/inscripcion` | Inscripcion | Formulario inscripción |
| `/checkout` | Checkout | Pago Stripe |
| `/success` | Success | Confirmación compra |
| `/raffle` | Raffle | Sorteo público |
| `/schedules` | Schedules | Horarios competición |
| `/location` | Location | Ubicación evento |
| `/legal/*` | Privacy, Terms, etc. | Páginas legales |

### Rutas backoffice
| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/backoffice` | BackofficeHome | Dashboard principal |
| `/backoffice/dashboard` | BackofficeDashboard | KPIs y métricas |
| `/backoffice/inscripciones` | Inscripciones | Gestión atletas (CRUD, paginación) |
| `/backoffice/inscripciones-page` | InscripcionesPage | Vista alternativa inscripciones |
| `/backoffice/participantes` | Participantes | Tabla de participantes |
| `/backoffice/sorteo` | Sorteo | Sorteo aleatorio + gift/delete modals |
| `/backoffice/rifa` | RifaPage | Gestión rifa |
| `/backoffice/rifa-config` | RaffleConfigPage | Configuración sorteo/productos |
| `/backoffice/configuracion` | Configuracion | Stripe + Email settings |
| `/backoffice/config` | ConfigPage | Config general |
| `/backoffice/horarios` | Horarios | Gestión horarios |
| `/backoffice/inscripcion-config` | InscripcionConfig | Config inscripción |
| `/backoffice/checkin` | CheckinPage | Checkin día del evento |
| `/login` | Login | Autenticación JWT |

### Estructura Backoffice
```
frontend/src/pages/backoffice/
├── Home.tsx               # Dashboard entry
├── Dashboard.tsx          # KPIs (participantes, tickets, revenue)
├── InscripcionesPage.tsx  # Vista inscripciones
├── InscripcionConfig.tsx  # Config inscripción
├── RifaPage.tsx           # Gestión rifa
├── ConfigPage.tsx         # Config general
├── CheckinPage.tsx        # Checkin evento
├── inscripciones/         # CRUD atletas
│   ├── Inscripciones.tsx
│   ├── components/ (AthleteForm, DeleteConfirmModal, Pagination)
│   └── hooks/ (useAthletes)
├── participantes/         # Tabla participantes
│   └── Participantes.tsx
├── sorteo/                # Sorteo aleatorio
│   ├── Sorteo.tsx
│   ├── GiftModal.tsx
│   └── DeleteConfirmModal.tsx
├── raffle-config/         # Config sorteo
│   └── RaffleConfigPage.tsx
├── configuracion/         # Stripe + Email settings
│   ├── Configuracion.tsx
│   ├── components/ (EmailSettingsForm, StripeSettingsForm)
│   └── hooks/ (useEmailConfig, useStripeConfig)
└── horarios/              # Gestión horarios
    ├── Horarios.tsx
    └── hooks/ (useSchedule)
```

### Dev
- Puerto: 5173
- API URL: `VITE_API_URL` (default `http://localhost:5006`)
- Proxies: `/api/*` y `/hubs/*` → backend:5006

### Convenciones
- Componentes funcionales con hooks
- Estado global via Jotai atoms (OBLIGATORIO: cero `useState`, usar `useAtomValue` / `useSetAtom`)
- TailwindCSS para estilos (clases utilitarias)
- `prefers-reduced-motion` desactiva animaciones de scroll
- Imágenes con `loading="lazy"` cuando proceda
- Arquitectura folder-per-component (ver skill `frontenac`)
- **Ningún archivo TSX debe superar 800 líneas**
- Todo valor derivado en render → `useMemo`
- Todo handler pasado a hijos → `useCallback`
- **Todo tag HTML** debe llevar `data-*` diferenciador (único en su bloque lógico)
- Lazy loading con `React.lazy` + `Suspense` para todas las rutas

---

## FER Web — `ferweb/`

Landing page independiente para FER Powerlifting Day. Sin backoffice, sin routing.

### Tech
- React 18 + TypeScript + Vite
- Tailwind CSS v3.4 (paleta FER "aura místico")
- Framer Motion (animaciones)
- Zod (validación formularios)
- Lucide React (iconos)
- React Hot Toast (notificaciones)
- Jotai (estado global)

### Estructura
```
ferweb/src/
├── api/              # API client (multi-tenant)
├── stores/           # Jotai atoms
├── hooks/            # Custom hooks
├── types/            # TypeScript types
├── utils/            # Utility functions
├── components/       # Shared components (Head, animations)
├── pages/fer/        # FER landing (única página)
│   ├── FerLanding.tsx  # Componente principal
│   ├── components/     # FER-specific components
│   ├── hooks/          # FER-specific hooks
│   ├── constants.ts    # FER colors, event info
│   └── index.ts
├── styles/           # Global CSS
├── app.tsx           # Entry: renderiza FerLanding directamente
└── hyperframes/      # HyperFrames composiciones video
```

### Dev
- Puerto: 5174
- API URL: `VITE_API_URL` (default `http://localhost:5006`)
- Producción: `https://fer.menustudioai.com`
- Proxy: `/api/*` → backend:5006 (sin SignalR)

### Colores FER (mantener sincronizado en 3 sitios)
1. `src/pages/fer/constants.ts` → `FER_COLORS` (single source of truth)
2. `tailwind.config.js` → `colors`
3. `src/styles/globals.css` → CSS variables `:root`

### Convenciones
- Sin router — single-page: `App.tsx` → `<FerLanding />`
- Mismas reglas de data-*, useMemo, useCallback que GR Cup
- Cookie auth: `gr_token` (matches backend UsuarioEndpoints)

---

## Backend — `backend/GrCup.Api/`

API compartida por ambas webs. Sirve endpoints para GR Cup y FER indistintamente.

### Tech
- ASP.NET Core 8 Minimal API
- MySQL con Pomelo.EntityFrameworkCore.MySql
- SignalR para real-time (solo GR Cup)
- JWT authentication para backoffice
- Stripe Checkout integration
- BunnyCDN para assets/imágenes
- Email service (SMTP)

### Estructura
```
backend/GrCup.Api/
├── Data/           # DbContext y configuración EF Core
├── Endpoints/      # Minimal API endpoints
│   ├── CompeticionEndpoints.cs
│   ├── InscripcionEndpoints.cs
│   ├── RifaEndpoints.cs
│   └── UsuarioEndpoints.cs
├── Hubs/           # SignalR hubs
├── Models/         # Entidades de dominio
├── Services/       # Lógica de negocio
│   ├── BunnyCdnService.cs
│   ├── EmailService.cs
│   ├── ImageProcessorService.cs
│   └── JwtService.cs
├── Migrations/     # EF Core migrations
└── Program.cs      # Configuración y startup
```

### Autenticación
- JWT para backoffice (login → cookie `gr_token`)
- Tokens via `Authorization: Bearer <token>`
- Secrets via environment variables

### API JSON
- Éxito: `{ success: true, data: {...} }`
- Error: `{ success: false, message: "..." }`
- Legado: `{ status: "success|error|warning", ... }`

### Endpoints
| Ruta | Descripción | Auth |
|------|-------------|------|
| `/api/*` | Endpoints públicos (config, participantes, competición) | No |
| `/api/tickets/*` | Stripe checkout | No |
| `/api/admin/*` | Endpoints admin/backoffice | JWT |
| `/api/webhooks/stripe` | Webhooks de Stripe | Stripe signature |
| `/hubs/*` | SignalR websockets | No |

### Puerto
- Dev: 5006

---

## Scroll-Driven Video Animations

### Frames
```
frontend/public/frames/
├── hero/           # 60 frames: 001.jpg ... 060.jpg
├── rules/          # 50 frames: 001.jpg ... 050.jpg
├── how-to-enter/   # 40 frames: 001.jpg ... 040.jpg
└── winners/        # 30 frames: 001.jpg ... 030.jpg
```

### Convenciones
- Formato: JPG (recomendado) o PNG
- Nombrado: tres dígitos con padding (001.jpg, 002.jpg...)
- Resolución: 1920x1080 o superior
- Optimización: WebP para tamaños menores

### Implementación
- Frame Preloader: carga progresiva
- Scroll Progress Tracker: scroll → número de frame
- Canvas Renderer: 60fps
- Parallax Layers: texto a diferentes velocidades

---

## Reglas de Cambio

- Mantener contratos de datos usados por la UI
- Cada endpoint devuelve shapes consistentes
- Evitar cambios fuera del scope de la tarea
- No exponer credenciales ni secretos en logs/respuestas
- Timeouts en operaciones de DB
- Composición sobre herencia
- **data-* obligatorio** en todo tag HTML en `.tsx`, `.jsx`, `.html`
- **useMemo** para todo derivado de estado/props en render
- **useCallback** para todo handler pasado a hijos
- Cambios en backend afectan a AMBAS webs — verificar impacto en GR Cup y FER
- No compartir código entre `frontend/` y `ferweb/` (proyectos Vite independientes)

---

## Dev Local

| Servicio | Comando | Puerto |
|----------|---------|--------|
| GR Cup frontend | `cd frontend && npm run dev` | 5173 |
| FER web | `cd ferweb && npm run dev` | 5174 |
| Backend API | `cd backend/GrCup.Api && dotnet run` | 5006 |
| Stripe webhooks | `stripe listen --forward-to localhost:5006/api/webhooks/stripe` | — |

### QA Visual y Dev Tunnel

Los dev servers corren como servicios `systemctl` y están expuestos via **Cloudflare Tunnel**:

| Proyecto | URL Tunnel | Destino |
|----------|-----------|---------|
| FER Web (dev) | `https://ferdev.menustudioai.com/` | ferweb dev server (systemctl) |

**QA visual SIEMPRE usa agent-browser MCP** (no Playwright directo). Las URLs de tunnel son las que deben usarse para capturas de pantalla y testing visual, ya que el agent-browser se ejecuta en un contexto remoto y no tiene acceso a `localhost`.

- Para QA de FER: usar `https://ferdev.menustudioai.com/`
- Para QA de GR Cup: usar el tunnel correspondiente cuando exista
- Nunca intentar screenshots con Playwright directamente — delegar a `qa-tester` + skill `qa-browser-testing` + `agent-browser`

---

## Configuración de Entorno

### Backend (.env)
```bash
JWT_SECRET=your-secret-key-at-least-32-characters-long
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strongpassword
```

### Frontend (.env) — ambos proyectos
```bash
VITE_API_URL=http://localhost:5006
```

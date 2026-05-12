# GR Cup Raffle Application (reglas del proyecto)

Este repo contiene:
- `frontend/`: Aplicación Preact + Vite + TypeScript + Tailwind CSS.
- `backend/GrCup.Api/`: API ASP.NET Core 8 Minimal API + C# con MySQL/EF Core.
- `Plans/`: Tareas y planes de implementación.

---

## NORMA OBLIGATORIA: Orquestación via Project Manager

**REGLA SUPREMA**: Toda tarea en este proyecto DEBE ser procesada a través del agente **Project Manager** con su skill asociada **project-management**. No se permite la ejecución directa de tareas.

### Protocolo obligatorio

1. **Toda tarea** debe invocarse como: agente `project-manager` + skill `project-management`
2. El Project Manager es el ÚNICO punto de entrada para cualquier acción
3. El Project Manager descompone la tarea y delega a agentes dedicados:
   - **Frontend** → agente `front-developer` + skills `frontenac` + `front-design` + `frontend-design` + `impeccable`
   - **Frontend QA** → agente `frontend-qa` + skill `ui-ux-pro-max`
   - **QA / Testing** → agente `qa-tester` + skills `quality-auditor` + `qa-browser-testing`
   - **Backend** → agente dedicado con skill correspondiente
   - **DevOps** → agente `gr-devops-agent` + skill `gr-dev-ops`
   - **Seguridad** → agente dedicado + skill `security-audit`
   - **Git** → agente dedicado + skill `git-workflow`
4. Cada agente dedicado DEBE cargar al menos una skill por sesión
5. No se puede hacer NINGUNA acción sin que el Project Manager invoque un agente nuevo

### Cadena de invocación

```
[Usuario solicita tarea]
        ↓
[Project Manager + skill: project-management]
        ↓ (descompone y delega)
[Agente dedicado + skill correspondiente]
        ↓
[Resultado validado → PM decide siguiente paso]
        ↓ (si es frontend)
[qa-tester + skills: quality-auditor + qa-browser-testing]
        ↓
[Reporte final del PM]
```

### Skills del proyecto

| Skill | Propósito | Llamada obligatoria por |
|-------|-----------|------------------------|
| `project-management` | Orquestación de tareas y agentes | project-manager (siempre) |
| `frontenac` | Arquitectura React: folder-per-component, Jotai, useMemo | front-developer (siempre) |
| `front-design` | UI mobile-first, accesible, moderna | front-developer (siempre) |
| `frontend-design` | Estética production-grade distintiva, tipografía, color, composición | front-developer (siempre) |
| `impeccable` | Color/design iteration, critique, polish, colorize | front-developer (siempre) |
| `ui-ux-pro-max` | Inteligencia de diseño UI/UX: 50+ estilos, 161 paletas, 99 UX guidelines | frontend-qa (siempre) |
| `quality-auditor` | Auditoría de calidad frontend completa | qa-tester (siempre) |
| `qa-browser-testing` | Testing con Chrome headless (agent-browser) | qa-tester (siempre) |
| `gr-dev-ops` | DevOps: Docker, systemctl, Cloudflare tunnels, nginx, migraciones, deploys | gr-devops-agent (obligatoria) |

### Agentes del proyecto

| Agente | Rol | Skills obligatorias |
|--------|-----|---------------------|
| `project-manager` | Orquestador. NUNCA ejecuta directamente | project-management |
| `front-developer` | Desarrollo frontend React/Preact | frontenac + front-design + frontend-design + impeccable |
| `frontend-qa` | QA UI/UX con design intelligence | ui-ux-pro-max |
| `qa-tester` | QA con browser headless | quality-auditor + qa-browser-testing |
| `gr-devops-agent` | DevOps: Docker, systemctl, tunnels, nginx, deploys | gr-dev-ops (obligatoria) |

### Reglas de precedencia actualizadas

1. Regla suprema: Project Manager + project-management skill → orquesta todo
2. Reglas de seguridad/contratos > AGENTS específico > reglas globales
3. Toda creación/modificación frontend → front-developer + frontenac + front-design + frontend-design + impeccable
4. Toda validación frontend UI/UX → frontend-qa + ui-ux-pro-max
5. Toda validación frontend técnica → qa-tester + quality-auditor + qa-browser-testing
6. Toda operación DevOps (restart, rebuild, migrate, deploy, health check) → gr-devops-agent + gr-dev-ops
7. Ningún agente puede omitir el uso de su skill obligatoria

---

## Objetivo principal
- Máxima velocidad percibida y real: HTML/CSS/JS mínimos, assets optimizados.
- Mantener contratos de datos usados por la UI (API responses, SignalR messages).
- Experiencia de usuario fluida con animaciones de scroll (video frames).

## Arquitectura recomendada
- Frontend: **Preact + Vite + TypeScript + Tailwind CSS v3.4** con build estático.
- Backend: **ASP.NET Core 8 Minimal API** sirviendo:
  - Endpoints JSON bajo `/api/*`.
  - SignalR hub para actualizaciones en tiempo real.
  - Stripe Checkout integration.

## Convenciones de carpetas
- `frontend/src/`: Preact + TypeScript (SPA).
- `backend/GrCup.Api/`: ASP.NET Core 8 Minimal API.
- No hay código legacy - proyecto nuevo desde cero.

## Jerarquía de AGENTS por carpeta (obligatorio)
- Este `AGENTS.md` aplica siempre como reglas globales.
- Además, **cada vez** que se vaya a hacer una operación de `read`, `edit` o `update`, hay que cargar y seguir el `AGENTS.md` específico del proyecto del archivo objetivo.

### Mapeo de referencia
- Si el archivo está en `backend/GrCup.Api/*` → aplicar `backend/GrCup.Api/AGENTS.md` + reglas globales de este archivo.
- Si el archivo está en `frontend/*` → aplicar `frontend/AGENTS.md` + reglas globales.
- Si el archivo está en `plans/*` → solo lectura/referencia.

### Reglas operativas por tarea
- Antes de tocar archivos, identificar el scope de la tarea por ruta.
- Si la tarea cruza varios proyectos, aplicar el AGENTS específico de cada carpeta en su bloque correspondiente.
- No mezclar reglas de un proyecto en otro salvo las reglas globales de este `AGENTS.md`.
- En dudas de precedencia: reglas de seguridad/contratos > AGENTS específico > reglas globales.

---

## Frontend (Preact)

Ubicación: `frontend/`

### Tecnología
- Preact 10 + TypeScript + Vite.
- TailwindCSS v3.4 para estilos.
- Animación: sistema de frames de scroll-driven con Canvas.
- SignalR client para actualizaciones en tiempo real.

### Estructura de carpetas
```
frontend/src/
├── components/        # Componentes UI reutilizables
├── pages/             # Página principal
├── hooks/             # Custom hooks
├── utils/             # Funciones utilitarias
├── stores/            # Estado global (signals)
├── layouts/           # Layout wrappers
├── constants/         # Constantes
├── types/             # Tipos TypeScript
├── lib/               # Lógica de negocio
├── admin/             # Panel admin (rutas separadas)
└── styles/            # Estilos adicionales
```

### Dev
- Puerto: 5173
- API URL: `VITE_API_URL` (default `http://localhost:5006`)

### Convenciones
- Componentes funcionales con hooks.
- Estado global via Jotai atoms (OBLIGATORIO: cero `useState`, usar `useAtomValue` / `useSetAtom`).
- TailwindCSS para estilos (clases utilitarias).
- `prefers-reduced-motion` debe desactivar animaciones de scroll.
- Imágenes con `loading="lazy"` cuando proceda.
- Arquitectura folder-per-component (ver skill `frontenac`).
- Todo valor derivado en render DEBE usar `useMemo`.
- Todo handler pasado a hijos DEBE usar `useCallback`.
- Ningún archivo debe superar 800 líneas.

---

## Backend (ASP.NET Core 8)

Ubicación: `backend/GrCup.Api/`

### Tecnología
- ASP.NET Core 8 Minimal API.
- MySQL con Pomelo.EntityFrameworkCore.MySql.
- SignalR para real-time.
- JWT authentication para admin.
- Stripe Checkout integration.

### Estructura de carpetas
```
backend/GrCup.Api/
├── Data/           # DbContext y configuración de EF Core
├── Endpoints/      # Minimal API endpoints
├── Hubs/           # SignalR hubs
├── Models/         # Entidades de dominio
├── Services/       # Lógica de negocio
├── Migrations/     # EF Core migrations
└── Program.cs      # Configuración y startup
```

### Autenticación
- **JWT** para panel admin.
- Tokens via `Authorization: Bearer <token>`.
- Secrets via environment variables.

### API JSON
- Éxito: `{ success: true, data: {...} }`
- Error: `{ success: false, message: "..." }`
- Legado: `{ status: "success|error|warning", ... }`

### Puerto
- Dev: 5006

---

## Interrelación entre proyectos

### Flujo de datos
```
[Usuario] → [frontend (Preact SPA)] → [backend (ASP.NET Core)]
                                      ↓
                              [SignalR Hub]
                                      ↓
                              [Stripe Webhooks]
```

### Endpoints del backend
- `/api/*`: endpoints públicos (config, participantes).
- `/api/tickets/*`: Stripe checkout.
- `/api/admin/*`: endpoints admin con JWT.
- `/api/webhooks/stripe`: webhooks de Stripe.

### Desarrollo local
- `frontend`: Vite en 5173 → API en 5006.
- `backend`: dotnet en 5006.
- Stripe CLI para webhooks locales.

---

## Reglas de cambio
- Mantener contratos de datos usados por la UI.
- Cada endpoint debe devolver shapes consistentes.
- Evitar cambios innecesarios fuera del scope.
- No exponer credenciales ni secretos en logs o respuestas.
- Usar siempre timeouts en operaciones de DB.
- Preferir composición sobre herencia.
- **Atributo HTML obligatorio en todo tag** (regla estricta): TODO tag HTML escrito en `.tsx`, `.jsx`, `.html` — sin excepción — debe llevar un atributo `data-*` diferenciador (`data-ui`, `data-slot`, `data-role` o equivalente). El valor debe describir el rol semántico del nodo y ser único dentro de su bloque lógico.
- Regla de oro (render): cualquier estructura derivada de estado/props usada por la UI (listas, mapas, contadores, texto compuesto) debe ir en `useMemo` para evitar recálculos innecesarios; handlers que se pasan a hijos deben estabilizarse con `useCallback`.

---

## Scroll-Driven Video Animations

### Estructura de frames
```
frontend/public/frames/
├── hero/           # 60 frames: 001.jpg ... 060.jpg
├── rules/          # 50 frames: 001.jpg ... 050.jpg
├── how-to-enter/   # 40 frames: 001.jpg ... 040.jpg
└── winners/        # 30 frames: 001.jpg ... 030.jpg
```

### Convenios de frames
- Formato: JPG (recomendado) o PNG.
- Nombrado: tres dígitos con padding (001.jpg, 002.jpg, etc.).
- Resolución: 1920x1080 o superior.
- Optimización: usar WebP para tamaños menores.

### Implementación
- Frame Preloader: carga frames progresivamente.
- Scroll Progress Tracker: mapea posición de scroll a número de frame.
- Canvas Renderer: muestra frames a 60fps.
- Parallax Layers: texto con diferentes velocidades.

---

## Admin Panel

### Ubicación
`frontend/src/admin/` - rutas `/admin/*`

### Tecnología
- Preact + TypeScript + Tailwind.
- JWT auth via login.
- Tablas con paginación y búsqueda.
- Export CSV para participantes.

### Features
- Dashboard: KPIs (participantes, tickets, revenue).
- Gestión de participantes: tabla paginada con búsqueda.
- Sorteo: selección aleatoria con confirmación.
- Historial de sorteos: audit trail completo.

---

## Configuración de entorno

### Backend (.env)
```bash
JWT_SECRET=your-secret-key-at-least-32-characters-long
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=strongpassword
```

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:5006
```

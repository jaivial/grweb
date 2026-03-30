# GR Cup Raffle Application (reglas del proyecto)

Este repo contiene:
- `frontend/`: Aplicación Preact + Vite + TypeScript + Tailwind CSS.
- `backend/GrCup.Api/`: API ASP.NET Core 8 Minimal API + C# con MySQL/EF Core.
- `Plans/`: Tareas y planes de implementación.

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
- Este `CLAUDE.md` aplica siempre como reglas globales.
- Además, **cada vez** que se vaya a hacer una operación de `read`, `edit` o `update`, hay que cargar y seguir el `AGENTS.md` específico del proyecto del archivo objetivo.

### Mapeo de referencia
- Si el archivo está en `backend/GrCup.Api/*` → aplicar `backend/GrCup.Api/AGENTS.md` + reglas globales de este archivo.
- Si el archivo está en `frontend/*` → aplicar `frontend/AGENTS.md` + reglas globales.
- Si el archivo está en `plans/*` → solo lectura/referencia.

### Reglas operativas por tarea
- Antes de tocar archivos, identificar el scope de la tarea por ruta.
- Si la tarea cruza varios proyectos, aplicar el AGENTS específico de cada carpeta en su bloque correspondiente.
- No mezclar reglas de un proyecto en otro salvo las reglas globales de este `CLAUDE.md`.
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
- Estado global via Preact Signals.
- TailwindCSS para estilos (clases utilitarias).
- `prefers-reduced-motion` debe desactivar animaciones de scroll.
- Imágenes con `loading="lazy"` cuando proceda.

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

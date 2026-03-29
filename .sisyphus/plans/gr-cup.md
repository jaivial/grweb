# GR Cup — Full-Stack Raffle Web Application

## TL;DR

> **Quick Summary**: Build a complete production-ready web app for GR Cup (powerlifting championship raffle) with a public-facing marketing/purchase site and an admin backoffice.
>
> **Deliverables**:
> - `frontend/` — Preact 10 + TypeScript + Vite + Tailwind CSS SPA with parallax scroll animations, Stripe checkout, SignalR live counter
> - `backend/` — ASP.NET Core 8 minimal API with MySQL (Pomelo EF Core), SignalR hub, JWT auth, Stripe integration
> - `docker-compose.yml` — full stack local dev with MySQL 8
> - Deployment-ready README per project
>
> **Estimated Effort**: XL (200+ files, ~50 tasks across 5 waves)
> **Parallel Execution**: YES — 5 waves, max 8 tasks per wave
> **Critical Path**: Wave 1 scaffolding → Wave 3 API → Wave 4 frontend core → Wave 5 admin → integration

---

## Context

### Original Request
Build a complete production-ready web application for GR Cup raffle (powerlifting championship) following the ciridae.com aesthetic with:
- Preact 10 + TypeScript + Vite + Tailwind CSS v3.4+ frontend
- ASP.NET Core 8 (minimal API) + C# backend
- MySQL 8 via Pomelo.EntityFrameworkCore.MySql
- SignalR for live participant counter
- JWT auth for backoffice
- Stripe Checkout for payments
- Parallax scroll-driven frame animations (4 sections, 30-60 frames each)
- Public site: hero, rules, how-to-enter, winners, footer, ticket purchase
- Admin panel: login, dashboard KPIs, paginated participants table, draw winner

### Design Reference (ciridae.com)
**CSS Design Tokens extracted**:
- Font: Roboto Mono (weights 300-700)
- Container: 320px min → 1920px max (fluid scaling with `clamp`)
- Section padding: `--size--100` (desktop), `--size--80` (tablet)
- Margins: `--size--160` to `--size--4` (standard spacing scale)
- Gaps: `--size--80` to `0.25rem`
- Color: Off-white sections, white cards, dark neutral base
- Typography: `line-height: 1.1` to `1.5`, `letter-spacing: -0.04em` to `0.1em`
- Bold sans-serif, generous line spacing, large headings

**Custom for GR Cup**:
- Dark/neutral base with electric blue `#00f0ff` and orange `#ff5e00` neon accents
- Full-screen sections with subtle dividers
- Sticky minimal nav bar
- Oversized CTA buttons with hover scale + glow effects
- Bold fitness/energy aesthetic

### Research Findings

**Preact + Vite + Tailwind**:
- `npm create vite@latest` → choose Preact template
- `npx tailwindcss init -p` for config generation
- Wouter for routing (`@preact/signals` for state)
- Tailwind JIT mode with content paths for purge
- Custom colors via `tailwind.config.js` extend
- Vite env vars: `import.meta.env.VITE_*`

**ASP.NET Core 8 Minimal API**:
- `dotnet new web` creates minimal API project
- Packages: `Pomelo.EntityFrameworkCore.MySql`, `Microsoft.AspNetCore.SignalR`, `Microsoft.AspNetCore.Authentication.JwtBearer`, `Stripe.net`
- Program.cs wires everything: DI, CORS, auth, SignalR, endpoints
- EF Core: DbContext with `OnConfiguring`, connection strings from `appsettings.json` or env
- SignalR: `MapHub<ParticipantsHub>("/hubs/participants")`, hub broadcasts count on purchase
- JWT: `AddJwtBearer` + `[Authorize]` attribute on admin endpoints
- Stripe: `StripeConfiguration.ApiKey` + `SessionService.Create()` for Checkout

**Parallax Frame Scrubbing**:
- Algorithm: `frameIndex = Math.floor((scrollProgress) * totalFrames)`
- `IntersectionObserver` for section entry, `scroll` listener for progress
- Canvas `drawImage()` for rendering (GPU-accelerated) OR preloaded `<img>` swapping
- Preload: load first 5 frames immediately, lazy-load rest via `new Image()`
- Memory: dispose old frames, keep window of ±10 frames
- Mobile: `passive: true` on scroll listener, `will-change: contents` on frame container
- Accessibility: respect `prefers-reduced-motion`, static fallback if no JS

### Metis Review
*To be filled after Metis consultation*

---

## Work Objectives

### Core Objective
Build two interconnected applications: a public-facing Preact SPA where users buy raffle tickets via Stripe and watch a live participant counter, and a protected ASP.NET Core admin panel for managing participants and drawing winners.

### Concrete Deliverables

**Public Site (`frontend/`)**
- `src/App.tsx` — root with routing (Wouter)
- `src/components/FrameSection.tsx` — parallax scroll-driven frame player
- `src/components/Navbar.tsx` — sticky minimal nav
- `src/components/LiveCounter.tsx` — SignalR-connected animated counter
- `src/pages/Home.tsx` — landing with all sections
- `src/pages/Checkout.tsx` — Stripe Checkout redirect page
- `src/pages/Success.tsx` — post-payment success page
- `src/services/api.ts` — REST client (fetch wrapper)
- `src/services/signalr.ts` — SignalR connection manager
- `src/hooks/useFramePlayer.ts` — scroll-to-frame logic
- `tailwind.config.js` — custom colors, fonts, animations
- `public/frames/` — placeholder directories with README

**Admin Panel (`frontend/src/admin/`)**
- `src/admin/pages/Login.tsx` — JWT login form
- `src/admin/pages/Dashboard.tsx` — KPI cards + real-time data
- `src/admin/pages/Participants.tsx` — paginated table with search + CSV export
- `src/admin/pages/DrawWinner.tsx` — draw button + winner display + history

**Backend (`backend/GrCup.Api/`)**
- `Program.cs` — full wiring: CORS, EF Core, JWT, SignalR, endpoints
- `Models/Participant.cs` + `Models/Draw.cs` — EF Core entities
- `Data/GrCupDbContext.cs` — DbContext with MySQL config
- `Hubs/ParticipantsHub.cs` — SignalR hub broadcasting count
- `Services/ParticipantService.cs` — business logic
- `Services/JwtService.cs` — token generation
- `Endpoints/tickets.cs` — `POST /api/tickets/buy`
- `Endpoints/participants.cs` — `GET /api/participants/count`, `GET /api/participants`
- `Endpoints/admin.cs` — `POST /api/admin/login`, `POST /api/admin/draw`, `GET /api/admin/draws`
- `docker-compose.yml` — MySQL 8 + API container

**Infrastructure**
- `frontend/package.json`, `vite.config.ts`, `tsconfig.json`
- `backend/GrCup.Api.csproj`, `appsettings.json`
- `docker-compose.yml` at root
- `README.md` per project + root `README.md`

### Definition of Done
- [ ] `cd frontend && npm run dev` serves app on port 5173
- [ ] `cd backend && dotnet run` starts API on port 5000
- [ ] `docker-compose up` starts MySQL + API + Frontend
- [ ] Ticket purchase form submits → Stripe Checkout opens
- [ ] Payment success → participant created → SignalR broadcasts count
- [ ] Admin login works → JWT issued → protected routes accessible
- [ ] Draw winner selects random participant from database
- [ ] All 4 parallax sections scrub frames on scroll

### Must Have
- Fully responsive (mobile-first)
- Stripe Checkout integration (0.50 € per ticket)
- SignalR live counter on hero
- Admin auth with JWT
- MySQL persistence
- Parallax frame sections (placeholder images until real frames added)
- Dark theme with neon accents
- Production build (`npm run build`, `dotnet publish`)

### Must NOT Have
- No database secrets in code (use env vars / docker secrets)
- No Stripe test keys committed to source (use `.env`)
- No `console.log` in production code
- No `Any` or `As` casts without justification
- No AI-slop patterns (excessive comments, over-abstraction, generic names)
- No cross-contamination between frontend and backend folders

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO — neither frontend nor backend has tests
- **Automated tests**: NO — time budget is for features, not tests
- **Agent-Executed QA**: ALWAYS — every task has QA scenarios

### QA Policy
Every task includes agent-executed QA scenarios (no human testing):
- **API tasks**: `curl` commands against localhost:5000
- **Frontend tasks**: Playwright browser automation (navigate, fill, click, assert)
- **Admin tasks**: Playwright with auth flow
- Evidence saved to `.sisyphus/evidence/task-{N}-{scenario}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 — Foundation (7 tasks, ALL INDEPENDENT — scaffold both projects in parallel):
├── T1:  Frontend scaffold — npm create vite@latest (preact-ts), install deps
├── T2:  Frontend Tailwind config — custom colors, fonts, animations, postcss
├── T3:  Frontend routing + layout — wouter, App.tsx, Navbar, global styles
├── T4:  Backend scaffold — dotnet new web, install NuGet packages
├── T5:  Backend Program.cs skeleton — DI, CORS, MySQL, JWT, SignalR wired
├── T6:  Backend models + DbContext — Participant, Draw, GrCupDbContext
└── T7:  Docker Compose — MySQL 8 + API container + env vars

Wave 2 — Backend Core API (7 tasks, MAX PARALLEL after Wave 1):
├── T8:  SignalR Hub — ParticipantsHub broadcast count, client connector
├── T9:  Participant service + endpoints — count, buy, paginated list
├── T10: JWT service + admin login endpoint — token gen, [Authorize]
├── T11: Stripe checkout endpoint — SessionService.Create, redirect URL
├── T12: Admin draw endpoint — random selection, Draw record creation
├── T13: Admin participants endpoint — server-side pagination + filter + CSV
└── T14: Admin draws history endpoint — list past draws

Wave 3 — Frontend Core UI (8 tasks, MAX PARALLEL after Wave 1 completes):
├── T15: Parallax frame player hook — useFramePlayer, IntersectionObserver, RAF
├── T16: FrameSection component — 4 sections, Canvas rendering, parallax layers
├── T17: LiveCounter component — SignalR connection, animated number
├── T18: Hero section — full-screen, headline, subhead, CTA, live counter
├── T19: Ticket purchase form — quantity, name, surname, email, Instagram, checkbox
├── T20: Checkout page — Stripe redirect, loading state, error handling
├── T21: Success page — confirmation, ticket count, share CTA
└── T22: Rules + How-to-Enter + Winners sections — static content

Wave 4 — Admin Panel (6 tasks, MAX PARALLEL after Wave 2 completes):
├── T23: Admin layout + auth context — protected routes, JWT in localStorage
├── T24: Login page — username/password form, error handling
├── T25: Dashboard KPIs — total participants, tickets, revenue (SignalR live)
├── T26: Participants table — pagination, search/filter, columns, row styles
├── T27: CSV export — client-side generation from API data
└── T28: Draw Winner page — draw button, winner display, history table

Wave 5 — Polish + Infrastructure (6 tasks, MAX PARALLEL after Wave 4):
├── T29: Footer + legal section — terms, privacy, contact
├── T30: Smooth scroll animations — fade-in, slide-up on every section
├── T31: Mobile nav — hamburger menu, drawer, touch-friendly
├── T32: Environment config — .env.example, Vite proxy to API, appsettings.json
├── T33: README files — frontend/README.md, backend/README.md, root README.md
└── T34: Production build verification — npm run build, dotnet publish, smoke test

Wave FINAL — 4 parallel reviews:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)  
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Can Start | Blocks | Notes |
|------|----------|--------|-------|
| T1-T3 (FE scaffold/layout) | Immediately | T15-T22 | Wave 1 |
| T4-T7 (BE scaffold/docker) | Immediately | T8-T14 | Wave 1 |
| T8-T14 (BE API) | After T5-T7 | T23-TT28 | Wave 2 |
| T15-T22 (FE core UI) | After T2-T3 | — | Wave 3 |
| T23-T28 (Admin panel) | After T10-T14 | — | Wave 4 |
| T29-T34 (Polish) | After T22+T28 | — | Wave 5 |
| F1-F4 | After T34 | — | FINAL |

**Critical Path**: T1 → T2 → T3 → T15 → T16 → T22 → T29 → T30 → T31 → T34 → F1-F4
**Max Concurrent**: 7 tasks (Wave 1 & 3)
**Parallel Speedup**: ~65% faster than sequential

---

## TODOs

---

### Wave 5 — Polish + Infrastructure (6 tasks, MAX PARALLEL after Wave 4)

- [ ] 29. **Footer + legal section — terms, privacy, contact**

  **What to do**:
  - Create `src/components/Footer.tsx` (replace stub from T3):
    - Logo: "GR CUP" + "GR Strength"
    - Links: Rules, How to Enter, FAQ, Contact
    - Social: Instagram icon link to @grstrength
    - Copyright: "© 2026 GR Strength. All rights reserved."
    - Legal links: Privacy Policy, Terms & Conditions
    - Dark bg (`bg-dark-base`), subtle top border
    - Mobile: stacked layout, links in columns
  - Create `src/pages/Legal.tsx` (Privacy Policy + Terms):
    - Simple text page with legal copy
    - " Raffle organized by GR Strength. 0.50 € per ticket. Winner drawn randomly."
    - GDPR note: "We collect your email and Instagram handle solely for the raffle."
    - Contact: admin@grstrength.com

  **Must NOT do**:
  - Do NOT create real legal documents — use placeholder/generic text
  - Do NOT link to non-existent legal pages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Simple footer and legal page

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 30, 31, 32, 33, 34)
  - **Blocks**: None
  - **Blocked By**: Task 3 (needs Footer stub)

  **References**:
  - ciridae.com footer: minimal, dark, logo + links

  **Acceptance Criteria**:
  - [ ] Footer renders at bottom of all pages
  - [ ] Instagram link points to @grstrength
  - [ ] Legal page accessible at /legal

  **QA Scenarios**:

  \`\`\`
  Scenario: Footer renders on home page
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Open http://localhost:5173/
      2. Scroll to bottom
      3. Assert footer visible with copyright, links, Instagram
    Expected Result: Footer renders correctly
    Failure Indicators: Footer missing, links broken
    Evidence: .sisyphus/evidence/task-29-footer.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Footer screenshot

  **Commit**: YES
  - Message: `feat(frontend): add footer with legal links and social icons`
  - Files: `frontend/src/components/Footer.tsx`, `frontend/src/pages/Legal.tsx`
  - Pre-commit: none

  ---

- [ ] 30. **Smooth scroll animations — fade-in, slide-up on every section**

  **What to do**:
  - Create `src/components/RevealOnScroll.tsx`:
    - Uses `IntersectionObserver` (from T15's hook or standalone)
    - Wraps children with animation classes
    - Options: `direction` ("up" | "left" | "scale"), `delay` (0-400ms), `threshold`
    - CSS animations (added to `src/index.css`):
      ```css
      .reveal-up { opacity: 0; transform: translateY(30px); transition: opacity 0.6s ease, transform 0.6s ease; }
      .reveal-up.visible { opacity: 1; transform: translateY(0); }
      .reveal-scale { opacity: 0; transform: scale(0.95); transition: opacity 0.5s ease, transform 0.5s ease; }
      .reveal-scale.visible { opacity: 1; transform: scale(1); }
      ```
  - Wrap all section content with `<RevealOnScroll>`:
    - Hero: title, subtitle, CTA (staggered delays 0, 100, 200ms)
    - Rules: each rule item
    - How-to-Enter: step cards
    - Winners: winner cards
    - Footer: links groups
  - Apply `prefers-reduced-motion` check — skip animations if enabled

  **Must NOT do**:
  - Do NOT animate every single element — stagger groups, not individual words
  - Do NOT use `transition: all` — only opacity and transform
  - Do NOT skip `will-change` hints on frequently animated elements

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - CSS animations, Intersection Observer, staggered reveals

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 29, 31, 32, 33, 34)
  - **Blocks**: None
  - **Blocked By**: Tasks 18, 22 (needs content to wrap)

  **References**:
  - Research: `IntersectionObserver` with threshold, RAF-throttled scroll
  - Research: CSS `reveal` classes pattern
  - ciridae.com: fade-in, slide-up effects on content

  **Acceptance Criteria**:
  - [ ] All sections animate on scroll (elements fade/slide in)
  - [ ] Animations trigger when element enters viewport
  - [ ] Reduced motion preference disables all animations
  - [ ] Staggered delays create visual rhythm

  **QA Scenarios**:

  \`\`\`
  Scenario: Sections animate on scroll
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Open http://localhost:5173/
      2. Scroll down slowly
      3. Observe each section's content animating in
    Expected Result: Fade-in/slide-up animations trigger correctly
    Failure Indicators: No animations, all visible immediately, janky
    Evidence: .sisyphus/evidence/task-30-scroll-animations.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Screenshot of animated content

  **Commit**: YES
  - Message: `feat(frontend): add scroll-triggered reveal animations to all sections`
  - Files: `frontend/src/components/RevealOnScroll.tsx`, `frontend/src/index.css`
  - Pre-commit: none

  ---

- [ ] 31. **Mobile nav — hamburger menu, drawer, touch-friendly**

  **What to do**:
  - Enhance `src/components/Navbar.tsx` (from T3):
    - Mobile menu: `position: fixed`, full-screen overlay, z-50
    - Animation: slide down from top (translateY -100% → 0)
    - Menu items: stacked vertically, large tap targets (min 48px height)
    - "×" close button top-right
    - Backdrop: semi-transparent dark overlay
    - On link click: close menu + scroll to section
    - Touch-friendly: no hover-dependent interactions
    - Smooth scroll: `scroll-behavior: smooth` on html
  - Ensure navbar `height: 64px` (4rem) — this is the `scroll-margin-top` value

  **Must NOT do**:
  - Do NOT use hover-dependent menus — must work on tap
  - Do NOT trap focus outside menu — close on backdrop click
  - Do NOT use `position: absolute` for mobile menu — must cover all content

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Mobile-first, touch interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 29, 30, 32, 33, 34)
  - **Blocks**: None
  - **Blocked By**: Task 3 (needs Navbar base)

  **References**:
  - Mobile menu pattern: fixed overlay, slide animation, large tap targets
  - Tailwind: `fixed inset-0 z-50`, `transform transition`

  **Acceptance Criteria**:
  - [ ] Mobile menu opens/closes correctly
  - [ ] All links work in mobile menu
  - [ ] Tap targets ≥ 48px
  - [ ] No horizontal scroll on mobile

  **QA Scenarios**:

  \`\`\`
  Scenario: Mobile hamburger menu
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set viewport to 375x667 (mobile)
      2. Open http://localhost:5173/
      3. Tap hamburger → menu slides in
      4. Tap a link → menu closes, page scrolls
      5. Tap × → menu closes
    Expected Result: Full mobile menu flow works
    Failure Indicators: Menu doesn't open, links don't work, touch issues
    Evidence: .sisyphus/evidence/task-31-mobile-nav.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Mobile menu screenshot

  **Commit**: YES
  - Message: `feat(frontend): enhance mobile navigation with full-screen drawer`
  - Files: `frontend/src/components/Navbar.tsx`
  - Pre-commit: none

  ---

- [ ] 32. **Environment config — .env.example, Vite proxy to API, appsettings.json**

  **What to do**:
  - Create `frontend/.env.example`:
    ```
    VITE_API_URL=http://localhost:5000
    VITE_SIGNALR_URL=http://localhost:5000/hubs/participants
    VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
    ```
  - Update `frontend/vite.config.ts` to add proxy:
    ```typescript
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        '/hubs': {
          target: 'http://localhost:5000',
          ws: true,  // WebSocket for SignalR
          changeOrigin: true,
        },
      },
    },
    ```
  - Update `frontend/.gitignore` to include `.env.local`, `.env.*.local`
  - Create `backend/GrCup.Api/appsettings.Development.json`:
    ```json
    {
      "ConnectionStrings": {
        "Default": "Server=localhost;Port=3306;Database=grcup;User=grcup_user;Password=grcup_password;"
      },
      "Jwt": { "Issuer": "GrCupApi", "Audience": "GrCupClient" },
      "Stripe": {
        "SuccessUrl": "/success",
        "CancelUrl": "/checkout?canceled=true"
      }
    }
    ```
  - Update `backend/.gitignore` to include `appsettings.*.local.json`
  - Stripe webhook local testing: use `stripe listen --forward-to localhost:5000/api/webhooks/stripe`

  **Must NOT do**:
  - Do NOT commit real API keys or secrets
  - Do NOT use `http://` for Stripe in production — use `https://`
  - Do NOT proxy to wrong port in production config

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Env var setup, proxy configuration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 29, 30, 31, 33, 34)
  - **Blocks**: All tasks that need env vars
  - **Blocked By**: Tasks 1, 4 (needs scaffold)

  **References**:
  - Vite proxy: `https://vitejs.dev/config/server-options.html`
  - Research: Vite env vars require `VITE_` prefix

  **Acceptance Criteria**:
  - [ ] `.env.example` has all required variables
  - [ ] Vite proxy correctly routes `/api` and `/hubs` to backend
  - [ ] `.gitignore` excludes sensitive files
  - [ ] `appsettings.Development.json` has correct structure

  **QA Scenarios**:

  \`\`\`
  Scenario: Vite proxy routes API calls correctly
    Tool: Playwright
    Preconditions: API running on 5000, frontend on 5173
    Steps:
      1. Open http://localhost:5173/
      2. Fetch http://localhost:5173/api/participants/count
      3. Assert response from backend (proxy working)
    Expected Result: API calls proxied through Vite to backend
    Failure Indicators: CORS error, 404, proxy not working
    Evidence: .sisyphus/evidence/task-32-proxy.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Proxy test output

  **Commit**: YES
  - Message: `feat(infrastructure): configure environment variables and Vite proxy`
  - Files: `frontend/.env.example`, `frontend/vite.config.ts`, `backend/GrCup.Api/appsettings.Development.json`, `.gitignore` files
  - Pre-commit: none

  ---

- [ ] 33. **README files — frontend/README.md, backend/README.md, root README.md**

  **What to do**:
  - Create `frontend/README.md`:
    - Prerequisites: Node.js 20+, npm
    - Setup: `npm install`, copy `.env.example` → `.env.local`, add Stripe key
    - Dev: `npm run dev` (runs on port 5173)
    - Build: `npm run build` → `dist/` folder
    - Deploy: Static hosting (Vercel, Netlify, Cloudflare Pages)
    - Env vars table
    - API proxy docs
  - Create `backend/README.md`:
    - Prerequisites: .NET 8 SDK, Docker (for MySQL)
    - Setup: `dotnet restore`, Docker: `docker-compose up mysql`, migrations: `dotnet ef database update`
    - Dev: `dotnet run --urls "http://0.0.0.0:5000"`
    - Stripe webhook: `stripe listen --forward-to localhost:5000/api/webhooks/stripe`
    - Env vars: `STRIPE_SECRET_KEY`, `JWT_SECRET_KEY`
    - Admin credentials: `admin` / `strongpassword`
    - Migrations: `dotnet ef migrations add`, `dotnet ef database update`
  - Create root `README.md`:
    - Project overview: GR Cup description
    - Architecture: frontend (Preact) + backend (ASP.NET Core) + MySQL
    - Quick start: "Run `docker-compose up` from root"
    - Tech stack summary
    - Folder structure
    - Contributing guidelines

  **Must NOT do**:
  - Do NOT include secrets in README
  - Do NOT skip Docker instructions
  - Do NOT write overly long documentation

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []
  - Technical writing, documentation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 29, 30, 31, 32, 34)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - README best practices: clear sections, code blocks, prerequisites listed

  **Acceptance Criteria**:
  - [ ] All 3 README files exist with proper content
  - [ ] Quick start works from root `README.md`
  - [ ] No secrets in any README

  **QA Scenarios**:

  \`\`\`
  Scenario: README files exist and are complete
    Tool: Bash
    Preconditions: All files created
    Steps:
      1. ls -la README.md && wc -l README.md
      2. ls -la frontend/README.md
      3. ls -la backend/GrCup.Api/README.md
    Expected Result: All 3 README files exist with substantial content
    Failure Indicators: Missing files, empty files
    Evidence: .sisyphus/evidence/task-33-readme.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] README file listings

  **Commit**: YES
  - Message: `docs: add README files for frontend, backend, and project root`
  - Files: `README.md`, `frontend/README.md`, `backend/GrCup.Api/README.md`
  - Pre-commit: none

  ---

- [ ] 34. **Production build verification — npm run build, dotnet publish, smoke test**

  **What to do**:
  - Frontend production build:
    - `cd frontend && npm run build`
    - Verify `dist/` folder created
    - Verify `dist/index.html` exists
    - Run `cd dist && npx serve -s .` and smoke test key pages
  - Backend production build:
    - `cd backend/GrCup.Api && dotnet publish -c Release`
    - Verify `bin/Release/net8.0/publish/` output
    - Verify `.dll` files present
  - Smoke test production builds:
    - Serve frontend static files
    - Run backend API
    - Test: `curl http://localhost:5173/` → HTML
    - Test: `curl http://localhost:5000/api/participants/count` → JSON
    - Test: Stripe session creation works end-to-end
  - Docker build test:
    - `docker build -t grcup-frontend ./frontend`
    - `docker build -t grcup-api ./backend/GrCup.Api`
    - Both should build without errors

  **Must NOT do**:
  - Do NOT skip the smoke test — production build might have different behavior
  - Do NOT commit dist/ or bin/ folders

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Build verification, smoke testing, Docker

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 29, 30, 31, 32, 33)
  - **Blocks**: Wave FINAL
  - **Blocked By**: Tasks 1, 4, 9, 11 (needs code to build)

  **References**:
  - Vite build: `npm run build` outputs to `dist/`
  - .NET publish: `dotnet publish -c Release` outputs to `bin/Release/net8.0/publish/`
  - Docker build: `docker build` with multi-stage Dockerfile

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds with no errors
  - [ ] `dotnet publish` succeeds with no errors
  - [ ] Docker images build successfully
  - [ ] Production serve works: frontend + backend both respond
  - [ ] Smoke tests pass: key API endpoints return correct responses

  **QA Scenarios**:

  \`\`\`
  Scenario: Frontend production build
    Tool: Bash
    Preconditions: All frontend tasks complete
    Steps:
      1. cd frontend && npm run build 2>&1 | tail -20
      2. ls dist/ | head -10
    Expected Result: Build succeeds, dist/ has files
    Failure Indicators: Build errors, missing dist/
    Evidence: .sisyphus/evidence/task-34-frontend-build.log

  Scenario: Backend production publish
    Tool: Bash
    Preconditions: All backend tasks complete
    Steps:
      1. cd backend/GrCup.Api && dotnet publish -c Release 2>&1 | tail -20
      2. ls bin/Release/net8.0/publish/*.dll | head -5
    Expected Result: Publish succeeds, DLLs present
    Failure Indicators: Build errors, missing DLLs
    Evidence: .sisyphus/evidence/task-34-backend-publish.log

  Scenario: End-to-end smoke test
    Tool: Bash + Playwright
    Preconditions: Production builds ready
    Steps:
      1. Serve frontend: npx serve frontend/dist -p 5173 &
      2. Run backend: dotnet run --project backend/GrCup.Api &
      3. curl http://localhost:5173/ → HTML
      4. curl http://localhost:5000/api/participants/count → JSON
      5. POST ticket purchase → Stripe session URL returned
    Expected Result: All smoke tests pass
    Failure Indicators: 500 errors, wrong responses
    Evidence: .sisyphus/evidence/task-34-e2e-smoke.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Frontend build output
  - [ ] Backend publish output
  - [ ] Smoke test results

  **Commit**: YES
  - Message: `chore(production): verify builds and run smoke tests`
  - Files: (no new files — verification only)
  - Pre-commit: none



- [ ] 23. **Admin layout + auth context — protected routes, JWT in localStorage**

  **What to do**:
  - Create `src/admin/context/AuthContext.tsx`:
    - `authToken` signal (string | null)
    - `login(username, password)` — calls `api.login()`, stores token in `localStorage`
    - `logout()` — removes token, redirects to `/admin/login`
    - `isAuthenticated` — computed from token existence
    - Provide via `AuthContext.Provider`
  - Create `src/admin/components/ProtectedRoute.tsx`:
    - Checks `isAuthenticated` — if false, redirect to `/admin/login`
    - If authenticated, render children
    - Wrap all `/admin/*` routes with this component
  - Create `src/admin/layouts/AdminLayout.tsx`:
    - Sidebar nav: Dashboard, Participants, Draw Winner
    - Top bar: "GR CUP Admin", logout button
    - Main content area
    - Dark theme (dark-bg, subtle card surfaces)
  - Update `src/app.tsx` routing:
    - `/admin/login` → Login page (no auth required)
    - `/admin/*` → all wrapped in `ProtectedRoute`

  **Must NOT do**:
  - Do NOT store token in plain localStorage without considering XSS — acceptable for demo
  - Do NOT expose token in URL query params
  - Do NOT create separate admin entry point — single SPA with admin routes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Auth context, protected routing, admin layout

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 24, 25, 26, 27, 28)
  - **Blocks**: Tasks 24, 25, 26, 27, 28
  - **Blocked By**: Task 10 (needs JWT auth on backend)

  **References**:
  - `wouter` routing: `<Route>` with component + layout pattern
  - Preact signals for auth state
  - localStorage for token persistence

  **Acceptance Criteria**:
  - [ ] `/admin/login` accessible without auth
  - [ ] `/admin/dashboard` redirects to login when not authenticated
  - [ ] JWT token stored in localStorage after login
  - [ ] Logout clears token and redirects

  **QA Scenarios**:

  \`\`\`
  Scenario: Protected route redirects to login
    Tool: Playwright
    Preconditions: Dev server running, no auth token
    Steps:
      1. Navigate directly to http://localhost:5173/admin/dashboard
      2. Assert redirect to /admin/login
      3. Assert URL changed to /admin/login
    Expected Result: Redirect to login page
    Failure Indicators: Admin page loads without auth, blank page
    Evidence: .sisyphus/evidence/task-23-protected-route.log

  Scenario: Auth flow works end-to-end
    Tool: Playwright
    Preconditions: Dev server + API running
    Steps:
      1. Navigate to /admin/login
      2. Fill: username=admin, password=strongpassword
      3. Submit → expect redirect to /admin/dashboard
      4. Refresh page → expect still on dashboard (token persisted)
    Expected Result: Login → dashboard → persist on refresh
    Failure Indicators: Login fails, redirect wrong, token not persisting
    Evidence: .sisyphus/evidence/task-23-auth-flow.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Auth flow screenshots
  - [ ] localStorage verification

  **Commit**: YES
  - Message: `feat(frontend): add admin auth context and protected route system`
  - Files: `frontend/src/admin/context/AuthContext.tsx`, `frontend/src/admin/components/ProtectedRoute.tsx`, `frontend/src/admin/layouts/AdminLayout.tsx`
  - Pre-commit: none

  ---

- [ ] 24. **Login page — username/password form, error handling**

  **What to do**:
  - Create `src/admin/pages/Login.tsx`:
    - GR Cup logo/branding at top
    - "Admin Login" heading
    - Username field (text input)
    - Password field (password input with show/hide toggle)
    - "Sign In" button — full-width, pill, neon-blue
    - Error state: red banner "Invalid credentials" if login fails
    - Loading state: spinner in button, inputs disabled
    - Demo hint: "Demo: admin / strongpassword"
    - Form validation: both fields required

  **Must NOT do**:
  - Do NOT hardcode credentials — must call backend API
  - Do NOT show password in plain text by default

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Simple form with state management

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 25, 26, 27, 28)
  - **Blocks**: None (uses AuthContext from T23)
  - **Blocked By**: Task 23 (needs AuthContext)

  **References**:
  - Tailwind form styling with dark theme
  - Error banner pattern

  **Acceptance Criteria**:
  - [ ] Login page renders with all fields
  - [ ] Wrong credentials show error message
  - [ ] Correct credentials redirect to dashboard
  - [ ] Loading state disables form during API call

  **QA Scenarios**:

  \`\`\`
  Scenario: Login form validation and submission
    Tool: Playwright
    Preconditions: Dev server + API running
    Steps:
      1. Navigate to /admin/login
      2. Submit empty form → expect validation error
      3. Fill wrong credentials → expect error banner
      4. Fill correct credentials → expect redirect to dashboard
    Expected Result: All states work correctly
    Failure Indicators: No validation, wrong redirect, no error feedback
    Evidence: .sisyphus/evidence/task-24-login.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Login page screenshot
  - [ ] Error state screenshot

  **Commit**: YES
  - Message: `feat(frontend): add admin login page with form validation`
  - Files: `frontend/src/admin/pages/Login.tsx`
  - Pre-commit: none

  ---

- [ ] 25. **Dashboard KPIs — total participants, tickets, revenue (SignalR live)**

  **What to do**:
  - Create `src/admin/pages/Dashboard.tsx`:
    - 3 KPI cards in a row (grid-cols-1 md:grid-cols-3):
      1. "Total Participants" — number with animated count-up, person icon
      2. "Total Tickets Sold" — number, ticket icon
      3. "Total Revenue" — "€X.XX" format, euro icon
    - Each card: dark surface bg, neon accent on number, subtle hover lift
    - Refresh from `GET /api/admin/stats` on mount
    - Also listen to SignalR for live updates:
      - `ParticipantCountUpdated` event → animate count up
      - Revenue recalculates
  - KPI number animation: count from 0 to value over 600ms on page load
  - Date range selector (optional): "Last 7 days", "Last 30 days", "All time"

  **Must NOT do**:
  - Do NOT load all participants for KPI calculation — use API aggregation
  - Do NOT show stale data — refresh on mount and on SignalR event

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Dashboard cards, live data, animated numbers

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 26, 27, 28)
  - **Blocks**: None (dashboard page)
  - **Blocked By**: Task 14 (needs stats endpoint)

  **References**:
  - Dashboard card patterns: icon + large number + label
  - Tailwind grid: `grid grid-cols-1 md:grid-cols-3 gap-6`
  - SignalR live updates from Task 17

  **Acceptance Criteria**:
  - [ ] 3 KPI cards render with correct data from API
  - [ ] Numbers animate from 0 on page load
  - [ ] Cards update when SignalR pushes new count
  - [ ] Cards have hover lift effect

  **QA Scenarios**:

  \`\`\`
  Scenario: Dashboard KPIs load and show data
    Tool: Playwright
    Preconditions: Dev server + API running, admin logged in
    Steps:
      1. Navigate to /admin/dashboard
      2. Assert 3 KPI cards visible
      3. Assert each card has a number (not "—")
      4. Wait 2s → numbers should animate from 0
    Expected Result: KPIs load, animate, show real data
    Failure Indicators: Blank cards, no animation, wrong numbers
    Evidence: .sisyphus/evidence/task-25-dashboard.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Dashboard KPI screenshot

  **Commit**: YES
  - Message: `feat(frontend): add admin dashboard with live KPI cards`
  - Files: `frontend/src/admin/pages/Dashboard.tsx`
  - Pre-commit: none

  ---

- [ ] 26. **Participants table — pagination, search/filter, columns, row styles**

  **What to do**:
  - Create `src/admin/pages/Participants.tsx`:
    - Table layout (Material-like with Tailwind):
      - Columns: Name, Surname, Email, Instagram @, Tickets, Total Paid, Joined
      - Header: dark bg, uppercase labels, sortable columns (click to sort)
      - Rows: alternating subtle bg, hover highlight
      - Responsive: horizontal scroll on mobile, columns compress
    - Search bar above table:
      - Text input: "Search by name, email or Instagram..."
      - Debounced 300ms — calls API on change
      - Clear button (×) when text present
    - Pagination below table:
      - "Showing X–Y of Z participants"
      - Previous / Next buttons (disabled at bounds)
      - Page number display: "Page 1 of 10"
      - Items per page: 10 (default), 25, 50 options
    - Empty state: "No participants found" with icon
    - Loading state: skeleton rows (pulse animation)
    - Fetch from `GET /api/admin/participants?page=X&pageSize=Y&search=Z`

  **Must NOT do**:
  - Do NOT render all participants client-side — must use server-side pagination
  - Do NOT use `debounce` incorrectly — 300ms is standard, not 2s

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Table UI, server-side pagination, search UX

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 25, 27, 28)
  - **Blocks**: None
  - **Blocked By**: Task 13 (needs pagination endpoint)

  **References**:
  - Tailwind table styling: `table-auto`, `thead`, `tbody`, `tr`, `td`
  - Server-side pagination UX patterns
  - Debounce with `setTimeout` pattern

  **Acceptance Criteria**:
  - [ ] Table renders with all columns
  - [ ] Pagination controls work (prev/next, page numbers)
  - [ ] Search filters results from API
  - [ ] Loading skeleton shows during fetch
  - [ ] Empty state shows when no results

  **QA Scenarios**:

  \`\`\`
  Scenario: Participants table with pagination and search
    Tool: Playwright
    Preconditions: Dev server + API running, admin logged in
    Steps:
      1. Navigate to /admin/participants
      2. Assert table with 10 rows visible
      3. Type "john" in search → expect filtered results within 500ms
      4. Click "Next" → expect page 2
      5. Change items per page to 25 → expect 25 rows
    Expected Result: Pagination and search work correctly
    Failure Indicators: Table empty, search not filtering, pagination broken
    Evidence: .sisyphus/evidence/task-26-participants.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Table screenshot with data
  - [ ] Search result screenshot

  **Commit**: YES
  - Message: `feat(frontend): add admin participants table with pagination and search`
  - Files: `frontend/src/admin/pages/Participants.tsx`
  - Pre-commit: none

  ---

- [ ] 27. **CSV export — client-side generation from API data**

  **What to do**:
  - Create `src/admin/components/ExportButton.tsx`:
    - Button: "Export CSV" with download icon
    - On click: fetch all participants (paginate through all pages)
    - Generate CSV client-side:
      ```typescript
      function generateCsv(participants: Participant[]): string {
        const headers = ['First Name', 'Surname', 'Email', 'Instagram', 'Tickets', 'Total Paid', 'Joined'];
        const rows = participants.map(p => [
          p.firstName, p.surname, p.email, p.instagram,
          p.ticketCount, p.totalPaid.toFixed(2),
          new Date(p.createdAt).toLocaleDateString()
        ]);
        return [headers, ...rows].map(r => r.join(',')).join('\n');
      }
      ```
    - Download: create `Blob` → `URL.createObjectURL` → click `<a>` → `URL.revokeObjectURL`
    - Filename: `grcup-participants-{YYYY-MM-DD}.csv`
    - Loading state while fetching: "Exporting..." with spinner

  **Must NOT do**:
  - Do NOT call the CSV endpoint (Task 13) for simplicity — fetch client-side
  - Do NOT use `innerHTML` for CSV generation
  - Do NOT skip encoding/escaping of CSV values

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Blob download, CSV generation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 25, 26, 28)
  - **Blocks**: None
  - **Blocked By**: Task 26 (participants table)

  **References**:
  - Research: CSV with quoted fields for comma/quote escaping
  - Blob download pattern: `URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))`

  **Acceptance Criteria**:
  - [ ] Export button visible in Participants page
  - [ ] Clicking downloads CSV file with correct filename
  - [ ] CSV has all participant data rows
  - [ ] Loading state shows during export

  **QA Scenarios**:

  \`\`\`
  Scenario: CSV export downloads correct file
    Tool: Playwright
    Preconditions: Dev server + API running, admin logged in
    Steps:
      1. Navigate to /admin/participants
      2. Click "Export CSV" button
      3. Wait for download
      4. Open downloaded file → assert has headers + data rows
    Expected Result: Valid CSV file downloaded
    Failure Indicators: Empty file, wrong format, download not triggered
    Evidence: .sisyphus/evidence/task-27-csv-export.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] CSV file contents
  - [ ] Download confirmation

  **Commit**: YES
  - Message: `feat(frontend): add CSV export functionality for participants`
  - Files: `frontend/src/admin/components/ExportButton.tsx`
  - Pre-commit: none

  ---

- [ ] 28. **Draw Winner page — draw button, winner display, history table**

  **What to do**:
  - Create `src/admin/pages/DrawWinner.tsx`:
    - Two-column layout:
      - Left: Draw controls
        - "Draw Winner" — large button, neon-orange, pill shape
        - Confirmation modal: "Are you sure? This will randomly select a winner."
        - Winner display (after draw): large card with:
          - Winner name + surname
          - Instagram @ (link to profile)
          - Email (partially masked: `j***@test.com`)
          - Ticket count
          - "Mark as Winner" button — marks in database
          - "Re-draw" button — picks another winner
      - Right: Draw history table
        - Columns: Date, Winner Name, Instagram, Confirmed
        - "Confirmed" column: checkmark or "—" 
        - Sort by date descending
        - Pagination (10 per page)
    - Fetch winner from `POST /api/admin/draw`
    - Fetch history from `GET /api/admin/draws`
    - Mark confirmed: `PATCH /api/admin/draws/{id}/confirm`
  - Celebration animation on winner reveal (confetti or glow effect)

  **Must NOT do**:
  - Do NOT show full email — mask for privacy
  - Do NOT auto-draw without confirmation
  - Do NOT allow draw with 0 participants — show error

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Draw UI, celebration animation, admin data display

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 25, 26, 27)
  - **Blocks**: None
  - **Blocked By**: Task 12 (needs draw endpoint)

  **References**:
  - Draw winner UX patterns from research
  - Confirmation modal before destructive action
  - Email masking pattern

  **Acceptance Criteria**:
  - [ ] "Draw Winner" button triggers confirmation modal
  - [ ] Draw selects random participant from DB
  - [ ] Winner card shows all info (name, IG, masked email, tickets)
  - [ ] History table shows past draws
  - [ ] "Re-draw" works without page refresh

  **QA Scenarios**:

  \`\`\`
  Scenario: Draw winner flow end-to-end
    Tool: Playwright
    Preconditions: Dev server + API running, admin logged in, participants exist
    Steps:
      1. Navigate to /admin/draw
      2. Click "Draw Winner" → modal appears
      3. Confirm → expect loading state
      4. Winner card appears with name, IG, email, tickets
      5. Click "Re-draw" → new winner shown
      6. Click "Mark as Winner" → confirmed checkmark appears
    Expected Result: Full draw flow works
    Failure Indicators: Draw fails, winner not shown, history not updated
    Evidence: .sisyphus/evidence/task-28-draw-winner.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Winner card screenshot
  - [ ] History table screenshot

  **Commit**: YES
  - Message: `feat(frontend): add admin draw winner page with history table`
  - Files: `frontend/src/admin/pages/DrawWinner.tsx`
  - Pre-commit: none



- [ ] 15. **Parallax frame player hook — useFramePlayer, IntersectionObserver, RAF**

  **What to do**:
  - Create `src/hooks/useFramePlayer.ts`:
    - Input: `sectionRef`, `totalFrames`, `frameUrls: string[]`, `scrollRatio: number`
    - Algorithm: `frameIndex = Math.floor(scrollProgress * (totalFrames - 1))`
    - Uses `requestAnimationFrame` to batch scroll → frame calculations
    - Uses `IntersectionObserver` for section activation/deactivation
    - Returns `{ currentFrame, isActive, progress }`
  - Create `src/hooks/useFramePreloader.ts`:
    - Priority queue: load current ± 5 frames immediately, rest lazily
    - Max 30 frames cached per section (LRU eviction)
    - Uses `createImageBitmap(img)` for efficient GPU-ready bitmaps
    - Uses `img.decode()` for non-blocking decode
  - Create `src/hooks/useScrollProgress.ts`:
    - Given a section ref, compute `progress = -rect.top / (rect.height - window.innerHeight)`
    - RAF-throttled scroll listener
  - Create `src/hooks/useReducedMotion.ts`:
    - Check `window.matchMedia('(prefers-reduced-motion: reduce)')`
    - Return `boolean` — if true, skip animations

  **Must NOT do**:
  - Do NOT update Preact state inside RAF — use `useRef` for frame index
  - Do NOT load all 180 frames into memory — LRU eviction mandatory
  - Do NOT use `debounce` on scroll — it introduces lag, use RAF

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Complex animation, performance optimization, Preact hooks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 16, 17, 18, 19, 20, 21, 22)
  - **Blocks**: Task 16 (FrameSection uses this hook)
  - **Blocked By**: Tasks 2, 3 (needs Tailwind config and routing)

  **References**:
  - Research: Canvas `drawImage()`, RAF-gated scroll, `IntersectionObserver` thresholds
  - Research: ImageBitmap + `createImageBitmap`, LRU cache per section
  - Research: `prefers-reduced-motion` detection
  - Research: RAF pattern — update Ref not state, setState only on frame change

  **Acceptance Criteria**:
  - [ ] `useFramePlayer` hook returns correct frame index as scroll progresses
  - [ ] Preloader loads frames near current position first
  - [ ] LRU eviction prevents memory bloat
  - [ ] Hook respects reduced motion preference

  **QA Scenarios**:

  \`\`\`
  Scenario: Frame index maps correctly to scroll progress
    Tool: Bash (Preact test harness or Playwright)
    Preconditions: Section with 60 frames, scrollRatio 2
    Steps:
      1. Render section at scrollY=0 → expect frame 0
      2. Scroll to middle (50% of section) → expect frame 29 or 30
      3. Scroll to bottom → expect frame 59
    Expected Result: Frame index = floor(progress * 59)
    Failure Indicators: Frame jumping, wrong index calculation
    Evidence: .sisyphus/evidence/task-15-frame-calc.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Console log of frame indices during scroll

  **Commit**: YES
  - Message: `feat(frontend): add scroll-driven frame player hooks with RAF and preloading`
  - Files: `frontend/src/hooks/useFramePlayer.ts`, `frontend/src/hooks/useFramePreloader.ts`, `frontend/src/hooks/useScrollProgress.ts`, `frontend/src/hooks/useReducedMotion.ts`
  - Pre-commit: none

  ---

- [ ] 16. **FrameSection component — 4 sections, Canvas rendering, parallax layers**

  **What to do**:
  - Create `src/components/FrameSection.tsx`:
    ```tsx
    interface Props {
      id: string;
      frames: string[]; // Array of 30-60 frame URLs
      scrollRatio?: number; // Default 2 (2× viewport height)
      children?: preact.ComponentChildren; // Parallax overlay content
    }
    ```
  - Structure:
    ```html
    <section id={id} style={{ height: scrollRatio * 100 + 'vh' }}>
      <div class="sticky top-0 h-screen overflow-hidden">
        <canvas ref={canvasRef} class="w-full h-full object-cover" />
        <div class="parallax-layer absolute inset-0 z-10">
          {children}  <!-- Title, CTA, overlays -->
        </div>
        <div class="parallax-layer absolute inset-0 z-5 opacity-30">
          <!-- Background atmospheric blur elements -->
        </div>
      </div>
    </section>
    ```
  - Canvas rendering:
    - Set `canvas.width = rect.width * devicePixelRatio`
    - Set `canvas.height = rect.height * devicePixelRatio`
    - `ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)`
    - Handle resize: reinitialize canvas dimensions
  - Create 4 sections in Home page:
    1. `#hero` — 60 frames (`/frames/hero/`), scrollRatio 3
    2. `#rules` — 50 frames (`/frames/rules/`), scrollRatio 2
    3. `#how-to-enter` — 40 frames (`/frames/how-to-enter/`), scrollRatio 2
    4. `#winners` — 30 frames (`/frames/winners/`), scrollRatio 1.5
  - Create `public/frames/hero/README.md`, `public/frames/rules/README.md`, etc. — explain to user to place their JPG frames here

  **Must NOT do**:
  - Do NOT use `<img>` tags for frame display — must use Canvas
  - Do NOT render all 4 sections' frames simultaneously — only active section
  - Do NOT skip `devicePixelRatio` — will be blurry on Retina screens
  - Do NOT hardcode placeholder URLs — generate from `/frames/{section}/XXX.webp`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Canvas rendering, scroll-driven animations, Preact

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 17, 18, 19, 20, 21, 22)
  - **Blocks**: Task 18 (Hero section uses this)
  - **Blocked By**: Task 15 (needs frame player hook)

  **References**:
  - Research: Canvas setup with `devicePixelRatio`, `drawImage()`, RAF loop
  - Research: Sticky container pattern, parallax layers with `will-change: transform`
  - Research: 4 sections × 30-60 frames architecture from research findings
  - `https://github.com/EmamSaimon592/scroll-canvas-animation` — GSAP + Canvas pattern (adapt to Preact)

  **Acceptance Criteria**:
  - [ ] Canvas renders correct frame at each scroll position
  - [ ] Frame transitions are smooth (60fps capable)
  - [ ] Resize handler re-initializes canvas correctly
  - [ ] All 4 sections use same FrameSection component
  - [ ] Placeholder README files exist in public/frames/

  **QA Scenarios**:

  \`\`\`
  Scenario: Canvas renders frames during scroll
    Tool: Playwright
    Preconditions: Dev server running, frames directory has test images
    Steps:
      1. Open http://localhost:5173/
      2. Scroll from top of hero section to bottom
      3. Assert canvas element is visible throughout scroll
      4. Assert canvas renders image content (not blank)
    Expected Result: Canvas shows frames in sync with scroll
    Failure Indicators: Blank canvas, janky scroll, wrong frame
    Evidence: .sisyphus/evidence/task-16-canvas-scroll.screenshots.png

  Scenario: Fallback for missing frames
    Tool: Playwright
    Preconditions: Dev server running, no frames placed yet
    Steps:
      1. Open http://localhost:5173/
      2. Scroll through all 4 sections
      3. Assert no crashes, no blank areas (should show dark gradient fallback)
    Expected Result: Graceful degradation, no JS errors
    Failure Indicators: Console errors, white flash, crashes
    Evidence: .sisyphus/evidence/task-16-fallback.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Screenshots of canvas rendering at different scroll positions

  **Commit**: YES
  - Message: `feat(frontend): add FrameSection parallax component with Canvas rendering`
  - Files: `frontend/src/components/FrameSection.tsx`, `frontend/src/pages/Home.tsx`, `public/frames/hero/README.md`, etc.
  - Pre-commit: none

  ---

- [ ] 17. **LiveCounter component — SignalR connection, animated number**

  **What to do**:
  - Create `src/services/signalr.ts`:
    - `HubConnectionBuilder` with URL `/hubs/participants`
    - Auto-reconnect with exponential backoff (0, 1s, 2s, 4s, 8s, max 30s)
    - Methods: `start()`, `stop()`, `on(event, handler)`, `invoke(method, args)`
  - Create `src/components/LiveCounter.tsx`:
    ```tsx
    // Shows: "247 people have entered" with animated counter
    // Number animates from 0 to target using requestAnimationFrame
    // Subtle glow pulse on the number
    // "people have entered" in muted text below
    ```
  - Number animation:
    - Animate from `currentValue` to `newValue` over 800ms
    - Use easeOutExpo: `t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t)`
    - Glow pulse: `text-shadow` that pulses every 2s
  - Create `src/services/api.ts`:
    - `getParticipantCount(): Promise<number>` — `GET /api/participants/count`
    - `getStats(): Promise<Stats>` — `GET /api/admin/stats`
    - `getParticipants(page, pageSize, search): Promise<PagedResult>`
    - `buyTickets(data): Promise<{ sessionUrl: string }>`
    - `login(username, password): Promise<{ token: string }>`
    - `drawWinner(): Promise<Winner>`
    - Base URL from `import.meta.env.VITE_API_URL ?? ''`

  **Must NOT do**:
  - Do NOT reconnect aggressively — exponential backoff is mandatory
  - Do NOT use `setInterval` for polling — use SignalR push
  - Do NOT display raw number without animation — must count up/down

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - SignalR client, animated counter UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 18, 19, 20, 21, 22)
  - **Blocks**: Task 18 (Hero uses LiveCounter)
  - **Blocked By**: Task 8 (backend hub needs to be running)

  **References**:
  - Research: SignalR client with auto-reconnect, `HubConnectionBuilder`
  - Research: Animated counter with RAF + easeOutExpo
  - Research: SignalR reconnection from research findings (exponential backoff)

  **Acceptance Criteria**:
  - [ ] Counter shows initial count from API on page load
  - [ ] Counter animates when SignalR pushes new count
  - [ ] Glow effect pulses continuously
  - [ ] "people have entered" text visible below number

  **QA Scenarios**:

  \`\`\`
  Scenario: Live counter connects and shows count
    Tool: Playwright
    Preconditions: Dev server + API running
    Steps:
      1. Open http://localhost:5173/
      2. Wait 3s for SignalR connection
      3. Assert counter shows a number (e.g. "0" or real count)
      4. Trigger ticket purchase via API
      5. Assert counter increments (within 5s)
    Expected Result: Counter shows count, increments on purchase
    Failure Indicators: Counter stuck at 0, no connection, no animation
    Evidence: .sisyphus/evidence/task-17-live-counter.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Screenshots of counter at different values
  - [ ] Console logs of SignalR events

  **Commit**: YES
  - Message: `feat(frontend): add SignalR service and animated LiveCounter component`
  - Files: `frontend/src/services/signalr.ts`, `frontend/src/services/api.ts`, `frontend/src/components/LiveCounter.tsx`
  - Pre-commit: none

  ---

- [ ] 18. **Hero section — full-screen, headline, subhead, CTA, live counter**

  **What to do**:
  - Create `src/components/HeroSection.tsx` using `FrameSection`:
    - Frame: hero section with 60 frames, scrollRatio 3
    - Overlay content (z-10):
      - Eyebrow: "GR CUP 2026" — small caps, letter-spacing 0.1em, neon-blue
      - Title: "WIN A POWERLIFTING CHAMPIONSHIP PACKAGE" — massive Bebas Neue, 6rem+, line-height 0.9
      - Subhead: "50 cents per entry. Buy as many as you want." — white text
      - CTA: "ENTER NOW" — pill button, neon-orange bg, black text, hover scale 1.05 + glow
      - Below CTA: LiveCounter component
    - Background parallax layer (z-5): subtle gradient overlay for text legibility
  - CSS animations:
    - Hero title: fade-in + slide-up on load (CSS animation, 0.8s ease-out)
    - CTA: glow pulse animation
    - Eyebrow: fade-in on load (delayed 0.2s)
  - Scroll arrow at bottom: bouncing chevron, click to scroll to next section

  **Must NOT do**:
  - Do NOT put counter inside the canvas — must be HTML overlay
  - Do NOT use pixel font sizes — use `clamp()` for fluid scaling
  - Do NOT skip `will-change: transform` on animated elements

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Bold typography, animated hero, fitness aesthetic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 19, 20, 21, 22)
  - **Blocks**: Task 22 (sections assembly)
  - **Blocked By**: Tasks 16, 17 (needs FrameSection and LiveCounter)

  **References**:
  - ciridae.com: massive display type (--size--100: 6.25rem), pill CTA, fluid type scale
  - Research: Bebas Neue for bold condensed headings
  - Tailwind glow effects: `shadow-neon-blue`, `shadow-neon-orange`

  **Acceptance Criteria**:
  - [ ] Hero takes full viewport height
  - [ ] Title uses bold condensed font at ~6rem
  - [ ] CTA button has pill shape, neon-orange, hover glow
  - [ ] LiveCounter visible below CTA
  - [ ] Scroll arrow bounces and scrolls to next section

  **QA Scenarios**:

  \`\`\`
  Scenario: Hero section renders with all elements
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Open http://localhost:5173/ (scroll to top)
      2. Assert hero section is full-viewport
      3. Assert title is visible: "WIN A POWERLIFTING CHAMPIONSHIP"
      4. Assert CTA button: "ENTER NOW" is visible and clickable
      5. Assert LiveCounter is visible below CTA
      6. Assert scroll arrow at bottom
    Expected Result: All elements visible, no overflow issues
    Failure Indicators: Text overflow, CTA not clickable, counter missing
    Evidence: .sisyphus/evidence/task-18-hero.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Hero screenshot showing all elements
  - [ ] Mobile hero screenshot

  **Commit**: YES
  - Message: `feat(frontend): build hero section with FrameSection, LiveCounter, and bold typography`
  - Files: `frontend/src/components/HeroSection.tsx`
  - Pre-commit: none

  ---

- [ ] 19. **Ticket purchase form — quantity, name, surname, email, Instagram, checkbox**

  **What to do**:
  - Create `src/components/TicketForm.tsx`:
    ```tsx
    // State: quantity (1-100), firstName, surname, email, instagram, confirmInstagram
    // Validation:
    //   - All fields required
    //   - Email: valid format
    //   - Instagram: must start with @ (add @ prefix if missing)
    //   - confirmInstagram: checkbox must be checked
    // Submit → POST /api/tickets/buy → redirect to Stripe sessionUrl
    ```
  - UI Layout:
    - Quantity selector: `-` / `+` buttons with number display, min=1, max=100
    - Price display: "€{quantity * 0.50}" updates live
    - 2-column grid: First Name + Surname
    - Full-width: Email, Instagram @username
    - Checkbox: "I confirm I follow @grstrength on Instagram"
    - Pay Now button: pill shape, neon-blue, full-width, disabled until valid
    - Loading state: spinner inside button, "Processing..."
    - Error state: red border + error message below field
  - Instagram field: prepend `@` if user doesn't type it
  - On submit: call `api.buyTickets(formData)` → redirect to `sessionUrl`
  - Use `@preact/signals` for form state if not already using signals

  **Must NOT do**:
  - Do NOT submit to Stripe directly — go through backend
  - Do NOT allow submission without Instagram follow confirmation
  - Do NOT skip client-side validation — must validate before API call
  - Do NOT use `required` HTML attribute alone — must have custom validation UX

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Form validation, Stripe integration UX, Preact state management

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 18, 20, 21, 22)
  - **Blocks**: Task 22 (form goes in How-to-Enter section)
  - **Blocked By**: Task 9 (needs API endpoint)

  **References**:
  - Stripe Checkout: redirect pattern, backend creates session, frontend redirects
  - Form validation: email regex, Instagram @ validation
  - Tailwind forms plugin for styled inputs

  **Acceptance Criteria**:
  - [ ] Form validates all fields before submission
  - [ ] Submitting valid form redirects to Stripe Checkout
  - [ ] Error messages appear below invalid fields
  - [ ] Price updates dynamically with quantity
  - [ ] Instagram @ is added automatically if user omits it

  **QA Scenarios**:

  \`\`\`
  Scenario: Ticket form validation
    Tool: Playwright
    Preconditions: Dev server + API running
    Steps:
      1. Open http://localhost:5173/ (scroll to form section)
      2. Click "Pay Now" with empty form → expect validation errors
      3. Fill all fields, check Instagram checkbox
      4. Assert Pay Now button becomes enabled
      5. Click Pay Now → expect redirect to Stripe
    Expected Result: Validation works, redirect to Stripe succeeds
    Failure Indicators: No validation, wrong redirect, API errors
    Evidence: .sisyphus/evidence/task-19-form.screenshots.png

  Scenario: Price calculation
    Tool: Playwright
    Preconditions: Form visible
    Steps:
      1. Set quantity to 5 → expect price "€2.50"
      2. Click + button → 6 → "€3.00"
      3. Click - button → 5 → "€2.50"
    Expected Result: Price = quantity × €0.50
    Failure Indicators: Price not updating, wrong calculation
    Evidence: .sisyphus/evidence/task-19-price-calc.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Form validation screenshots
  - [ ] Stripe redirect verification

  **Commit**: YES
  - Message: `feat(frontend): add ticket purchase form with validation and Stripe redirect`
  - Files: `frontend/src/components/TicketForm.tsx`
  - Pre-commit: none

  ---

- [ ] 20. **Checkout page — Stripe redirect, loading state, error handling**

  **What to do**:
  - Create `src/pages/Checkout.tsx`:
    - If no `?session_id=` param → redirect to home
    - Show loading spinner: "Processing your entry..."
    - After Stripe redirect back → `?success=true` or `?canceled=true`
    - Success state: "You're in! Check your email for confirmation."
    - Canceled state: "Payment canceled — your entry was not processed."
    - Both states: CTA to return home or retry
  - Handle Stripe redirect via query params (Vite SPA routing: use `location.search`)
  - Use `wouter`'s `useLocation` hook to read query params

  **Must NOT do**:
  - Do NOT create Stripe session client-side — always through backend
  - Do NOT show sensitive data on this page
  - Do NOT skip error boundary — Stripe might fail

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Simple state machine: loading → success/canceled

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 18, 19, 21, 22)
  - **Blocks**: None (last-page after purchase)
  - **Blocked By**: Task 19 (needs Stripe redirect URL)

  **References**:
  - Stripe redirect pattern: backend returns URL, frontend uses `window.location.href`
  - Wouter: `useLocation()` for query params

  **Acceptance Criteria**:
  - [ ] `/checkout` without params redirects to home
  - [ ] Loading state shows spinner and message
  - [ ] `?success=true` shows success message
  - [ ] `?canceled=true` shows canceled message

  **QA Scenarios**:

  \`\`\`
  Scenario: Checkout page handles success
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5173/checkout?success=true
      2. Assert success message visible
      3. Assert "Return Home" button visible
    Expected Result: Success state renders correctly
    Failure Indicators: Wrong page, no message, console errors
    Evidence: .sisyphus/evidence/task-20-checkout.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Checkout success screenshot
  - [ ] Checkout canceled screenshot

  **Commit**: YES
  - Message: `feat(frontend): add Stripe checkout callback page`
  - Files: `frontend/src/pages/Checkout.tsx`
  - Pre-commit: none

  ---

- [ ] 21. **Success page — confirmation, ticket count, share CTA**

  **What to do**:
  - Create `src/pages/Success.tsx`:
    - Retrieve `?session_id=` from URL
    - Optional: Call backend to get participant info by session_id
    - Display: large checkmark icon, "You're in the draw!"
    - Show ticket count: "You have X entries in the GR Cup 2026 draw"
    - Share CTA: "Share on Instagram" button (deep link to Instagram), "Share on Twitter/X"
    - What happens next: "Winner drawn on [date]. You'll receive an email if you win."
    - Footer CTA: "Buy more entries" → scrolls to form

  **Must NOT do**:
  - Do NOT show winner announcement here — that's the draw page
  - Do NOT display personal participant data without session verification

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Celebration UI, share buttons

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 18, 19, 20, 22)
  - **Blocks**: None
  - **Blocked By**: Task 20 (needs checkout page)

  **References**:
  - ciridae.com: checkmark animations, celebration state design
  - Instagram share deep link: `instagram://library?AssetPath=...` or web share

  **Acceptance Criteria**:
  - [ ] Success page shows checkmark + confirmation message
  - [ ] Ticket count displayed
  - [ ] Share buttons functional (open Instagram/Twitter)
  - [ ] "Buy more entries" CTA scrolls to form

  **QA Scenarios**:

  \`\`\`
  Scenario: Success page renders with celebration UI
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to http://localhost:5173/success
      2. Assert celebration UI visible
      3. Assert "Share" buttons present
    Expected Result: Success page renders with all elements
    Failure Indicators: Blank page, missing elements
    Evidence: .sisyphus/evidence/task-21-success.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Success page screenshot

  **Commit**: YES
  - Message: `feat(frontend): add post-purchase success page with share CTAs`
  - Files: `frontend/src/pages/Success.tsx`
  - Pre-commit: none

  ---

- [ ] 22. **Rules + How-to-Enter + Winners sections — static content**

  **What to do**:
  - Create `src/components/RulesSection.tsx`:
    - Uses `FrameSection` with 50 rules frames
    - Overlay: numbered list of rules (e.g., "0.50 € per entry", "Winner drawn randomly")
    - Each rule: pill number, bold rule text
  - Create `src/components/HowToEnterSection.tsx`:
    - Uses `FrameSection` with 40 frames
    - Overlay: 3-step process:
      1. "Fill the form" — with form preview
      2. "Pay via Stripe" — card icon
      3. "You're entered" — checkmark
    - Steps connected with animated lines/dots
    - TicketForm embedded below the steps
  - Create `src/components/WinnersSection.tsx`:
    - Uses `FrameSection` with 30 frames
    - Overlay: "PAST WINNERS" heading
    - Placeholder: 3 winner cards with placeholder data (name, prize, date)
    - "2025 GR Cup: Maria K., Athens — Full Meet Entry Package"
    - Gradient overlay for text legibility
  - Create `src/pages/Home.tsx`:
    - Composes: `<Navbar />` + `<HeroSection />` + `<RulesSection />` + `<HowToEnterSection />` + `<WinnersSection />` + `<Footer />`
    - Each section: `scroll-margin-top` for anchor linking

  **Must NOT do**:
  - Do NOT create actual winner data — use placeholder for demo
  - Do NOT skip scroll-margin-top — anchor links will hide behind navbar

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Content layout, section composition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15, 16, 17, 18, 19, 20, 21)
  - **Blocks**: None (Home page assembled)
  - **Blocked By**: Tasks 16, 18, 19, 29 (needs FrameSection, Hero, Form, Footer)

  **References**:
  - ciridae.com: numbered rules, step indicators, card layouts
  - Section layout from research

  **Acceptance Criteria**:
  - [ ] Home page has all 5 sections in order
  - [ ] Each section has `scroll-margin-top` for navbar clearance
  - [ ] Rules section shows numbered list
  - [ ] How-to-Enter shows 3 steps + form
  - [ ] Winners shows placeholder cards
  - [ ] Footer renders below all sections

  **QA Scenarios**:

  \`\`\`
  Scenario: All home page sections render and are navigable
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Open http://localhost:5173/
      2. Scroll through all sections (Hero, Rules, How-to-Enter, Winners, Footer)
      3. Assert each section is visible and has content
      4. Click navbar "Rules" link → should scroll to rules section
    Expected Result: All sections render, nav scrolling works
    Failure Indicators: Missing sections, nav not scrolling, blank areas
    Evidence: .sisyphus/evidence/task-22-home-scroll.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Screenshot of each section

  **Commit**: YES
  - Message: `feat(frontend): assemble Home page with all sections and static content`
  - Files: `frontend/src/components/RulesSection.tsx`, `frontend/src/components/HowToEnterSection.tsx`, `frontend/src/components/WinnersSection.tsx`, `frontend/src/pages/Home.tsx`
  - Pre-commit: none



- [ ] 8. **SignalR Hub — ParticipantsHub broadcast count, client connector**

  **What to do**:
  - Create `Hubs/ParticipantsHub.cs`:
    ```csharp
    using Microsoft.AspNetCore.SignalR;
    
    public class ParticipantsHub : Hub {
        public async Task JoinRaffle(string raffleId) {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"raffle-{raffleId}");
        }
        public async Task LeaveRaffle(string raffleId) {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"raffle-{raffleId}");
        }
    }
    ```
  - Create `Services/IHubBroadcastService.cs` + `HubBroadcastService.cs`:
    - Inject `IHubContext<ParticipantsHub>` to broadcast
    - Method `BroadcastParticipantCount(int count, string raffleId = "main")`
  - Register `IHubContext<ParticipantsHub>` in Program.cs (already added as `.AddSignalR()`)
  - The hub endpoint `/hubs/participants` is mapped in Program.cs
  - Client receives via `@microsoft/signalr` (from frontend Task 17)

  **Must NOT do**:
  - Do NOT use `[Authorize]` on the hub — public access for live counter
  - Do NOT broadcast on every scroll event — only on actual participant changes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - SignalR hub patterns from research findings

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 11, 12, 13, 14)
  - **Blocks**: Task 17 (frontend LiveCounter needs SignalR client)
  - **Blocked By**: Task 5 (needs Program.cs)

  **References**:
  - `https://learn.microsoft.com/en-us/aspnet/core/signalr/introduction` — SignalR hub pattern
  - Research finding: Hub with `IHubContext<THub>` injection for broadcasting from services

  **Acceptance Criteria**:
  - [ ] Hub connects at `/hubs/participants`
  - [ ] `Clients.Group("raffle-main").SendAsync("ParticipantCountUpdated", count)` compiles
  - [ ] `dotnet build` succeeds with Hub and service

  **QA Scenarios**:

  \`\`\`
  Scenario: SignalR hub accepts connections
    Tool: Bash
    Preconditions: API running with MySQL (Task 7)
    Steps:
      1. Start API: dotnet run --urls "http://0.0.0.0:5000"
      2. In browser JS console: connect to /hubs/participants via signalr
      3. Trigger participant add (simulate API call)
      4. Verify hub broadcasts count to connected clients
    Expected Result: Hub accepts connection, broadcasts on participant changes
    Failure Indicators: "401 Unauthorized", hub not found at endpoint
    Evidence: .sisyphus/evidence/task-8-signalr-test.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Build output confirming hub compiles

  **Commit**: YES
  - Message: `feat(backend): add SignalR ParticipantsHub for real-time participant count`
  - Files: `backend/GrCup.Api/Hubs/ParticipantsHub.cs`, `backend/GrCup.Api/Services/HubBroadcastService.cs`
  - Pre-commit: none

  ---

- [ ] 9. **Participant service + endpoints — count, buy, paginated list**

  **What to do**:
  - Create `Services/ParticipantService.cs`:
    - `GetCountAsync()` — `db.Participants.CountAsync()`
    - `GetOrCreateAsync(email, firstName, surname, instagram)` — upsert by email
    - `IncrementTicketsAsync(email, quantity)` — add tickets + update TotalPaid
    - `GetAllAsync(page, pageSize, search)` — paginated with search filter
  - Create `Endpoints/tickets.cs`:
    - `POST /api/tickets/buy` — body: `{ firstName, surname, email, instagram, ticketCount }` → upsert participant → broadcast count → return Stripe session URL
  - Create `Endpoints/participants.cs`:
    - `GET /api/participants/count` → returns `{ count: number }` (public, no auth)
    - `GET /api/participants` → paginated list (admin only, auth added in T10)
  - Broadcast participant count via SignalR after every ticket purchase

  **Must NOT do**:
  - Do NOT create Stripe session here — that's Task 11
  - Do NOT use `AsNoTracking()` for writes
  - Do NOT use `ORDER BY RAND()` for winner selection (that's T12)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Business logic + EF Core async patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10, 11, 12, 13, 14)
  - **Blocks**: Tasks 15, 19, 25 (frontend needs these endpoints)
  - **Blocked By**: Task 6 (needs models)

  **References**:
  - Research: `AsNoTracking()` for read-only queries, upsert pattern, paginated queries
  - Microsoft minimal API with `[AsParameters]` for request binding

  **Acceptance Criteria**:
  - [ ] `GET /api/participants/count` returns `{ count: N }`
  - [ ] `POST /api/tickets/buy` creates/updates participant, returns session URL (empty string until T11)
  - [ ] `GET /api/participants?page=1&pageSize=10&search=john` returns paginated results
  - [ ] `curl http://localhost:5000/api/participants/count` returns JSON

  **QA Scenarios**:

  \`\`\`
  Scenario: Ticket purchase creates participant
    Tool: Bash
    Preconditions: API running, MySQL connected
    Steps:
      1. curl -X POST http://localhost:5000/api/tickets/buy \
         -H "Content-Type: application/json" \
         -d '{"firstName":"John","surname":"Doe","email":"john@test.com","instagram":"@john","ticketCount":3}'
      2. Response: expect 200 with sessionUrl (string)
      3. curl http://localhost:5000/api/participants/count → expect count >= 1
    Expected Result: Participant created, count incremented
    Failure Indicators: 500 error, count not incrementing, validation errors
    Evidence: .sisyphus/evidence/task-9-ticket-buy.log

  Scenario: Duplicate email upserts participant
    Tool: Bash
    Preconditions: Same email from above
    Steps:
      1. POST /api/tickets/buy with same email, ticketCount=2
      2. GET /api/participants?search=john
    Expected Result: Same participant updated (ticketCount increased, not new record)
    Failure Indicators: Duplicate record created, error returned
    Evidence: .sisyphus/evidence/task-9-upsert.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] curl outputs showing API responses

  **Commit**: YES
  - Message: `feat(backend): add participant service and ticket purchase endpoint`
  - Files: `backend/GrCup.Api/Services/ParticipantService.cs`, `backend/GrCup.Api/Endpoints/tickets.cs`, `backend/GrCup.Api/Endpoints/participants.cs`
  - Pre-commit: none

  ---

- [ ] 10. **JWT service + admin login endpoint**

  **What to do**:
  - Create `Services/JwtService.cs`:
    - `GenerateToken(username, role)` — HS256, 24h expiry, includes role claim
    - Reads secret from `Environment.GetEnvironmentVariable("JWT_SECRET_KEY")`
  - Create `Services/AdminService.cs`:
    - Validate credentials against hardcoded `admin` / strong password (demo mode)
    - Could also check `appsettings.json` for configurable credentials
  - Create `Endpoints/admin.cs` (auth portion):
    - `POST /api/admin/login` → body: `{ username, password }` → validates → returns `{ token: string, expiresIn: 86400 }`
  - Add `[Authorize]` to admin endpoints in Tasks 13-14
  - Configure JWT in Program.cs: `AddJwtBearer` with events for SignalR (query string token)
  - **SignalR JWT special**: WebSockets don't send headers, so add `OnMessageReceived` event to extract JWT from query string

  **Must NOT do**:
  - Do NOT store passwords in plain text — use BCrypt hash comparison
  - Do NOT put the JWT secret in source code — must be env var
  - Do NOT use RS256 — HS256 is fine for symmetric demo auth

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - JWT, BCrypt, auth middleware patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 11, 12, 13, 14)
  - **Blocks**: Tasks 23, 24 (frontend admin auth)
  - **Blocked By**: Task 5 (needs Program.cs auth wiring)

  **References**:
  - Research: JWT setup with `AddJwtBearer`, token generation with `SymmetricSecurityKey`
  - Research: `OnMessageReceived` event for SignalR WebSocket JWT (query string)
  - `https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/security` — JWT in minimal API

  **Acceptance Criteria**:
  - [ ] `POST /api/admin/login` with correct credentials returns JWT token
  - [ ] `POST /api/admin/login` with wrong credentials returns 401
  - [ ] Protected endpoint returns 401 without valid JWT
  - [ ] Protected endpoint returns 200 with valid JWT in Authorization header

  **QA Scenarios**:

  \`\`\`
  Scenario: Admin login returns JWT token
    Tool: Bash
    Preconditions: API running
    Steps:
      1. curl -X POST http://localhost:5000/api/admin/login \
         -H "Content-Type: application/json" \
         -d '{"username":"admin","password":"strongpassword"}'
      2. Response: expect { "token": "eyJ...", "expiresIn": 86400 }
    Expected Result: JWT token returned, 200 status
    Failure Indicators: 401, wrong response shape, expired token format
    Evidence: .sisyphus/evidence/task-10-admin-login.log

  Scenario: Protected endpoint rejects unauthenticated request
    Tool: Bash
    Preconditions: API running
    Steps:
      1. curl http://localhost:5000/api/admin/participants → expect 401
      2. curl -H "Authorization: Bearer invalid" http://localhost:5000/api/admin/participants → expect 401
    Expected Result: 401 Unauthorized for missing/invalid token
    Failure Indicators: 200 response without auth, 500 error
    Evidence: .sisyphus/evidence/task-10-auth-reject.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Login response with token
  - [ ] Auth rejection responses

  **Commit**: YES
  - Message: `feat(backend): add JWT auth service and admin login endpoint`
  - Files: `backend/GrCup.Api/Services/JwtService.cs`, `backend/GrCup.Api/Services/AdminService.cs`, `backend/GrCup.Api/Endpoints/admin.cs`
  - Pre-commit: none

  ---

- [ ] 11. **Stripe checkout endpoint — SessionService.Create, redirect URL**

  **What to do**:
  - Create `Services/StripeService.cs`:
    - `CreateCheckoutSessionAsync(email, firstName, surname, ticketCount, successUrl, cancelUrl)`
    - Line item: `priceData` with `currency: "eur"`, `unitAmount: 50` (€0.50 in cents)
    - Product name: `"GR Cup Raffle Entry"`
    - `metadata`: `{ email, firstName, surname, ticketCount }`
    - `customer_email`: set from purchase form
    - `allow_promotion_codes`: true
    - `payment_method_types`: `["card"]`
  - Create Stripe webhook handler:
    - `POST /api/webhooks/stripe` — verify signature, handle `checkout.session.completed`
    - On success: upsert participant (if not exists), increment ticket count
    - Broadcast new participant count via SignalR
    - Use `EventUtility.ConstructEvent()` for signature verification
  - Update `POST /api/tickets/buy` to call Stripe service and return `sessionUrl`
  - Add `DisableAntiforgery()` attribute to webhook endpoint

  **Must NOT do**:
  - Do NOT expose Stripe secret key to frontend
  - Do NOT skip webhook signature verification
  - Do NOT create session without `customer_email` (needed for winner contact)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Stripe API integration patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 12, 13, 14)
  - **Blocks**: Tasks 19, 20 (frontend checkout flow)
  - **Blocked By**: Task 10 (needs webhook to update participants after payment)

  **References**:
  - Research: Stripe `SessionService.Create()` with `priceData`, webhook `EventUtility.ConstructEvent()`
  - `https://github.com/stripe-samples/checkout-one-time-payments/blob/main/server/dotnet/Program.cs` — Stripe server-side pattern

  **Acceptance Criteria**:
  - [ ] `POST /api/tickets/buy` returns `{ sessionUrl: "https://checkout.stripe.com/..." }`
  - [ ] Stripe dashboard shows test session created
  - [ ] Webhook receives and processes `checkout.session.completed`
  - [ ] Participant count updates after webhook

  **QA Scenarios**:

  \`\`\`
  Scenario: Ticket purchase creates Stripe Checkout session
    Tool: Bash
    Preconditions: API running, Stripe test key configured
    Steps:
      1. curl -X POST http://localhost:5000/api/tickets/buy \
         -H "Content-Type: application/json" \
         -d '{"firstName":"Jane","surname":"Smith","email":"jane@test.com","instagram":"@jane","ticketCount":5}'
      2. Response: expect sessionUrl starting with "https://checkout.stripe.com/"
    Expected Result: Valid Stripe Checkout URL returned
    Failure Indicators: Empty sessionUrl, Stripe API error, 500
    Evidence: .sisyphus/evidence/task-11-stripe-session.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Stripe session creation response

  **Commit**: YES
  - Message: `feat(backend): integrate Stripe Checkout and webhook handler`
  - Files: `backend/GrCup.Api/Services/StripeService.cs`, `backend/GrCup.Api/Endpoints/webhooks.cs`
  - Pre-commit: none

  ---

- [ ] 12. **Admin draw endpoint — random selection, Draw record creation**

  **What to do**:
  - Create `Services/DrawService.cs`:
    - `SelectRandomWinnerAsync()` — load all participants, pick random, create Draw record
    - Use `Random.Shared` for cryptographically-safe-ish randomness
    - Option: `ORDER BY RAND()` for simplicity, acceptable for small-to-medium datasets
  - Create `Endpoints/draws.cs`:
    - `POST /api/admin/draw` — `[Authorize]` — selects winner → returns `{ winnerEmail, winnerName, winnerInstagram, ticketCount, drawId }`
    - `GET /api/admin/draws` — `[Authorize]` — paginated list of past draws
    - `PATCH /api/admin/draws/{id}/confirm` — `[Authorize]` — marks draw as confirmed
  - Broadcast winner via SignalR after draw

  **Must NOT do**:
  - Do NOT use `ORDER BY RAND()` on tables with >10K rows — use in-memory approach
  - Do NOT allow drawing without participants — return 400 if count is 0
  - Do NOT expose winner email publicly — this endpoint requires auth

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Random selection, database transactions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11, 13, 14)
  - **Blocks**: Task 28 (frontend Draw Winner page)
  - **Blocked By**: Task 9 (needs participant data)

  **References**:
  - Research: `ORDER BY RAND()` for <10K rows, in-memory selection pattern
  - Research: EF Core transaction with `SaveChangesAsync`

  **Acceptance Criteria**:
  - [ ] `POST /api/admin/draw` without auth → 401
  - [ ] `POST /api/admin/draw` with valid JWT and participants → returns winner
  - [ ] `POST /api/admin/draw` with no participants → 400 with message
  - [ ] `GET /api/admin/draws` → list of past draws
  - [ ] Draw record saved to database

  **QA Scenarios**:

  \`\`\`
  Scenario: Draw selects random participant
    Tool: Bash
    Preconditions: API running, admin JWT token obtained
    Steps:
      1. Get admin token: POST /api/admin/login
      2. Create 3 test participants (POST /api/tickets/buy × 3)
      3. POST /api/admin/draw -H "Authorization: Bearer $TOKEN"
      4. Response: expect winner from among the 3 participants
    Expected Result: Winner returned, Draw record created in DB
    Failure Indicators: 401, 400, winner not from participants list
    Evidence: .sisyphus/evidence/task-12-draw.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Draw API response with winner details

  **Commit**: YES
  - Message: `feat(backend): add admin draw winner endpoint with random selection`
  - Files: `backend/GrCup.Api/Services/DrawService.cs`, `backend/GrCup.Api/Endpoints/draws.cs`
  - Pre-commit: none

  ---

- [ ] 13. **Admin participants endpoint — pagination + filter + CSV**

  **What to do**:
  - Extend `Endpoints/admin.cs` (or create new file):
    - `GET /api/admin/participants?page=1&pageSize=10&search=john` — `[Authorize]`
      - Search: `WHERE Email LIKE %search% OR FirstName LIKE %search% OR Instagram LIKE %search%`
      - Returns: `{ items: Participant[], total: number, page: number, pageSize: number, totalPages: number }`
    - `GET /api/admin/participants/export` — `[Authorize]`
      - Returns CSV file: `Name,Surname,Email,Instagram,Tickets,TotalPaid,CreatedAt`
      - Use manual CSV string builder (no external package needed)
      - Filename: `grcup-participants-{date}.csv`

  **Must NOT do**:
  - Do NOT return all participants without pagination
  - Do NOT use string concatenation for SQL — use EF Core `Where()`
  - Do NOT return passwords or sensitive data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Pagination, CSV generation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11, 12, 14)
  - **Blocks**: Task 26 (frontend participants table)
  - **Blocked By**: Task 10 (needs [Authorize])

  **References**:
  - Research: PagedResult record pattern, keyset pagination for large tables
  - Research: CSV with quoted fields for comma/quote escaping

  **Acceptance Criteria**:
  - [ ] `GET /api/admin/participants?page=1&pageSize=10` returns correct pagination metadata
  - [ ] `GET /api/admin/participants?search=john` filters results
  - [ ] `GET /api/admin/participants/export` returns CSV with correct headers
  - [ ] All endpoints return 401 without valid JWT

  **QA Scenarios**:

  \`\`\`
  Scenario: Paginated participants with search
    Tool: Bash
    Preconditions: Admin token, 20+ participants in DB
    Steps:
      1. GET /api/admin/participants?page=1&pageSize=5 → expect 5 items, total >= 5
      2. GET /api/admin/participants?page=2&pageSize=5 → expect next 5 items
      3. GET /api/admin/participants?search=john → expect filtered results
    Expected Result: Correct pagination, correct filter
    Failure Indicators: Wrong page returned, search not working, missing pagination metadata
    Evidence: .sisyphus/evidence/task-13-pagination.log

  Scenario: CSV export contains all fields
    Tool: Bash
    Preconditions: Admin token
    Steps:
      1. GET /api/admin/participants/export -H "Authorization: Bearer $TOKEN" > export.csv
      2. head -1 export.csv → expect headers
      3. wc -l export.csv → expect row count > 0
    Expected Result: Valid CSV with headers and data rows
    Failure Indicators: Empty file, wrong format, missing fields
    Evidence: .sisyphus/evidence/task-13-csv-export.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Pagination JSON response
  - [ ] CSV file contents

  **Commit**: YES
  - Message: `feat(backend): add admin participants endpoint with pagination, search, and CSV export`
  - Files: `backend/GrCup.Api/Endpoints/admin.cs`
  - Pre-commit: none

  ---

- [ ] 14. **Admin draws history endpoint — list past draws**

  **What to do**:
  - Extend `Endpoints/draws.cs`:
    - `GET /api/admin/draws` — `[Authorize]` — paginated draw history
      - Include winner name, email, draw date, notes
      - Sort by draw date descending
  - KPI aggregation endpoint:
    - `GET /api/admin/stats` — `[Authorize]`
      - `{ totalParticipants: int, totalTickets: int, totalRevenue: decimal }`
      - Use `db.Participants.SumAsync(p => p.TicketCount)` for total tickets
      - Use `db.Participants.SumAsync(p => p.TotalPaid)` for total revenue
      - Use `db.Participants.CountAsync()` for total participants

  **Must NOT do**:
  - Do NOT expose financial data without auth
  - Do NOT compute KPIs by loading all records into memory — use SQL aggregation

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Simple aggregation queries

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11, 12, 13)
  - **Blocks**: Task 25 (frontend dashboard KPIs)
  - **Blocked By**: Task 10 (needs [Authorize])

  **References**:
  - Research: SQL aggregation in EF Core: `SumAsync`, `CountAsync` — efficient server-side

  **Acceptance Criteria**:
  - [ ] `GET /api/admin/stats` returns all 3 KPIs
  - [ ] `GET /api/admin/draws` returns paginated draw history
  - [ ] Both endpoints require valid JWT

  **QA Scenarios**:

  \`\`\`
  Scenario: Admin stats endpoint
    Tool: Bash
    Preconditions: Admin token, participants in DB
    Steps:
      1. GET /api/admin/stats -H "Authorization: Bearer $TOKEN"
      2. Response: { totalParticipants: N, totalTickets: N, totalRevenue: N.nn }
    Expected Result: Correct aggregated stats
    Failure Indicators: Wrong numbers, missing fields, 401
    Evidence: .sisyphus/evidence/task-14-stats.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Stats JSON response

  **Commit**: YES
  - Message: `feat(backend): add admin stats and draws history endpoints`
  - Files: `backend/GrCup.Api/Endpoints/admin.cs`, `backend/GrCup.Api/Endpoints/draws.cs`
  - Pre-commit: none



- [ ] 1. **Frontend scaffold — npm create vite@latest (preact-ts), install all deps**

  **What to do**:
  - `cd /home/jaime/projects/grweb` → `mkdir frontend && cd frontend`
  - `npm create vite@latest . -- --template preact-ts` (in empty frontend dir)
  - `npm install`
  - Install additional deps:
    - `@preact/signals` — reactive state
    - `wouter` — client-side routing (`wouter/preact`)
    - `tailwindcss postcss autoprefixer` — dev deps
    - `@microsoft/signalr` — SignalR client
    - `clsx` — conditional class names
    - `@fontsource/roboto-mono` — font package
  - Run `npx tailwindcss init -p` to generate `tailwind.config.js` and `postcss.config.js`
  - Verify `npm run dev` starts without errors

  **Must NOT do**:
  - Do NOT install React-specific packages
  - Do NOT change `vite.config.ts` (proxy config added later in T32)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Just scaffolding — no domain expertise needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6, 7)
  - **Blocks**: Tasks 15-22 (frontend core UI)
  - **Blocked By**: None

  **References**:
  - `npm create vite@latest` — official Vite scaffold for Preact-TS template
  - `https://yuri.ws/webdev/installing-preact-vite-and-tailwind-css-together/` — Preact+Vite+Tailwind setup guide
  - `https://github.com/chandrakumarreddy/vite-ts-preact-tailwind-template` — template with signals + wouter

  **Acceptance Criteria**:
  - [ ] `npm create vite` succeeds in frontend/ directory
  - [ ] `npm install` succeeds with no peer-dep warnings
  - [ ] `npm run dev` starts dev server on port 5173
  - [ ] `npx tailwindcss init -p` creates `tailwind.config.js` and `postcss.config.js`

  **QA Scenarios**:

  \`\`\`
  Scenario: Fresh install creates working dev server
    Tool: Bash
    Preconditions: Clean empty frontend/ directory
    Steps:
      1. Run: cd /home/jaime/projects/grweb/frontend && npm run dev &
      2. Wait 5s for server startup
      3. curl http://localhost:5173/ → expect HTML response
      4. Kill the dev server
    Expected Result: HTML page served, no errors in stdout
    Failure Indicators: "Cannot find module", "ERR_PORT_IN_USE", "vite command not found"
    Evidence: .sisyphus/evidence/task-1-dev-server.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Dev server log showing successful startup
  - [ ] `npm ls --depth=0` output confirming all packages installed

  **Commit**: YES
  - Message: `feat(frontend): scaffold Preact + Vite + Tailwind project`
  - Files: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
  - Pre-commit: none

  ---

- [ ] 2. **Frontend Tailwind config — custom colors, fonts, animations, postcss**

  **What to do**:
  - Configure `tailwind.config.js`:
    ```js
    // Custom GR Cup colors
    colors: {
      'neon-blue': '#00f0ff',
      'neon-orange': '#ff5e00',
      'dark-base': '#0a0a0a',
      'dark-surface': '#141414',
      'dark-card': '#1e1e1e',
    }
    // Extend fontFamily: 'mono': ['Roboto Mono', 'monospace']
    // Extend fontFamily: 'body': ['Inter', 'sans-serif'] // fallback for body text
    // Content paths: content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']
    // Plugins: require('@tailwindcss/forms') for form styles
    // Animations: fadeIn, slideUp, glowPulse, counterBounce
    ```
  - Create `src/index.css` with:
    ```css
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
    /* Custom base styles: dark background, neon text accents */
    body { @apply bg-dark-base text-white antialiased; }
    /* Custom scrollbar: thin, dark, neon-blue thumb */
    /* Selection: neon-blue bg, white text */
    ```
  - Add custom keyframe animations:
    - `fadeIn`: opacity 0→1, 0.6s ease-out
    - `slideUp`: translateY(30px)→0 + fadeIn, 0.8s ease-out
    - `glowPulse`: box-shadow neon-blue pulse, 2s infinite
    - `counterBounce`: scale 1→1.15→1, 0.3s

  **Must NOT do**:
  - Do NOT use arbitrary values (`bg-[#00f0ff]`) — add to config instead
  - Do NOT override the PostCSS config generated by `tailwindcss init -p`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6, 7)
  - **Blocks**: All frontend tasks (15-22)
  - **Blocked By**: Task 1 (must complete tailwind init first)

  **References**:
  - `https://yuri.ws/webdev/installing-preact-vite-and-tailwind-css-together/` — Tailwind config instructions
  - Tailwind CSS v3.4 docs: `https://tailwindcss.com/docs/customizing-colors`
  - ciridae.com CSS: custom spacing scale `--size--100` etc, Roboto Mono font

  **Acceptance Criteria**:
  - [ ] `tailwind.config.js` has `neon-blue`, `neon-orange`, `dark-*` colors
  - [ ] `src/index.css` imports Tailwind with `@tailwind` directives
  - [ ] Custom animations `fadeIn`, `slideUp`, `glowPulse` defined
  - [ ] Custom font families `mono` and `body` defined

  **QA Scenarios**:

  \`\`\`
  Scenario: Tailwind custom colors available in components
    Tool: Bash
    Preconditions: Frontend project scaffolded (Task 1 complete)
    Steps:
      1. Grep for 'bg-neon-blue' in src/ — expect matches after adding to config
      2. Build: cd frontend && npm run build 2>&1 | head -50
    Expected Result: Build succeeds, no CSS errors about unknown utilities
    Failure Indicators: "Unknown word", "Cannot find any classes"
    Evidence: .sisyphus/evidence/task-2-tailwind-build.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Build output showing successful CSS compilation

  **Commit**: YES
  - Message: `feat(frontend): configure Tailwind with GR Cup design tokens`
  - Files: `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/postcss.config.js`
  - Pre-commit: none

  ---

- [ ] 3. **Frontend routing + layout — wouter, App.tsx, Navbar, global styles**

  **What to do**:
  - Create `src/app.tsx` with Wouter routing:
    ```tsx
    import { Router, Route } from 'wouter/preact';
    import Home from './pages/Home';
    import Checkout from './pages/Checkout';
    import Success from './pages/Success';
    import Login from './admin/pages/Login';
    import Dashboard from './admin/pages/Dashboard';
    import Participants from './admin/pages/Participants';
    import DrawWinner from './admin/pages/DrawWinner';
    // Public routes: /, /checkout, /success
    // Admin routes: /admin/login, /admin/dashboard, /admin/participants, /admin/draw
    ```
  - Create `src/components/Navbar.tsx`:
    - Sticky top-0, z-50, backdrop-blur bg-dark-base/80
    - Logo: "GR CUP" bold mono text with neon-orange accent
    - Links: Hero, Rules, How to Enter, Winners, [Admin]
    - Mobile: hamburger → slide-down menu
    - Smooth scroll to section anchors
  - Create `src/components/Footer.tsx` (stub for now, fully implemented in T29):
    - Minimal dark footer with copyright, links
  - Create `src/layouts/Layout.tsx` — wraps all public pages with Navbar + Footer

  **Must NOT do**:
  - Do NOT add auth logic yet — that's Task 23
  - Do NOT implement full admin pages — stubs only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Basic component layout — no complex animation expertise needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6, 7)
  - **Blocks**: Tasks 15-22, 23-28
  - **Blocked By**: Task 1 (needs npm packages installed)

  **References**:
  - `wouter` routing: `https://github.com/molefrog/wouter` — HashRouter for simple SPA
  - ciridae.com navbar: sticky, backdrop-blur, minimal links
  - Tailwind sticky: `sticky top-0 z-50`

  **Acceptance Criteria**:
  - [ ] `npm run dev` serves pages at `/`, `/checkout`, `/success`
  - [ ] `npm run dev` serves pages at `/admin/login`, `/admin/dashboard`
  - [ ] Navbar visible on all public pages
  - [ ] Hamburger menu opens on mobile viewport

  **QA Scenarios**:

  \`\`\`
  Scenario: Navbar renders and navigates between routes
    Tool: Playwright
    Preconditions: Dev server running, no auth
    Steps:
      1. Open http://localhost:5173/
      2. Assert navbar is visible with "GR CUP" logo
      3. Click "Rules" link — expect URL changes or scroll to section
      4. Navigate to /checkout — assert page loads
      5. Navigate to /admin/login — assert page loads
    Expected Result: All routes render correct components, no 404
    Failure Indicators: Blank page, "Cannot find module", routing 404
    Evidence: .sisyphus/evidence/task-3-routing.screenshots.png

  Scenario: Mobile hamburger menu
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set viewport to 375x667 (mobile)
      2. Open http://localhost:5173/
      3. Assert hamburger icon visible
      4. Click hamburger — assert menu slides down
      5. Click a link — assert menu closes
    Expected Result: Menu toggles correctly, links work
    Failure Indicators: Menu doesn't open, links don't work on mobile
    Evidence: .sisyphus/evidence/task-3-mobile-nav.screenshots.png
  \`\`\`

  **Evidence to Capture**:
  - [ ] Screenshots of desktop navbar
  - [ ] Screenshots of mobile hamburger menu

  **Commit**: YES
  - Message: `feat(frontend): setup routing with wouter and base layout`
  - Files: `frontend/src/app.tsx`, `frontend/src/components/Navbar.tsx`, `frontend/src/layouts/Layout.tsx`
  - Pre-commit: none

  ---

- [ ] 4. **Backend scaffold — dotnet new web, install all NuGet packages**

  **What to do**:
  - `cd /home/jaime/projects/grweb` → `mkdir backend && cd backend`
  - `dotnet new web -n GrCup.Api --no-https` (creates minimal API, no HTTPS)
  - `cd GrCup.Api`
  - Install NuGet packages:
    ```bash
    dotnet add package Pomelo.EntityFrameworkCore.MySql
    dotnet add package Microsoft.AspNetCore.SignalR
    dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer
    dotnet add package Stripe.net
    dotnet add package Microsoft.EntityFrameworkCore.Design  # for migrations
    dotnet add package Swashbuckle.AspNetCore  # Swagger
    dotnet add package Serilog.AspNetCore  # structured logging
    ```
  - Update `GrCup.Api.csproj` to add `<Nullable>enable</Nullable>` and proper version
  - Verify `dotnet run` starts on port 5000

  **Must NOT do**:
  - Do NOT add Program.cs logic yet — that's Task 5
  - Do NOT create models yet — that's Task 6

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Just scaffolding — no domain expertise needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6, 7)
  - **Blocks**: Tasks 8-14
  - **Blocked By**: None

  **References**:
  - `dotnet new web --no-https` — official .NET 8 minimal API template
  - `https://github.com/jiaweing/dotnet8-jwt-api-boilerplate` — boilerplate with MySQL + JWT

  **Acceptance Criteria**:
  - [ ] `dotnet new web` creates project in backend/GrCup.Api/
  - [ ] All 7 NuGet packages install without conflicts
  - [ ] `dotnet run` starts HTTP server on port 5000
  - [ ] `curl http://localhost:5000/` returns a response (even 404)

  **QA Scenarios**:

  \`\`\`
  Scenario: Backend starts without errors
    Tool: Bash
    Preconditions: Clean backend/GrCup.Api/ directory
    Steps:
      1. cd backend/GrCup.Api && dotnet run &
      2. Wait 8s for compilation + startup
      3. curl http://localhost:5000/ → expect HTTP response (any status)
      4. Kill dotnet process
    Expected Result: Server starts, responds to requests
    Failure Indicators: "Package not found", "Cannot find SDK", port in use
    Evidence: .sisyphus/evidence/task-4-backend-start.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Backend startup log showing successful compilation
  - [ ] `curl` output showing HTTP response

  **Commit**: YES
  - Message: `feat(backend): scaffold ASP.NET Core 8 minimal API project`
  - Files: `backend/GrCup.Api/GrCup.Api.csproj`, `backend/GrCup.Api/Program.cs`, `backend/GrCup.Api/appsettings.json`
  - Pre-commit: none

  ---

- [ ] 5. **Backend Program.cs skeleton — DI, CORS, MySQL, JWT, SignalR wired**

  **What to do**:
  - Write complete `Program.cs` that wires ALL services:
    ```csharp
    var builder = WebApplication.CreateBuilder(args);

    // CORS — allow frontend origin in dev
    builder.Services.AddCors(options => {
        options.AddPolicy("AllowFrontend", policy => {
            policy.WithOrigins("http://localhost:5173", "http://localhost:3000")
                  .AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        });
    });

    // MySQL via Pomelo
    var connectionString = builder.Configuration.GetConnectionString("Default");
    builder.Services.AddDbContext<GrCupDbContext>(options =>
        options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

    // JWT Authentication
    var jwtKey = builder.Configuration["Jwt:Key"]!;
    var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options => {
            options.TokenValidationParameters = new TokenValidationParameters {
                ValidateIssuer = true, ValidateAudience = true,
                ValidateLifetime = true, ValidateIssuerSigningKey = true,
                ValidIssuer = jwtIssuer, ValidAudience = "GrCup",
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
            };
        });

    // SignalR
    builder.Services.AddSignalR();

    // DI services
    builder.Services.AddScoped<ParticipantService>();
    builder.Services.AddSingleton<JwtService>();
    builder.Services.AddSingleton(new StripeService(
        builder.Configuration["Stripe:SecretKey"]!,
        builder.Configuration["Stripe:WebhookSecret"]!));

    // Swagger
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();

    // Serilog
    builder.Host.UseSerilog();

    var app = builder.Build();

    // Middleware pipeline
    app.UseCors("AllowFrontend");
    app.UseSerilogRequestLogging();
    if (app.Environment.IsDevelopment()) {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    // Map SignalR hub
    app.MapHub<ParticipantsHub>("/hubs/participants");

    // Map all endpoints (from separate files)
    app.MapTicketEndpoints();
    app.MapParticipantEndpoints();
    app.MapAdminEndpoints();

    app.Run();
    ```

  **Must NOT do**:
  - Do NOT hardcode secrets — read from `appsettings.json` or env vars
  - Do NOT add endpoint implementations — that's Wave 2

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - Program.cs wiring requires understanding of .NET DI, auth, and middleware

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6, 7)
  - **Blocks**: Tasks 8-14 (needs models from Task 6 first)
  - **Blocked By**: Tasks 4, 6 (needs csproj and models)

  **References**:
  - `https://www.djamware.com/post/688b2c4e038e104425826d6d/build-a-secure-rest-api-with-aspnet-core-8-entity-framework-and-jwt-authentication` — JWT + EF Core in .NET 8
  - `https://dev.to/leandroveiga/how-to-implement-real-time-communication-in-net-8-minimal-apis-using-signalr-a-step-by-step-guide-2faj` — SignalR in minimal API
  - `https://learn.microsoft.com/en-us/aspnet/core/tutorials/signalr` — Microsoft SignalR tutorial

  **Acceptance Criteria**:
  - [ ] `Program.cs` has all sections: CORS, MySQL, JWT, SignalR, Swagger, Serilog
  - [ ] `appsettings.json` has `ConnectionStrings:Default`, `Jwt:Key`, `Stripe:SecretKey`
  - [ ] Code compiles without errors (`dotnet build`)
  - [ ] Missing types (ParticipantService, ParticipantsHub, etc.) expected — stubbed for Wave 2

  **QA Scenarios**:

  \`\`\`
  Scenario: Backend compiles with Program.cs
    Tool: Bash
    Preconditions: Task 4 + Task 6 complete
    Steps:
      1. cd backend/GrCup.Api && dotnet build 2>&1 | tail -30
    Expected Result: Build succeeds (may have missing type warnings, that's OK for Wave 1)
    Failure Indicators: "The type or namespace name does not exist" errors on core types
    Evidence: .sisyphus/evidence/task-5-programcs-compile.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Build output

  **Commit**: YES
  - Message: `feat(backend): wire Program.cs with CORS, EF Core, JWT, SignalR, Swagger`
  - Files: `backend/GrCup.Api/Program.cs`, `backend/GrCup.Api/appsettings.json`
  - Pre-commit: none

  ---

- [ ] 6. **Backend models + DbContext — Participant, Draw, GrCupDbContext**

  **What to do**:
  - Create `Models/Participant.cs`:
    ```csharp
    public class Participant {
        public int Id { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string Surname { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty; // UNIQUE
        public string Instagram { get; set; } = string.Empty;
        public int TicketCount { get; set; }
        public decimal TotalPaid { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
    ```
  - Create `Models/Draw.cs`:
    ```csharp
    public class Draw {
        public int Id { get; set; }
        public string WinnerEmail { get; set; } = string.Empty;
        public string? WinnerName { get; set; }
        public string? WinnerInstagram { get; set; }
        public DateTime DrawDate { get; set; } = DateTime.UtcNow;
        public string? Notes { get; set; }
    }
    ```
  - Create `Data/GrCupDbContext.cs`:
    ```csharp
    public class GrCupDbContext : DbContext {
        public DbSet<Participant> Participants => Set<Participant>();
        public DbSet<Draw> Draws => Set<Draw>();

        protected override void OnConfiguring(DbContextOptionsBuilder options) {
            if (!options.IsConfigured) {
                var connectionString = "..."; // from DI in Program.cs
                options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString));
            }
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder) {
            modelBuilder.Entity<Participant>(entity => {
                entity.HasIndex(e => e.Email).IsUnique();
                entity.Property(e => e.TotalPaid).HasPrecision(10, 2);
            });
        }
    }
    ```
  - Run initial migration: `dotnet ef migrations add InitialCreate`
  - Create `Data/DbInitializer.cs` — seeds admin credentials in appsettings for demo

  **Must NOT do**:
  - Do NOT hardcode connection string in DbContext — use `IConfiguration` or connection string from Program.cs
  - Do NOT add business logic to entities — that's the service layer

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Standard EF Core patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 7)
  - **Blocks**: Tasks 8-14 (needs models for endpoints)
  - **Blocked By**: Task 4 (needs project scaffold)

  **References**:
  - `https://github.com/jiaweing/dotnet8-jwt-api-boilerplate` — EF Core + MySQL setup
  - Pomelo docs: `https://pomeloframework.github.io/Pomelo.EntityFrameworkCore.MySql/`
  - EF Core conventions: `HasIndex`, `HasPrecision`, `IsUnique`

  **Acceptance Criteria**:
  - [ ] `dotnet build` succeeds with models and DbContext
  - [ ] `dotnet ef migrations add InitialCreate` generates migration
  - [ ] `appsettings.json` has connection string placeholder

  **QA Scenarios**:

  \`\`\`
  Scenario: EF Core models compile and migration generates
    Tool: Bash
    Preconditions: Task 4 + Task 6 complete
    Steps:
      1. cd backend/GrCup.Api && dotnet build 2>&1
      2. dotnet ef migrations add InitialCreate 2>&1
    Expected Result: Build succeeds, migration file created in Migrations/ folder
    Failure Indicators: "Cannot find type", "Could not find connection string"
    Evidence: .sisyphus/evidence/task-6-models-compile.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] Build output
  - [ ] Migration file listing

  **Commit**: YES
  - Message: `feat(backend): add EF Core models (Participant, Draw) and DbContext`
  - Files: `backend/GrCup.Api/Models/Participant.cs`, `backend/GrCup.Api/Models/Draw.cs`, `backend/GrCup.Api/Data/GrCupDbContext.cs`
  - Pre-commit: none

  ---

- [ ] 7. **Docker Compose — MySQL 8 + API container + env vars**

  **What to do**:
  - Create `docker-compose.yml` at project root:
    ```yaml
    version: '3.8'
    services:
      mysql:
        image: mysql:8
        environment:
          MYSQL_ROOT_PASSWORD: rootsecret
          MYSQL_DATABASE: grcup
          MYSQL_USER: grcup_user
          MYSQL_PASSWORD: grcup_password
        ports:
          - "3306:3306"
        volumes:
          - mysql_data:/var/lib/mysql
        healthcheck:
          test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
          interval: 10s
          timeout: 5s
          retries: 5

      api:
        build:
          context: ./backend
          dockerfile: GrCup.Api/Dockerfile
        ports:
          - "5000:8080"
        environment:
          - ASPNETCORE_ENVIRONMENT=Development
          - ConnectionStrings__Default=Server=mysql;Port=3306;Database=grcup;User=grcup_user;Password=grcup_password;
          - Jwt__Key=SuperSecretKeyThatIsAtLeast32CharactersLong!
          - Jwt__Issuer=GrCupApi
          - Stripe__SecretKey=${STRIPE_SECRET_KEY}
          - Stripe__WebhookSecret=${STRIPE_WEBHOOK_SECRET}
        depends_on:
          mysql:
            condition: service_healthy
    volumes:
      mysql_data:
    ```
  - Create `backend/GrCup.Api/Dockerfile`:
    ```dockerfile
    FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
    WORKDIR /src
    COPY GrCup.Api.csproj ./
    RUN dotnet restore
    COPY . ./
    RUN dotnet publish -c Release -o /app/publish

    FROM mcr.microsoft.com/dotnet/aspnet:8.0
    WORKDIR /app
    COPY --from=build /app/publish .
    EXPOSE 8080
    ENTRYPOINT ["dotnet", "GrCup.Api.dll"]
    ```
  - Create `.env.example` at project root:
    ```
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    STRIPE_PUBLISHABLE_KEY=pk_test_...
    ```
  - Create `.gitignore` at project root (ignore .env, bin/, obj/, node_modules/)

  **Must NOT do**:
  - Do NOT commit real .env file
  - Do NOT use port 3306 for anything other than MySQL

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Docker Compose boilerplate

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5, 6)
  - **Blocks**: Wave FINAL verification
  - **Blocked By**: Task 4 (needs Dockerfile context)

  **References**:
  - MySQL 8 official image docs: `https://hub.docker.com/_/mysql`
  - `https://github.com/jiaweing/dotnet8-jwt-api-boilerplate` — boilerplate with Docker

  **Acceptance Criteria**:
  - [ ] `docker-compose config` validates without errors
  - [ ] Dockerfile builds: `docker build -t grcup-api ./backend/GrCup.Api`
  - [ ] .env.example contains all required env vars
  - [ ] .gitignore excludes .env, bin/, obj/, node_modules/

  **QA Scenarios**:

  \`\`\`
  Scenario: Docker Compose validates
    Tool: Bash
    Preconditions: docker-compose.yml and Dockerfile exist
    Steps:
      1. docker-compose config > /dev/null 2>&1 && echo "VALID" || echo "INVALID"
    Expected Result: "VALID" output
    Failure Indicators: YAML syntax errors, missing services
    Evidence: .sisyphus/evidence/task-7-docker-validate.log

  Scenario: Dockerfile builds successfully
    Tool: Bash
    Preconditions: Dockerfile exists at correct path
    Steps:
      1. docker build -t grcup-api-test ./backend/GrCup.Api/ 2>&1 | tail -20
    Expected Result: Build succeeds, image created
    Failure Indicators: Build errors, missing dotnet SDK
    Evidence: .sisyphus/evidence/task-7-docker-build.log
  \`\`\`

  **Evidence to Capture**:
  - [ ] `docker-compose config` output
  - [ ] Docker build output

  **Commit**: YES
  - Message: `feat(infrastructure): add Docker Compose with MySQL 8 and API container`
  - Files: `docker-compose.yml`, `backend/GrCup.Api/Dockerfile`, `.env.example`, `.gitignore`
  - Pre-commit: none

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build` for frontend + `dotnet build` for backend. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Frontend Build [PASS/FAIL] | Backend Build [PASS/FAIL] | TypeScript [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

**Grouped by wave** — each wave's tasks commit together:

- **Wave 1**: `feat(infrastructure): scaffold frontend and backend projects with Docker Compose`
  - Files: `frontend/` scaffold, `backend/GrCup.Api/` scaffold, `docker-compose.yml`, `.env.example`, `.gitignore`

- **Wave 2**: `feat(backend): implement full API with SignalR, JWT auth, Stripe, and admin endpoints`
  - Files: `backend/GrCup.Api/` — Hubs, Services, Endpoints, Models, Data

- **Wave 3**: `feat(frontend): build public SPA with parallax animations, live counter, and Stripe checkout`
  - Files: `frontend/src/` — hooks, components, pages, services

- **Wave 4**: `feat(frontend): add protected admin panel with KPIs, participants table, and draw winner`
  - Files: `frontend/src/admin/` — pages, components, context

- **Wave 5**: `chore: add polish, documentation, and production build verification`
  - Files: Footers, READMEs, environment config, build verification

---

## Success Criteria

### Verification Commands
```bash
# Frontend dev
cd frontend && npm install && npm run dev
# Expected: Dev server starts on port 5173

# Frontend build
cd frontend && npm run build
# Expected: dist/ folder created, build succeeds

# Backend dev
cd backend/GrCup.Api && dotnet run --urls "http://0.0.0.0:5000"
# Expected: API starts on port 5000

# Backend build
cd backend/GrCup.Api && dotnet publish -c Release
# Expected: bin/Release/net8.0/publish/ created

# Docker Compose
docker-compose up --build
# Expected: MySQL + API containers start successfully

# Smoke tests
curl http://localhost:5000/api/participants/count
# Expected: {"count":0}

# Admin login
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"strongpassword"}'
# Expected: {"token":"eyJ...","expiresIn":86400}
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Frontend builds without errors
- [ ] Backend builds without errors
- [ ] Docker images build successfully
- [ ] Admin login works with demo credentials
- [ ] Ticket purchase creates Stripe session
- [ ] SignalR hub accepts connections
- [ ] Draw winner selects random participant
- [ ] All 34 QA scenarios executed and passed
- [ ] All evidence files captured in `.sisyphus/evidence/`
- [ ] 3 README files complete
- [ ] Scope fidelity verified (no creep, no missing)


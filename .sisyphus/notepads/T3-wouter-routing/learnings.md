# T3: Wouter Routing + App/Layout/Navbar

## Pattern: Wouter import path
- `wouter/preact` subpath does NOT exist in wouter v3
- The main `wouter` export is framework-agnostic and works with Preact
- `skipLibCheck: true` in tsconfig.app.json handles React type imports in wouter's `.d.ts` files
- Correct import: `import { Router, Route } from 'wouter'` (NOT `wouter/preact`)

## Pattern: Preact children type
- Use `preact.ComponentChildren` for children prop type in Layout and similar wrappers

## Pattern: Admin pages directory
- Admin pages live at `src/admin/pages/` with default exports
- Admin login route has no Layout wrapper (no Navbar)
- All other admin routes use `<Layout>` wrapper

## Files created
- `src/app.tsx` — Wouter Router with all routes
- `src/components/Navbar.tsx` — sticky, scroll-aware, mobile hamburger menu
- `src/layouts/Layout.tsx` — wraps children in Navbar + main padding
- `src/pages/Home.tsx` — stub
- `src/pages/Checkout.tsx` — stub
- `src/pages/Success.tsx` — stub
- `src/admin/pages/Login.tsx` — stub
- `src/admin/pages/Dashboard.tsx` — stub
- `src/admin/pages/Participants.tsx` — stub
- `src/admin/pages/DrawWinner.tsx` — stub

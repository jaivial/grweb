# FER Web — Landing Website

## Overview
Independent FER Powerlifting Day landing page. Isolated from the GR Cup frontend.

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS v3.4 (FER "aura místico" palette)
- Framer Motion (animations)
- Zod (form validation)
- Lucide React (icons)
- React Hot Toast (notifications)

## Dev
- Port: 5174
- API URL: `VITE_API_URL` (default `http://localhost:5006`)
- Production: `https://fer.menustudioai.com`

## Colors
FER colors are defined in THREE places (keep in sync):
1. `src/pages/fer/constants.ts` → `FER_COLORS` (single source of truth)
2. `tailwind.config.js` → `colors` section
3. `src/styles/globals.css` → CSS variables `:root`

## Structure
```
src/
├── api/           # API client (multi-tenant)
├── stores/        # Jotai atoms
├── hooks/         # Custom hooks
├── types/         # TypeScript types
├── utils/         # Utility functions
├── components/    # Shared components (Head.tsx, animations/)
├── pages/fer/     # FER landing (main page)
│   ├── components/  # FER-specific components
│   ├── hooks/       # FER-specific hooks
│   └── constants.ts # FER colors, event info
└── styles/        # Global CSS
```

## Conventions
- Components: functional with hooks
- Styling: TailwindCSS + inline styles for FER colors
- Every HTML element must have `data-*` attribute
- Memoize derived state with `useMemo`
- Stabilize handlers with `useCallback`
- Backend cookie: `gr_token` (matches backend UsuarioEndpoints)

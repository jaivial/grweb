# Plan: Quick Links Section — FER Web Home Page

## Objective
Create a new **Quick Links** section on the FER home page (`FerLanding`) that renders all 8 links from the mobile sidebar (`NAV_LINKS`) as visually attractive, descriptive cards. Style: Cursor IDE clean, elegant, minimal aesthetic. Layout: flexbox (not grid) with `min-width` / `max-width` containers for responsive breakpoints.

---

## Phase 1: Research & Constants Setup

### Task 1.1 — Extend `NAV_LINKS` with metadata
- [ ] Add `icon` field (Lucide icon component reference) to each entry in `NAV_LINKS`
- [ ] Add `description` field (short, evocative phrase) to each entry in `NAV_LINKS`
- [ ] Add `emoji` or `gradientColor` field to each entry for visual distinction
- [ ] Ensure `NAV_LINKS` continues to export as `const` for tree-shaking

### Task 1.2 — Define link metadata content
- [ ] Assign appropriate Lucide icon to each link (e.g., Home → `House`, Inscripción → `PenLine`, Modalidades → `Layers`, etc.)
- [ ] Write one-line Spanish descriptions for each link
- [ ] Assign subtle color/gradient tokens to each card for visual variety without breaking the FER dark theme

### Microtasks
- [ ] Verify existing consumers of `NAV_LINKS` (Navbar, MobileSidebar) still type-check after adding icon/description fields
- [ ] Export new fields from `constants/index.ts` if needed

---

## Phase 2: Component Architecture — `QuickLinksSection`

### Task 2.1 — Create `QuickLinksSection.tsx`
- [ ] File: `ferweb/src/pages/fer/components/QuickLinksSection.tsx`
- [ ] Import `NAV_LINKS`, `FER_COLORS` from constants
- [ ] Use `<section>` wrapper with `data-ui="fer-quicklinks-section"`
- [ ] Section heading: "Acceso Rápido" or "Explora" — minimal, elegant
- [ ] Subheading line: subtle description text

### Task 2.2 — Style the section header
- [ ] Section heading with `font-display font-black` and FER_COLORS.text
- [ ] Underline accent bar (gradient gold→silver, matching DisciplinasSection pattern)
- [ ] Fade-in scroll animation via Framer Motion `whileInView`

### Task 2.3 — Build the card list container
- [ ] Container: `max-w-6xl mx-auto` (matches existing sections)
- [ ] Inner flexbox row: `flex flex-wrap justify-center`
- [ ] **No CSS Grid** — use flexbox only
- [ ] Container `min-width: 280px`, `max-width: 1280px`
- [ ] Padding: `px-4` mobile, `gap-4` between cards

### Task 2.4 — Build `QuickLinkCard` sub-component
- [ ] Each card is a `<button>` (to use `navigate()`) or `<a>` based on path
- [ ] Card structure:
  ```
  ┌─────────────────────┐
  │  [icon]              │
  │  Label               │
  │  Description text    │
  └─────────────────────┘
  ```
- [ ] Card `min-width: 240px`, `max-width: 320px`
- [ ] Card `flex: 1 1 240px` (grow, shrink, basis)
- [ ] Background: `FER_COLORS.bgCard` with subtle border `FER_COLORS.accent15`
- [ ] Border radius: `rounded-xl` or `rounded-2xl`
- [ ] Hover state: border glow / translateY(-2px) / subtle background lighten
- [ ] Icon in a small pill/rounded container with subtle background tint
- [ ] Description in `FER_COLORS.textMuted` at `text-sm`

### Task 2.5 — Stagger animation
- [ ] Wrap card list in Framer Motion `motion.div` with `staggerChildren: 0.08`
- [ ] Each card fades in + slides up slightly on scroll into view
- [ ] Respect `prefers-reduced-motion`

---

## Phase 3: Integrate into FerLanding

### Task 3.1 — Place section in the landing page flow
- [ ] Import `QuickLinksSection` in `FerLanding.tsx`
- [ ] Place between `ComoFunciona` and `ParallaxShowcase` (or after Hero, before QueEs — determine best flow position)
- [ ] Add `data-ui="fer-quicklinks-section-wrapper"` to parent

### Task 3.2 — Verify with all 8 links
- [ ] Inicio (`/`)
- [ ] Inscripción (`/inscripcion`)
- [ ] Modalidades (`/modalidades`)
- [ ] Horarios (`/horarios`)
- [ ] Ubicación (`/ubicacion`)
- [ ] Galería (`/galeria`)
- [ ] Tutoriales (`/tutoriales`)
- [ ] Sobre Nosotros (`/sobre-nosotros`)

---

## Phase 4: Polish & Design Impeccability

### Task 4.1 — Hover & interaction states
- [ ] `hover:bg-white/[3-5]` — subtle lighten
- [ ] `transition-all duration-300` smoothness
- [ ] Border accent on hover (left border or bottom border glow)
- [ ] Cursor pointer on cards
- [ ] Focus-visible ring for keyboard navigation (FER_COLORS.accent)

### Task 4.2 — Visual hierarchy
- [ ] Icon size: `w-8 h-8` or `w-10 h-10` in a subtle circular/rounded container
- [ ] Label: `text-base font-semibold` with `FER_COLORS.text`
- [ ] Description: `text-sm` with `FER_COLORS.textMuted` and `leading-relaxed`
- [ ] Card padding: `p-5` (1.25rem) consistent

### Task 4.3 — Responsive breakpoints (flexbox only)
- [ ] **Mobile (<640px)**: cards stack at full width (`min-width: 100%` or `flex-basis: 100%`)
- [ ] **Tablet (640-1024px)**: 2 cards per row (`flex: 1 1 280px`)
- [ ] **Desktop (>1024px)**: 3-4 cards per row (`flex: 1 1 240px`, max 280px)
- [ ] No grid `grid-cols-*` classes anywhere — use `flex-wrap` + `flex-basis` + `min-width` / `max-width`

### Task 4.4 — Test reduced motion
- [ ] Animation variants fall back to opacity-only when `prefers-reduced-motion: reduce`

---

## Phase 5: Quality Assurance

### Task 5.1 — Validate data-ui attributes
- [ ] Every element has a unique `data-ui` attribute per the project convention
- [ ] Section: `fer-quicklinks-section`
- [ ] Container: `fer-quicklinks-container`
- [ ] Each card: `fer-quicklink-card-{path-slug}`
- [ ] Icons, labels, descriptions each have `data-ui`

### Task 5.2 — Check integration
- [ ] FerLanding renders without errors
- [ ] Navigation via quick links works (uses `wouter` `useLocation` navigate)
- [ ] No style leaks or conflicts with existing sections
- [ ] Section is visible on scroll (not hidden behind other elements)

### Task 5.3 — Verify against project conventions
- [ ] No `useState` in the component (use `useMemo` / `useCallback`)
- [ ] No TSX file exceeds 800 lines
- [ ] FER_COLORS used for all colors (no hardcoded hex)
- [ ] `loading="lazy"` on any images
- [ ] Tailwind classes, not inline styles for layout

---

## Files to Create/Modify

| File | Action | Reason |
|------|--------|--------|
| `ferweb/src/pages/fer/constants/constants.ts` | Modify | Add `icon`, `description`, `gradientColor` to `NAV_LINKS` |
| `ferweb/src/pages/fer/components/QuickLinksSection.tsx` | **Create** | New section component |
| `ferweb/src/pages/fer/FerLanding.tsx` | Modify | Import and mount `QuickLinksSection` |
| `ferweb/src/pages/fer/constants/index.ts` | Verify | Re-exports include new fields if needed |

---

## Execution Order

1. Phase 1 → Extend constants (no breaking changes to existing consumers)
2. Phase 2 → Build the component with all visual states
3. Phase 3 → Integrate into FerLanding
4. Phase 4 → Polish colors, animations, responsive
5. Phase 5 → QA pass

## Acceptance Criteria

- [ ] 8 quick link cards visible on the FER home page
- [ ] Each card has an icon, label, and short description
- [ ] Layout uses flexbox exclusively (zero grid classes)
- [ ] Responsive: 1 col mobile, 2 col tablet, 3-4 col desktop
- [ ] Hover states with subtle glow/border/lift effect
- [ ] Staggered scroll-in animation (reduced-motion safe)
- [ ] Dark theme matches FER design system (`FER_COLORS`)
- [ ] `data-ui` attributes on all interactive and container elements
- [ ] Zero ESLint/TypeScript errors

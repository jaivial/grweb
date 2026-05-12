# FER Web - Style Guide

Design system reference for the FER Powerlifting Day landing page.
Theme: **Silver/Mate Luxury Watch Brand Aesthetic** — dark background + mate silver + subtle shimmer.

---

## Color Palette

All colors defined in `src/pages/fer/constants/constants.ts`, mirrored in `tailwind.config.js` and `src/styles/globals.css`.

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `bgDark` | `#0B0F1A` | `fer-bg-dark` | Main background, form backgrounds |
| `bgCard` | `#161B26` | `fer-bg-card` | Card backgrounds, alternate section bg |
| `accent` | `#8B95A5` | `fer-accent` | Primary interactive color, buttons, icons |
| `glow` | `#CBD5E1` | `fer-glow` | Bright text highlights, hover states |
| `text` | `#F1F5F9` | `fer-text` | Primary body/heading text |
| `textMuted` | `#8494A7` | `fer-text-muted` | Secondary text, descriptions |
| `gold` | `#C9CDD4` | `fer-gold` | Premium accent, section title highlights |
| `purple` | `#7C8DA4` | `fer-purple` | Secondary accent, discipline colors |
| `silver` | `#A8B2C1` | `fer-silver` | Shimmer gradient endpoints |
| `shimmer` | `#E2E8F0` | `fer-shimmer` | Shimmer gradient bright point |
| `green` | `#10B981` | — | Success states, check icons |
| `red` | `#EF4444` | — | Error states |

### Opacity Patterns

Append hex alpha to color values (e.g., `${FER_COLORS.accent}20`):

| Alpha | Opacity | Usage |
|-------|---------|-------|
| `15` | ~8% | Icon background fills |
| `18` | ~9% | Badge backgrounds |
| `20` | ~12.5% | Border colors |
| `25` | ~14.5% | Card borders, chip borders |
| `30` | ~18.8% | Box-shadow glow |
| `35` | ~21% | Submit button shadow |
| `40` | ~25% | Hero CTA outer shadow |
| `50` | ~31% | Card borders, focus rings |

---

## Typography

### Font Families

| Token | Stack | Usage |
|-------|-------|-------|
| `font-display` | `"Syne", "Inter", system-ui, sans-serif` | Headings, logos, display text |
| `font-body` | `"Inter", system-ui, -apple-system, sans-serif` | Body text (default) |
| `font-accent` | `"Caveat", cursive` | Polaroid captions |

### Heading Patterns

**H1 (Hero):** `text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-black leading-none`

**H2 (Section):** `text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4`
- Highlight word: wrap in `<span>` with `FER_COLORS.gold` or `FER_COLORS.accent`

**H3 (Card):** `text-lg sm:text-xl font-display font-bold mb-2`

**Subtitle:** `text-base sm:text-lg` with `FER_COLORS.textMuted`

**Label/Chip:** `text-sm font-medium` or `text-sm font-semibold uppercase tracking-[0.3em]`

---

## Section Structure

### Standard Content Section

```tsx
<section
  id="fer-xxx"
  className="py-20 sm:py-28 px-4"
  style={{ backgroundColor: FER_COLORS.bgDark }}  // or bgCard for alternating
>
  <div className="max-w-6xl mx-auto">
    <motion.div className="text-center mb-14 sm:mb-16">
      <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4">
        ...
      </h2>
      <p className="text-base sm:text-lg" style={{ color: FER_COLORS.textMuted }}>
        ...
      </p>
    </motion.div>
    {/* Content */}
  </div>
</section>
```

### Layout Conventions

| Pattern | Value |
|---------|-------|
| Section padding | `py-20 sm:py-28 px-4` |
| Max-width (standard) | `max-w-6xl mx-auto` |
| Max-width (narrow/form) | `max-w-xl mx-auto` |
| Max-width (medium) | `max-w-4xl mx-auto` |
| Max-width (wide) | `max-w-5xl mx-auto` |
| Header margin | `mb-14 sm:mb-16` |
| Grid gap (cards) | `gap-5` |
| Grid gap (large) | `gap-10 lg:gap-16` |

### Background Alternation

Alternate between `bgDark` and `bgCard` for visual separation.

---

## Animations

### Framer Motion - WhileInView (Standard)

```tsx
const sectionVariants = useMemo(() => ({
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}), []);

<motion.div
  variants={sectionVariants}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: '-100px' }}
>
```

### Stagger Children

```tsx
const containerVariants = useMemo(() => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
}), []);
```

### Scroll-Driven

```tsx
const { scrollYProgress } = useScroll({
  target: containerRef,
  offset: ['start end', 'end start'],
});
const opacity = useTransform(scrollYProgress, [0.04, 0.12, 0.42, 0.52], [0, 1, 1, 0]);
```

### CSS Classes

- `.text-shimmer` — animated gradient text (3s infinite)
- `.bg-shimmer` — same for backgrounds
- `animate-spin`, `animate-pulse` — Tailwind built-ins

---

## Buttons

### Primary CTA

```
className="group relative px-10 sm:px-14 py-4 sm:py-5 text-base sm:text-lg font-bold rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95"
style={{
  backgroundColor: FER_COLORS.accent,
  color: FER_COLORS.text,
  boxShadow: `0 0 40px ${FER_COLORS.accent}40, 0 0 80px ${FER_COLORS.accent}20`,
}}
whileTap={{ scale: 0.97 }}
```

### Submit Button

```
className="w-full py-4 rounded-xl font-bold text-lg"
style={{
  backgroundColor: FER_COLORS.accent,
  color: FER_COLORS.text,
  boxShadow: `0 0 30px ${FER_COLORS.accent}35`,
}}
```

### Secondary/Outline

```
style={{
  backgroundColor: FER_COLORS.bgDark,
  color: FER_COLORS.text,
  border: `1px solid ${FER_COLORS.accent}20`,
}}
```

---

## Cards

### Standard Card

```
className="relative p-6 sm:p-7 rounded-2xl transition-shadow duration-300 hover:shadow-lg overflow-hidden"
style={{
  backgroundColor: FER_COLORS.bgDark,
  border: `1px solid ${FER_COLORS.accent}20`,
  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
}}
```

### Gradient Card

```
style={{
  background: `linear-gradient(135deg, ${FER_COLORS.bgCard} 0%, ${FER_COLORS.bgDark} 100%)`,
  border: `1px solid ${FER_COLORS.purple}20`,
}}
```

### Icon Container (inside cards)

```
className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-4 sm:mb-5"
style={{ backgroundColor: `${FER_COLORS.accent}15` }}
// Icon: size={26} style={{ color: FER_COLORS.accent }}
```

---

## Icons (lucide-react)

- Import individually: `import { Calendar, Clock } from 'lucide-react'`
- Inline with text: size 14-20px
- Card icons: size 26px in 48x48/56x56 containers
- Feature icons: responsive `w-10 h-10 sm:w-14 sm:h-14`
- Color: `FER_COLORS.accent` by default, `FER_COLORS.gold` for premium

---

## Visual Motifs

1. **Radial gradient glows** — Large circles at 3-12% opacity behind content
2. **Decorative underlines** — `h-1 rounded-full` with gradient fills
3. **Text shimmer** — `.text-shimmer` CSS class for gradient sweep on key words
4. **Canvas particles** — Circle/diamond/star particles in accent/gold palette
5. **Dot grid** — `radial-gradient(circle at 1px 1px, ...)` at 3% opacity
6. **Corner brackets** — L-shaped border elements with gold at 40%

---

## Component Conventions

- **PascalCase** filenames: `HorariosSection.tsx`
- **Named exports**: `export function ComponentName()`
- **`data-ui`** attribute on every element
- **`useMemo`** for all derived values
- **`useCallback`** for all handlers passed to children
- **`FER_COLORS`** constant for all colors (never raw hex in TSX)
- **`prefers-reduced-motion`** check for scroll animations
- Max **800 lines** per TSX file

---

## Responsive Breakpoints

Custom breakpoints (shifted smaller than Tailwind defaults):

| Name | Min-width |
|------|-----------|
| `xs` | 280px |
| `sm2` | 320px |
| `sm` | 480px |
| `md` | 540px |
| `lg` | 640px |
| `xl` | 768px |
| `2xl` | 992px |
| `3xl` | 1024px |

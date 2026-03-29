# Implementation Plan: Prices All Movements Section

## Objective

Create a new section called `PricesAllMovementsSection` with dark theme styling, spectrum-like angled images, and scroll-triggered animations following the established patterns from AthletesSection and WeightCategoriesSection.

## Files to Create/Modify

### 1. Create: `frontend/src/pages/home/components/PricesAllMovementsSection.tsx`

New component with:
- Dark theme (black background `#0a0a0a`)
- Logo above title (from provided URL)
- Title: "Premio para los mejores en cada movimiento"
- Three angled images (spectrum-like: left angled -6deg, center 0deg, right +6deg)
- Subtitle: "Demuestra quien manda en cada movimiento!"
- Movement labels: Sentadilla, Press de banca, Peso muerto
- Intersection Observer animations (per-element, fade-in only)
- Fade overlays on all 4 sides
- Red accent glows

### 2. Update: `frontend/src/pages/home/components/index.ts`

Add export:
```tsx
export { PricesAllMovementsSection } from './PricesAllMovementsSection';
```

### 3. Update: `frontend/src/pages/home/Home.tsx`

Add import and place section in the page layout (after WeightCategoriesSection or AthletesSection as appropriate).

## Image URLs

| Position | Movement | URL |
|----------|----------|-----|
| Logo | GR Cup Logo | `https://jaimedigitalstudio.b-cdn.net/grcup/logos/ChatGPT%20Image%2029%20mar%202026%2C%2018_16_29.png` |
| Left | Sentadilla | `https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2029%20mar%202026%2C%2021_55_55.png` |
| Center | Press de banca | `https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2023%20mar%202026%2C%2000_00_19.png` |
| Right | Peso muerto | `https://jaimedigitalstudio.b-cdn.net/grcup/atheltephotos/ChatGPT%20Image%2022%20mar%202026%2C%2023_51_04.png` |

## Implementation Tasks
## Implementation Tasks

- [x] Task 1. Create PricesAllMovementsSection.tsx with useScrollVisibility hook (same pattern as AthletesSection)
- [x] Task 2. Create AngledImage component with mask fade and rotation
- [x] Task 3. Implement section layout with logo, title, images, subtitle, and movement labels
- [x] Task 4. Add fade overlays and background glow effects
- [x] Task 5. Export from components/index.ts
- [x] Task 6. Import and add to Home.tsx
- [x] Task 7. Verify build compiles without errors

## Verification Criteria

- [x] [Criterion 1]: Section renders with black background
- [x] [Criterion 2]: Logo displays above title
- [x] [Criterion 3]: Three images display in row (desktop) or column (mobile)
- [x] [Criterion 4]: Images have correct rotations: left -6deg, center 0deg, right +6deg
- [x] [Criterion 5]: Movement labels display below images with red accent color
- [x] [Criterion 6]: Fade animations trigger on scroll (per-element, fade-in only)
- [x] [Criterion 7]: `prefers-reduced-motion` is respected
- [x] [Criterion 8]: Build compiles without errors
## Potential Risks

1. **Image loading**: Use `loading="lazy"` and `decoding="async"`
2. **Animation conflicts**: Each element has independent IntersectionObserver
3. **Responsive layout**: Grid adapts from 1 column (mobile) to 3 columns (tablet+)

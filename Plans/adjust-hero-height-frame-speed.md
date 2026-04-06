# Adjust Hero Container Height & Frame Speed — TODO

## Goal
- Reduce hero section height from `600vh` to `400vh`.
- Keep frame animation reaching 100% at the **same scroll position** (i.e., same absolute scroll distance from when hero enters viewport).
- Adjust frame animation threshold proportionally so frames feel the same speed relative to scroll.

## Changes

### 1. `frontend/src/pages/home/components/HeroSection.tsx`
- [ ] Line ~89: Change `style={{ height: '600vh' }}` → `style={{ height: '400vh' }}`

### 2. `frontend/src/utils/heroAnimationState.ts`
- [ ] Scale `FRAME_ANIMATION.end` threshold proportionally:
  - Current: `end: 1` (animation lasts 96% of scroll: 1 - 0.04 = 0.96)
  - Ratio: `400 / 600 = 0.667`
  - New: `end: 0.667` (frame animation starts at scroll progress 0.04, ends at 0.667 → same 0.627 absolute scroll distance)
- [ ] Optionally scale `CLOUDS_ENTER` thresholds proportionally to keep same relative behavior:
  - Current: `{ start: 0.85, end: 1.0 }`
  - New: `{ start: 0.85 * 0.667, end: 1.0 * 0.667 }` → `{ start: 0.567, end: 0.667 }`

## Verification
- [ ] With `400vh` height, frame progress should reach 100% at ~62.7% of total page scroll (same as before).
- [ ] Other phase thresholds (`TEXT_FADE_IN`, `TEXT_FADE_OUT`, `SMOKE_REVEAL`) remain unchanged — they are relative scroll progress thresholds, not absolute durations, so they don't need scaling.
- [ ] `useScrollProgress.ts` — no changes needed. It uses the section's actual DOM height (`rect.height`), so the progress formula is already correct.

# Hero Section with Scroll-Driven Animation Implementation Plan

## Objective

Implement a sophisticated hero section with scroll-driven animations, smoke effects, frame-by-frame animation, and a glassmorphism navbar. The hero section will use a fixed parallax scrolling technique with 400vh height, featuring text animations, smoke reveal effects, and frame-based trophy animation synchronized with scroll position.

---

## Implementation Plan

### Phase 1: Dependencies and Infrastructure Setup

- [ ] **Install react-smoke and peer dependencies**
  - Add `react-smoke`, `three`, and `@react-three/fiber` packages
  - These are required for the dark smoke overlay effect
  - Note: react-smoke uses React Three Fiber for WebGL rendering

- [ ] **Create trophy frames directory structure**
  - Verify/create `/home/jaime/projects/grweb/frontend/public/trophy/` directory
  - Ensure frames are named with zero-padded numbers (001.jpg, 002.jpg, etc.)
  - Document expected frame count and naming convention

- [ ] **Update Tailwind configuration for new animations**
  - Add custom animation keyframes for text fade in/out (800ms duration)
  - Add smoke reveal animation classes
  - Add glassmorphism utility classes
  - Configure custom timing functions for smooth transitions

### Phase 2: Core Hooks and Utilities

- [ ] **Create useIntersectionObserver hook**
  - Implement Intersection Observer API wrapper
  - Configure threshold at 0.02 (98% out of view trigger)
  - Return visibility state and intersection ratio
  - Support multiple callbacks for different threshold states
  - File location: `src/hooks/useIntersectionObserver.ts`

- [ ] **Create useScrollProgress hook**
  - Track scroll progress within a specific container/section
  - Return normalized progress value (0 to 1) across 400vh scroll
  - Support scroll direction detection
  - Optimize with requestAnimationFrame for performance
  - File location: `src/hooks/useScrollProgress.ts`

- [ ] **Create useFramePreloader hook**
  - Preload all trophy frames from `/trophy/` directory
  - Track loading progress and completion state
  - Store frames in array for quick access
  - Support both JPG and PNG formats
  - File location: `src/hooks/useFramePreloader.ts`

- [ ] **Create animation state machine utility**
  - Define animation phases: IDLE, TEXT_FADE_IN_1, TEXT_FADE_OUT_1, TEXT_FADE_IN_2, TEXT_FADE_OUT_2, SMOKE_REVEAL, FRAME_ANIMATION
  - Map scroll progress to animation phases
  - Calculate phase transitions based on scroll position
  - Return current phase and phase-specific progress
  - File location: `src/utils/heroAnimationState.ts`

### Phase 3: Smoke Effect Component

- [ ] **Create SmokeOverlay component**
  - Integrate react-smoke library with Canvas from @react-three/fiber
  - Configure dark smoke color (dark gray/black)
  - Implement opacity and position animations based on scroll progress
  - Create horizontal split animation (smoke moves to left and right sides)
  - Handle WebGL context and cleanup
  - File location: `src/components/effects/SmokeOverlay.tsx`

- [ ] **Create smoke animation controller**
  - Control smoke density based on animation phase
  - Implement smooth transition when smoke moves aside
  - Sync smoke movement with scroll position
  - Handle edge cases (fast scrolling, scroll direction changes)

### Phase 4: Text Animation Components

- [ ] **Create AnimatedText component**
  - Generic component for fade in/out text animations
  - Support configurable fade duration (800ms default)
  - Handle opacity transitions with CSS transitions
  - Support multiple text values with sequential display
  - File location: `src/components/animations/AnimatedText.tsx`

- [ ] **Create HeroTextSequence component**
  - Manage sequence: "Los ganadores" → "nunca se rinden"
  - Coordinate timing: 800ms delay, then fade in/out sequence
  - Map scroll progress to text visibility states
  - Style text with neon effects matching existing design
  - File location: `src/components/hero/HeroTextSequence.tsx`

### Phase 5: Frame Animation Component

- [ ] **Create FrameAnimator component**
  - Display trophy frames based on scroll progress
  - Use canvas element for optimal performance
  - Implement smooth frame interpolation
  - Handle frame loading states with fallback
  - Support responsive sizing
  - File location: `src/components/animations/FrameAnimator.tsx`

- [ ] **Create frame progress calculator**
  - Map scroll progress (after smoke reveal) to frame index
  - Calculate which frame to display at each scroll position
  - Handle edge cases (beginning/end of frame sequence)
  - Support variable frame rates (frames per scroll vh)

### Phase 6: Main Hero Section Component

- [ ] **Create HeroSection component structure**
  - Container with 400vh height for scroll space
  - Fixed positioning for content during scroll
  - Intersection Observer for fade-in trigger (98% threshold)
  - 500ms fade-in animation when entering viewport
  - File location: `src/pages/home/components/HeroSection.tsx` (update existing)

- [ ] **Implement parallax scroll container**
  - Fixed position content wrapper
  - Track scroll progress through 400vh space
  - Update animation state based on scroll position
  - Handle scroll position restoration on page reload

- [ ] **Integrate all hero sub-components**
  - Layer structure: Frame background → Smoke overlay → Text overlay
  - Coordinate animation timing between all elements
  - Ensure proper z-index layering
  - Handle component visibility based on animation phase

- [ ] **Implement animation phase orchestration**
  - Phase 1 (0-20% scroll): Initial delay and first text fade in
  - Phase 2 (20-40% scroll): First text fade out
  - Phase 3 (40-60% scroll): Second text fade in
  - Phase 4 (60-80% scroll): Second text fade out and smoke reveal
  - Phase 5 (80-100% scroll): Frame animation sequence
  - Ensure phases cannot be skipped (enforce sequence even with fast scrolling)

### Phase 7: Glassmorphism Navbar Component

- [ ] **Create Navbar component with glassmorphism styling**
  - Backdrop blur effect (backdrop-filter: blur)
  - Semi-transparent dark background
  - Horizontal margins (not full width)
  - 0.6rem border-radius
  - No border outline
  - Minimal design with logo/brand
  - File location: `src/components/layout/Navbar.tsx`

- [ ] **Implement navbar visibility logic**
  - Hidden when hero section is in view
  - Appears with fade-in when hero section is 98% out of viewport
  - Use Intersection Observer on hero section
  - Smooth transition animation (500ms fade in)
  - Fixed positioning at top of viewport

- [ ] **Add navbar content and navigation**
  - Logo/brand element
  - Navigation links (if needed)
  - Responsive design considerations
  - Z-index management for layering

### Phase 8: Test Section Component

- [ ] **Create TestSection component**
  - Height: 1000px
  - Dark background color (matching site theme)
  - Centered "GRS CUP" text
  - Styled to match overall design aesthetic
  - File location: `src/pages/home/components/TestSection.tsx`

- [ ] **Position test section below hero**
  - Ensure proper document flow after 400vh hero section
  - Verify navbar appears when scrolling into this section

### Phase 9: Integration and Page Assembly

- [ ] **Update Home page component**
  - Remove or replace existing HeroSection implementation
  - Add new HeroSection with all features
  - Add TestSection below hero
  - Ensure Navbar is positioned correctly
  - File location: `src/pages/home/Home.tsx` (update existing)

- [ ] **Update Layout component**
  - Conditionally render Navbar based on hero visibility
  - Pass visibility state from hero section
  - Ensure proper z-index stacking
  - File location: `src/layouts/Layout.tsx` (update existing)

- [ ] **Configure global styles for new components**
  - Add any additional CSS needed for animations
  - Ensure glassmorphism styles work across browsers
  - Add fallbacks for browsers without backdrop-filter support
  - File location: `src/styles/globals.css` (update existing)

### Phase 10: Performance Optimization

- [ ] **Optimize frame loading and rendering**
  - Implement progressive frame loading
  - Use requestAnimationFrame for scroll handlers
  - Debounce resize events
  - Consider lazy loading for below-fold content

- [ ] **Optimize smoke effect performance**
  - Configure appropriate particle density
  - Limit smoke area to visible viewport
  - Pause smoke animation when not visible
  - Consider reducing quality on mobile devices

- [ ] **Add loading states and error handling**
  - Show loading indicator while frames load
  - Handle frame loading errors gracefully
  - Provide fallback content if WebGL not supported
  - Handle smoke library initialization errors

### Phase 11: Testing and Refinement

- [ ] **Test scroll-driven animation sequence**
  - Verify all phases execute in correct order
  - Test fast scrolling behavior
  - Test scroll direction changes
  - Verify timing matches requirements (800ms delays/transitions)

- [ ] **Test intersection observer triggers**
  - Verify hero fade-in at 98% out of viewport
  - Verify navbar appears at correct time
  - Test on different screen sizes
  - Test with different scroll speeds

- [ ] **Cross-browser testing**
  - Test backdrop-filter support (Safari, Firefox, Chrome)
  - Test WebGL support for smoke effect
  - Verify smooth animations across browsers
  - Test on mobile devices

- [ ] **Accessibility considerations**
  - Ensure text is readable during animations
  - Provide reduced motion alternatives
  - Verify keyboard navigation works
  - Test with screen readers

---

## Verification Criteria

1. **Hero Section Structure**
   - [ ] Hero section has exactly 400vh height
   - [ ] Content uses fixed positioning during scroll
   - [ ] Fade-in animation (500ms) triggers when section is 98% out of viewport

2. **Text Animation Sequence**
   - [ ] "Los ganadores" fades in after 800ms delay (800ms duration)
   - [ ] "Los ganadores" fades out (800ms duration)
   - [ ] "nunca se rinden" fades in (800ms duration)
   - [ ] "nunca se rinden" fades out (800ms duration)
   - [ ] All text animations are scroll-driven, not time-driven

3. **Smoke Effect**
   - [ ] Dark smoke covers first frame initially
   - [ ] Smoke splits and moves to sides after text sequence
   - [ ] Smoke reveal is synchronized with scroll position
   - [ ] First frame is revealed after smoke moves aside

4. **Frame Animation**
   - [ ] Frame animation starts only after smoke reveal completes
   - [ ] Frames animate smoothly based on scroll progress
   - [ ] All frames from `/trophy/` directory are displayed
   - [ ] Frame rate is appropriate for smooth animation

5. **Navbar**
   - [ ] Glassmorphism styling (backdrop blur, semi-transparent)
   - [ ] Margins on left and right (not full width)
   - [ ] 0.6rem border-radius
   - [ ] No border outline
   - [ ] Appears when hero section is 98% out of viewport
   - [ ] 500ms fade-in animation

6. **Test Section**
   - [ ] 1000px height
   - [ ] Dark background
   - [ ] "GRS CUP" text visible
   - [ ] Positioned below hero section

7. **Performance**
   - [ ] Smooth 60fps animations
   - [ ] No frame drops during scroll
   - [ ] Efficient frame loading
   - [ ] Optimized smoke rendering

---

## Potential Risks and Mitigations

1. **Risk: react-smoke library compatibility with Preact**
   - **Mitigation**: Test react-smoke with Preact early; if incompatible, create custom smoke effect using CSS animations or canvas-based particle system

2. **Risk: Performance issues with frame animation and smoke simultaneously**
   - **Mitigation**: Disable smoke animation during frame sequence; use will-change CSS property; implement frame throttling

3. **Risk: Scroll-driven animations may feel jerky on slower devices**
   - **Mitigation**: Implement smooth interpolation; use CSS transforms for better performance; provide reduced quality mode

4. **Risk: WebGL not supported on all devices**
   - **Mitigation**: Provide CSS-based fallback for smoke effect; detect WebGL support and gracefully degrade

5. **Risk: Complex state management for animation phases**
   - **Mitigation**: Use finite state machine pattern; thoroughly test edge cases; add comprehensive logging for debugging

6. **Risk: Frame preloading may cause long initial load time**
   - **Mitigation**: Implement progressive loading; show loading indicator; preload critical frames first

7. **Risk: Intersection Observer timing may vary across browsers**
   - **Mitigation**: Test across multiple browsers; add fallback using scroll position if IO not supported; adjust threshold values

8. **Risk: Glassmorphism not supported in older browsers**
   - **Mitigation**: Provide solid color fallback; use @supports query for progressive enhancement

---

## Alternative Approaches

1. **Alternative: Custom smoke effect instead of react-smoke**
   - **Description**: Build custom particle-based smoke using canvas or CSS animations
   - **Trade-offs**: More control over animation but requires more development time; no dependency on Three.js

2. **Alternative: Time-based animations instead of scroll-driven**
   - **Description**: Use setTimeout/setInterval for text animations instead of scroll position
   - **Trade-offs**: Simpler implementation but less engaging user experience; doesn't meet requirement specification

3. **Alternative: Video instead of frame sequence**
   - **Description**: Use video element with scroll-based playback
   - **Trade-offs**: Smaller file size but less control over individual frames; may have compression artifacts

4. **Alternative: CSS-only parallax instead of fixed positioning**
   - **Description**: Use CSS transform3d for parallax effect
   - **Trade-offs**: Better performance but less precise control over animation timing

5. **Alternative: GSAP library for animations**
   - **Description**: Use GSAP ScrollTrigger for complex scroll animations
   - **Trade-offs**: More powerful animation tools but adds ~50KB to bundle; excellent scroll-driven animation support

---

## Technical Specifications

### Animation Timing (Scroll-Driven)

```
Scroll Progress | Animation Phase
----------------|------------------
0% - 5%         | Initial state, smoke visible
5% - 20%        | Text 1 fade in ("Los ganadores")
20% - 35%       | Text 1 fade out
35% - 50%       | Text 2 fade in ("nunca se rinden")
50% - 65%       | Text 2 fade out
65% - 80%       | Smoke reveal animation
80% - 100%      | Frame animation sequence
```

### Component Hierarchy

```
App
└── Layout
    ├── Navbar (conditionally visible)
    └── Home
        ├── HeroSection (400vh)
        │   ├── FrameAnimator (background)
        │   ├── SmokeOverlay (middle layer)
        │   └── HeroTextSequence (foreground)
        └── TestSection (1000px)
```

### File Structure

```
src/
├── components/
│   ├── animations/
│   │   ├── AnimatedText.tsx
│   │   └── FrameAnimator.tsx
│   ├── effects/
│   │   └── SmokeOverlay.tsx
│   ├── hero/
│   │   └── HeroTextSequence.tsx
│   └── layout/
│       └── Navbar.tsx
├── hooks/
│   ├── useIntersectionObserver.ts
│   ├── useScrollProgress.ts
│   └── useFramePreloader.ts
├── utils/
│   └── heroAnimationState.ts
└── pages/
    └── home/
        └── components/
            ├── HeroSection.tsx (update)
            └── TestSection.tsx
```

### Browser Support Requirements

- Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- WebGL support for smoke effect
- backdrop-filter support for glassmorphism
- Intersection Observer API
- requestAnimationFrame
- CSS transforms and transitions

---

## Dependencies to Install

```json
{
  "dependencies": {
    "react-smoke": "^1.0.0",
    "three": "^0.160.0",
    "@react-three/fiber": "^8.15.0"
  }
}
```

Note: Verify latest compatible versions with Preact before installation.

---

## Estimated Complexity

- **Difficulty**: High
- **Key Challenges**: 
  - Scroll-driven state machine
  - Smoke effect integration
  - Performance optimization
  - Animation timing coordination
- **Critical Path**: Smoke component → Animation state machine → Frame animator → Integration
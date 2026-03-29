# Lightning Effect Implementation Plan

## Objective

Replace the video background with a WebGL-based lightning effect behind the smoke during the text and smoke animation phases. The lightning effect should be dark red and visible throughout the text + smoke phases (0-50% of scroll progress), then hidden when the frame animation begins.

## Project Structure Summary

| Component | File | Current State |
|-----------|------|---------------|
| HeroSection | `frontend/src/pages/home/components/HeroSection.tsx` | Contains video background at z-0, smoke at z-10, text at z-20 |
| SmokeOverlay | `frontend/src/components/effects/SmokeOverlay.tsx` | Uses react-smoke with Three.js Canvas |
| Animation State | `frontend/src/utils/heroAnimationState.ts` | Manages 7 animation phases |

## Animation Phases (1200vh total)

| Phase | Progress | Description |
|-------|----------|-------------|
| IDLE | 0-3% | Initial state |
| TEXT_FADE_IN_1 | 3-12% | "Los ganadores" fades in |
| TEXT_FADE_OUT_1 | 12-21% | "Los ganadores" fades out |
| TEXT_FADE_IN_2 | 21-30% | "nunca se rinden" fades in |
| TEXT_FADE_OUT_2 | 30-39% | "nunca se rinden" fades out |
| SMOKE_REVEAL | 39-50% | Smoke splits and moves aside |
| FRAME_ANIMATION | 50-100% | Trophy frame animation |

## Implementation Plan

### Phase 1: Dependency Installation

- [ ] **Task 1.1**: Navigate to frontend directory and run `npx shadcn@latest add @react-bits/Lightning-TS-TW`
  - **Rationale**: Installs the Lightning component from the specified shadcn package
  - **Verification**: Check that the component is added to `components.json` and the package is in `package.json`

### Phase 2: Create Lightning Component

- [ ] **Task 2.1**: Create the Lightning component file at `frontend/src/components/effects/Lightning.tsx`
  - **Rationale**: Implements WebGL-based lightning effect using the shader from the feedback
  - **Implementation**: Use canvas with WebGL context, fragment shader for noise-based lightning, configurable hue for dark red color
  - **Props**: hue (default dark red ~0 or 350), xOffset, speed, intensity, size

- [ ] **Task 2.2**: Ensure WebGL shader compiles correctly
  - **Rationale**: The lightning effect relies on GLSL shaders for performance
  - **Include**: FBM noise, hash functions, HSV to RGB conversion, animated lightning bolts

### Phase 3: Integrate Lightning into HeroSection

- [ ] **Task 3.1**: Modify `HeroSection.tsx` to remove video background
  - **Rationale**: The video should be quit/removed as per requirements
  - **Action**: Remove the `<div>` containing the video element (lines 86-101)

- [ ] **Task 3.2**: Add Lightning component behind smoke layer
  - **Rationale**: Lightning should be visible as background during text + smoke phases
  - **Position**: Between FrameAnimator (z-0) and SmokeOverlay (z-10)
  - **z-index**: 5 (behind smoke at z-10)

- [ ] **Task 3.3**: Control Lightning visibility based on animation phase
  - **Rationale**: Lightning should only show during text + smoke phases (0-50%), hidden during frame animation
  - **Implementation**: Add `lightningOpacity` to animation state calculation or derive from `!frameAnimationActive`

- [ ] **Task 3.4**: Configure dark red lightning color
  - **Rationale**: User specified "dark red" for lightning color
  - **Hue value**: 0 or ~350 (red spectrum) - adjust for dark appearance
  - **May need**: Increase intensity slightly for visibility through smoke

### Phase 4: Verify Animation State Integration

- [ ] **Task 4.1**: Update `heroAnimationState.ts` if needed
  - **Rationale**: May need to export `isTextOrSmokePhase` helper function
  - **Current**: Existing helpers `isTextPhase()`, `isSmokePhase()` can be combined

### Phase 5: Cleanup and Testing

- [ ] **Task 5.1**: Remove debug console logs from Lightning component
  - **Rationale**: Clean production code

- [ ] **Task 5.2**: Test lightning effect in browser
  - **Rationale**: Verify WebGL renders correctly, color is dark red, effect is behind smoke

- [ ] **Task 5.3**: Verify lightning visibility during all text + smoke phases
  - **Rationale**: Test scrolling through 0-50% progress range

## Verification Criteria

1. **Video Removed**: Video element no longer exists in HeroSection
2. **Lightning Visible**: Dark red lightning effect appears behind smoke during scroll 0-50%
3. **Lightning Hidden**: Lightning effect disappears when frame animation starts (50%+)
4. **Color Correct**: Lightning appears dark red (not bright red or orange)
5. **Performance**: No console errors, smooth 60fps animation
6. **Integration**: Lightning properly positioned behind smoke (z-index 5 < smoke z-index 10)

## Potential Risks and Mitigations

1. **WebGL Not Supported**
   - **Risk**: Browser doesn't support WebGL
   - **Mitigation**: Add fallback with console warning, CSS gradient background

2. **Shadcn Package Not Found**
   - **Risk**: Package `@react-bits/Lightning-TS-TW` doesn't exist or has different name
   - **Mitigation**: Create component manually based on provided code, verify package name

3. **Shader Compilation Errors**
   - **Risk**: GLSL shader has syntax errors
   - **Mitigation**: Test shader in isolation, use WebGL error logging

4. **Lightning Visibility Through Smoke**
   - **Risk**: Dark red lightning may not be visible through gray smoke
   - **Mitigation**: Adjust lightning intensity, hue, or smoke opacity as needed

## Alternative Approaches

1. **Canvas 2D Lightning**: Use 2D canvas instead of WebGL
   - **Trade-off**: Less performant for complex noise, simpler implementation

2. **CSS Lightning Effect**: Pure CSS with gradients and animations
   - **Trade-off**: Limited visual complexity, no noise-based effects

3. **Three.js Lightning**: Use Three.js like smoke effect
   - **Trade-off**: Consistent with existing smoke implementation, more dependencies

## Technical Notes

- The Lightning component uses WebGL with fragment shaders for real-time noise-based lightning generation
- FBM (Fractal Brownian Motion) provides organic, flickering lightning appearance
- HSV to RGB conversion allows easy hue adjustment for dark red color
- Canvas resizes with window to maintain full-screen coverage

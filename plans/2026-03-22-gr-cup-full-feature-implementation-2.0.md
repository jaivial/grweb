# GR Cup Raffle - Full Feature Implementation Plan

## Objective

Complete the GR Cup Raffle application with all features including scroll-driven video frame animations, following the Ciridae-inspired design aesthetic, to achieve a production-ready, premium raffle experience.

## Current State Analysis

**Completed (65%)**:
- ✅ Backend API (100%): All services, endpoints, SignalR, database
- ✅ Frontend Infrastructure (100%): API client, stores, hooks, protected routes
- ✅ Documentation (100%): README, status docs, implementation plan

**Remaining (35%)**:
- ⏳ Frontend Pages (7 pages)
- ⏳ Animation System (scroll-driven video frames)
- ⏳ Polish & SEO (animations, meta tags)

## Implementation Phases

### Phase 1: Core Frontend Pages (Days 1-2)

#### Day 1 Morning: Essential User Flow

- [ ] **Task 1.1: Build Checkout Page** (frontend/src/pages/Checkout.tsx)
  - Create ticket quantity selector with +/- buttons (min 1, max 100)
  - Add form fields: First Name, Surname, Instagram @username, Email
  - Implement Instagram follow confirmation checkbox (required)
  - Add real-time price calculation display (0.50€ × quantity)
  - Create "Pay Now" button that calls `api.buyTickets()`
  - Handle loading state during API call
  - Redirect to Stripe Checkout URL on success
  - Add error handling and user feedback
  - Style with Tailwind: dark background, neon accents, glow effects on focus
  - **Rationale**: This is the critical conversion point - must work perfectly for payments

- [ ] **Task 1.2: Build Success Page** (frontend/src/pages/Success.tsx)
  - Display payment confirmation message with confetti animation
  - Show ticket count and total paid
  - Display participant details summary (name, email, Instagram)
  - Add "Share on Instagram" button with pre-filled story template
  - Add "Return to Home" link
  - Trigger SignalR participant count update
  - **Rationale**: Confirms successful transaction and encourages social sharing

#### Day 1 Afternoon: Admin Authentication

- [ ] **Task 1.3: Build Admin Login Page** (frontend/src/admin/pages/Login.tsx)
  - Create centered login form with dark theme
  - Add username input field with icon
  - Add password input field with show/hide toggle
  - Implement form validation (both fields required)
  - Call `login()` from auth store on submit
  - Show error messages for failed login
  - Redirect to `/admin/dashboard` on success
  - Add "Remember me" checkbox (localStorage persistence)
  - Style with neon glow effects on focus
  - **Rationale**: Secure entry point to admin panel

- [ ] **Task 1.4: Update Admin Routes** (frontend/src/app.tsx)
  - Wrap admin routes with ProtectedRoute component
  - Add logout functionality to Navbar
  - Handle token expiration gracefully
  - **Rationale**: Ensures admin routes are properly protected

#### Day 2 Morning: Admin Dashboard

- [ ] **Task 1.5: Build Admin Dashboard** (frontend/src/admin/pages/Dashboard.tsx)
  - Create 3 KPI cards in responsive grid:
    - Total Participants (big number with icon)
    - Total Tickets Sold (big number with icon)
    - Total Revenue (big number with € symbol)
  - Fetch statistics on mount using `api.getStatistics(token)`
  - Connect to SignalR for real-time updates
  - Add recent activity feed (last 10 ticket purchases)
  - Add quick action buttons: "View Participants", "Draw Winner"
  - Implement loading skeleton states
  - Add error boundary for failed data fetches
  - **Rationale**: Provides at-a-glance business metrics

#### Day 2 Afternoon: Participant Management

- [ ] **Task 1.6: Build Admin Participants Page** (frontend/src/admin/pages/Participants.tsx)
  - Create Material Design-inspired data table with Tailwind
  - Add columns: Name, Surname, Email, Instagram, Tickets, Total Paid, Date
  - Implement server-side pagination (10 per page)
  - Add pagination controls (Previous, Next, Page X of Y)
  - Add search input with 300ms debounce
  - Call `api.getParticipants(token, page, search)` on search/page change
  - Add "Export to CSV" button that calls `api.exportCsv(token)`
  - Implement loading states (skeleton rows)
  - Add empty state design when no participants
  - Make table responsive (horizontal scroll on mobile)
  - **Rationale**: Enables efficient participant management at scale

#### Day 2 Evening: Winner Draw

- [ ] **Task 1.7: Build Admin Draw Winner Page** (frontend/src/admin/pages/DrawWinner.tsx)
  - Create large prominent "Randomly Select Winner" button with neon glow
  - Add confirmation modal: "Are you sure? This will select a random winner."
  - On confirm, call `api.drawWinner(token)`
  - Display winner card with confetti animation:
    - Winner name and Instagram handle
    - Number of tickets purchased
    - Total amount paid
  - Add "Confirm Winner" and "Re-Draw" buttons
  - On confirm, call `api.confirmWinner(token, drawId)`
  - Show draw history table (Date, Winner, Status)
  - Add "Void" button for each draw in history
  - Connect to SignalR to broadcast winner announcement
  - **Rationale**: Provides controlled, fair winner selection with audit trail

### Phase 2: Animation System (Days 3-4)

#### Day 3: Core Animation Infrastructure

- [ ] **Task 2.1: Create Frame Preloader** (frontend/src/utils/FramePreloader.ts)
  - Create class to manage frame loading
  - Implement progressive loading strategy (visible section first)
  - Add priority queue system for loading order
  - Implement LRU cache with 200-frame limit
  - Add loading state tracking per section
  - Implement error handling for failed frame loads
  - Add fallback to static image on load failure
  - Optimize for mobile (reduce concurrent loads)
  - **Rationale**: Ensures smooth playback without visible loading delays

- [ ] **Task 2.2: Create Scroll Progress Tracker** (frontend/src/hooks/useScrollProgress.ts)
  - Create hook that tracks scroll position within a section
  - Use Intersection Observer to detect section visibility
  - Calculate progress (0-1) based on scroll position
  - Implement throttling (16ms / 60fps) for performance
  - Map progress to frame number: `frame = Math.floor(progress * totalFrames)`
  - Handle edge cases (section not visible, rapid scrolling)
  - Add smooth interpolation between frames
  - Support both vertical and horizontal scroll (future-proof)
  - **Rationale**: Maps scroll position to frame numbers accurately

- [ ] **Task 2.3: Create Canvas Frame Renderer** (frontend/src/components/ScrollVideo.tsx)
  - Create component using HTML Canvas for rendering
  - Implement double-buffering to prevent flicker
  - Use requestAnimationFrame for smooth updates
  - Handle device pixel ratio for crisp rendering on high-DPI
  - Implement frame interpolation logic
  - Add opacity transitions between frame changes
  - Optimize canvas size based on container dimensions
  - Support both fixed and absolute positioning
  - **Rationale**: Provides 60fps frame playback performance

- [ ] **Task 2.4: Create Parallax Layer Component** (frontend/src/components/ParallaxLayer.tsx)
  - Create component with configurable scroll speed multiplier
  - Use CSS transforms for GPU acceleration
  - Support multiple layers with different speeds
  - Implement z-index management
  - Add smooth transitions on scroll
  - Support text, images, and other content
  - Make configurable: speed, direction, offset
  - **Rationale**: Adds depth and visual interest without performance cost

#### Day 4: Section Implementations

- [ ] **Task 2.5: Build Hero Section** (frontend/src/components/sections/HeroSection.tsx)
  - Create full-screen section with 60 frames from `/frames/hero/`
  - Add large animated event title "GR CUP 2026" with glow effect
  - Display live participant counter with countUp animation
  - Add "Enter Now" CTA button with hover scale + neon glow
  - Include scroll indicator at bottom with bounce animation
  - Add parallax layers: title (speed: 0.3), counter (speed: 0.5), CTA (speed: 0.7)
  - Ensure smooth 60fps playback on desktop
  - Optimize for 30fps minimum on mobile
  - **Rationale**: Creates immediate visual impact and communicates event

- [ ] **Task 2.6: Build Rules Section** (frontend/src/components/sections/RulesSection.tsx)
  - Create full-screen section with 50 frames from `/frames/rules/`
  - Display pricing information: "0.50€ per ticket"
  - Add bullet points with staggered fade-in animations:
    - "Buy as many tickets as you want"
    - "Winner drawn randomly from all participants"
    - "More tickets = higher chance to win"
  - Include eligibility requirements with icons
  - Add subtle divider line separating from next section
  - Implement parallax text layers
  - **Rationale**: Clearly communicates raffle rules to avoid disputes

- [ ] **Task 2.7: Build How to Enter Section** (frontend/src/components/sections/HowToEnterSection.tsx)
  - Create full-screen section with 40 frames from `/frames/how-to-enter/`
  - Display numbered steps with large animated numbers (1, 2, 3, 4)
  - Step 1: "Click 'Enter Now' button"
  - Step 2: "Fill in your details"
  - Step 3: "Complete payment via Stripe"
  - Step 4: "You're entered! Winner drawn randomly"
  - Each step fades in as user scrolls
  - Add icons for each step
  - Include parallax effect on step numbers
  - **Rationale**: Reduces friction by providing clear instructions

- [ ] **Task 2.8: Build Winners Section** (frontend/src/components/sections/WinnersSection.tsx)
  - Create full-screen section with 30 frames from `/frames/winners/`
  - If past winners exist: display with confetti animation
  - If no winners yet: show "Be the first GR Cup champion!" message
  - Add final prominent CTA button "Get Your Tickets Now"
  - Include countdown timer to draw date (optional)
  - Add footer with legal links and social media
  - Implement parallax layers for depth
  - **Rationale**: Creates urgency and provides final conversion opportunity

- [ ] **Task 2.9: Integrate Sections into Home Page** (frontend/src/pages/Home.tsx)
  - Import all 4 section components
  - Stack sections vertically with full-screen height
  - Initialize SignalR connection for live counter
  - Fetch initial participant count on mount
  - Add smooth scroll behavior between sections
  - Implement scroll restoration on page reload
  - Test animation performance across all sections
  - **Rationale**: Combines all sections into cohesive home page experience

### Phase 3: Polish & Optimization (Day 5)

#### Day 5 Morning: Micro-Interactions

- [ ] **Task 3.1: Add Button Animations**
  - Implement hover scale effect (scale: 1.05)
  - Add neon glow on hover (box-shadow animation)
  - Add active press effect (scale: 0.95)
  - Create smooth transitions (300ms ease-out)
  - Apply to all buttons site-wide
  - **Rationale**: Provides tactile feedback and premium feel

- [ ] **Task 3.2: Add Form Field Animations**
  - Add neon border glow on focus
  - Implement label float animation
  - Add subtle shake animation on validation error
  - Create smooth color transitions
  - Style placeholder text with opacity
  - **Rationale**: Improves form UX and visual polish

- [ ] **Task 3.3: Add Counter Animations**
  - Implement countUp animation for numbers
  - Add easing function for natural feel
  - Animate on scroll into view
  - Add subtle bounce effect on completion
  - **Rationale**: Makes statistics more engaging

- [ ] **Task 3.4: Add Loading States**
  - Create skeleton loaders for data fetching
  - Add pulsing animation to skeletons
  - Implement loading spinners with neon colors
  - Add fade-in transition when data loads
  - **Rationale**: Provides visual feedback during async operations

- [ ] **Task 3.5: Add Toast Notifications**
  - Create toast component for success/error messages
  - Add slide-in animation from top-right
  - Implement auto-dismiss after 5 seconds
  - Add manual dismiss button
  - Support multiple toasts stacking
  - **Rationale**: Provides non-intrusive user feedback

#### Day 5 Afternoon: SEO & Meta Tags

- [ ] **Task 3.6: Add Open Graph Tags** (frontend/index.html)
  - Add og:title: "GR Cup 2026 - Powerlifting Championship Raffle"
  - Add og:description: Compelling 155-character description
  - Add og:image: Event banner image URL
  - Add og:url: Production URL
  - Add og:type: "website"
  - Add og:site_name: "GR Cup"
  - **Rationale**: Enables rich social media sharing

- [ ] **Task 3.7: Add Twitter Card Tags** (frontend/index.html)
  - Add twitter:card: "summary_large_image"
  - Add twitter:title: Same as og:title
  - Add twitter:description: Same as og:description
  - Add twitter:image: Same as og:image
  - Add twitter:site: "@grstrength" (if available)
  - **Rationale**: Optimizes Twitter sharing experience

- [ ] **Task 3.8: Add JSON-LD Structured Data** (frontend/index.html)
  - Add Event schema with raffle details
  - Add Organization schema for GR Strength
  - Include dates, location, pricing
  - Validate with Google Rich Results Test
  - **Rationale**: Enables rich search results

- [ ] **Task 3.9: Add Dynamic Meta Tags** (frontend/src/components/SEO.tsx)
  - Create component for dynamic page titles
  - Update document.title on route change
  - Add canonical URL for each page
  - Add meta description dynamically
  - **Rationale**: Improves SEO across all pages

#### Day 5 Evening: Final Testing & Optimization

- [ ] **Task 3.10: Performance Optimization**
  - Run Lighthouse audit
  - Optimize images (WebP conversion, compression)
  - Implement lazy loading for below-fold content
  - Add preload hints for critical assets
  - Minimize main thread blocking
  - Target: 90+ Lighthouse score
  - **Rationale**: Ensures fast load times and good UX

- [ ] **Task 3.11: Cross-Browser Testing**
  - Test on Chrome 90+
  - Test on Firefox 88+
  - Test on Safari 14+
  - Test on Edge 90+
  - Fix any browser-specific issues
  - **Rationale**: Ensures broad compatibility

- [ ] **Task 3.12: Mobile Testing**
  - Test on iPhone (Safari)
  - Test on Android (Chrome)
  - Test on iPad (Safari)
  - Verify touch interactions
  - Check animation performance on mobile
  - Test responsive breakpoints
  - **Rationale**: Ensures mobile experience is excellent

- [ ] **Task 3.13: End-to-End Testing**
  - Test complete purchase flow
  - Test admin login and all admin features
  - Test winner draw workflow
  - Test real-time updates across tabs
  - Test error scenarios
  - **Rationale**: Validates complete user journeys

### Phase 4: Deployment Preparation (Day 6 Morning)

- [ ] **Task 4.1: Environment Configuration**
  - Create .env.example files for backend and frontend
  - Document all required environment variables
  - Set up production environment variables
  - Configure Stripe for live mode
  - **Rationale**: Ensures smooth deployment

- [ ] **Task 4.2: Build & Deploy Frontend**
  - Run `npm run build` in frontend
  - Test production build locally
  - Deploy dist/ folder to Vercel/Netlify
  - Set environment variables in dashboard
  - Verify deployment works
  - **Rationale**: Makes frontend accessible publicly

- [ ] **Task 4.3: Deploy Backend**
  - Create Dockerfile for backend
  - Deploy to Railway/Render
  - Configure production MySQL database
  - Run migrations on production database
  - Set environment variables
  - Configure Stripe webhook URL in Stripe Dashboard
  - Verify API endpoints work
  - **Rationale**: Makes backend accessible publicly

- [ ] **Task 4.4: Production Verification**
  - Test complete flow on production URLs
  - Verify Stripe payments work in live mode
  - Test webhook delivery
  - Check real-time updates
  - Monitor error logs
  - **Rationale**: Ensures production deployment is successful

## Verification Criteria

### Functional Requirements
- [ ] User can view all 4 animated sections with smooth 60fps playback
- [ ] Live participant counter updates in real-time across multiple tabs
- [ ] User can purchase tickets via Stripe Checkout successfully
- [ ] User receives confirmation on success page with social sharing
- [ ] Admin can log in with username/password
- [ ] Admin can view dashboard with accurate real-time KPIs
- [ ] Admin can search and paginate through participants
- [ ] Admin can export participants to CSV
- [ ] Admin can draw random winner with confirmation workflow
- [ ] Admin can view draw history and void draws
- [ ] All animations work smoothly on desktop and mobile

### Performance Requirements
- [ ] Page load time < 3 seconds on 4G
- [ ] Scroll animations maintain 60fps on desktop
- [ ] Scroll animations maintain 30fps minimum on mobile
- [ ] API response time < 200ms (p95)
- [ ] Frame preloading doesn't block main thread
- [ ] Canvas rendering uses GPU acceleration
- [ ] Lighthouse score 90+

### Design Requirements
- [ ] Matches Ciridae-inspired aesthetic
- [ ] Dark theme with neon accents (#00f0ff, #ff5e00)
- [ ] Bold typography with generous spacing
- [ ] Full-screen sections with smooth transitions
- [ ] Oversized CTA buttons with hover effects
- [ ] Mobile-first responsive design
- [ ] Smooth scroll animations throughout

### Security Requirements
- [ ] Admin routes protected with JWT validation
- [ ] SQL injection prevented via EF Core
- [ ] XSS prevented via React automatic escaping
- [ ] Stripe webhook signature verified
- [ ] Environment variables used for secrets
- [ ] HTTPS enforced in production

### Browser Compatibility
- [ ] Chrome 90+ (desktop and mobile)
- [ ] Firefox 88+
- [ ] Safari 14+ (desktop and iOS)
- [ ] Edge 90+

## Potential Risks and Mitigations

### 1. **Animation Performance on Low-End Mobile Devices**
**Risk**: 180 total frames may cause memory issues and jank on budget phones.
**Mitigation**:
- Implement adaptive quality: detect device capability and reduce frame count
- Use Intersection Observer to only load frames when section is near viewport
- Provide static image fallback for devices with < 4GB RAM
- Test on low-end Android devices early

### 2. **Frame Preloading Bandwidth Consumption**
**Risk**: Loading 180 frames could consume 50-100MB+ of bandwidth.
**Mitigation**:
- Use WebP format for 30% smaller file size vs JPEG
- Implement progressive loading: hero first, others on-demand
- Add bandwidth detection using Network Information API
- Consider offering "low bandwidth mode" in settings

### 3. **Scroll Animation Timing Issues**
**Risk**: Frame scrubbing may feel jerky or out of sync with scroll.
**Mitigation**:
- Use requestAnimationFrame for smooth updates
- Implement frame interpolation with easing
- Add 100ms buffer zone at section boundaries
- Test with various scroll speeds (slow, medium, fast)

### 4. **Stripe Webhook Delivery Failures**
**Risk**: Webhook failures could result in lost participant records.
**Mitigation**:
- Implement idempotent webhook processing
- Log all webhook events for manual reconciliation
- Create admin tool to manually process Stripe session IDs
- Set up Stripe webhook monitoring and alerts

### 5. **Real-Time Update Scalability**
**Risk**: SignalR may struggle with thousands of concurrent connections.
**Mitigation**:
- Implement connection throttling if needed
- Consider Redis backplane for multi-instance deployments
- Monitor connection count and server resources
- Have fallback to polling if SignalR fails

### 6. **Database Performance with Large Participant Count**
**Risk**: Weighted random selection becomes slow with 100K+ participants.
**Mitigation**:
- Test with large dataset early
- Consider alternative algorithm: reservoir sampling
- Add database indexes on frequently queried columns
- Cache participant count in Redis if needed

### 7. **Mobile Scroll Event Throttling**
**Risk**: Mobile browsers throttle scroll events, causing choppy animations.
**Mitigation**:
- Use Intersection Observer instead of scroll events where possible
- Implement touch event handlers for direct manipulation
- Use CSS transforms for GPU acceleration
- Test extensively on actual mobile devices

### 8. **Cross-Browser Canvas Rendering**
**Risk**: Canvas rendering may behave differently across browsers.
**Mitigation**:
- Test on all target browsers early
- Use feature detection for advanced canvas features
- Implement fallbacks for unsupported features
- Keep canvas operations simple and standard

## Alternative Approaches

### Alternative 1: Use Video Instead of Image Sequences
**Description**: Use actual video files instead of image sequences.
**Trade-offs**:
- ✅ Smaller file size
- ✅ Simpler implementation
- ❌ Less precise frame control
- ❌ Browser codec support varies
- ❌ Harder to achieve frame-perfect scrubbing
**Recommendation**: Stick with image sequences for precise control requirement

### Alternative 2: Use WebGL Instead of Canvas
**Description**: Use WebGL for rendering frames with shader effects.
**Trade-offs**:
- ✅ More powerful rendering capabilities
- ✅ Can add visual effects (blur, color grading)
- ❌ More complex implementation
- ❌ Harder to debug
- ❌ May be overkill for simple frame display
**Recommendation**: Use Canvas for simplicity; consider WebGL for future enhancements

### Alternative 3: Server-Sent Events Instead of SignalR
**Description**: Use SSE (EventSource) instead of SignalR.
**Trade-offs**:
- ✅ Simpler server implementation
- ✅ Native browser API
- ❌ Unidirectional only
- ❌ No automatic reconnection
- ❌ Less mature ecosystem
**Recommendation**: Keep SignalR for bidirectional communication and reconnection handling

### Alternative 4: Use CSS Scroll-Driven Animations
**Description**: Use new CSS scroll-driven animations API instead of JavaScript.
**Trade-offs**:
- ✅ Native browser support
- ✅ Better performance
- ❌ Limited browser support (Chrome only as of 2024)
- ❌ Less control over animation timing
**Recommendation**: Use JavaScript approach for broad browser support; consider CSS for progressive enhancement

## Implementation Priority Order

### Week 1 (Days 1-2): Core Functionality
1. Checkout page with Stripe integration
2. Success page with confirmation
3. Admin login
4. Admin dashboard with KPIs
5. Participants management page
6. Draw winner page
7. Basic Home page (static, no animations)

**Milestone**: Fully functional raffle application

### Week 2 (Days 3-4): Animation System
8. Frame preloader utility
9. Scroll progress tracker hook
10. Canvas frame renderer component
11. Parallax layer component
12. Hero section implementation
13. Rules section implementation
14. How to Enter section implementation
15. Winners section implementation
16. Integrate all sections into Home page

**Milestone**: Premium animated experience

### Week 2 (Day 5): Polish & Deploy
17. Button hover animations
18. Form field animations
19. Counter animations
20. Loading states
21. Toast notifications
22. Open Graph tags
23. Twitter Card tags
24. JSON-LD structured data
25. Performance optimization
26. Cross-browser testing
27. Mobile testing
28. End-to-end testing

**Milestone**: Production-ready application

### Week 2 (Day 6): Deployment
29. Environment configuration
30. Frontend deployment
31. Backend deployment
32. Production verification

**Milestone**: Live application

## Success Metrics

### Technical Metrics
- Page load time < 3 seconds
- Animation frame rate ≥ 60fps on desktop, ≥ 30fps on mobile
- API response time < 200ms (p95)
- Zero security vulnerabilities in dependency scan
- Lighthouse score ≥ 90

### Business Metrics
- Checkout completion rate > 80%
- Admin task completion time < 30 seconds for common operations
- Zero payment processing errors
- 100% uptime during raffle period
- Positive user feedback on animations

### User Experience Metrics
- Smooth scroll animations without jank
- Intuitive navigation
- Clear call-to-actions
- Fast feedback on user actions
- Accessible on all devices

## Conclusion

This implementation plan provides a detailed roadmap for completing the GR Cup Raffle application with all features. The backend is production-ready, and the frontend infrastructure is solid. The remaining work focuses on:

1. **Building 7 frontend pages** (2 days)
2. **Implementing scroll-driven animation system** (2 days)
3. **Adding polish and SEO** (1 day)
4. **Deploying to production** (0.5 days)

**Total estimated time**: 5.5 days

By following this plan systematically and addressing risks proactively, the team can deliver a premium, production-ready raffle application that provides an engaging user experience while maintaining security and reliability.

**Next Step**: Begin Phase 1, Task 1.1 (Build Checkout Page) to start the implementation.
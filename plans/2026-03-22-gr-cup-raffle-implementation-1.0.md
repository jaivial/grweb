# GR Cup Raffle Application - Complete Implementation Plan

## Executive Summary

This plan outlines the complete implementation of a production-ready raffle application for the GR Cup powerlifting championship. The project has a solid architectural foundation with backend infrastructure (ASP.NET Core 8, MySQL, SignalR) and frontend scaffolding (Preact, TypeScript, Vite, Tailwind) already in place. The implementation will focus on building all business logic, UI components, payment integration, and the unique scroll-driven video frame animation system.

## Project Structure Analysis

### Current State
- **Backend**: Infrastructure complete with models, DbContext, JWT auth, SignalR hub, and Stripe package installed. All API endpoints and service implementations are placeholder/stub code.
- **Frontend**: Project scaffolding complete with routing, Tailwind theme, and responsive Navbar. All page components are placeholder headings only.
- **Database**: Models defined but no migrations generated.

### Design Reference (Ciridae.com)
- Modern minimalist aesthetic with dark backgrounds
- Bold sans-serif typography with generous spacing
- Full-screen sections with subtle dividers
- Neon accent colors (electric blue #00f0ff, orange #ff5e00)
- Oversized CTA buttons with hover effects
- Smooth scroll animations throughout

---

## Implementation Phases

### Phase 1: Database Foundation & Backend Core Services

#### 1.1 Database Setup
- [ ] Generate Entity Framework Core initial migration for Participants and Draws tables
- [ ] Create database update script for production deployment
- [ ] Add seed data method for admin user (optional, can be hardcoded)
- [ ] Verify unique constraints on Participant.Email field
- [ ] Test database connection and migration rollback procedures

**Rationale**: Database migrations must be in place before any data operations can occur. This establishes the data layer foundation.

#### 1.2 Service Layer Implementation
- [ ] Implement `ParticipantService` with methods: CreateAsync, UpdateAsync, GetByEmailAsync, GetAllPaginatedAsync, GetCountAsync, IncrementTicketsAsync
- [ ] Implement `JwtService` with methods: GenerateToken, ValidateToken, GetClaimsPrincipal
- [ ] Create `StripeService` with methods: CreateCheckoutSession, ConstructEvent, GetSessionAsync
- [ ] Create `DrawService` with methods: SelectRandomWinnerAsync, ConfirmWinnerAsync, GetDrawHistoryAsync
- [ ] Register all services in Program.cs dependency injection container

**Rationale**: Service layer encapsulates business logic and separates concerns from API endpoints, making code testable and maintainable.

#### 1.3 SignalR Hub Implementation
- [ ] Implement `ParticipantsHub` with methods for broadcasting participant count updates
- [ ] Add connection management (OnConnectedAsync, OnDisconnectedAsync)
- [ ] Create client-side event handlers for receiving updates
- [ ] Implement authenticated hub connections using JWT from query string
- [ ] Add error handling and reconnection logic

**Rationale**: SignalR enables real-time participant counter updates without polling, providing a seamless user experience.

---

### Phase 2: Backend API Endpoints

#### 2.1 Public API Endpoints
- [ ] `POST /api/tickets/buy` - Create Stripe checkout session and provisional participant record
- [ ] `GET /api/participants/count` - Return total unique participant count
- [ ] `POST /api/webhooks/stripe` - Handle Stripe webhook events (checkout.session.completed)
- [ ] `GET /api/health` - Health check endpoint for monitoring

**Rationale**: Public endpoints handle the core raffle functionality: ticket purchases and live statistics.

#### 2.2 Admin Authentication Endpoints
- [ ] `POST /api/admin/login` - Validate credentials and return JWT token
- [ ] `GET /api/admin/verify` - Validate existing token and return user info
- [ ] `POST /api/admin/logout` - Optional token invalidation (if implementing token blacklist)

**Rationale**: Admin panel requires secure authentication before accessing sensitive operations.

#### 2.3 Admin Management Endpoints
- [ ] `GET /api/admin/participants` - Paginated list with search/filter (name, email, Instagram)
- [ ] `GET /api/admin/participants/{id}` - Single participant details
- [ ] `GET /api/admin/export/csv` - Export all participants to CSV format
- [ ] `GET /api/admin/statistics` - Dashboard KPIs (total participants, tickets, revenue)

**Rationale**: Admin needs comprehensive participant management capabilities with efficient data retrieval.

#### 2.4 Winner Draw Endpoints
- [ ] `POST /api/admin/draw` - Execute random winner selection (SQL ORDER BY RAND() LIMIT 1)
- [ ] `POST /api/admin/draw/{id}/confirm` - Mark draw as confirmed winner
- [ ] `GET /api/admin/draws` - History of all draws with winner details
- [ ] `DELETE /api/admin/draw/{id}` - Void a draw (allow re-draw)

**Rationale**: Structured draw workflow prevents errors and maintains audit trail of all winner selections.

---

### Phase 3: Frontend Core Infrastructure

#### 3.1 API Client & State Management
- [ ] Create `apiClient.ts` with base fetch wrapper, error handling, and auth header injection
- [ ] Create `authStore.ts` using Preact signals for authentication state management
- [ ] Create `participantStore.ts` for participant counter state
- [ ] Implement SignalR connection manager with automatic reconnection
- [ ] Create utility functions: formatCurrency, formatDate, validateEmail, validateInstagramHandle

**Rationale**: Centralized API and state management prevents code duplication and ensures consistent behavior.

#### 3.2 Protected Route Implementation
- [ ] Create `ProtectedRoute` component that checks JWT validity
- [ ] Implement token storage in localStorage with expiration checking
- [ ] Add automatic redirect to login for unauthenticated admin access
- [ ] Create `useAuth` hook for accessing authentication state
- [ ] Implement token refresh logic (optional for demo)

**Rationale**: Admin routes must be protected from unauthorized access while maintaining good UX.

---

### Phase 4: Scroll-Driven Video Frame Animation System

#### 4.1 Frame Preloading System
- [ ] Create `FramePreloader` class to preload all frame images for each section
- [ ] Implement progressive loading strategy (load visible section first, then others)
- [ ] Add loading state indicators for each section
- [ ] Optimize memory usage by implementing frame caching with LRU strategy
- [ ] Create fallback behavior for slow connections (show static image)

**Rationale**: Preloading ensures smooth frame scrubbing without visible loading delays during scroll.

#### 4.2 Scroll Progress Tracker
- [ ] Create `useScrollProgress` hook that calculates progress (0-1) within a section
- [ ] Implement Intersection Observer to detect when sections enter/exit viewport
- [ ] Add throttling/debouncing for scroll event performance
- [ ] Create smooth interpolation between frame numbers
- [ ] Handle edge cases (scroll during load, rapid scrolling, mobile momentum)

**Rationale**: Accurate scroll tracking is critical for frame-accurate video simulation.

#### 4.3 Canvas-Based Frame Renderer
- [ ] Create `ScrollVideo` component using HTML Canvas for rendering
- [ ] Implement frame interpolation: `currentFrame = Math.floor(progress * totalFrames)`
- [ ] Add double-buffering to prevent flickering during frame changes
- [ ] Optimize canvas rendering with requestAnimationFrame
- [ ] Handle device pixel ratio for crisp rendering on high-DPI displays

**Rationale**: Canvas rendering provides better performance than img tag swapping for 60fps animation.

#### 4.4 Parallax Layer System
- [ ] Create `ParallaxLayer` component with configurable scroll speed multiplier
- [ ] Implement CSS transform-based positioning for GPU acceleration
- [ ] Create z-index management system for multiple layers
- [ ] Add subtle parallax to text overlays (title, CTA, description)
- [ ] Test parallax smoothness on mobile devices

**Rationale**: Parallax adds depth and visual interest without heavy performance cost when using transforms.

#### 4.5 Section Implementations
- [ ] **Hero Section** (60 frames): Event title, date, live counter, "Enter Now" CTA with parallax
- [ ] **Rules Section** (50 frames): Raffle rules, ticket pricing, eligibility with scroll-synced text reveals
- [ ] **How to Enter Section** (40 frames): Step-by-step instructions with animated number markers
- [ ] **Winners Section** (30 frames): Past winners showcase or teaser for upcoming draw

**Rationale**: Four distinct sections create a narrative flow that guides users from awareness to action.

---

### Phase 5: Public User-Facing Pages

#### 5.1 Home Page - Hero Section
- [ ] Full-screen scroll-video component with 60 frames from `/frames/hero/`
- [ ] Large animated event title "GR CUP 2026" with glow effect
- [ ] Live participant counter with SignalR connection (animated number transitions)
- [ ] Prominent "Enter Now" CTA button with hover scale + glow animation
- [ ] Scroll indicator at bottom with bounce animation
- [ ] Parallax text layers moving at different speeds

**Rationale**: Hero creates immediate impact and clearly communicates the event while showing social proof through live counter.

#### 5.2 Home Page - Rules Section
- [ ] Full-screen scroll-video with 50 frames from `/frames/rules/`
- [ ] Animated reveal of pricing (0.50€ per ticket)
- [ ] Bullet points appearing with staggered fade-in animations
- [ ] Clear statement: "Buy as many tickets as you want"
- [ ] Eligibility requirements with icon illustrations
- [ ] Subtle divider line separating from next section

**Rationale**: Rules must be clear and prominent to avoid disputes; scroll animation keeps engagement high.

#### 5.3 Home Page - How to Enter Section
- [ ] Full-screen scroll-video with 40 frames from `/frames/how-to-enter/`
- [ ] Numbered steps with large animated numbers (1, 2, 3, 4)
- [ ] Step 1: Click "Enter Now" button
- [ ] Step 2: Fill in your details
- [ ] Step 3: Complete payment via Stripe
- [ ] Step 4: You're entered! Winner drawn randomly
- [ ] Each step fades in as user scrolls

**Rationale**: Clear instructions reduce friction and support conversions.

#### 5.4 Home Page - Winners/CTA Section
- [ ] Full-screen scroll-video with 30 frames from `/frames/winners/`
- [ ] If past winners exist: display with confetti animation
- [ ] If no winners yet: "Be the first GR Cup champion!" messaging
- [ ] Final prominent CTA button "Get Your Tickets Now"
- [ ] Countdown timer to draw date (optional)
- [ ] Footer with legal links and social media

**Rationale**: Final section creates urgency and provides last conversion opportunity.

#### 5.5 Checkout Page
- [ ] Ticket quantity selector with +/- buttons (minimum 1, display price calculation)
- [ ] Form fields: First Name, Surname, Instagram @username, Email
- [ ] Instagram follow confirmation checkbox (required)
- [ ] Form validation with inline error messages
- [ ] "Pay {total}€ with Stripe" button
- [ ] Loading state during Stripe redirect
- [ ] Error handling for API failures

**Rationale**: Streamlined checkout minimizes abandonment; clear validation prevents errors.

#### 5.6 Success Page
- [ ] Confirmation message with ticket count and total paid
- [ ] Participant details summary
- [ ] "Share on Instagram" button with pre-filled story template
- [ ] "Return to Home" link
- [ ] SignalR triggers participant counter update across all clients

**Rationale**: Success page confirms transaction and encourages social sharing for viral growth.

---

### Phase 6: Admin Panel

#### 6.1 Admin Login Page
- [ ] Clean login form with username and password fields
- [ ] Form validation and error display
- [ ] JWT token storage on successful login
- [ ] Redirect to dashboard after authentication
- [ ] "Remember me" option using localStorage
- [ ] Rate limiting awareness (show message after failed attempts)

**Rationale**: Secure but simple authentication for admin access.

#### 6.2 Admin Dashboard
- [ ] Three KPI cards with real-time SignalR updates:
  - Total Participants (unique emails)
  - Total Tickets Sold
  - Total Revenue (€)
- [ ] Recent activity feed (last 10 ticket purchases)
- [ ] Quick action buttons: "View Participants", "Draw Winner"
- [ ] Chart showing ticket sales over time (optional, using Chart.js)
- [ ] Responsive grid layout for mobile

**Rationale**: Dashboard provides at-a-glance business metrics and quick access to common actions.

#### 6.3 Participants Management Page
- [ ] Material Design-inspired data table with Tailwind styling
- [ ] Columns: Name, Surname, Email, Instagram, Tickets, Total Paid, Date
- [ ] Server-side pagination (10 per page) with page controls
- [ ] Search input with debounce (searches name, email, Instagram)
- [ ] Filter by ticket count range (optional)
- [ ] Export to CSV button (downloads all participants, not just current page)
- [ ] Click row to view participant details in modal
- [ ] Loading states and empty state design

**Rationale**: Efficient participant management is critical for admin operations; server-side pagination handles scale.

#### 6.4 Draw Winner Page
- [ ] Large prominent "Randomly Select Winner" button with confirmation modal
- [ ] Winner display card with confetti animation on selection:
  - Name and Instagram handle
  - Number of tickets purchased
  - Total paid
- [ ] "Confirm Winner" and "Re-Draw" buttons
- [ ] Draw history table showing:
  - Draw date/time
  - Winner name and Instagram
  - Status (Pending/Confirmed)
- [ ] Option to void confirmed winner if needed
- [ ] SignalR broadcast to all clients when winner is drawn

**Rationale**: Structured draw process with confirmation prevents accidental draws and maintains audit trail.

---

### Phase 7: Payment Integration (Stripe)

#### 7.1 Stripe Checkout Integration
- [ ] Create Stripe Checkout Session with line items (0.50€ × quantity)
- [ ] Set success_url to redirect to /success page with session_id
- [ ] Set cancel_url to redirect back to checkout page
- [ ] Store participant data in session metadata for webhook retrieval
- [ ] Configure Stripe to collect email (optional, for Stripe receipts)

**Rationale**: Stripe Checkout provides PCI-compliant payment processing with minimal implementation effort.

#### 7.2 Webhook Handler
- [ ] Create public endpoint `POST /api/webhooks/stripe`
- [ ] Verify webhook signature using Stripe signing secret
- [ ] Handle `checkout.session.completed` event
- [ ] Retrieve participant data from session metadata
- [ ] Create or update Participant record with ticket count and total paid
- [ ] Trigger SignalR broadcast to update live counter
- [ ] Log all webhook events for debugging

**Rationale**: Webhooks are the only reliable way to confirm payment completion for async payment flows.

#### 7.3 Error Handling & Edge Cases
- [ ] Handle payment failures gracefully (show error message, allow retry)
- [ ] Implement idempotency for webhook processing (prevent duplicate updates)
- [ ] Add timeout handling for Stripe API calls
- [ ] Create admin view to see failed payment attempts (optional)
- [ ] Test with Stripe CLI for local webhook testing

**Rationale**: Robust error handling prevents data inconsistencies and provides good user experience.

---

### Phase 8: Styling & Animations

#### 8.1 Global Styles & Theme
- [ ] Extend Tailwind config with Ciridae-inspired custom classes
- [ ] Create reusable animation classes: fade-in, slide-up, scale-in
- [ ] Define consistent spacing scale (8px base unit)
- [ ] Create custom button variants (primary-neon, secondary-outline)
- [ ] Implement dark mode color scheme throughout
- [ ] Add focus-visible styles for accessibility

**Rationale**: Consistent styling system speeds development and ensures visual coherence.

#### 8.2 Micro-Interactions
- [ ] Button hover effects: scale(1.05) + neon glow
- [ ] Form field focus animations (border glow)
- [ ] Counter number animations (countUp effect)
- [ ] Loading spinners with neon colors
- [ ] Smooth page transitions between routes
- [ ] Toast notifications for success/error feedback

**Rationale**: Micro-interactions create polished feel and provide user feedback.

#### 8.3 Responsive Design
- [ ] Mobile-first approach for all components
- [ ] Breakpoint system: sm (640px), md (768px), lg (1024px), xl (1280px)
- [ ] Touch-friendly tap targets (minimum 44px)
- [ ] Adjusted animations for mobile (reduced complexity for performance)
- [ ] Test on actual devices: iPhone, Android, iPad
- [ ] Optimize scroll-video frame count for mobile bandwidth

**Rationale**: Mobile traffic expected to be significant; performance critical on mobile networks.

---

### Phase 9: SEO & Meta Tags

#### 9.1 Meta Tag Implementation
- [ ] Dynamic page title: "GR Cup 2026 - Powerlifting Championship Raffle"
- [ ] Meta description: Compelling 155-character description
- [ ] Open Graph tags: title, description, image, url, type
- [ ] Twitter Card tags: summary_large_image
- [ ] Canonical URL to prevent duplicate content issues
- [ ] Favicon and apple-touch-icon

**Rationale**: SEO optimization ensures discoverability and proper social media sharing.

#### 9.2 Structured Data
- [ ] JSON-LD schema for Event (raffle details, dates)
- [ ] JSON-LD schema for Organization (GR Strength)
- [ ] Verify with Google Rich Results Test

**Rationale**: Structured data enables rich search results and better discoverability.

---

### Phase 10: Environment Configuration & Security

#### 10.1 Environment Variables
- [ ] Backend: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, JWT_SECRET, CONNECTION_STRING, ADMIN_PASSWORD
- [ ] Frontend: VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY
- [ ] Create `.env.example` files for both frontend and backend
- [ ] Document all required environment variables in README
- [ ] Validate environment variables on startup (fail fast if missing)

**Rationale**: Environment variables enable secure configuration across environments.

#### 10.2 Security Measures
- [ ] HTTPS enforcement in production
- [ ] CORS configuration for production domains
- [ ] Rate limiting on API endpoints (especially /api/tickets/buy)
- [ ] Input validation and sanitization on all endpoints
- [ ] SQL injection prevention via Entity Framework parameterized queries
- [ ] XSS prevention via React/Preact automatic escaping
- [ ] CSRF protection for admin endpoints (via JWT in Authorization header)

**Rationale**: Security measures protect against common web vulnerabilities.

---

### Phase 11: Testing & Quality Assurance

#### 11.1 Backend Testing
- [ ] Unit tests for ParticipantService methods
- [ ] Unit tests for DrawService random selection logic
- [ ] Integration tests for API endpoints using WebApplicationFactory
- [ ] Test Stripe webhook handling with mock events
- [ ] Database integration tests with in-memory SQLite

**Rationale**: Automated tests prevent regressions and ensure business logic correctness.

#### 11.2 Frontend Testing
- [ ] Component tests for critical components (Checkout form, Admin table)
- [ ] Integration tests for checkout flow
- [ ] Test scroll-video animation performance
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile device testing

**Rationale**: Frontend tests ensure UI behaves correctly across environments.

#### 11.3 End-to-End Testing
- [ ] Complete purchase flow test (fill form → Stripe test payment → success page)
- [ ] Admin login and participant management test
- [ ] Winner draw workflow test
- [ ] SignalR real-time update test

**Rationale**: E2E tests validate complete user journeys work as expected.

---

### Phase 12: Documentation & Deployment

#### 12.1 README Documentation
- [ ] Project overview and features list
- [ ] Prerequisites (Node.js 18+, .NET 8 SDK, MySQL 8)
- [ ] Local development setup instructions
- [ ] Backend setup: `dotnet restore`, `dotnet ef database update`, `dotnet run`
- [ ] Frontend setup: `npm install`, `npm run dev`
- [ ] Environment variable configuration guide
- [ ] How to add new video frame folders (folder structure, naming convention)
- [ ] Database migration commands
- [ ] Stripe testing guide (using test cards, Stripe CLI)

**Rationale**: Comprehensive documentation enables team members to work with the project.

#### 12.2 Deployment Configuration
- [ ] Backend Dockerfile for containerized deployment
- [ ] Frontend build configuration for static hosting
- [ ] Frontend deployment: Vercel/Netlify configuration
- [ ] Backend deployment: Railway/Render configuration
- [ ] Database migration run strategy for production
- [ ] Environment variable setup in production platforms
- [ ] Custom domain configuration
- [ ] SSL certificate setup

**Rationale**: Clear deployment instructions ensure smooth production releases.

#### 12.3 Production Checklist
- [ ] Change ADMIN_PASSWORD from default
- [ ] Set strong JWT_SECRET (256-bit minimum)
- [ ] Configure production MySQL database
- [ ] Switch Stripe from test to live mode
- [ ] Update CORS origins to production domains
- [ ] Enable production logging (remove debug logs)
- [ ] Set up monitoring and error tracking (optional: Sentry)
- [ ] Configure automated database backups

**Rationale**: Production checklist prevents security issues and data loss.

---

## Verification Criteria

### Functional Requirements
- [ ] User can view all sections with smooth scroll-driven animations at 60fps
- [ ] Live participant counter updates in real-time across multiple browser tabs
- [ ] User can purchase tickets via Stripe Checkout successfully
- [ ] Admin can log in with username/password and access protected routes
- [ ] Admin can view paginated participants list with search functionality
- [ ] Admin can export all participants to CSV
- [ ] Admin can draw a random winner with confirmation workflow
- [ ] Dashboard displays accurate KPIs that update in real-time

### Performance Requirements
- [ ] Scroll animations maintain 60fps on desktop and 30fps minimum on mobile
- [ ] Initial page load under 3 seconds on 4G connection
- [ ] API response time under 200ms for all endpoints
- [ ] Frame preloading doesn't block main thread
- [ ] Canvas rendering uses GPU acceleration

### Security Requirements
- [ ] Admin routes return 401 without valid JWT
- [ ] SQL injection attempts are prevented
- [ ] XSS attempts are escaped
- [ ] Stripe webhook signature is verified
- [ ] Sensitive data (passwords, JWT secret) stored in environment variables

### Browser Compatibility
- [ ] Chrome 90+ (desktop and mobile)
- [ ] Firefox 88+
- [ ] Safari 14+ (desktop and iOS)
- [ ] Edge 90+

---

## Potential Risks and Mitigations

### 1. **Scroll Animation Performance on Mobile**
**Risk**: 60 frames per section may cause memory issues and jank on low-end mobile devices.
**Mitigation**: 
- Implement adaptive quality: detect device capability and reduce frame count on low-end devices
- Use Intersection Observer to only load frames when section is near viewport
- Implement lazy loading with priority queue
- Consider providing static image fallback for devices with limited memory

### 2. **Stripe Webhook Reliability**
**Risk**: Webhook delivery failures could result in participants not being recorded after payment.
**Mitigation**:
- Implement idempotent webhook processing using Stripe event ID
- Log all webhook events for manual reconciliation
- Create admin tool to manually trigger participant creation from Stripe session ID
- Set up Stripe webhook monitoring and alerts

### 3. **Random Winner Selection Legal Compliance**
**Risk**: Random selection algorithm may not meet legal requirements for raffles in certain jurisdictions.
**Mitigation**:
- Use cryptographically secure random number generation (RNGCryptoServiceProvider)
- Log detailed audit trail of draw process (timestamp, participant pool size, selection)
- Consider weighted selection based on ticket count if required by rules
- Consult legal counsel for specific jurisdiction requirements

### 4. **SignalR Scalability**
**Risk**: With thousands of concurrent connections, SignalR may become a bottleneck.
**Mitigation**:
- Implement SignalR scale-out with Redis backplane for multi-instance deployments
- Use connection throttling if needed
- Consider falling back to polling for non-critical updates
- Monitor connection count and server resources

### 5. **Database Performance with Large Participant Count**
**Risk**: ORDER BY RAND() becomes slow with large tables (O(n) complexity).
**Mitigation**:
- Implement alternative random selection: pre-calculate random offsets
- Add database index on frequently queried columns
- Consider caching participant count in Redis
- Test with 100K+ participant dataset

### 6. **Frame Preloading Bandwidth Consumption**
**Risk**: Loading 180 total frames (60+50+40+30) could consume significant bandwidth.
**Mitigation**:
- Implement progressive loading: hero frames first, others on-demand
- Use WebP format for 30% smaller file size vs JPEG
- Add bandwidth detection and adjust quality accordingly
- Implement service worker for frame caching across sessions

### 7. **Admin Authentication Security**
**Risk**: Simple JWT implementation may be vulnerable to token theft or replay attacks.
**Mitigation**:
- Implement short token expiration (1 hour) with refresh token mechanism
- Add IP address logging for admin logins
- Consider adding 2FA for production deployment
- Implement token blacklist for logout functionality

### 8. **Concurrent Ticket Purchases**
**Risk**: Race conditions when same email purchases tickets simultaneously from different devices.
**Mitigation**:
- Use database transaction with optimistic concurrency
- Implement unique constraint on email field
- Handle duplicate key exceptions gracefully
- Consider using stripe customer ID for deduplication

---

## Alternative Approaches

### Alternative 1: Video Instead of Image Sequence
**Description**: Use actual video files instead of image sequences for scroll-driven animation.
**Trade-offs**:
- ✅ Smaller file size for equivalent content
- ✅ Simpler implementation using HTML5 video element
- ❌ Less precise frame control (video seeks can be inconsistent)
- ❌ Browser video codec support varies
- ❌ Harder to achieve frame-perfect scrubbing
**Recommendation**: Stick with image sequences for precise frame control requirement

### Alternative 2: Server-Sent Events Instead of SignalR
**Description**: Use SSE (EventSource API) instead of SignalR for real-time updates.
**Trade-offs**:
- ✅ Simpler server implementation
- ✅ Native browser API (no library needed)
- ❌ Unidirectional only (server to client)
- ❌ No automatic reconnection handling
- ❌ Less mature ecosystem
**Recommendation**: Keep SignalR for bidirectional communication and reconnection handling

### Alternative 3: Client-Side Random Selection
**Description**: Perform winner selection entirely on frontend using JavaScript.
**Trade-offs**:
- ✅ Reduced server load
- ❌ Security risk: manipulation possible
- ❌ No audit trail
- ❌ Cannot guarantee fairness
**Recommendation**: Never use for raffle - always perform selection server-side

### Alternative 4: Stripe Payment Intents Instead of Checkout
**Description**: Use Stripe Payment Intents API with custom form instead of hosted checkout.
**Trade-offs**:
- ✅ More control over payment flow
- ✅ Custom UI possible
- ❌ Much more complex implementation
- ❌ Requires PCI SAQ A compliance
- ❌ More code to maintain
**Recommendation**: Use Stripe Checkout for simplicity and PCI compliance

### Alternative 5: SQLite Instead of MySQL
**Description**: Use SQLite database for simpler deployment.
**Trade-offs**:
- ✅ No separate database server needed
- ✅ Simpler backup (single file)
- ❌ Poor concurrency handling
- ❌ No SignalR scale-out with Redis backplane
- ❌ Not suitable for production load
**Recommendation**: Use MySQL for production scalability

---

## Implementation Priority Order

### Week 1: Foundation
1. Database migrations and core services
2. Public API endpoints (tickets, count, webhook)
3. Basic frontend pages without animations (Home, Checkout, Success)
4. Stripe integration end-to-end

### Week 2: Admin & Real-Time
5. Admin authentication and protected routes
6. Admin dashboard and participant management
7. SignalR real-time updates
8. Winner draw functionality

### Week 3: Polish & Animations
9. Scroll-driven video frame animation system
10. All four animated sections (Hero, Rules, How to Enter, Winners)
11. Micro-interactions and polish
12. Responsive design refinement

### Week 4: Testing & Deployment
13. Comprehensive testing (unit, integration, E2E)
14. Documentation (README, deployment guides)
15. Production deployment setup
16. Final QA and bug fixes

---

## Success Metrics

### Technical Metrics
- Page load time < 3 seconds
- Animation frame rate ≥ 60fps on desktop, ≥ 30fps on mobile
- API response time < 200ms (p95)
- Zero security vulnerabilities in dependency scan

### Business Metrics
- Checkout completion rate > 80%
- Admin task completion time < 30 seconds for common operations
- Zero payment processing errors
- 100% uptime during raffle period

---

## Conclusion

This implementation plan provides a comprehensive roadmap for building the GR Cup Raffle application. The project has a solid foundation with the existing scaffolding, allowing the team to focus on implementing business logic, the unique scroll-driven animation system, and payment integration.

The key technical challenges are:
1. Achieving smooth 60fps scroll-driven animations on both desktop and mobile
2. Ensuring reliable payment processing with Stripe webhooks
3. Building an intuitive admin interface for managing participants and drawing winners

By following this plan systematically and addressing risks proactively, the team can deliver a production-ready application that provides an engaging user experience while maintaining security and reliability.

**Next Step**: Hand off to implementation agent (Forge) to begin Phase 1 (Database Foundation & Backend Core Services).
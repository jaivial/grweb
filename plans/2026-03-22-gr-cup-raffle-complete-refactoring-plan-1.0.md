# GR Cup Raffle - Complete Refactoring & Implementation Plan

## Executive Summary

This plan outlines the complete reorganization of the GR Cup Raffle application into a scalable, maintainable architecture with strict separation of concerns. All components will be refactored to follow the principle of "no logic in components" with files not exceeding 1000 lines.

---

## Part 1: Remaining Phases & Improvements

### Phase 1: Animation System Implementation (Week 1-2)

#### 1.1 Frame Preloader System
**Objective**: Create an optimized progressive image loading system for 180 frames

**Tasks**:
- [ ] Create `FramePreloader` class with priority queue
- [ ] Implement LRU caching strategy (max 100 frames in memory)
- [ ] Add progressive loading with intersection observer
- [ ] Implement WebP fallback for older browsers
- [ ] Add loading state indicators
- [ ] Create service worker for frame caching
- [ ] Optimize for mobile (adaptive quality)

**Technical Approach**:
```
Priority Queue:
1. Hero frames (60) - highest priority
2. Rules frames (50) - medium priority  
3. How to Enter (40) - medium priority
4. Winners (30) - low priority

Cache Strategy:
- LRU eviction when cache > 100MB
- Preload visible section first
- Lazy load offscreen sections
```

**Verification**:
- [ ] All 180 frames load progressively
- [ ] No frame drops during scroll
- [ ] Memory usage stays under 150MB
- [ ] Initial load time < 3s on 4G

---

#### 1.2 Scroll Progress Tracker
**Objective**: Create precise scroll-to-frame mapping system

**Tasks**:
- [ ] Create `useScrollProgress` hook with throttling
- [ ] Implement Intersection Observer for section visibility
- [ ] Add scroll velocity detection
- [ ] Create frame interpolation algorithm
- [ ] Add smooth scroll snapping
- [ ] Implement scroll direction detection
- [ ] Add touch gesture support for mobile

**Technical Approach**:
```
Scroll Mapping:
- Section height = viewport height × 2
- Progress = scrollY / sectionHeight (0-1)
- Frame = Math.floor(progress × totalFrames)
- Throttle: 16ms (60fps)

Interpolation:
- Linear interpolation for smooth transitions
- Easing function for natural feel
```

**Verification**:
- [ ] Frame changes sync with scroll position
- [ ] No jank or stuttering
- [ ] Works on touch devices
- [ ] Scroll position accurate to ±1 frame

---

#### 1.3 Canvas Frame Renderer
**Objective**: Create 60fps canvas-based frame display system

**Tasks**:
- [ ] Create `CanvasRenderer` component with double-buffering
- [ ] Implement device pixel ratio handling
- [ ] Add frame interpolation for smooth transitions
- [ ] Create GPU-accelerated transforms
- [ ] Implement requestAnimationFrame loop
- [ ] Add performance monitoring
- [ ] Create fallback for low-end devices

**Technical Approach**:
```
Rendering Pipeline:
1. Clear canvas
2. Draw current frame
3. Apply transforms (scale, position)
4. Composite with parallax layers
5. Request next frame

Optimization:
- Double-buffering to prevent flicker
- GPU acceleration via will-change
- Frame skipping on low FPS
```

**Verification**:
- [ ] Consistent 60fps on desktop
- [ ] 30fps minimum on mobile
- [ ] No canvas memory leaks
- [ ] Smooth frame transitions

---

#### 1.4 Parallax Layer System
**Objective**: Create depth effect with multiple scroll-speed layers

**Tasks**:
- [ ] Create `ParallaxLayer` component with configurable speed
- [ ] Implement z-index management
- [ ] Add GPU-accelerated transforms
- [ ] Create layer composition system
- [ ] Add opacity transitions
- [ ] Implement responsive scaling
- [ ] Create layer presets

**Technical Approach**:
```
Layer Configuration:
- Background: speed 0.2
- Midground: speed 0.5
- Foreground: speed 1.0
- Text overlay: speed 1.5

Transform:
- translate3d for GPU acceleration
- will-change: transform
- backface-visibility: hidden
```

**Verification**:
- [ ] Smooth parallax effect
- [ ] No z-index conflicts
- [ ] Responsive on all devices
- [ ] Performance impact < 5ms/frame

---

#### 1.5 Section Implementation
**Objective**: Implement all 4 animated sections with frame sequences

**Hero Section (60 frames)**:
- [ ] Event title with parallax
- [ ] Live participant counter
- [ ] "Enter Now" CTA button
- [ ] Background video frames
- [ ] Particle effects overlay

**Rules Section (50 frames)**:
- [ ] Pricing breakdown
- [ ] Eligibility requirements
- [ ] Terms & conditions
- [ ] Animated bullet points
- [ ] Background transitions

**How to Enter Section (40 frames)**:
- [ ] Step-by-step instructions
- [ ] Animated number indicators
- [ ] Progress visualization
- [ ] Interactive elements
- [ ] Background morphing

**Winners Section (30 frames)**:
- [ ] Past winners carousel
- [ ] Winner announcement animation
- [ ] Trophy/medal effects
- [ ] Confetti celebration
- [ ] Background celebration

**Verification**:
- [ ] All sections render correctly
- [ ] Smooth transitions between sections
- [ ] Counter updates in real-time
- [ ] CTA buttons functional

---

### Phase 2: Performance Optimization (Week 2)

#### 2.1 Code Splitting & Lazy Loading
**Tasks**:
- [ ] Implement route-based code splitting
- [ ] Lazy load admin panel
- [ ] Lazy load animation system
- [ ] Create loading skeletons
- [ ] Optimize bundle size
- [ ] Implement tree shaking

**Targets**:
- Initial bundle < 100KB
- Admin chunk < 50KB
- Animation chunk < 200KB

---

#### 2.2 Image Optimization
**Tasks**:
- [ ] Convert all frames to WebP
- [ ] Create responsive image srcset
- [ ] Implement blur placeholders
- [ ] Add lazy loading for images
- [ ] Optimize SVG icons
- [ ] Create sprite sheet for icons

**Targets**:
- Frame size < 50KB each
- Total frames < 9MB
- Icon sprite < 20KB

---

#### 2.3 API Optimization
**Tasks**:
- [ ] Implement request caching
- [ ] Add request deduplication
- [ ] Optimize pagination queries
- [ ] Add database indexing
- [ ] Implement query batching
- [ ] Add response compression

**Targets**:
- API response < 200ms
- Cache hit rate > 80%
- Database queries < 50ms

---

### Phase 3: Testing & Quality Assurance (Week 3)

#### 3.1 Unit Testing
**Tasks**:
- [ ] Test all utility functions
- [ ] Test custom hooks
- [ ] Test API client methods
- [ ] Test state management
- [ ] Test frame interpolation
- [ ] Test scroll calculations

**Coverage Target**: 80%

---

#### 3.2 Integration Testing
**Tasks**:
- [ ] Test checkout flow
- [ ] Test admin workflows
- [ ] Test real-time updates
- [ ] Test payment processing
- [ ] Test winner selection
- [ ] Test export functionality

**Coverage Target**: 70%

---

#### 3.3 E2E Testing
**Tasks**:
- [ ] Test complete user journey
- [ ] Test admin panel workflows
- [ ] Test mobile responsiveness
- [ ] Test cross-browser compatibility
- [ ] Test payment flow
- [ ] Test error scenarios

**Coverage Target**: Critical paths 100%

---

### Phase 4: SEO & Analytics (Week 3)

#### 4.1 SEO Implementation
**Tasks**:
- [ ] Add Open Graph tags
- [ ] Add Twitter Card tags
- [ ] Implement JSON-LD structured data
- [ ] Create sitemap.xml
- [ ] Add robots.txt
- [ ] Implement canonical URLs
- [ ] Add meta descriptions

---

#### 4.2 Analytics Integration
**Tasks**:
- [ ] Add Google Analytics 4
- [ ] Track page views
- [ ] Track checkout events
- [ ] Track admin actions
- [ ] Add error tracking
- [ ] Create custom dashboards

---

### Phase 5: Accessibility (Week 3)

**Tasks**:
- [ ] Add ARIA labels
- [ ] Implement keyboard navigation
- [ ] Add focus management
- [ ] Test with screen readers
- [ ] Add skip links
- [ ] Implement color contrast
- [ ] Add reduced motion support

**Target**: WCAG 2.1 AA

---

### Phase 6: Deployment & DevOps (Week 4)

#### 6.1 CI/CD Pipeline
**Tasks**:
- [ ] Set up GitHub Actions
- [ ] Add automated testing
- [ ] Add linting checks
- [ ] Add type checking
- [ ] Add bundle size checks
- [ ] Create deployment workflows

---

#### 6.2 Monitoring & Logging
**Tasks**:
- [ ] Add error tracking (Sentry)
- [ ] Add performance monitoring
- [ ] Add uptime monitoring
- [ ] Create alerting rules
- [ ] Add log aggregation
- [ ] Create dashboards

---

#### 6.3 Production Deployment
**Tasks**:
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Railway
- [ ] Configure production database
- [ ] Set up CDN for frames
- [ ] Configure Stripe webhooks
- [ ] Add SSL certificates
- [ ] Configure custom domain

---

## Part 2: Project Reorganization Architecture

### New Folder Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                          # Reusable UI components (NO BUSINESS LOGIC)
│   │   │   ├── Button/
│   │   │   │   ├── Button.tsx           # Component only
│   │   │   │   ├── types.ts             # Button props & variants
│   │   │   │   ├── variants.ts          # Style variants
│   │   │   │   └── index.ts             # Export
│   │   │   ├── Input/
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── types.ts
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useInputValidation.ts
│   │   │   │   └── index.ts
│   │   │   ├── Card/
│   │   │   ├── Modal/
│   │   │   ├── Table/
│   │   │   ├── Badge/
│   │   │   ├── Spinner/
│   │   │   ├── Icon/
│   │   │   └── index.ts                 # Export all UI components
│   │   │
│   │   └── layout/                      # Layout components
│   │       ├── Navbar/
│   │       │   ├── Navbar.tsx
│   │       │   ├── types.ts
│   │       │   ├── components/
│   │       │   │   ├── NavLinks.tsx
│   │       │   │   ├── MobileMenu.tsx
│   │       │   │   └── AdminNav.tsx
│   │       │   ├── hooks/
│   │       │   │   ├── useScrollPosition.ts
│   │       │   │   └── useMobileMenu.ts
│   │       │   └── index.ts
│   │       └── Layout/
│   │
│   ├── pages/
│   │   ├── home/
│   │   │   ├── Home.tsx                 # Main page component (orchestrator only)
│   │   │   ├── types.ts
│   │   │   ├── atoms/
│   │   │   │   └── homeAtoms.ts         # Page-level state
│   │   │   ├── hooks/
│   │   │   │   ├── useHomeData.ts
│   │   │   │   └── useScrollToSection.ts
│   │   │   ├── lib/
│   │   │   │   └── homeUtils.ts
│   │   │   └── components/              # Page-specific sections
│   │   │       ├── HeroSection/
│   │   │       │   ├── HeroSection.tsx
│   │   │       │   ├── types.ts
│   │   │       │   ├── utils/
│   │   │       │   │   ├── frameUtils.ts
│   │   │       │   │   └── counterUtils.ts
│   │   │       │   ├── hooks/
│   │   │       │   │   ├── useFramePreloader.ts
│   │   │       │   │   ├── useScrollProgress.ts
│   │   │       │   │   └── useLiveCounter.ts
│   │   │       │   ├── components/
│   │   │       │   │   ├── FrameCanvas.tsx
│   │   │       │   │   ├── ParallaxContainer.tsx
│   │   │       │   │   ├── LiveCounter.tsx
│   │   │       │   │   └── CTAButton.tsx
│   │   │       │   ├── atoms/
│   │   │       │   │   ├── frameAtoms.ts
│   │   │       │   │   └── counterAtoms.ts
│   │   │       │   └── index.ts
│   │   │       ├── RulesSection/
│   │   │       │   ├── RulesSection.tsx
│   │   │       │   ├── types.ts
│   │   │       │   ├── utils/
│   │   │       │   ├── hooks/
│   │   │       │   ├── components/
│   │   │       │   └── index.ts
│   │   │       ├── HowToEnterSection/
│   │   │       └── WinnersSection/
│   │   │
│   │   ├── checkout/
│   │   │   ├── Checkout.tsx
│   │   │   ├── types.ts
│   │   │   ├── atoms/
│   │   │   │   ├── formAtoms.ts
│   │   │   │   └── validationAtoms.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useFormValidation.ts
│   │   │   │   ├── useStripeCheckout.ts
│   │   │   │   └── useTicketQuantity.ts
│   │   │   ├── utils/
│   │   │   │   ├── validationUtils.ts
│   │   │   │   ├── priceCalculator.ts
│   │   │   │   └── formatters.ts
│   │   │   ├── lib/
│   │   │   │   └── checkoutApi.ts
│   │   │   └── components/
│   │   │       ├── TicketSelector/
│   │   │       ├── CheckoutForm/
│   │   │       ├── FormField/
│   │   │       └── PriceSummary/
│   │   │
│   │   ├── success/
│   │   │   ├── Success.tsx
│   │   │   ├── types.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useSessionData.ts
│   │   │   │   └── useSocialShare.ts
│   │   │   ├── utils/
│   │   │   │   └── shareUtils.ts
│   │   │   └── components/
│   │   │       ├── SuccessAnimation/
│   │   │       ├── PurchaseDetails/
│   │   │       ├── NextSteps/
│   │   │       └── SocialShare/
│   │   │
│   │   └── admin/
│   │       ├── login/
│   │       │   ├── Login.tsx
│   │       │   ├── types.ts
│   │       │   ├── hooks/
│   │       │   │   ├── useLoginForm.ts
│   │       │   │   └── useAuth.ts
│   │       │   ├── utils/
│   │       │   │   └── validation.ts
│   │       │   └── components/
│   │       │       ├── LoginForm/
│   │       │       └── DemoCredentials/
│   │       │
│   │       ├── dashboard/
│   │       │   ├── Dashboard.tsx
│   │       │   ├── types.ts
│   │       │   ├── atoms/
│   │       │   │   └── dashboardAtoms.ts
│   │       │   ├── hooks/
│   │       │   │   ├── useDashboardData.ts
│   │       │   │   ├── useRealTimeUpdates.ts
│   │       │   │   └── useQuickActions.ts
│   │       │   ├── utils/
│   │       │   │   └── statsFormatters.ts
│   │       │   └── components/
│   │       │       ├── KPICard/
│   │       │       ├── QuickActions/
│   │       │       └── InfoCards/
│   │       │
│   │       ├── participants/
│   │       │   ├── Participants.tsx
│   │       │   ├── types.ts
│   │       │   ├── atoms/
│   │       │   │   ├── paginationAtoms.ts
│   │       │   │   └── searchAtoms.ts
│   │       │   ├── hooks/
│   │       │   │   ├── useParticipants.ts
│   │       │   │   ├── usePagination.ts
│   │       │   │   ├── useSearch.ts
│   │       │   │   └── useExport.ts
│   │       │   ├── utils/
│   │       │   │   ├── tableUtils.ts
│   │       │   │   ├── paginationUtils.ts
│   │       │   │   └── searchUtils.ts
│   │       │   └── components/
│   │       │       ├── SearchBar/
│   │       │       ├── ParticipantsTable/
│   │       │       ├── PaginationControls/
│   │       │       └── StatsSummary/
│   │       │
│   │       └── draw/
│   │           ├── DrawWinner.tsx
│   │           ├── types.ts
│   │           ├── atoms/
│   │           │   └── drawAtoms.ts
│   │           ├── hooks/
│   │           │   ├── useDraw.ts
│   │           │   ├── useDrawHistory.ts
│   │           │   └── useConfirmation.ts
│   │           ├── utils/
│   │           │   └── drawUtils.ts
│   │           └── components/
│   │               ├── DrawButton/
│   │               ├── WinnerModal/
│   │               ├── DrawHistory/
│   │               └── InfoCards/
│   │
│   ├── hooks/                           # Global custom hooks
│   │   ├── useSignalR.ts
│   │   ├── useDebounce.ts
│   │   ├── useThrottle.ts
│   │   ├── useIntersectionObserver.ts
│   │   ├── useLocalStorage.ts
│   │   └── index.ts
│   │
│   ├── utils/                           # Global utility functions
│   │   ├── api/
│   │   │   ├── client.ts                # API client class
│   │   │   ├── endpoints.ts             # Endpoint definitions
│   │   │   ├── interceptors.ts          # Request/response interceptors
│   │   │   └── types.ts
│   │   ├── formatters/
│   │   │   ├── date.ts
│   │   │   ├── number.ts
│   │   │   └── currency.ts
│   │   ├── validators/
│   │   │   ├── email.ts
│   │   │   ├── instagram.ts
│   │   │   └── form.ts
│   │   └── helpers/
│   │       ├── scroll.ts
│   │       ├── dom.ts
│   │       └── storage.ts
│   │
│   ├── stores/                          # Global state (Preact signals)
│   │   ├── auth/
│   │   │   ├── authStore.ts
│   │   │   ├── authActions.ts
│   │   │   └── types.ts
│   │   ├── participants/
│   │   │   ├── participantsStore.ts
│   │   │   ├── participantsActions.ts
│   │   │   └── types.ts
│   │   └── ui/
│   │       ├── uiStore.ts
│   │       └── types.ts
│   │
│   ├── lib/                             # Third-party integrations
│   │   ├── stripe/
│   │   │   ├── stripeClient.ts
│   │   │   └── stripeUtils.ts
│   │   ├── signalr/
│   │   │   ├── signalRClient.ts
│   │   │   └── signalRUtils.ts
│   │   └── analytics/
│   │       ├── ga.ts
│   │       └── events.ts
│   │
│   ├── constants/                       # Application constants
│   │   ├── routes.ts
│   │   ├── api.ts
│   │   ├── colors.ts
│   │   ├── animation.ts
│   │   └── config.ts
│   │
│   ├── types/                           # Global TypeScript types
│   │   ├── api.ts
│   │   ├── models.ts
│   │   ├── ui.ts
│   │   └── utils.ts
│   │
│   └── styles/                          # Global styles
│       ├── globals.css
│       ├── animations.css
│       └── utilities.css
│
├── public/
│   ├── frames/
│   │   ├── hero/
│   │   ├── rules/
│   │   ├── how-to-enter/
│   │   └── winners/
│   └── assets/
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Part 3: Component Refactoring Guidelines

### Rule 1: No Logic in Components
**Before** (Bad):
```tsx
// Checkout.tsx (BAD - logic in component)
export default function Checkout() {
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState('');
  
  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  
  const calculateTotal = () => {
    return quantity * 0.5;
  };
  
  const handleSubmit = async () => {
    if (!validateEmail(email)) {
      alert('Invalid email');
      return;
    }
    // ... submit logic
  };
  
  return <form>...</form>;
}
```

**After** (Good):
```tsx
// Checkout.tsx (GOOD - orchestrator only)
export default function Checkout() {
  const { formData, updateField } = useFormState();
  const { validateField, validateForm } = useFormValidation();
  const { calculateTotal } = usePriceCalculator();
  const { submitCheckout, isSubmitting } = useStripeCheckout();
  
  const handleSubmit = () => {
    if (validateForm(formData)) {
      submitCheckout(formData);
    }
  };
  
  return (
    <CheckoutLayout>
      <TicketSelector />
      <CheckoutForm />
      <PriceSummary />
    </CheckoutLayout>
  );
}
```

---

### Rule 2: File Size Limit (1000 lines max)

**Strategy**:
1. Extract utilities to `utils/` folder
2. Extract hooks to `hooks/` folder
3. Extract sub-components to `components/` folder
4. Extract types to `types.ts`
5. Extract state to `atoms/` folder

**Example Breakdown**:

Original file: `Checkout.tsx` (2500 lines)

**After refactoring**:
```
checkout/
├── Checkout.tsx (80 lines) - orchestrator only
├── types.ts (50 lines) - TypeScript interfaces
├── atoms/
│   ├── formAtoms.ts (100 lines) - form state
│   └── validationAtoms.ts (80 lines) - validation state
├── hooks/
│   ├── useFormValidation.ts (200 lines) - validation logic
│   ├── useStripeCheckout.ts (150 lines) - payment logic
│   ├── useTicketQuantity.ts (100 lines) - quantity logic
│   └── useFormState.ts (120 lines) - form state management
├── utils/
│   ├── validationUtils.ts (200 lines) - validation helpers
│   ├── priceCalculator.ts (100 lines) - price calculations
│   └── formatters.ts (150 lines) - data formatting
├── lib/
│   └── checkoutApi.ts (200 lines) - API calls
└── components/
    ├── TicketSelector.tsx (100 lines)
    ├── CheckoutForm.tsx (150 lines)
    ├── FormField.tsx (80 lines)
    └── PriceSummary.tsx (100 lines)

Total: 1960 lines across 16 files (avg 122 lines per file)
```

---

### Rule 3: Functional Component Structure

Every functional component MUST have:

```
[ComponentName]/
├── [ComponentName].tsx          # Main component (orchestrator)
├── types.ts                      # TypeScript interfaces
├── index.ts                      # Public exports
├── utils/                        # Pure utility functions
│   ├── [utility1].ts
│   └── [utility2].ts
├── hooks/                        # Custom hooks
│   ├── use[Hook1].ts
│   └── use[Hook2].ts
├── components/                   # Sub-components
│   ├── [SubComponent1].tsx
│   └── [SubComponent2].tsx
├── atoms/                        # Local state (Preact signals)
│   └── [state].ts
└── lib/                          # Third-party integrations
    └── [library].ts
```

---

## Part 4: Migration Strategy

### Step 1: Create New Structure (Day 1)
- [ ] Create all folders
- [ ] Create index.ts files
- [ ] Set up barrel exports

### Step 2: Extract Reusable UI Components (Day 1-2)
**Priority Order**:
1. Button (used everywhere)
2. Input (used in forms)
3. Card (used in dashboard)
4. Modal (used in draw winner)
5. Table (used in participants)
6. Badge (used for status)
7. Spinner (loading states)
8. Icon (SVG icons)

**Process**:
1. Create component folder
2. Extract component logic
3. Create types.ts
4. Move styles to variants.ts
5. Create hooks if needed
6. Add to ui/index.ts

### Step 3: Refactor Pages (Day 2-5)
**Priority Order**:
1. Checkout (most complex)
2. Admin Dashboard
3. Admin Participants
4. Admin Draw Winner
5. Success
6. Admin Login
7. Home (after animation system)

**Process for each page**:
1. Create page folder structure
2. Extract types to types.ts
3. Extract state to atoms/
4. Extract hooks to hooks/
5. Extract utilities to utils/
6. Extract sub-components to components/
7. Refactor main component to orchestrator
8. Test functionality

### Step 4: Create Global Utilities (Day 5)
- [ ] Create global hooks (useDebounce, useThrottle, etc.)
- [ ] Create global utils (formatters, validators)
- [ ] Create global stores (auth, participants, ui)
- [ ] Create constants file
- [ ] Create global types

### Step 5: Update Imports (Day 5)
- [ ] Update all import paths
- [ ] Use barrel exports
- [ ] Remove circular dependencies
- [ ] Test all pages

---

## Part 5: File Size Examples

### Example 1: Button Component (Under 1000 lines)

**components/ui/Button/Button.tsx** (50 lines):
```tsx
import { buttonVariants } from './variants';
import { ButtonProps } from './types';

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  children, 
  ...props 
}: ButtonProps) {
  return (
    <button 
      className={buttonVariants({ variant, size })}
      {...props}
    >
      {children}
    </button>
  );
}
```

**components/ui/Button/types.ts** (30 lines):
```tsx
export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}
```

**components/ui/Button/variants.ts** (50 lines):
```tsx
import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'font-bold rounded-lg transition-transform',
  {
    variants: {
      variant: {
        primary: 'bg-neon-blue text-dark-base',
        secondary: 'bg-transparent border-2 border-neon-orange',
        danger: 'bg-red-500 text-white',
      },
      size: {
        sm: 'px-4 py-2 text-sm',
        md: 'px-6 py-3 text-base',
        lg: 'px-8 py-4 text-lg',
      },
    },
  }
);
```

**Total**: 130 lines across 3 files ✅

---

### Example 2: Checkout Page (Under 1000 lines per file)

**pages/checkout/Checkout.tsx** (80 lines):
```tsx
export default function Checkout() {
  const { formData, updateField } = useFormState();
  const { validateForm } = useFormValidation();
  const { calculateTotal } = usePriceCalculator();
  const { submitCheckout, isSubmitting } = useStripeCheckout();
  
  const handleSubmit = () => {
    if (validateForm(formData)) {
      submitCheckout(formData);
    }
  };
  
  return (
    <CheckoutLayout>
      <TicketSelector />
      <CheckoutForm />
      <PriceSummary />
    </CheckoutLayout>
  );
}
```

**pages/checkout/hooks/useFormValidation.ts** (150 lines):
```tsx
export function useFormValidation() {
  const validateEmail = (email: string) => {
    return EMAIL_REGEX.test(email);
  };
  
  const validateInstagram = (username: string) => {
    return INSTAGRAM_REGEX.test(username);
  };
  
  const validateForm = (formData: FormData) => {
    // Validation logic
  };
  
  return { validateEmail, validateInstagram, validateForm };
}
```

**Total across all checkout files**: 1200 lines in 15 files (avg 80 lines each) ✅

---

## Part 6: Verification Checklist

### Architecture Verification
- [ ] No component file exceeds 1000 lines
- [ ] No logic in component files (only orchestration)
- [ ] All utilities extracted to utils/
- [ ] All hooks extracted to hooks/
- [ ] All types extracted to types.ts
- [ ] All state extracted to atoms/
- [ ] All sub-components extracted to components/
- [ ] All imports use barrel exports
- [ ] No circular dependencies

### Code Quality Verification
- [ ] All functions have single responsibility
- [ ] All hooks have single responsibility
- [ ] All components have single responsibility
- [ ] No duplicate code
- [ ] No hardcoded values (use constants)
- [ ] All constants in constants/ folder
- [ ] All types properly defined

### Testing Verification
- [ ] All utility functions have unit tests
- [ ] All hooks have unit tests
- [ ] All components have integration tests
- [ ] All pages have E2E tests
- [ ] Test coverage > 80%

### Performance Verification
- [ ] No unnecessary re-renders
- [ ] No memory leaks
- [ ] All async operations properly handled
- [ ] All subscriptions properly cleaned up
- [ ] Bundle size optimized

---

## Part 7: Timeline & Milestones

### Week 1: Foundation & Animation System
- **Day 1-2**: Create new folder structure, extract UI components
- **Day 3-4**: Implement frame preloader and scroll tracker
- **Day 5-7**: Implement canvas renderer and parallax system

### Week 2: Page Refactoring & Animation Sections
- **Day 1-2**: Refactor Checkout, Success, Admin pages
- **Day 3-4**: Implement Hero and Rules sections
- **Day 5-7**: Implement How to Enter and Winners sections

### Week 3: Testing, SEO & Optimization
- **Day 1-2**: Write unit and integration tests
- **Day 3-4**: Implement SEO, analytics, accessibility
- **Day 5-7**: Performance optimization, code splitting

### Week 4: Deployment & Documentation
- **Day 1-2**: Set up CI/CD pipeline
- **Day 3-4**: Deploy to production
- **Day 5-7**: Final testing, documentation, handoff

---

## Success Metrics

### Code Quality
- Average file size: < 200 lines
- Maximum file size: < 1000 lines
- Test coverage: > 80%
- No ESLint warnings
- No TypeScript errors

### Performance
- Initial load: < 3s
- Time to interactive: < 5s
- Bundle size: < 500KB
- Lighthouse score: > 90

### User Experience
- Smooth 60fps animations
- No frame drops
- Mobile responsive
- Accessible (WCAG 2.1 AA)

---

## Conclusion

This comprehensive plan ensures:
1. ✅ **Scalable Architecture**: Easy to add new features
2. ✅ **Maintainable Code**: Clear separation of concerns
3. ✅ **Testable Components**: Isolated units
4. ✅ **Performance**: Optimized bundle and runtime
5. ✅ **Team Collaboration**: Clear structure and conventions

**Estimated Total Effort**: 4 weeks (160 hours)
**Team Size**: 2-3 developers
**Risk Level**: Medium (major refactoring)

The refactored architecture will serve as a solid foundation for future enhancements and make the codebase significantly easier to maintain and scale.

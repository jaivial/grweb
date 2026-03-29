# GR Cup Raffle - Remaining Refactoring Tasks

## Quick Start Guide

This document provides a structured approach to completing the remaining refactoring tasks. Each task should take 2-4 hours to complete following the established patterns.

---

## Task 1: Success Page (2 hours)

### Files to Create
```
pages/success/
├── Success.tsx              # Orchestrator (~100 lines)
├── types.ts                 # Type definitions
├── utils/
│   └── formatters.ts        # Date/price formatting
├── hooks/
│   └── usePaymentStatus.ts  # Check payment status
├── components/
│   ├── SuccessHeader.tsx    # Animated checkmark
│   ├── PurchaseDetails.tsx   # Order summary
│   ├── NextSteps.tsx        # What happens next
│   └── ShareButtons.tsx     # Social sharing
├── atoms/
│   └── state.ts             # Payment state
└── index.ts
```

### Key Features
- Payment confirmation display
- Ticket count and total
- Email notice
- "What happens next" steps
- Social sharing buttons

---

## Task 2: Admin Login Page (2 hours)

### Files to Create
```
pages/admin/login/
├── Login.tsx                # Orchestrator (~120 lines)
├── types.ts                 # Form types
├── utils/
│   ├── validators.ts        # Username/password validation
│   └── formatters.ts        # Error messages
├── hooks/
│   ├── useLogin.ts          # Login logic
│   └── useFormValidation.ts  # Form validation
├── components/
│   ├── LoginForm.tsx        # Form component
│   ├── FormInput.tsx        # Input wrapper
│   └── ErrorAlert.tsx       # Error display
├── atoms/
│   └── state.ts             # Login state
└── index.ts
```

### Key Features
- Username/password form
- Client-side validation
- Error handling
- Demo credentials notice
- JWT token storage

---

## Task 3: Checkout Page (4 hours)

### Files to Create
```
pages/checkout/
├── Checkout.tsx             # Orchestrator (~150 lines)
├── types.ts                 # Form & product types
├── utils/
│   ├── validators.ts        # All field validators
│   ├── formatters.ts        # Price calculation
│   └── constants.ts         # Ticket price, limits
├── hooks/
│   ├── useCheckout.ts       # Checkout logic
│   ├── useStripe.ts         # Stripe integration
│   ├── useFormState.ts      # Form state management
│   └── useTicketQuantity.ts # Quantity selector logic
├── components/
│   ├── TicketSelector.tsx   # Quantity +/- buttons
│   ├── CheckoutForm.tsx      # Main form
│   ├── PriceSummary.tsx     # Total calculation
│   ├── InstagramCheckbox.tsx # Follow checkbox
│   └── SubmitButton.tsx      # Pay Now button
├── atoms/
│   └── state.ts             # Form & cart state
├── lib/
│   └── stripe.ts            # Stripe client setup
└── index.ts
```

### Key Features
- Ticket quantity selector (1-100)
- Form fields: First name, Surname, Instagram, Email
- Instagram follow checkbox
- Real-time price calculation
- Form validation
- Stripe Checkout redirect
- Loading states

---

## Task 4: Admin Dashboard (3 hours)

### Files to Create
```
pages/admin/dashboard/
├── Dashboard.tsx            # Orchestrator (~100 lines)
├── types.ts                 # Dashboard types
├── utils/
│   ├── formatters.ts        # Number/date formatting
│   └── constants.ts         # Refresh intervals
├── hooks/
│   ├── useStats.ts          # Fetch & update stats
│   ├── useAutoRefresh.ts    # Polling logic
│   └── useSignalR.ts        # Real-time updates
├── components/
│   ├── StatsGrid.tsx        # 3 KPI cards
│   ├── KpiCard.tsx          # Individual KPI
│   ├── QuickActions.tsx      # Action buttons
│   ├── ActivityFeed.tsx      # Recent purchases
│   └── InfoCards.tsx        # Help cards
├── atoms/
│   └── state.ts             # Stats & loading state
└── index.ts
```

### Key Features
- 3 KPI cards (participants, tickets, revenue)
- Auto-refresh every 30 seconds
- Real-time updates via SignalR
- Quick action buttons
- Activity feed placeholder

---

## Task 5: Admin Participants (3 hours)

### Files to Create
```
pages/admin/participants/
├── Participants.tsx         # Orchestrator (~100 lines)
├── types.ts                 # Table types
├── utils/
│   ├── formatters.ts        # Date/number formatting
│   └── export.ts            # CSV export logic
├── hooks/
│   ├── useParticipants.ts   # Fetch participants
│   ├── usePagination.ts    # Pagination logic
│   └── useSearch.ts        # Search/filter logic
├── components/
│   ├── SearchBar.tsx        # Search input
│   ├── ParticipantTable.tsx # Data table
│   ├── Pagination.tsx        # Page controls
│   ├── ExportButton.tsx      # CSV export
│   └── Stats.tsx            # Summary stats
├── atoms/
│   └── state.ts             # Table state
└── index.ts
```

### Key Features
- Data table with 5 columns
- Server-side pagination (10 per page)
- Debounced search
- CSV export
- Loading skeletons
- Mobile card view

---

## Task 6: Admin Draw Winner (3 hours)

### Files to Create
```
pages/admin/draw/
├── DrawWinner.tsx          # Orchestrator (~120 lines)
├── types.ts                 # Draw types
├── utils/
│   ├── formatters.ts        # Date formatting
│   └── randomizer.ts        # Draw logic
├── hooks/
│   ├── useDraw.ts           # Draw functionality
│   ├── useDrawHistory.ts    # History fetch
│   └── useConfirmation.ts   # Modal logic
├── components/
│   ├── DrawButton.tsx        # Big draw button
│   ├── WinnerDisplay.tsx     # Winner card
│   ├── ConfirmationModal.tsx # Confirm modal
│   ├── DrawHistory.tsx       # History table
│   └── ActionButtons.tsx     # Confirm/Void buttons
├── atoms/
│   └── state.ts             # Draw state
└── index.ts
```

### Key Features
- Large "Randomly Select Winner" button
- Confirmation modal
- Winner display card
- Confirm/Void actions
- Draw history table
- Status badges

---

## Global Utilities (4 hours)

### Files to Create/Refactor

#### Stores
```
stores/
├── auth.ts                  # Auth state & actions
├── participants.ts          # Participant count
└── ui.ts                    # UI state (toasts, modals)
```

#### Hooks
```
hooks/
├── useSignalR.ts           # SignalR connection
├── useLocalStorage.ts      # Persistence
├── useDebounce.ts          # Debounce utility
└── useClickOutside.ts     # Click outside detection
```

#### Utils
```
utils/
├── api.ts                  # API client
├── constants.ts            # App constants
└── helpers.ts              # Utility functions
```

#### Types
```
types/
├── api.ts                  # API response types
├── forms.ts                # Form types
└── common.ts               # Common types
```

---

## Implementation Order

1. **Success Page** (2h)
   - Quick win, simple page
   - Establishes pattern for pages

2. **Admin Login** (2h)
   - Simple form page
   - Auth integration

3. **Checkout** (4h)
   - Most complex page
   - Stripe integration
   - Form state management

4. **Admin Dashboard** (3h)
   - Real-time updates
   - KPI cards

5. **Admin Participants** (3h)
   - Table component usage
   - Pagination & search

6. **Admin Draw Winner** (3h)
   - Draw functionality
   - Confirmation flows

7. **Global Utilities** (4h)
   - Complete refactoring
   - Update all imports

8. **Router Update** (1h)
   - Update app.tsx
   - Test all routes

---

## Total Time Estimate

- Success Page: 2 hours
- Admin Login: 2 hours
- Checkout: 4 hours
- Admin Dashboard: 3 hours
- Admin Participants: 3 hours
- Admin Draw Winner: 3 hours
- Global Utilities: 4 hours
- Router Update: 1 hour

**Total: 22 hours (~3-4 days)**

---

## Code Patterns to Follow

### Orchestrator Pattern
```tsx
// Component.tsx (orchestrator - NO LOGIC)
export function Component(): JSX.Element {
  // State hooks
  const { state, actions } = useComponentLogic();
  
  // Render sub-components
  return (
    <Container>
      <Header />
      <Body />
      <Footer />
    </Container>
  );
}
```

### Hook Pattern
```tsx
// useComponentLogic.ts
export function useComponentLogic() {
  const [state, setState] = useState(initial);
  
  const actions = {
    update: (value) => setState(value),
    reset: () => setState(initial),
  };
  
  useEffect(() => {
    // Side effects
  }, []);
  
  return { state, actions };
}
```

### Type Pattern
```tsx
// types.ts
export interface ComponentState {
  isLoading: boolean;
  data: DataType | null;
  error: string | null;
}

export interface ComponentActions {
  update: (value: DataType) => void;
  reset: () => void;
}
```

---

## Verification Checklist

After each page:
- [ ] No logic in orchestrator
- [ ] All types extracted
- [ ] All hooks extracted
- [ ] All utilities extracted
- [ ] Components composed
- [ ] No file > 1000 lines
- [ ] No TypeScript errors
- [ ] Page functions correctly

---

## Quick Wins

### Tip 1: Copy from Home Page
The Home page is a complete reference. Use it as a template for:
- File structure
- Hook patterns
- Component composition
- State management

### Tip 2: Reuse UI Components
All 8 UI components are ready to use:
- Button, Input, Card, Badge
- Spinner, Icon, Modal, Table

### Tip 3: Extract Incrementally
Start with:
1. Create folder structure
2. Add types.ts
3. Extract utilities
4. Extract hooks
5. Build sub-components
6. Create orchestrator

---

## Next Commands

Continue with refactoring:

```bash
# Success page
cd frontend/src/pages/success
# Create files following the pattern

# Admin Login
cd frontend/src/pages/admin/login
# Create files following the pattern

# Continue for each page...
```

---

**Status**: Ready to continue
**Estimated completion**: 3-4 days
**Pattern established**: ✅

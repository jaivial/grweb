# GR Cup Raffle - Full Refactoring Execution Plan

## Refactoring Strategy

Based on the dependency analysis, I'll refactor in this order:

### Phase 1: Create Foundation Structure
1. Create new folder structure
2. Set up barrel exports
3. Create global utilities and constants

### Phase 2: Extract Reusable UI Components (No Logic)
**Priority Order**:
1. Button (most used)
2. Input (forms)
3. Card (dashboard)
4. Badge (status)
5. Spinner (loading)
6. Icon (SVG icons)
7. Modal (draw winner)
8. Table (participants)

### Phase 3: Refactor Pages (Extract Logic)
**Order by complexity**:
1. Home (simplest)
2. Success
3. Admin Login
4. Checkout
5. Admin Dashboard
6. Admin Participants
7. Admin Draw Winner

### Phase 4: Extract Global Utilities
1. API client refinements
2. Formatters (date, currency)
3. Validators (email, instagram)
4. Custom hooks (debounce, throttle)

### Phase 5: Create Global Stores
1. Auth store improvements
2. Participants store improvements
3. UI store (modals, toasts)

### Phase 6: Update Imports & Test
1. Update all import paths
2. Test each page
3. Verify functionality

## File Size Targets

- **Components**: < 100 lines
- **Hooks**: < 200 lines
- **Utils**: < 300 lines
- **Pages**: < 150 lines (orchestrator only)
- **Total per feature**: < 1000 lines across all files

## Execution Timeline

**Day 1**: Foundation + UI Components (Button, Input, Card, Badge, Spinner)
**Day 2**: More UI Components (Icon, Modal, Table) + Start Page Refactoring
**Day 3**: Refactor all Pages (extract logic to hooks/utils)
**Day 4**: Global utilities, stores, testing
**Day 5**: Final verification and documentation

## Verification Checklist

After each component:
- [ ] No logic in component file
- [ ] All files < 1000 lines
- [ ] Types extracted to types.ts
- [ ] Utils extracted to utils/
- [ ] Hooks extracted to hooks/
- [ ] Sub-components extracted to components/
- [ ] State extracted to atoms/
- [ ] Tests pass
- [ ] No console errors

Starting refactoring now...

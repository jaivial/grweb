# Testing Infrastructure Plan: Data-* Attributes + Storybook CT

## Goal
Improve test reliability by:
1. Enforcing the existing `data-*` attribute rule on ALL components
2. Setting up Storybook 8.x with `@storybook/test` for component testing
3. Writing CT tests using Storybook (comparing with existing E2E)

---

## Phase 0: Delete Old Plans

**Action**: Delete the obsolete `playwrightCTimprovements` plan since Playwright CT is skipped.

```bash
rm -rf Plans/playwrightCTimprovements/
```

---

## Phase 1: Systematic `data-*` Attribute Audit

### Naming Convention (from existing E2E tests)

| Attribute | Usage | Example |
|-----------|-------|---------|
| `data-ui` | Page/section containers, layout wrappers | `data-ui="sorteo-page"`, `data-ui="gift-modal-overlay"` |
| `data-tab-id` | Tab navigation triggers | `data-tab-id="premios"` |
| `data-testid` | Interactive elements (buttons, inputs, badges) | `data-testid="gift-edit-btn"`, `data-testid="gift-title-input"` |
| `data-testid^="prefix-"` | Dynamic/list items | `data-testid^="gift-card-"` (use `.nth()` in tests) |

### Pattern per Component Type

**Containers/Wrappers** → `data-ui`
```tsx
<div data-ui="component-name-container">
<section data-ui="section-name">
```

**Navigation** → `data-tab-id`
```tsx
<button data-tab-id="tab-name">
```

**Buttons** → `data-testid="component-action-btn"`
```tsx
<button data-testid="gift-save-btn">Save</button>
<button data-testid="gift-delete-btn">Delete</button>
```

**Inputs** → `data-testid="component-field-input"`
```tsx
<input data-testid="gift-title-input">
<textarea data-testid="gift-subtitle-input">
```

**Badges/Status** → `data-testid="component-status-badge"`
```tsx
<span data-testid="gift-status-badge">Active</span>
```

**Cards/List Items** → `data-testid^="prefix-"`
```tsx
<div data-testid="gift-card-{id}">
```

**Modals/Overlays** → `data-testid` + `data-ui`
```tsx
<div data-testid="gift-form-modal" data-ui="gift-modal-overlay">
```

### Audit Scope

**All components in `frontend/src/components/` and `frontend/src/pages/`**

Estimated components: ~50-80
Estimated elements: ~500+
Estimated time: 4-6 hours

### Implementation Steps

1. **Glob all `.tsx` files** in `src/`
2. **Audit each file** for missing `data-*` attributes on HTML elements
3. **Add attributes** following naming convention
4. **Verify** E2E tests still pass

---

## Phase 2: Storybook 8.x Setup

### Install Dependencies

```bash
npm install --save-dev @storybook/react @storybook/react-vite @storybook/addon-essentials @storybook/test
```

### Create Config Files

**`.storybook/main.ts`** — Vite builder, addon configuration
**`.storybook/preview.tsx`** — Global decorators (Router, global styles)

### Add Scripts to `package.json`

```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build",
  "test:storybook": "test-storybook"
}
```

---

## Phase 3: Write Stories and CT Tests

### Stories Pattern (`.stories.tsx`)

```tsx
// GiftModal.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { GiftModal } from './GiftModal';

const meta = {
  component: GiftModal,
} satisfies Meta<typeof GiftModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CreateMode: Story = {
  args: {
    mode: 'create',
    isOpen: true,
    onClose: () => {},
    onSave: async () => {},
  },
};

export const EditMode: Story = {
  args: {
    mode: 'edit',
    gift: { id: 1, title: 'Test', subtitle: 'Sub' },
    isOpen: true,
    onClose: () => {},
    onSave: async () => {},
  },
};
```

### CT Test Pattern (using `@storybook/test`)

```tsx
// GiftModal.test.tsx
import { render, screen } from '@storybook/test';
import { composeStory } from '@storybook/react';
import { CreateMode, EditMode } from './GiftModal.stories';

test('opens in create mode', async () => {
  const Story = composeStory(CreateMode, defaultAnnotations);
  await render(<Story />);
  
  await expect(screen.getByTestId('gift-modal-title')).toContainText('Nuevo');
});
```

---

## Comparison: E2E vs Storybook CT

| Aspect | E2E (current) | Storybook CT |
|--------|---------------|--------------|
| Browser | Full browser | Full browser |
| UI | Full app + routing | Component in isolation |
| Auth | Cookie injection needed | Mock or provide context |
| Network | Real API calls | Mock or real (configurable) |
| Selector stability | `data-*` needed | Same |
| LOC per test | ~50-100 | ~20-40 |
| CI time | ~2-5 min | ~1-2 min |
| Setup complexity | Low | Medium |

---

## Deliverables

### Files to Create/Modify

**Plan:**
- `Plans/testing-data-attributes-and-storybook/README.md` — This plan

**Deleted:**
- `Plans/playwrightCTimprovements/` — Old plan (deleted)

**New (Storybook):**
- `.storybook/main.ts`
- `.storybook/preview.tsx`
- `src/**/*.stories.tsx` — Stories for key components
- `src/**/*.test.tsx` — Storybook CT tests

**Modified:**
- `frontend/package.json` — Add Storybook scripts and deps
- `src/**/*.{tsx,jsx}` — Add missing `data-*` attributes

---

## Verification

After each phase:

1. **Phase 1**: Run E2E tests — all selectors should work
2. **Phase 2**: `npm run storybook` — Verify on :6006
3. **Phase 3**: `npm run test:storybook` — Run CT tests

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Adding `data-*` breaks existing UI | Use semantic attributes (`data-ui`, `data-tab-id`) not visual |
| Storybook stories drift from components | CI check: warn if component changes without story update |
| Storybook CT doesn't mock network | Use MSW or direct API mocking in stories |

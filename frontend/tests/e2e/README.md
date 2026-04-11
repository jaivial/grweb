# Playwright Test Scripts Guide

## Quick Start

### Run Tests (Auto-Detect Mode)
```bash
cd frontend
npm run test:e2e
```
- **With display (local machine)**: Runs in headed mode with browser visible
- **Without display (server)**: Runs in headless mode automatically

### Run Tests (Explicit Mode)

#### Headed Mode (with virtual display on server)
```bash
npm run test:e2e:headed
# or
../scripts/test-headed.sh
```

#### Headless Mode (for CI/production)
```bash
npm run test:e2e:headless
# or
../scripts/test-headless.sh
```

### Run Specific Tests
```bash
# Run custom raffle tests
npm run test:e2e:headed "Custom Raffle"

# Run only admin tests
npm run test:e2e:headed "Admin:"

# Run a single test
npm run test:e2e:headed "should display raffle method options"
```

### View Test Report
```bash
npm run test:e2e:report
```

### Interactive UI Mode
```bash
npm run test:e2e:ui
```

## Configuration

The `playwright.config.ts` auto-detects the environment:

```typescript
const hasDisplay = !!process.env.DISPLAY;
const useHeaded = !isCI && hasDisplay;

// Automatically sets:
// - headless: !useHeaded
// - slowMo: useHeaded ? 50 : 0
```

## Diagnostic Features

All test runs include:
- ✅ **Video recording** on failure
- ✅ **Screenshots** on failure
- ✅ **Full trace** on retry
- ✅ **HTML report** with network calls, DOM snapshots, console errors

## Troubleshooting

### "Missing X server" Error
Use the xvfb script:
```bash
../scripts/test-headed.sh
```

### Tests Too Fast to Debug
Headed mode includes 50ms slow motion. To increase:
```typescript
// playwright.config.ts
slowMo: 100,  // increase to 100ms
```

### Tests Timing Out
- Check if backend is running
- Check if MySQL is running
- Increase timeout in config:
```typescript
webServer: {
  timeout: 180_000,  // 3 minutes
}
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run test:e2e` | Auto-detect mode (headed/headless) |
| `npm run test:e2e:headed` | Headed mode with xvfb |
| `npm run test:e2e:headless` | Headless mode (CI) |
| `npm run test:e2e:ui` | Interactive UI mode |
| `npm run test:e2e:report` | View HTML report |

## Test Files

- `tests/e2e/backoffice/custom-raffle.spec.ts` - Custom raffle feature tests (14 tests)
- `tests/e2e/backoffice/sorteo.spec.ts` - Sorteo page tests
- `tests/e2e/admin/draw.spec.ts` - Admin draw tests
- `tests/e2e/admin/participants.spec.ts` - Admin participants tests
- `tests/e2e/auth/login.spec.ts` - Auth tests

## Test Helpers

- `shared/auth.helpers.ts` - Login/logout via UI
- `shared/console-monitor.ts` - Catches console errors
- `shared/network-capture.ts` - Intercepts API calls
- `shared/api.helpers.ts` - API constants

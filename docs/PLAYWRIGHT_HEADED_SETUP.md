# Headed Playwright Tests Setup

## ✅ Configuration Complete

Your Playwright tests are now configured with **smart auto-detection**:

### How It Works

The `playwright.config.ts` automatically detects your environment:

```typescript
const hasDisplay = !!process.env.DISPLAY;
const useHeaded = !isCI && hasDisplay;
```

**Results:**
- ✅ **Local machine with monitor** → Headed mode (browser visible)
- ✅ **Server/CI without display** → Headless mode (no browser needed)
- ✅ **Via xvfb-run** → Headed mode with virtual display

## Quick Commands

### On Your Local Machine (with display)
```bash
cd frontend
npm run test:e2e              # Auto: headed mode
npm run test:e2e:ui           # Interactive UI mode
```

### On Server (no display)
```bash
cd frontend
npm run test:e2e              # Auto: headless mode
npm run test:e2e:headless     # Explicit headless
```

### On Server (with virtual display for headed debugging)
```bash
npm run test:e2e:headed       # Uses xvfb automatically
# or
../scripts/test-headed.sh
```

### Run Specific Tests
```bash
# Run custom raffle tests only
npm run test:e2e:headed "Custom Raffle"

# Run a single test
npm run test:e2e:headed "should display raffle method options"

# Run all admin tests
npm run test:e2e:headless "Admin:"
```

### View Test Reports
```bash
npm run test:e2e:report
```

## What's Configured

### Diagnostic Features (Always On)
- 📹 **Video Recording** - Saved on test failure
- 📸 **Screenshots** - Captured on failure
- 🔍 **Full Trace** - Network calls, DOM snapshots, console
- 📊 **HTML Report** - Beautiful interactive report

### Headed Mode Features
- 👁️ **Browser Visible** - Watch tests execute
- 🐌 **50ms Slow Motion** - Easy to follow actions
- ⏸️ **Debug Friendly** - Pause and inspect anytime

### Headless Mode Features
- ⚡ **Fast Execution** - No rendering overhead
- 🔄 **CI Ready** - Works in automated pipelines
- 💾 **Resource Efficient** - Less memory/CPU

## Files Created

| File | Purpose |
|------|---------|
| `frontend/playwright.config.ts` | Auto-detect configuration |
| `scripts/test-headed.sh` | Run with xvfb virtual display |
| `scripts/test-headless.sh` | Run in headless mode |
| `frontend/tests/e2e/README.md` | Test usage guide |

## Testing the Setup

### Verify Configuration
```bash
cd frontend
npm run test:e2e -- --list
```

### Run Single Test (Verify It Works)
```bash
npm run test:e2e "should display raffle method options"
```

Expected: ✅ 1 passed

## Troubleshooting

### Issue: "Missing X server" Error
**Solution:** Use the xvfb script
```bash
npm run test:e2e:headed
```

### Issue: Tests Run Too Fast to Debug
**Solution:** They're in headless mode (no display detected)
```bash
# Force headed mode with xvfb
npm run test:e2e:headed "Your Test Name"
```

### Issue: xvfb-run Not Found
**Solution:** Install it
```bash
sudo apt-get update && sudo apt-get install -y xvfb
```

### Issue: Tests Fail with "Unable to connect"
**Solution:** Start backend and database
```bash
# Start MySQL
docker-compose up -d mysql

# Start backend
cd backend/GrCup.Api && dotnet run

# Start frontend (in another terminal)
cd frontend && npm run dev

# Run tests
npm run test:e2e
```

## Best Practices

### For Development
1. Run specific tests during development:
   ```bash
   npm run test:e2e:headless "Custom Raffle"
   ```

2. Use headed mode for debugging failures:
   ```bash
   npm run test:e2e:headed "Failing Test Name"
   ```

3. View detailed reports:
   ```bash
   npm run test:e2e:report
   ```

### For CI/CD
```yaml
# Example GitHub Actions
- name: Run E2E Tests
  run: npm run test:e2e:headless
  env:
    CI: true
```

### For Team Members
Share this command to run all tests:
```bash
npm run test:e2e
```

It will automatically use the best mode for their environment!

## Configuration Reference

### playwright.config.ts Settings

```typescript
{
  headless: !useHeaded,           // Auto: false if display exists
  slowMo: useHeaded ? 50 : 0,    // Auto: 50ms if headed
  trace: 'on-first-retry',        // Full trace on retry
  video: 'retain-on-failure',    // Save video on failures
  screenshot: 'only-on-failure', // Save screenshots on failures
  timeout: 30000,                 // Per-test timeout
  webServer: {
    timeout: 120_000,            // Server startup timeout
    reuseExistingServer: !isCI   // Don't restart if running
  }
}
```

## Summary

✅ **Tests are now smart:** Auto-detect headed vs headless mode  
✅ **Scripts created:** Easy commands for any environment  
✅ **Diagnostics enabled:** Full debugging capability  
✅ **Documentation ready:** Complete usage guide  

**Next step:** Start MySQL and backend to see all 14 tests pass!

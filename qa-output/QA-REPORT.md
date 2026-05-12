# QA Test Report - Competition Context Indicator

**URL:** http://localhost:5173/backoffice/grcup/configuracion  
**Date:** 2026-05-12  
**Viewport:** 1280x720 (Desktop), 375x667 (Mobile)  
**Browser:** Chrome (agent-browser)  

## Summary

| Check | Status |
|-------|--------|
| Login redirects to backoffice | PASS |
| /backoffice/configuracion page loads | PASS |
| Competition context indicator visible | PASS |
| Indicator shows "Competicion activa" | PASS |
| Competition switching works | PASS |

## Test Results

### Step 1: Login (http://localhost:5173/backoffice/login)
- Status: PASS
- Login form displayed correctly with username/password fields
- Login with admin@grplatform.com / admin123 successful
- Redirected to http://localhost:5173/backoffice/grcup

### Step 2: Navigate to Configuration Page
- Status: PASS
- URL: http://localhost:5173/backoffice/grcup/configuracion
- Page loads successfully with tabs: Email, Stripe, Evento

### Step 3: Verify Competition Context Indicator
- Status: PASS
- Element found: `[data-ui="competition-context"]`
- Text displayed: "Competicion activa" + "Configuracion especifica para esta competicion"
- CSS classes: `mt-2 flex items-center gap-2 text-sm text-white/60`
- Badge style: `px-2 py-0.5 bg-red-accent/20 text-red-accent rounded-full text-xs`

### Step 4: Competition Context Switching
- Status: PASS
- Competition selector button present: "GR Cup 2026 Root"
- Dropdown displays both competitions:
  - GR Cup 2026
  - FER Powerlifting Day
- Switching to FER updates the page context correctly
- Competition context indicator remains "Competicion activa" after switching

## Screenshots

| File | Description |
|------|-------------|
| `/var/www/grweb/qa-output/screenshots/03-login-page-visible.png` | Login page with form |
| `/var/www/grweb/qa-output/screenshots/04-configuracion-page.png` | Configuration page with competition context indicator |
| `/var/www/grweb/qa-output/screenshots/05-configuracion-mobile.png` | Mobile view of configuration page |
| `/var/www/grweb/qa-output/screenshots/06-competition-selector-dropdown.png` | Competition selector dropdown open |
| `/var/www/grweb/qa-output/screenshots/07-fer-configuracion-page.png` | FER Powerlifting Day configuration page |

## Issues Found

### Medium Issue: Login URL Mismatch
- The task specified `/login` but the actual login route is `/backoffice/login`
- The app routes to `/backoffice/login` not `/login`
- Recommendation: Update documentation or task instructions

### Note: WebGL/Two.js Errors in Headless Mode
- The homepage (/) crashes in headless Chrome due to WebGL context not available
- This is expected behavior for headless testing environments
- The app has a React error boundary issue that causes the whole tree to crash
- Login and backoffice pages work correctly without Three.js dependencies

## Pass/Fail Summary
- Total checks: 5
- Passed: 5
- Failed: 0
- Warnings: 1 (WebGL in headless mode)

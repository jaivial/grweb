# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# Infrastructure (NO DOCKER)

**DO NOT use Docker for anything.** All services run natively via systemd.

## Backend API (ASP.NET Core 8)

- **Service:** `grcup-api.service` — systemd, runs as user `grcup-api`
- **Binary:** `/opt/grcup-api/current/GrCup.Api.dll`
- **Env file:** `/etc/grcup-api/grcup-api.env`
- **Port:** `127.0.0.1:5006`
- **Nginx proxy:** `fercup.com` → `127.0.0.1:5006` (for `/api/` and `/hubs/`)
- **Logs:** `journalctl -u grcup-api -f`
- **Restart:** `systemctl restart grcup-api`
- **Deploy:** `dotnet publish backend/GrCup.Api -c Release -o /tmp/publish && cp -r /tmp/publish/* /opt/grcup-api/current/ && systemctl restart grcup-api`

## MySQL Database

- **Host:** `127.0.0.1` (TCP, NOT socket)
- **Port:** `3306`
- **Database:** `grcup`
- **User:** `grcup_app`
- **Password:** `GrCupApp2024!`
- **Connect:** `mysql -h 127.0.0.1 -P 3306 -ugrcup_app -pGrCupApp2024\! grcup`

## Frontend (fercup.com)

- **Nginx root:** `/var/www/fercup.com/` (serves pre-built SPA)
- **Build source:** `ferweb/` (React + Vite)
- **Build command:** `cd ferweb && npm run build`
- **Deploy:** `cp -r ferweb/dist/* /var/www/fercup.com/ && nginx -s reload`

## Stripe Payments

- Stripe credentials are stored **only in the `StripeConfig` database table**, never in env files
- Configure via backoffice (Stripe settings page) per competition
- Backend reads from DB: `StripeConfigService.GetExactConfigAsync(competicionId)`
- DB has a record for `CompeticionId = 2` (slug `fer`) with valid `sk_live_*` keys
- To update: `UPDATE StripeConfig SET SecretKey=..., PublishableKey=..., WebhookSecret=... WHERE CompeticionId=2;`

## Frontend Dev Server

- **Service:** `ferweb-dev.service` — Vite dev on port `5180`
- **URL:** `https://ferdev.menustudioai.com` (via Cloudflare tunnel `cloudflared-ferdev.service`)
- **Restart:** `systemctl restart ferweb-dev.service`
- **Logs:** `journalctl -u ferweb-dev.service -f`

## Nginx

- **Config:** `/etc/nginx/sites-available/fercup.com`
- **Reload:** `nginx -t && nginx -s reload`
- **Logs:** `/var/log/nginx/fercup.com.access.log` and `.error.log`

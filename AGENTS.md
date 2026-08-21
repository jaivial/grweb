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

---

# Project Structure

Three modules: **frontend**, **backoffice**, **backend**.

- **Frontend** — client-facing apps about the competitions. Multiple frontends live here: `ferweb/` and `frontend/`. They consume endpoints from backend.
- **Backoffice** — frontend, but in its own module because it manages data shown or received by `ferweb/` and `frontend/`. Talks to backend.
- **Backend** — single API. Exposes endpoints and websockets to backoffice, ferweb, and frontend.

## Production (backoffice + ferweb + backend)

- Deployment medium: check whether served via **Docker** or **systemd** before assuming.
- **Backoffice** is served as frontend via **nginx** (separate process).
- **ferweb** is served as frontend via **nginx** (separate process, different from backoffice).
- **Backend** runs as an API behind its nginx proxy.

## Development (docker-based)

- New **docker container** per dev environment, isolated from prod.
- **Database**: duplicated and separated from prod DB.
- **frontends + backoffice + ferweb**: `npm run dev` (HMR).
- **backend**: `air` mode (HMR for Go/.NET — match the actual backend stack).
- **Docker must be configurable**: pick which frontends to start (`backoffice`, `ferweb`, `frontend`, any subset). None mandatory.
- Frontends served via **nginx** (NOT cloudflare tunnel) inside the dev container.
- Hosted on a **subdomain** the user provides, or one the user asks to be created in **Cloudflare DNS** using their credentials.
- **Dev subdomains ≠ prod subdomains**. Different hostnames for each environment.

## Workflow

1. Create a **new worktree** based on the **current branch**.
2. Work **only inside that worktree**.
3. When done: **commit + push all WIP**.
4. Open a **PR against the parent branch**.
5. **Review loop** in that PR:
   - Run `pr-review` as a comment.
   - Fix all **medium** and **important** blockers.
   - Re-run `pr-review` as a comment.
   - Repeat until no medium/important blockers remain.
6. **Merge** the PR.
7. **Delete** the worktree and the merged branch.
8. **Refetch + pull** the parent branch.

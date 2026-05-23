# FER Cup BunnyCDN Migration Plan

**Date:** 2026-05-17  
**Status:** Plan only - do not execute automatically  
**Scope:** Migrate `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com` away from Cloudflare proxying and onto Bunny.net/BunnyCDN while keeping the current origin server and nginx application layout.

## Objective

Move the public FER Cup domains from Cloudflare-dependent reachability to Bunny.net so browsers can still reach the site on match days when LaLiga blocks Cloudflare proxy IP ranges in Spain.

The current failure mode is external browser reachability through Cloudflare, not necessarily origin health. The existing origin nginx, Certbot certificates, and backend can be healthy while Cloudflare edge IP blocking makes `fercup.com` unreachable for affected users.

## Security Notes

- A BunnyCDN/Bunny.net global API key was exposed in chat. Rotate that key before any migration work and treat it as compromised.
- Use the least-privilege Bunny API access available for DNS/CDN setup instead of a global API key whenever possible.
- Do not write Bunny credentials to this repository, Markdown plans, shell history, nginx configs, systemd units, deployment scripts, or logs.
- Credentials may be loaded securely from an environment file outside the repo, such as a root-owned file under `/etc` with mode `0600`, or from a secret manager. Do not print the values.
- The user reported credentials exist in `.env` under `/var/www/grcup`; do not read or print secret values from that file. If a migration script later needs credentials, source only named variables in a controlled shell and keep command tracing disabled.

## Current Context

- Current origin server IP is assumed to be `65.109.100.94` unless discovery proves otherwise.
- `fercup.com` and `www.fercup.com` are configured in nginx at `/etc/nginx/sites-enabled/fercup.com`.
- `backoffice.fercup.com` is configured in nginx at `/etc/nginx/sites-enabled/backoffice.fercup.com`.
- Public app static root: `/var/www/fercup.com`.
- Backoffice static root: `/var/www/backoffice.fercup.com`.
- nginx proxies `/api/` to `http://127.0.0.1:5006`.
- nginx proxies `/hubs/` to `http://127.0.0.1:5006` with WebSocket upgrade headers.
- Current TLS origin certificates use `/etc/letsencrypt/live/fercup.com/` for both public and backoffice vhosts.
- Backend health endpoint is expected at `GET /api/health`.
- The backend service may be Docker container `grcup-api` or a systemd service depending on deployment state; verify before migration.

## Target Architecture

Route these hostnames through Bunny.net/BunnyCDN while leaving the origin application stack on the current server:

- `fercup.com`
- `www.fercup.com`
- `backoffice.fercup.com`

Recommended target flow:

```text
Browser
  -> Bunny edge hostname / Bunny-managed DNS record
  -> HTTPS origin fetch to 65.109.100.94 with Host header preserved
  -> nginx vhost
  -> static files from /var/www/fercup.com or /var/www/backoffice.fercup.com
  -> /api/ and /hubs/ proxied to 127.0.0.1:5006
```

Cloudflare should no longer be in the serving path for these domains after cutover. It can remain only as an inactive rollback option if desired.

## Decision Points

### Bunny DNS vs Current Registrar DNS

Choose one DNS authority model before implementation:

1. Bunny DNS authoritative nameservers.
2. Current registrar DNS with records pointing to Bunny CDN targets.
3. Current Cloudflare DNS in DNS-only mode, if Cloudflare DNS remains reliable and is not proxied. This still depends on Cloudflare DNS operations and is less clean for a Cloudflare exit.

Recommendation: use Bunny DNS or registrar DNS, not Cloudflare-proxied DNS, for the final architecture.

### Pull Zone Per Host vs Shared Pull Zone

Options:

1. One pull zone for public site: `fercup.com` + `www.fercup.com`; one separate pull zone for `backoffice.fercup.com`.
2. One shared pull zone with all three hostnames.

Recommendation: separate backoffice from public site. Backoffice usually needs stricter cache bypass rules, access logging, and rollback isolation.

### Full-Site Proxy vs Static-Only CDN

Options:

1. Full-site proxy: Bunny serves HTML/static and forwards `/api/`, `/hubs/`, webhooks, and admin paths to origin with cache bypass.
2. Static-only CDN: Bunny caches static assets while browser API/WebSocket calls go directly to origin.

Recommendation: start with full-site proxy only if Bunny configuration supports required WebSocket behavior for `/hubs/`. Otherwise use static-only CDN with direct-origin API/WebSocket URLs and accept the extra app configuration work.

### Origin Protocol

Options:

1. Bunny edge to origin over HTTPS on `65.109.100.94` with the original Host header.
2. Bunny edge to origin over HTTP on `65.109.100.94`.

Recommendation: use HTTPS origin fetch when possible. Keep nginx HTTP vhosts available for ACME challenges and fallback redirects.

## Prerequisites

- Domain registrar access for `fercup.com`.
- Bunny.net account access with rotated, least-privilege API credentials.
- Confirm whether Bunny DNS or registrar DNS will be authoritative.
- Confirm origin public IP is `65.109.100.94`.
- Confirm nginx is healthy and serving all three hostnames locally.
- Confirm Certbot certificates cover `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com`.
- Confirm backend process health, either Docker or systemd.
- Confirm origin firewall allows Bunny edge IP ranges, or temporarily allows public `80/443` during cutover.
- Confirm origin rate limits will not block Bunny edge traffic.
- Confirm Stripe webhook endpoint, if used, is not cached and remains reachable.
- Confirm SignalR/WebSocket path requirements for `/hubs/participants` or any other `/hubs/*` path.

## Discovery Checklist

Run discovery before any Bunny or DNS changes. Save outputs in the deployment ticket only; do not commit operational output if it contains secrets or sensitive infrastructure details.

### DNS and Authority

```bash
dig +short NS fercup.com
dig +short A fercup.com
dig +short A www.fercup.com
dig +short A backoffice.fercup.com
dig +short CNAME www.fercup.com
dig +short CNAME backoffice.fercup.com
dig @1.1.1.1 fercup.com A +short
dig @8.8.8.8 fercup.com A +short
whois fercup.com
```

### Origin Identity and Firewall

```bash
curl -4 -fsS https://ifconfig.me
ip -4 addr show
ss -ltnp | grep -E ':(80|443|5006)\b'
sudo ufw status verbose || true
sudo iptables -S || true
```

Expected origin IP: `65.109.100.94`, unless discovery proves a different production address.

### nginx Vhosts and Static Roots

```bash
sudo nginx -t
sudo ls -l /etc/nginx/sites-enabled/
sudo nginx -T | grep -E 'server_name|root |proxy_pass|ssl_certificate|location /api|location /hubs' -A 3 -B 2
sudo test -d /var/www/fercup.com && sudo ls -la /var/www/fercup.com | head
sudo test -d /var/www/backoffice.fercup.com && sudo ls -la /var/www/backoffice.fercup.com | head
```

### Certificates

```bash
sudo certbot certificates
sudo openssl x509 -in /etc/letsencrypt/live/fercup.com/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
curl -vkI --resolve fercup.com:443:65.109.100.94 https://fercup.com/
curl -vkI --resolve www.fercup.com:443:65.109.100.94 https://www.fercup.com/
curl -vkI --resolve backoffice.fercup.com:443:65.109.100.94 https://backoffice.fercup.com/
```

### Backend and App Endpoints

```bash
curl -fsS http://127.0.0.1:5006/api/health
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'grcup|mysql' || true
systemctl status grcup-api.service --no-pager || true
curl -fsS --resolve fercup.com:443:65.109.100.94 https://fercup.com/api/health
curl -fsS --resolve backoffice.fercup.com:443:65.109.100.94 https://backoffice.fercup.com/api/health
```

### SignalR and WebSocket Paths

```bash
grep -R "hubs/\|HubConnection\|withUrl" /var/www/grweb/ferweb /var/www/grweb/backoffice /var/www/grweb/backend/GrCup.Api 2>/dev/null
curl -i --resolve fercup.com:443:65.109.100.94 https://fercup.com/hubs/participants
```

If WebSocket CLI testing is available:

```bash
websocat -v wss://fercup.com/hubs/participants
```

### Cacheable Static Assets

```bash
curl -I --resolve fercup.com:443:65.109.100.94 https://fercup.com/
curl -I --resolve fercup.com:443:65.109.100.94 https://fercup.com/index.html
curl -I --resolve backoffice.fercup.com:443:65.109.100.94 https://backoffice.fercup.com/
find /var/www/fercup.com -maxdepth 2 -type f | sed 's#^#/##' | head
find /var/www/backoffice.fercup.com -maxdepth 2 -type f | sed 's#^#/##' | head
```

## Bunny Setup Steps

### Pull Zones

Create two pull zones unless a shared-zone decision is made explicitly:

- Public pull zone for `fercup.com` and `www.fercup.com`.
- Backoffice pull zone for `backoffice.fercup.com`.

Configure each pull zone:

- Origin URL: `https://fercup.com` for public and `https://backoffice.fercup.com` for backoffice, or origin IP `https://65.109.100.94` with preserved Host header if Bunny supports that mode cleanly.
- Host header: preserve the incoming hostname so nginx selects the correct vhost.
- Origin protocol: HTTPS preferred.
- Enable edge SSL certificates for each hostname in Bunny.
- Enable HTTP/2 and HTTP/3 if available.
- Enable compression for text assets.
- Enable origin shield only if it does not break regional latency or origin IP visibility requirements.

### Cache Rules

Use conservative rules first:

- Cache static fingerprinted assets such as `*.js`, `*.css`, `*.woff2`, `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, `*.avif`, `*.svg`, `*.ico`, `*.webm`, and `*.map`.
- Do not cache `/`, `/index.html`, or SPA fallback HTML unless headers are explicitly correct.
- Bypass cache for `/api/*`.
- Bypass cache for `/hubs/*` and ensure WebSocket upgrade support if full-site proxying is used.
- Bypass cache for `/admin/*`, `/backoffice/*`, authentication endpoints, checkout endpoints, and webhook endpoints.
- Bypass cache for requests with `Authorization` or session/cookie headers.
- Respect origin `Cache-Control` headers initially; tighten TTLs after validation.

Suggested starting behavior:

```text
/assets/* or hashed static extensions -> cache, long TTL, immutable when origin sends it
/api/* -> bypass
/hubs/* -> bypass and allow WebSocket
/webhooks/* -> bypass
/admin/* -> bypass
/index.html and / -> no-store or very short TTL
```

### WebSocket Support

- Confirm Bunny supports WebSocket pass-through for the selected pull zone/product.
- Validate `/hubs/*` with SignalR negotiate and WebSocket upgrade after Bunny hostname is active.
- If Bunny cannot proxy WebSockets reliably, use direct-origin WebSocket/API endpoints or move only static assets to Bunny.

### Logs, Monitoring, and Purge

- Enable Bunny logging if available for pull zone requests, cache status, and origin errors.
- Configure alerts for high `5xx`, origin timeout, and cache-miss spikes.
- Document a manual purge path for the public and backoffice pull zones.
- Purge after every static deploy until cache keys and headers are fully proven.

## DNS Cutover Plan

### Pre-Cutover

1. Lower TTL for `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com` to 60-300 seconds at least one TTL window before cutover.
2. Create Bunny pull zones and custom hostnames.
3. Verify Bunny edge SSL certificates are issued before switching user-facing traffic.
4. Validate Bunny origin fetch using Bunny-provided test hostname if available.
5. Keep current origin nginx untouched except for any required proxy header hardening.

### Record Strategy

Follow Bunny's exact required DNS target for each hostname.

Typical options:

- `www.fercup.com` as `CNAME` to the Bunny pull zone hostname.
- `backoffice.fercup.com` as `CNAME` to the Bunny pull zone hostname.
- `fercup.com` apex as Bunny DNS `ALIAS/ANAME`, registrar `ALIAS/ANAME`, or Bunny-provided `A` records if required.

Do not leave Cloudflare orange-cloud proxy enabled for the target records. If Cloudflare DNS is temporarily retained, records must be DNS-only, but the preferred migration is away from Cloudflare as an authoritative serving dependency.

### Staggered Cutover

1. Cut over `backoffice.fercup.com` first because it has lower public traffic and validates auth/API behavior.
2. Validate backoffice login, API, static assets, and any WebSocket flows.
3. Cut over `www.fercup.com` next.
4. Cut over `fercup.com` apex last.
5. Monitor Bunny logs, nginx access logs, backend logs, and external browser checks for at least one full propagation window.

### Authority Validation

```bash
dig +short NS fercup.com
dig @1.1.1.1 fercup.com A +short
dig @8.8.8.8 fercup.com A +short
dig @1.1.1.1 www.fercup.com CNAME +short
dig @8.8.8.8 www.fercup.com CNAME +short
dig @1.1.1.1 backoffice.fercup.com CNAME +short
dig @8.8.8.8 backoffice.fercup.com CNAME +short
```

## nginx and Origin Changes

Only change nginx if discovery shows Bunny requires it or if logs/client IP handling need hardening.

### Proxy Headers and Real Client IP

- Preserve `Host` from Bunny to nginx.
- Decide whether to trust Bunny real-IP headers only from Bunny edge IP ranges.
- Do not blindly trust `X-Forwarded-For` from all internet clients.
- If enabling real client IP, add Bunny edge ranges through nginx `set_real_ip_from` and use the Bunny-provided real-IP header or standard `X-Forwarded-For` only from trusted IPs.

Example shape only; verify Bunny's current header and IP range documentation before use:

```nginx
set_real_ip_from <BUNNY_EDGE_CIDR>;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

### HTTPS Origin Mode

- Keep nginx listening on `443` with valid Certbot certificates.
- Ensure Bunny can validate the origin certificate for `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com`.
- If Bunny connects to origin IP but validates by hostname, configure origin Host/SNI correctly.

### CORS and Base URLs

- Verify frontend environment values do not hard-code Cloudflare tunnel domains.
- Confirm public frontend and backoffice call same-origin `/api/*` where possible.
- Confirm WebSocket URLs are same-origin or explicitly set to the Bunny-served hostnames.

### Health and SPA Fallback

- Keep `/api/health` reachable through each hostname.
- Keep `try_files $uri $uri/ /index.html` behavior for frontend routes.
- Ensure Bunny does not cache fallback HTML for missing static assets as `200` in a way that hides deploy mistakes.

## SSL and Certificate Plan

### Bunny Edge Certificates

- Enable Bunny-managed SSL for `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com`.
- Wait until Bunny shows certificates as issued before DNS cutover where required.
- Validate HTTPS from external networks after each hostname cutover.

### Origin Certbot Certificates

- Keep existing Certbot certificates on origin for HTTPS origin fetch.
- Confirm SAN coverage includes all three hostnames.
- If DNS authority moves from Cloudflare to Bunny or registrar DNS, review renewal method.

### Renewal Considerations

- HTTP-01 renewal should still work if Bunny forwards `/.well-known/acme-challenge/*` to origin without caching/interference.
- DNS-01 renewal must be reconfigured if it currently uses Cloudflare DNS APIs.
- If Certbot uses a Cloudflare DNS plugin today, migrate it to Bunny DNS API, registrar DNS API, or HTTP-01 before Cloudflare credentials are removed.
- Add a renewal dry-run to post-cutover validation.

```bash
sudo certbot renew --dry-run
```

## Build and Deploy Relation

- Do not rebuild `ferweb/` or `backoffice/` solely for the CDN migration.
- Rebuild `ferweb/` only if environment values, asset paths, API base URLs, or WebSocket URLs must change.
- Rebuild `backoffice/` only if environment values, auth callback URLs, API base URLs, or WebSocket URLs must change.
- Static `dist` output remains served by origin/nginx unless a later, explicit decision is made to move assets to Bunny Storage.
- Bunny Storage migration is out of scope for this plan.

## Validation Checklist

### DNS

```bash
dig @1.1.1.1 fercup.com A +short
dig @8.8.8.8 fercup.com A +short
dig @1.1.1.1 www.fercup.com CNAME +short
dig @8.8.8.8 www.fercup.com CNAME +short
dig @1.1.1.1 backoffice.fercup.com CNAME +short
dig @8.8.8.8 backoffice.fercup.com CNAME +short
```

### Origin Direct With Host Headers

```bash
curl -fsS -I --resolve fercup.com:443:65.109.100.94 https://fercup.com/
curl -fsS -I --resolve www.fercup.com:443:65.109.100.94 https://www.fercup.com/
curl -fsS -I --resolve backoffice.fercup.com:443:65.109.100.94 https://backoffice.fercup.com/
curl -fsS --resolve fercup.com:443:65.109.100.94 https://fercup.com/api/health
```

### Bunny-Served Hostnames

```bash
curl -fsS -I https://fercup.com/
curl -fsS -I https://www.fercup.com/
curl -fsS -I https://backoffice.fercup.com/
curl -fsS https://fercup.com/api/health
curl -fsS https://backoffice.fercup.com/api/health
```

Validate response headers:

- HTTPS certificate chain is Bunny edge certificate for public traffic.
- `Cache-Control` is long-lived only for static immutable assets.
- `/api/*`, `/hubs/*`, admin/auth, checkout, and webhook paths are not cached.
- Bunny cache status headers show expected hit/miss/bypass behavior.

### Functional Tests

- Open `https://fercup.com` from desktop browser.
- Open `https://www.fercup.com` and confirm redirect/canonical behavior if configured.
- Open `https://backoffice.fercup.com` and log in with valid admin credentials.
- Test API calls from public and backoffice browsers.
- Test SignalR/WebSocket connection and live updates.
- Test Stripe checkout creation if the site exposes ticket purchase flows.
- Test Stripe webhook delivery to the production webhook endpoint, if relevant.
- Test from mobile data, home ISP, and a network known to be affected by match-day Cloudflare blocking if possible.
- Monitor nginx access/error logs and backend logs during tests.

### Monitoring Commands

```bash
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log
docker logs grcup-api --tail 100 -f || true
journalctl -u grcup-api.service -n 100 -f || true
```

## Rollback Plan

Rollback should restore reachability without changing application code.

Options:

1. Revert DNS records to direct origin `65.109.100.94` with nginx serving HTTPS directly.
2. Revert DNS records to prior Cloudflare setup if Cloudflare is not currently blocked for the target users.
3. Disable Bunny custom hostnames or pause Bunny pull zones to stop serving stale/broken responses.
4. Restore nginx configuration backups if any origin header or real-IP changes caused issues.
5. Purge Bunny cache before re-attempting cutover after a fix.

Rollback steps:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -fsS -I --resolve fercup.com:443:65.109.100.94 https://fercup.com/
curl -fsS --resolve fercup.com:443:65.109.100.94 https://fercup.com/api/health
```

If DNS was moved to Bunny DNS and Bunny DNS itself is the problem, switch authoritative nameservers back at the registrar only after confirming registrar propagation timing and rollback blast radius.

## Acceptance Criteria

- `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com` are no longer served through Cloudflare proxy IPs.
- All three hostnames resolve through the selected Bunny/registrar DNS architecture.
- Bunny edge SSL works for all three hostnames.
- Origin HTTPS remains valid and usable for Bunny origin fetch.
- Public site loads correctly on desktop and mobile.
- Backoffice loads and authenticates correctly.
- `/api/health` succeeds through public and backoffice hostnames.
- `/api/*`, `/hubs/*`, auth/admin, checkout, and webhook routes are bypassed from cache.
- SignalR/WebSocket behavior is validated or an explicit direct-origin alternative is documented.
- Static assets are cached as intended and HTML is not incorrectly cached.
- Certbot renewal path is confirmed after DNS authority changes.
- Rollback path is documented, tested at least at command level, and does not require secrets in the repo.

## Out of Scope

- Performing the actual Bunny migration.
- Changing DNS records.
- Creating Bunny pull zones or hostnames.
- Reading, printing, storing, or committing Bunny API keys or any other secrets.
- Changing application code unless later discovery proves it is required for API/WebSocket/base URL behavior.
- Moving static assets to Bunny Storage.
- Rebuilding `ferweb/` or `backoffice/` unless later required by configuration changes.
- Decommissioning Cloudflare account resources beyond disabling/removing proxying for these hostnames.

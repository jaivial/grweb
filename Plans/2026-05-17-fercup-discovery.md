# FER Cup BunnyCDN Migration - Discovery Report

**Date:** 2026-05-17
**Phase:** Discovery (Phase 1 only - no DNS/migration changes made)
**Origin IP:** 65.109.100.94 (confirmed)

---

## 1. DNS and Authority

| Record | Value |
|--------|-------|
| NS servers | `dayana.ns.cloudflare.com`, `kenneth.ns.cloudflare.com` |
| `fercup.com` A | `65.109.100.94` |
| `www.fercup.com` A | `65.109.100.94` |
| `www.fercup.com` CNAME | None (direct A) |
| `backoffice.fercup.com` A | `65.109.100.94` |
| `backoffice.fercup.com` CNAME | None (direct A) |
| Registrar | Cloudflare, Inc. |
| Domain Expiry | 2027-05-17 |

**Observations:**
- DNS is managed by **Cloudflare** (not DNS-only mode yet - nameservers are Cloudflare)
- All three hostnames resolve to origin IP `65.109.100.94` directly
- No CNAME chains detected for www or backoffice
- **Decision required:** DNS authority must move away from Cloudflare before/simultaneous with Bunny migration

---

## 2. Origin Identity and Firewall

| Check | Result |
|-------|--------|
| Public IP (ifconfig.me) | `65.109.100.94` ✅ matches expected |
| Interface enp8s0 | `65.109.100.94/32` ✅ correct |
| Port 80 (nginx) | Listening 0.0.0.0:80 ✅ |
| Port 443 (nginx) | Listening 0.0.0.0:443 ✅ |
| Port 5006 (backend) | Listening 127.0.0.1:5006 ✅ (dotnet process) |
| UFW firewall | Inactive ✅ |
| iptables INPUT policy | ACCEPT ✅ (no blocking) |

**Observations:**
- Origin IP **confirmed as `65.109.100.94`**
- Firewall has NO restrictive rules - all traffic allowed (INPUT ACCEPT)
- **No firewall changes needed** for Bunny edge IPs (none blocked)
- Multiple Docker bridges active (172.17-20, 172.18 ranges) - not relevant for this migration

---

## 3. nginx Vhosts and Static Roots

### Vhosts Enabled
```
/etc/nginx/sites-enabled/fercup.com        -> /etc/nginx/sites-available/fercup.com
/etc/nginx/sites-enabled/backoffice.fercup.com -> /etc/nginx/sites-available/backoffice.fercup.com
```

### nginx Configuration Test
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**Warnings (non-blocking):**
- Multiple deprecated `http2` directives on various vhosts
- SSL stapling warnings for fercup.com (no OCSP responder)
- Conflicting server name for `fer-backoffice.menustudioai.com`

### Static Roots

| Hostname | Root Path | Exists |
|----------|-----------|--------|
| fercup.com / www.fercup.com | `/var/www/fercup.com` | ✅ Yes |
| backoffice.fercup.com | `/var/www/backoffice.fercup.com` | ✅ Yes |

**Public site files:**
- `index.html` (3435 bytes, last modified Sun May 17 18:03)
- `assets/` directory with JS/CSS bundles
- `favicon.ico`, `favicon.svg`, `robots.txt`, `sitemap.xml`, `og-image.svg`

**Backoffice files:**
- `index.html` (520 bytes)
- `assets/` directory with JS bundles
- PWA icons (android-chrome-*, apple-touch-icon)
- No obvious static asset fingerprinting observed

### Proxy Configuration (from nginx -T)

**fercup.com / www.fercup.com:**
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5006;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

location /hubs/ {
    proxy_pass http://127.0.0.1:5006;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**backoffice.fercup.com:** Same pattern (API and hubs proxies to 127.0.0.1:5006)

**Observations:**
- nginx is healthy and configured correctly
- `X-Real-IP` is passed (important for logging/security)
- WebSocket upgrade headers present for `/hubs/`
- **No `try_files` seen** - likely SPA with JS routing handled client-side

---

## 4. Certificates

### Certbot Certificate: `fercup.com`

| Field | Value |
|-------|-------|
| Serial | `69feff699c6a8ecefe939430ca776c35423` |
| Key Type | ECDSA |
| Subject | `CN = fercup.com` |
| Issuer | Let's Encrypt E7 |
| SANs | `fercup.com`, `www.fercup.com`, `backoffice.fercup.com` |
| Issued | May 17 17:14:48 2026 GMT |
| Expires | Aug 15 17:14:47 2026 GMT |
| Valid | **89 days remaining** ✅ |

**All three hostnames covered by single SAN certificate**

### HTTPS Origin Tests

| URL | Status | Notes |
|-----|--------|-------|
| `https://fercup.com/` | HTTP 200 ✅ | nginx, valid cert |
| `https://www.fercup.com/` | HTTP 200 ✅ | nginx, valid cert |
| `https://backoffice.fercup.com/` | HTTP 200 ✅ | nginx, valid cert |

**No Cache-Control headers on root responses (would be set by Bunny post-migration)**

### Observations
- Origin SSL cert is valid for all three hostnames
- No OCSP stapling configured (warning in nginx)
- **No Let's Encrypt rate limit concerns** for Bunny edge certs

---

## 5. Backend and App Endpoints

### Backend Health (Local)

```
GET http://127.0.0.1:5006/api/health
Response: {"success":true,"status":"healthy"}
Status: HTTP 200 ✅
```

### Backend Service

| Item | Value |
|------|-------|
| Type | **systemd service** (NOT Docker) |
| Service name | `grcup-api.service` |
| Status | `active (running)` since Sun 2026-05-17 18:01:19 UTC |
| PID | 1823808 |
| Binary | `/usr/bin/dotnet /opt/grcup-api/current/GrCup.Api.dll` |
| Memory | 125.8M |
| Docker containers | `grcup-mysql` (MySQL, healthy, port 3308->3306) |

### API Endpoint Tests (with Host header resolution)

| URL | Status |
|-----|--------|
| `https://fercup.com/api/health` | HTTP 200 ✅ |
| `https://backoffice.fercup.com/api/health` | HTTP 200 ✅ |

**Observations:**
- Backend is healthy and responsive
- systemd service (not container) - no restart needed for migration
- MySQL running in Docker as `grcup-mysql`
- Both public and backoffice API health endpoints work

---

## 6. SignalR and WebSocket Paths

### SignalR Hub URL (from source)
```typescript
// /var/www/grweb/backoffice/src/hooks/useSignalR.ts
const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${API_URL}/hubs/participants`)
```

**Hub path: `/hubs/participants`**

### WebSocket Test Response
```
curl -i --resolve fercup.com:443:65.109.100.94 https://fercup.com/hubs/participants

HTTP/2 400
server: nginx
cache-control: no-cache, no-store
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff

Connection ID required
```

**Response analysis:**
- nginx accepts the connection ✅
- HTTP 400 with "Connection ID required" = SignalR expects proper negotiate request
- This is **expected behavior** - WebSocket endpoint requires SignalR protocol handshake
- WebSocket upgrade headers are correctly configured in nginx

### Observations
- SignalR hub at `/hubs/participants` confirmed
- WebSocket upgrade headers present in nginx config
- **Full-site proxy mode with Bunny must support WebSocket upgrade for `/hubs/*`**
- If Bunny cannot handle WebSocket, fallback to direct-origin WebSocket URLs

---

## 7. Cacheable Static Assets

### Response Headers (No CDN)

**`https://fercup.com/`:**
```
HTTP/2 200
server: nginx
date: Sun, 17 May 2026 18:51:26 GMT
content-type: text/html
content-length: 3435
last-modified: Sun, 17 May 2026 18:03:55 GMT
vary: Accept-Encoding
etag: "6a0a030b-d6b"
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
accept-ranges: bytes
```
**No Cache-Control header** - Bunny will default to no-cache unless configured

### Static Files Found

**Public site (`/var/www/fercup.com`):**
- `index.html` (not fingerprinted)
- `assets/*.js` (fingerprinted: `index-DJ280vPA.js`, etc.)
- `assets/*.css` (if any)
- Images: `favicon.ico`, `favicon.svg`, `og-image.svg`, `robots.txt`, `sitemap.xml`

**Backoffice (`/var/www/backoffice.fercup.com`):**
- `index.html` (not fingerprinted)
- `assets/*.js` (fingerprinted)
- Images: icons, trophyicon.png, PWA icons

### Observations
- JS assets use content hashing (good for long-term caching)
- HTML files NOT fingerprinted (correct - should not be cached long)
- **No `Cache-Control` headers currently set** - Bunny configuration must add these
- Static assets are cacheable; HTML must NOT be cached

---

## Summary: Migration Readiness

### ✅ Ready / No Issues
- [x] Origin IP confirmed: `65.109.100.94`
- [x] DNS resolves to origin IP (not Cloudflare-proxied)
- [x] nginx healthy and configured for all 3 hostnames
- [x] SSL certificates valid for all hostnames (89 days)
- [x] Backend service healthy (`/api/health` returns 200)
- [x] WebSocket upgrade headers configured for `/hubs/`
- [x] Static roots exist and contain assets
- [x] No firewall blocks (all INPUT ACCEPT)
- [x] JS assets are fingerprinted (cache-friendly)

### ⚠️ Issues / Action Required Before Migration

| Issue | Severity | Notes |
|-------|----------|-------|
| **DNS authority is Cloudflare** | HIGH | Must move to Bunny DNS or registrar DNS before cutover |
| **No Cache-Control headers** | MEDIUM | Bunny must be configured to add these for static assets |
| **HTML not fingerprinted** | LOW | Correct behavior - HTML should not be cached long |
| **WebSocket support** | MEDIUM | Must verify Bunny supports WebSocket pass-through for `/hubs/*` |
| **fercup.com/apex cannot be CNAME** | MEDIUM | Need Bunny ALIAS/ANAME or A record strategy |

### Blockers for Migration
1. **DNS authority must change** - Cloudflare nameservers must be replaced
2. **Bunny WebSocket support confirmation needed** - if not supported, must use static-only CDN with direct-origin API/WebSocket

### Next Steps (Phase 2 - not yet executed)
1. Load Bunny credentials from secure location (`/etc` with mode 0600)
2. Create Bunny pull zones (public + backoffice separation recommended)
3. Configure cache rules with proper Cache-Control headers
4. Test WebSocket behavior with Bunny test hostname
5. Update DNS at registrar (lower TTL first)
6. Staggered cutover: backoffice → www → apex

---

## Files Referenced
- `/var/www/grweb/Plans/2026-05-17-fercup-bunnycdn-migration-plan.md`
- `/var/www/grweb/Plans/2026-05-17-fercup-discovery.md` (this file)

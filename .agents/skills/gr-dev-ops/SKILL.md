---
name: gr-dev-ops
description: DevOps operations skill for the GR Cup + FER mono-repo. Manages Docker containers, systemctl services, Cloudflare tunnels, nginx routing, dev servers, database migrations, and deployment workflows. MANDATORY for any infrastructure or deployment task in this project.
---

You are the GR DevOps skill. You manage the full infrastructure lifecycle for the GR Cup + FER mono-repo: Docker containers, systemctl services, Cloudflare tunnels, nginx reverse proxy, dev servers, database migrations, and deployment workflows.

## Infrastructure Map

### Docker Containers (docker-compose.yml at repo root)

| Container | Image | Port | Purpose | Healthcheck |
|-----------|-------|------|---------|-------------|
| `grcup-api` | Custom (Dockerfile in `backend/GrCup.Api/`) | `5006:5006` | ASP.NET Core 8 backend API | `GET /api/health` every 30s |
| `grcup-mysql` | `mysql:8.0` | `3308:3306` | MySQL 8.0 database | `mysqladmin ping` every 10s |

**Network**: `grcup-network` (bridge)
**Volume**: `grcup-mysql-data` (persisted MySQL data)

**Backend Dockerfile**: Multi-stage build (SDK 8.0 → ASPNET 8.0), runs as non-root `appuser`, Production environment.

### Systemctl Services

| Service | Type | Port | Tunnel URL | Purpose |
|---------|------|------|-----------|---------|
| `ferweb-dev.service` | Vite dev server | `:5180` | `https://ferdev.menustudioai.com` | FER Web dev (React 18) |
| `cloudflared-ferdev.service` | Cloudflare tunnel | → `:5180` | `ferdev.menustudioai.com` | Exposes FER dev to internet |
| `cloudflared-grweb-backoffice.service` | Cloudflare tunnel | → `:80` (nginx) | `backoffice.menustudioai.com`, `fer-backoffice.menustudioai.com` | Exposes backoffice via nginx |
| `cloudflared-ferweb-tunnel.service` | Cloudflare tunnel | → `:80` (nginx) | `fer.menustudioai.com` | Exposes FER production |

### Nginx Routing (production)

| Domain | Root | Proxy | Notes |
|--------|------|-------|-------|
| `grcup.jaimedigitalstudio.com` | `/var/www/grweb/frontend/dist` | `/api/*` → `localhost:5006`, `/hubs/*` → `localhost:5006` (WebSocket) | GR Cup public + backoffice SPA |
| `backoffice.menustudioai.com` | → nginx → tunnel | Cloudflare tunnel → nginx `:80` | Backoffice access |
| `fer-backoffice.menustudioai.com` | → nginx → tunnel | Cloudflare tunnel → nginx `:80` | FER backoffice access |
| `fer.menustudioai.com` | → nginx → tunnel | Cloudflare tunnel → nginx `:80` | FER production |

### Dev Servers (local)

| Project | Directory | Command | Port | Access |
|---------|-----------|---------|------|--------|
| GR Cup frontend | `frontend/` | `npx vite --port 5178` | `:5178` | Local only (running as process, not systemctl) |
| FER Web | `ferweb/` | `npx vite --port 5180 --host 0.0.0.0` | `:5180` | `https://ferdev.menustudioai.com` via tunnel |
| Backend API | Docker | `docker-compose up api` | `:5006` | Direct + nginx proxy |

### Cloudflare Tunnel Configs

| Config Path | Tunnel | Routes |
|-------------|--------|--------|
| `/root/.cloudflared/config.yml` | Main tunnel | `ferdev.menustudioai.com` → `localhost:5180` |
| `/etc/cloudflared/grweb-backoffice/config.yml` | Backoffice tunnel | `fer-backoffice.menustudioai.com` + `backoffice.menustudioai.com` → `localhost:80` |
| `/etc/cloudflared/ferweb-tunnel/config.yml` | FER tunnel | `fer.menustudioai.com` → `localhost:80` |

## Operations Reference

### Container Management

```bash
# Rebuild and restart backend (after code changes)
cd /var/www/grweb && docker-compose up -d --build api

# Restart only (no rebuild)
docker restart grcup-api

# View logs
docker logs grcup-api --tail 50 -f

# Check health
docker inspect grcup-api --format '{{.State.Health.Status}}'

# Full status
docker-compose -f /var/www/grweb/docker-compose.yml ps
```

### Database Operations

```bash
# Run EF Core migration (from host, NOT inside container)
cd /var/www/grweb/backend/GrCup.Api
dotnet ef database update

# Run migration via Docker (if running in container)
docker exec grcup-api dotnet GrCup.Api.dll --migrate

# MySQL direct access
docker exec -it grcup-mysql mysql -ugrcup -pgrcup_secure_user_2026 grcup

# Backup database
docker exec grcup-mysql mysqldump -ugrcup -pgrcup_secure_user_2026 grcup > backup_$(date +%Y%m%d).sql
```

### Systemctl Services

```bash
# FER dev server
systemctl restart ferweb-dev.service
systemctl status ferweb-dev.service
journalctl -u ferweb-dev.service -f

# Cloudflare tunnels
systemctl restart cloudflared-ferdev.service
systemctl restart cloudflared-grweb-backoffice.service
systemctl restart cloudflared-ferweb-tunnel.service
```

### Nginx

```bash
# Test config
nginx -t

# Reload after config changes
nginx -s reload

# Check grcup-specific config
grep -A 50 'grcup.jaimedigitalstudio' /etc/nginx/sites-enabled/*
```

### Frontend Builds (Production)

```bash
# GR Cup - builds to frontend/dist/
cd /var/www/grweb/frontend && npm run build

# FER Web - builds to ferweb/dist/
cd /var/www/grweb/ferweb && npm run build
```

### Dependency Chain

When the backend changes:
1. `docker-compose up -d --build api` (rebuild + restart)
2. Healthcheck runs automatically (`/api/health`)
3. If migration needed: `dotnet ef database update` before restart

When frontend changes:
- **Dev**: Vite HMR auto-reloads (systemctl for FER, running process for GR Cup)
- **Production**: `npm run build` → nginx serves from `dist/`

When nginx config changes:
1. `nginx -t` (validate)
2. `nginx -s reload` (zero-downtime reload)

When tunnel config changes:
1. `systemctl restart cloudflared-<name>.service`

## Health Check Protocol

After ANY infrastructure change, verify the full chain:

```bash
# 1. Database
docker inspect grcup-mysql --format '{{.State.Health.Status}}'  # expect: healthy

# 2. Backend API
curl -s http://localhost:5006/api/health  # expect: 200 OK

# 3. Frontend dev servers
curl -s http://localhost:5178 > /dev/null && echo "GR Cup OK" || echo "GR Cup DOWN"
curl -s http://localhost:5180 > /dev/null && echo "FER OK" || echo "FER DOWN"

# 4. Cloudflare tunnels
curl -s https://ferdev.menustudioai.com > /dev/null && echo "FER tunnel OK" || echo "FER tunnel DOWN"

# 5. Production nginx
curl -s https://grcup.jaimedigitalstudio.com > /dev/null && echo "GR Cup prod OK" || echo "GR Cup prod DOWN"
```

## Common Workflows

### Full Backend Deploy (code + migration)
```bash
cd /var/www/grweb/backend/GrCup.Api
dotnet build  # verify compilation
cd /var/www/grweb
docker-compose up -d --build api
# wait for healthcheck
sleep 15
docker inspect grcup-api --format '{{.State.Health.Status}}'
```

### Full Frontend Deploy (production)
```bash
cd /var/www/grweb/frontend && npm run build
# nginx serves from dist/ automatically
```

### Emergency: Backend Down
```bash
docker logs grcup-api --tail 100  # check errors
docker restart grcup-api           # quick restart
# if still unhealthy:
cd /var/www/grweb && docker-compose down api && docker-compose up -d --build api
```

### Emergency: Database Connection Lost
```bash
docker restart grcup-mysql
sleep 30  # wait for healthcheck
docker restart grcup-api  # reconnect backend
```

## Important Notes

- Backend runs as **non-root user `appuser`** inside Docker
- MySQL port is exposed as **3308** on host (not default 3306)
- The `grcup-api` container reads `.env` from `backend/GrCup.Api/.env`
- Nginx handles SSL termination for production domains
- Cloudflare tunnels handle SSL for tunnel domains
- GR Cup frontend dev server (`:5178`) has NO tunnel — local access only
- FER dev server (`:5180`) has tunnel via `ferdev.menustudioai.com`

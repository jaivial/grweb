# FER Cup Systemd + Static Hosting Deployment Plan

**Date:** 2026-05-17  
**Status:** Plan only - do not execute automatically  
**Scope:** Backend service migration from Docker to systemd, optional MySQL migration from Docker to local MySQL, static hosting for `ferweb/` and `backoffice/`, Cloudflare DNS configuration for `fercup.com` and `backoffice.fercup.com`.

## Goals

1. Deploy `backend/GrCup.Api/` as a new host-managed `systemd` service on port `5006`.
2. Stop and disable the existing Docker backend container `grcup-api` after the systemd service is validated.
3. If the production MySQL database is currently in Docker container `grcup-mysql`, migrate it from Docker volume `grcup-mysql-data` to local server MySQL.
4. Build `ferweb/` and serve `ferweb/dist` on `https://fercup.com`.
5. Build `backoffice/` and serve `backoffice/dist` on `https://backoffice.fercup.com`.
6. Configure Cloudflare DNS without writing API secrets into the repo, shell history, or deployment files.

## Security Notes

- A Cloudflare API key/account credential was exposed during planning. Revoke or rotate the exposed credential before deployment.
- Replace it with a least-privilege Cloudflare API token stored outside this repository, such as in a password manager, CI/CD secret store, or root-owned file under `/etc` with mode `0600`.
- The Cloudflare token should have only the permissions needed for DNS changes on the target zone, for example `Zone:Read` and `DNS:Edit` scoped only to `fercup.com`.
- Do not place Cloudflare secrets in Markdown plans, `.env` files committed to git, shell scripts in the repo, nginx configs, systemd unit files, or command examples.
- The existing repo includes historical deployment material that appears to contain credential-like values. Treat those values as compromised and rotate them before production use.

## Current Repo Context

- Backend project: `backend/GrCup.Api/GrCup.Api.csproj` targeting `.NET 8`.
- Backend health endpoint: `GET /api/health`.
- Backend SignalR hub path: `/hubs/participants`.
- Backend currently has Docker service `api` with container name `grcup-api` in `docker-compose.yml`.
- Docker MySQL service uses container name `grcup-mysql`, host port `3308`, database name `grcup`, and volume `grcup-mysql-data`.
- Backend reads `ConnectionStrings__Default` from environment before falling back to appsettings.
- `ferweb/` build command: `npm run build`, output: `ferweb/dist`.
- `backoffice/` build command: `npm run build`, output: `backoffice/dist`.

## Assumptions To Confirm

- The production server already has nginx, systemd, .NET 8 runtime, Node/npm, and MySQL 8 available or installable.
- `fercup.com` and `backoffice.fercup.com` should point to this server, not Cloudflare Tunnel-only hostnames.
- The backend API remains available on localhost port `5006` and is proxied by nginx for `/api/*` and `/hubs/*`.
- Static files can be served directly from `/var/www/grweb/ferweb/dist` and `/var/www/grweb/backoffice/dist`, or copied to release directories under `/var/www/fercup` and `/var/www/fercup-backoffice`.
- The local MySQL target should use database `grcup`; a dedicated least-privilege database user should be created for the backend.

## Phase 1 - Preflight Discovery

Run discovery commands and record outputs in the deployment ticket, not in this repo if they contain secrets.

```bash
hostnamectl
date -Is
pwd
git -C /var/www/grweb status --short
dotnet --info
node --version
npm --version
mysql --version
nginx -v
systemctl status nginx --no-pager
docker compose -f /var/www/grweb/docker-compose.yml ps
docker inspect grcup-api --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
docker inspect grcup-mysql --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
ss -ltnp | grep -E ':(80|443|5006|3306|3308)\b'
```

Confirm which MySQL instance is authoritative:

```bash
# Docker MySQL check. Use interactive password input or a temporary protected env var; do not paste passwords into shared logs.
docker exec -i grcup-mysql mysql -u grcup -p -e "SELECT DATABASE(), COUNT(*) FROM information_schema.tables WHERE table_schema='grcup';" grcup

# Local MySQL check.
sudo mysql -e "SELECT VERSION(); SHOW DATABASES;"
```

## Phase 2 - Backups

Create filesystem and database backups before changing service ownership.

```bash
sudo install -d -m 0750 /var/backups/grcup
sudo tar -C /var/www -czf /var/backups/grcup/grweb-files-$(date +%Y%m%d-%H%M%S).tar.gz grweb/backend/GrCup.Api grweb/ferweb grweb/backoffice
```

If Docker MySQL is authoritative:

```bash
docker exec grcup-mysql mysqldump --single-transaction --routines --triggers --events -u grcup -p grcup \
  | sudo tee /var/backups/grcup/grcup-docker-mysql-$(date +%Y%m%d-%H%M%S).sql >/dev/null
sudo chmod 0600 /var/backups/grcup/grcup-docker-mysql-*.sql
```

Verify backup readability without printing sensitive data:

```bash
sudo test -s /var/backups/grcup/grcup-docker-mysql-*.sql
sudo ls -lh /var/backups/grcup/
```

## Phase 3 - Optional MySQL Migration From Docker To Local MySQL

Skip this phase if local MySQL is already authoritative and contains the current `grcup` data.

1. Create a local database and a least-privilege app user. Use a generated password stored outside the repo.

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS grcup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'grcup_app'@'localhost' IDENTIFIED BY '<GENERATED_DB_PASSWORD>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON grcup.* TO 'grcup_app'@'localhost';
FLUSH PRIVILEGES;
```

2. Import the Docker dump into local MySQL.

```bash
sudo mysql grcup < /var/backups/grcup/<DUMP_FILE>.sql
```

3. Validate table counts and latest records against Docker before cutting over.

```bash
sudo mysql -e "SELECT COUNT(*) AS tables_count FROM information_schema.tables WHERE table_schema='grcup';"
sudo mysql grcup -e "SHOW TABLES;"
```

4. Keep `grcup-mysql` running until the backend systemd service has been validated against local MySQL and a rollback window has passed.

## Phase 4 - Backend Publish Layout

Recommended host layout:

- App release root: `/opt/grcup-api/releases/<timestamp>`.
- Active symlink: `/opt/grcup-api/current`.
- External environment file: `/etc/grcup-api/grcup-api.env`.
- Runtime user: `grcup-api` system user without shell login.

Create runtime user and directories:

```bash
sudo useradd --system --home /opt/grcup-api --shell /usr/sbin/nologin grcup-api || true
sudo install -d -o grcup-api -g grcup-api -m 0755 /opt/grcup-api/releases
sudo install -d -o root -g grcup-api -m 0750 /etc/grcup-api
```

Create `/etc/grcup-api/grcup-api.env` with mode `0640`, owned by `root:grcup-api`. Do not commit this file.

```ini
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_URLS=http://127.0.0.1:5006
ConnectionStrings__Default=Server=127.0.0.1;Port=3306;Database=grcup;User=grcup_app;Password=<GENERATED_DB_PASSWORD>;CharSet=utf8mb4;
JWT_SECRET=<GENERATED_32_PLUS_CHARACTER_SECRET>
STRIPE_SECRET_KEY=<PRODUCTION_STRIPE_SECRET>
STRIPE_PUBLISHABLE_KEY=<PRODUCTION_STRIPE_PUBLISHABLE_KEY>
STRIPE_WEBHOOK_SECRET=<PRODUCTION_STRIPE_WEBHOOK_SECRET>
```

Publish backend:

```bash
cd /var/www/grweb/backend/GrCup.Api
dotnet restore
dotnet publish GrCup.Api.csproj -c Release -o /opt/grcup-api/releases/$(date +%Y%m%d-%H%M%S)
sudo chown -R grcup-api:grcup-api /opt/grcup-api/releases/<RELEASE_TIMESTAMP>
sudo ln -sfn /opt/grcup-api/releases/<RELEASE_TIMESTAMP> /opt/grcup-api/current
```

## Phase 5 - Systemd Unit Template

Create `/etc/systemd/system/grcup-api.service`:

```ini
[Unit]
Description=GR Cup / FER Cup ASP.NET Core API
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=simple
User=grcup-api
Group=grcup-api
WorkingDirectory=/opt/grcup-api/current
EnvironmentFile=/etc/grcup-api/grcup-api.env
ExecStart=/usr/bin/dotnet /opt/grcup-api/current/GrCup.Api.dll
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=grcup-api
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/grcup-api

[Install]
WantedBy=multi-user.target
```

Start and validate the new service before disabling Docker:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now grcup-api.service
sudo systemctl status grcup-api.service --no-pager
curl -fsS http://127.0.0.1:5006/api/health
journalctl -u grcup-api.service -n 100 --no-pager
```

## Phase 6 - Stop And Disable Existing Docker Backend

Only run this after systemd health checks pass.

```bash
docker stop grcup-api
docker update --restart=no grcup-api
docker compose -f /var/www/grweb/docker-compose.yml stop api
docker compose -f /var/www/grweb/docker-compose.yml ps
curl -fsS http://127.0.0.1:5006/api/health
```

If local MySQL is validated and Docker MySQL is no longer needed, stop it only after a rollback window is approved:

```bash
docker stop grcup-mysql
docker update --restart=no grcup-mysql
```

Do not remove containers or volumes until backups are verified and the rollback window has expired.

## Phase 7 - Build Static Frontends

Install dependencies and build FER public site:

```bash
cd /var/www/grweb/ferweb
npm ci
npm run build
test -f dist/index.html
```

Install dependencies and build backoffice:

```bash
cd /var/www/grweb/backoffice
npm ci
npm run build
test -f dist/index.html
```

Recommended static release directories:

```bash
sudo install -d -m 0755 /var/www/fercup.com
sudo install -d -m 0755 /var/www/backoffice.fercup.com
sudo rsync -a --delete /var/www/grweb/ferweb/dist/ /var/www/fercup.com/
sudo rsync -a --delete /var/www/grweb/backoffice/dist/ /var/www/backoffice.fercup.com/
```

## Phase 8 - Nginx Static Hosting And API Proxy

Create nginx server blocks for `fercup.com` and `backoffice.fercup.com`. Adjust certificate paths to match the server's SSL automation.

```nginx
server {
    listen 80;
    server_name fercup.com www.fercup.com;
    return 301 https://fercup.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name fercup.com;

    root /var/www/fercup.com;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /hubs/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 80;
    server_name backoffice.fercup.com;
    return 301 https://backoffice.fercup.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name backoffice.fercup.com;

    root /var/www/backoffice.fercup.com;
    index index.html;

    add_header Permissions-Policy "camera=(self)" always;

    location /api/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /hubs/ {
        proxy_pass http://127.0.0.1:5006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Phase 9 - Cloudflare DNS Plan

Use the Cloudflare dashboard or a least-privilege API token stored outside the repo. Do not paste token values into commands that will be saved in shell history.

Recommended records:

| Name | Type | Target | Proxy | Notes |
| --- | --- | --- | --- | --- |
| `fercup.com` | `A` | `<SERVER_PUBLIC_IPV4>` | Proxied | Public FER landing |
| `www.fercup.com` | `CNAME` | `fercup.com` | Proxied | Redirects to apex via nginx |
| `backoffice.fercup.com` | `A` or `CNAME` | `<SERVER_PUBLIC_IPV4>` or `fercup.com` | Proxied | Backoffice SPA |

Cloudflare settings checklist:

- SSL/TLS mode: `Full (strict)` after valid origin certificates are installed.
- Enable proxied records only after nginx responds correctly on `80` and `443`.
- Keep DNS TTL automatic unless there is a planned cutover window requiring a temporary lower TTL.
- If using an API token, export it only in the current shell session and unset it immediately after use.

Example API workflow with placeholders only:

```bash
export CLOUDFLARE_API_TOKEN='<TOKEN_FROM_SECRET_STORE>'
# Use Cloudflare API or cli tooling to upsert DNS records for the fercup.com zone.
unset CLOUDFLARE_API_TOKEN
```

## Phase 10 - Validation Checklist

Backend:

```bash
systemctl is-active grcup-api.service
curl -fsS http://127.0.0.1:5006/api/health
journalctl -u grcup-api.service -n 100 --no-pager
```

Database:

```bash
sudo mysql grcup -e "SHOW TABLES;"
sudo mysql grcup -e "SELECT COUNT(*) FROM __EFMigrationsHistory;"
```

Static sites locally through nginx:

```bash
curl -I -H 'Host: fercup.com' http://127.0.0.1/
curl -I -H 'Host: backoffice.fercup.com' http://127.0.0.1/
curl -fsS -H 'Host: fercup.com' http://127.0.0.1/api/health
```

Public validation after DNS/SSL:

```bash
curl -I https://fercup.com
curl -I https://www.fercup.com
curl -I https://backoffice.fercup.com
curl -fsS https://fercup.com/api/health
```

Browser checks:

- `https://fercup.com` loads the FER landing without console API base URL errors.
- `https://backoffice.fercup.com` loads the backoffice SPA.
- Backoffice login works using production API cookies/tokens.
- SignalR/WebSocket paths under `/hubs/` connect successfully from backoffice.
- Camera permissions header remains available for backoffice QR/check-in flows.

## Rollback Plan

Backend rollback to Docker:

```bash
sudo systemctl stop grcup-api.service
docker update --restart=unless-stopped grcup-api
docker start grcup-api
curl -fsS http://127.0.0.1:5006/api/health
```

Backend rollback to previous systemd release:

```bash
sudo ln -sfn /opt/grcup-api/releases/<PREVIOUS_RELEASE_TIMESTAMP> /opt/grcup-api/current
sudo systemctl restart grcup-api.service
curl -fsS http://127.0.0.1:5006/api/health
```

Database rollback:

- If local MySQL migration fails before cutover, leave Docker MySQL running and keep the backend connection string pointed to Docker host port `3308` or the existing known-good database endpoint.
- If local MySQL fails after cutover, stop `grcup-api.service`, restore the previous connection string, restart Docker MySQL if needed, and restart the backend.
- Do not delete `grcup-mysql` or `grcup-mysql-data` until the rollback window is closed.

Static site rollback:

```bash
sudo rsync -a --delete /var/backups/grcup/<PREVIOUS_FER_STATIC_BACKUP>/ /var/www/fercup.com/
sudo rsync -a --delete /var/backups/grcup/<PREVIOUS_BACKOFFICE_STATIC_BACKUP>/ /var/www/backoffice.fercup.com/
sudo nginx -t
sudo systemctl reload nginx
```

DNS rollback:

- Revert Cloudflare records to the previous targets using the dashboard or least-privilege token.
- Keep old DNS targets documented in the deployment ticket before making DNS changes.

## Acceptance Criteria

- `grcup-api.service` is enabled, active, and serves `GET /api/health` on `127.0.0.1:5006`.
- `grcup-api` Docker container is stopped and restart policy is disabled after systemd validation.
- If Docker MySQL was authoritative, local MySQL contains the migrated `grcup` database and the backend uses `ConnectionStrings__Default` from `/etc/grcup-api/grcup-api.env`.
- `https://fercup.com` serves the built `ferweb/` SPA.
- `https://backoffice.fercup.com` serves the built `backoffice/` SPA.
- `/api/*` and `/hubs/*` proxy from both domains to the backend correctly.
- Cloudflare DNS records exist for `fercup.com`, `www.fercup.com`, and `backoffice.fercup.com` without any secrets stored in the repo.
- Exposed Cloudflare credentials are revoked/rotated and replaced by a least-privilege token stored outside the repo.
- Rollback paths for backend, database, static assets, and DNS are documented and tested at least to command-readiness.

# GrWeb Tunnel Services - Quick Reference

## Services Running

| Service | Description | Port | URL |
|---------|-------------|------|-----|
| grweb-frontend-dev | Vite dev server | 5177 | http://localhost:5177 |
| cloudflared-grweb-backoffice | Cloudflare tunnel for grweb | - | https://backoffice.menustudioai.com |
| cloudflared-ferweb-tunnel | Cloudflare tunnel for future project | 8080 (placeholder) | https://ferweb.menustudioai.com |

## Systemd Commands

```bash
# View status
systemctl status grweb-frontend-dev
systemctl status cloudflared-grweb-backoffice
systemctl status cloudflared-ferweb-tunnel

# Stop services
systemctl stop grweb-frontend-dev
systemctl stop cloudflared-grweb-backoffice
systemctl stop cloudflared-ferweb-tunnel

# Start services
systemctl start grweb-frontend-dev
systemctl start cloudflared-grweb-backoffice
systemctl start cloudflared-ferweb-tunnel

# Restart services
systemctl restart grweb-frontend-dev
systemctl restart cloudflared-grweb-backoffice
```

## Cloudflare Tunnels

| Tunnel ID | Name | Status |
|-----------|------|--------|
| b6ad763a-9c0a-4bb6-8d26-6bc0dc42fdda | grweb-backoffice | healthy |
| 255db0fa-cfeb-4e84-9588-dc7568dea5b9 | ferweb-tunnel | healthy |

## DNS Records

| Subdomain | Points To |
|-----------|-----------|
| backoffice.menustudioai.com | grweb-backoffice tunnel |
| ferweb.menustudioai.com | ferweb-tunnel |

## Configuration Files

- `/etc/cloudflared/grweb-backoffice/config.yml`
- `/etc/cloudflared/ferweb-tunnel/config.yml`
- `/etc/cloudflared/credentials-grweb-backoffice.json`
- `/etc/cloudflared/credentials-ferweb-tunnel.json`

## Ferweb Setup (Future)

To set up ferweb when ready:
1. Clone/create project in `/var/www/ferweb`
2. Update `/etc/cloudflared/ferweb-tunnel/config.yml` to point to correct port
3. Restart: `systemctl restart cloudflared-ferweb-tunnel`

## URLs

- **GrWeb Backoffice**: https://backoffice.menustudioai.com
- **FerWeb** (future): https://ferweb.menustudioai.com

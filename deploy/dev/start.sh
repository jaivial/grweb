#!/bin/bash
set -e

# Inject dev DB connection string for the .NET backend.
# Reads from env (Docker run -e) or falls back to defaults below.
export ConnectionStrings__Default="${ConnectionStrings__Default:-Server=${HOST_GATEWAY};Port=3306;Database=grscup-dev;User=root;Password=myth;CharSet=utf8mb4;}"

echo "[grscup-dev] DB target: ${ConnectionStrings__Default}"
echo "[grscup-dev] Starting supervisord..."

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
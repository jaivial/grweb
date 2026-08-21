# grscup-dev: single container running backend (dotnet watch),
# backoffice + frontend (vite HMR), and nginx reverse-proxy.
# DB lives on the host, not inside this container.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS base
ENV DEBIAN_FRONTEND=noninteractive

# Install Node 20 LTS + nginx + supervisor
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends \
      nodejs nginx supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Backend (image-only restore; source mounted at runtime) ---
COPY backend/GrCup.Api/GrCup.Api.csproj /app/backend/GrCup.Api/GrCup.Api.csproj
WORKDIR /app/backend/GrCup.Api
RUN dotnet restore GrCup.Api.csproj
WORKDIR /app

# --- Backoffice + Frontend: install deps at build time, then copy rest of source ---
COPY backoffice/package.json backoffice/package-lock.json /app/backoffice/
WORKDIR /app/backoffice
RUN npm ci --no-audit --no-fund
COPY backoffice/index.html backoffice/vite.config.ts backoffice/postcss.config.js backoffice/tailwind.config.js backoffice/tsconfig.json backoffice/tsconfig.app.json backoffice/tsconfig.node.json backoffice/vitest.config.ts /app/backoffice/
COPY backoffice/public /app/backoffice/public
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json /app/frontend/
WORKDIR /app/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.ts frontend/postcss.config.js frontend/tailwind.config.js frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/vitest.config.ts /app/frontend/
COPY frontend/public /app/frontend/public
WORKDIR /app

# --- nginx + supervisor + config ---
COPY deploy/dev/nginx.conf /etc/nginx/nginx.conf
COPY deploy/dev/supervisord.conf /etc/supervisor/conf.d/grscup-dev.conf
COPY deploy/dev/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

ENV ASPNETCORE_ENVIRONMENT=Development \
    ASPNETCORE_URLS=http://+:5006 \
    NODE_ENV=development \
    HOST_GATEWAY=host.docker.internal \
    ConnectionStrings__Default="Server=host.docker.internal;Port=3306;Database=grscup-dev;User=root;Password=myth;CharSet=utf8mb4;"

EXPOSE 80

CMD ["/usr/local/bin/start.sh"]
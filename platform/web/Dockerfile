# syntax=docker/dockerfile:1.7
# Angular apps of the GR Cup platform. Targets:
#   docker build --target public     -t grcup/web:<sha> platform/web          (SSR, Node)
#   docker build --target backoffice -t grcup/backoffice:<sha> platform/web   (static SPA, nginx-unprivileged)
FROM node:24-alpine AS build
WORKDIR /w
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm ng build public && pnpm ng build backoffice

FROM node:24-alpine AS public
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /w/dist/public ./dist/public
USER node
EXPOSE 8080
CMD ["node", "dist/public/server/server.mjs"]

FROM nginxinc/nginx-unprivileged:1.29-alpine AS backoffice
COPY nginx-backoffice.conf /etc/nginx/conf.d/default.conf
COPY --from=build /w/dist/backoffice/browser /usr/share/nginx/html
EXPOSE 8080

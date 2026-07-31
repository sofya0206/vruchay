# Сборка SPA + Caddy: раздаёт статику, проксирует /api и /health на api,
# сам получает TLS-сертификаты (Let's Encrypt) для DOMAIN.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @gramota/shared --filter @gramota/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @gramota/shared build && pnpm --filter @gramota/web build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/www

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

# Данные предпринимателя для политики обработки данных. В образ они попадают
# при сборке, а не лежат в репозитории: адрес регистрации ИП — домашний адрес.
# Если их не передать, страница политики скажет об этом прямым текстом,
# а не сделает вид, что документ опубликован.
ARG VITE_OPERATOR_NAME
ARG VITE_OPERATOR_INN
ARG VITE_OPERATOR_OGRNIP
ARG VITE_OPERATOR_ADDRESS
ARG VITE_OPERATOR_EMAIL
ARG VITE_OPERATOR_PHONE
ARG VITE_POLICY_DATE
ENV VITE_OPERATOR_NAME=$VITE_OPERATOR_NAME \
    VITE_OPERATOR_INN=$VITE_OPERATOR_INN \
    VITE_OPERATOR_OGRNIP=$VITE_OPERATOR_OGRNIP \
    VITE_OPERATOR_ADDRESS=$VITE_OPERATOR_ADDRESS \
    VITE_OPERATOR_EMAIL=$VITE_OPERATOR_EMAIL \
    VITE_OPERATOR_PHONE=$VITE_OPERATOR_PHONE \
    VITE_POLICY_DATE=$VITE_POLICY_DATE

RUN pnpm --filter @gramota/shared build && pnpm --filter @gramota/web build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv/www

# API и worker собираются из одного образа; роль задаётся командой запуска.
# В Фазе 2 сюда добавится Chromium для Playwright (отдельный слой в worker-стадии).
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @gramota/shared --filter @gramota/server
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @gramota/shared build \
  && pnpm --filter @gramota/server exec prisma generate \
  && pnpm --filter @gramota/server build \
  && pnpm --filter @gramota/server deploy --prod /out

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /out /app

# Chromium для генерации PDF ставится вместе с системными зависимостями.
# В образе он есть у обеих ролей: контейнер один, команда запуска разная.
RUN npx --yes playwright@1.62.0 install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Приложение работает не от root: если Chromium удастся скомпрометировать,
# у злоумышленника не будет прав на изменение образа и системных файлов.
RUN useradd --create-home --shell /usr/sbin/nologin app \
    && chown -R app:app /app /home/app
USER app

EXPOSE 3000
CMD ["node", "dist/main.js"]

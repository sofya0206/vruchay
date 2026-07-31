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
EXPOSE 3000
CMD ["node", "dist/main.js"]

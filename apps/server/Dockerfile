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
# Браузеры — в общий каталог, а не в домашний каталог того, кто их ставил.
# Ставит их root, а работает приложение от пользователя app: в /root/.cache
# он не заглянет и браузер не найдёт. Проверяется это только запуском —
# сборка образа проходит успешно в любом случае.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /out /app

# Chromium ставится тем же playwright, что лежит в зависимостях приложения:
# версия библиотеки и номер сборки браузера должны совпадать, иначе
# библиотека будет искать браузер, которого нет.
# В образе он есть у обеих ролей: контейнер один, команда запуска разная.
RUN node_modules/.bin/playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && rm -rf /var/lib/apt/lists/*

# Приложение работает не от root: если Chromium удастся скомпрометировать,
# у злоумышленника не будет прав на изменение образа и системных файлов.
RUN useradd --create-home --shell /usr/sbin/nologin app \
    && chown -R app:app /app /home/app
USER app

# Браузер запускается здесь же, при сборке, и именно от пользователя app.
# Каталог с браузерами задаётся переменной, и ошибиться в нём легко, а
# проявилась бы ошибка только в проде и только на первом же награждении:
# сборка образа без этой строки проходит успешно в любом случае.
RUN node -e "require('playwright').chromium.launch({args:['--no-sandbox']}).then(b=>b.close())" \
    && echo 'Chromium запускается от пользователя app'

EXPOSE 3000
CMD ["node", "dist/main.js"]

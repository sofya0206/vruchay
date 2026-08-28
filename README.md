# Вручай — сервис цифровых документов

Массовое создание, выдача и проверка именных документов: грамоты,
сертификаты, дипломы. Загружаешь список людей, выбираешь макет —
сервис выпускает PDF, рассылает по почте и даёт каждому документу
страницу проверки по QR.

Сайт: https://vruchay.ru. Данные и серверы — в РФ (152-ФЗ), Selectel,
аттестованная зона.

## Стек

TypeScript · React 19 + Vite + Tailwind · NestJS 11 (Fastify) · Prisma +
PostgreSQL · BullMQ + Redis · Playwright (PDF) · Docker + Caddy.

## Структура

- `apps/web` — интерфейс (кабинет, редактор, посадочная)
- `apps/server` — API и воркер генерации/рассылки
- `packages/shared` — общие типы и схема макета (контракт редактор ⇄ PDF)
- `docs/` — решения (ADR), инструкции, бизнес-документы

## Запуск локально

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres, redis, minio, mailpit
cp .env.example apps/server/.env
pnpm --filter @gramota/server prisma:migrate
pnpm dev                                          # server:3000 + web:5173
```

Веб: http://localhost:5173 · Письма: http://localhost:8025 · MinIO: http://localhost:9001

Перед коммитом: `pnpm lint && pnpm -r test && pnpm -r build`.

Часть тестов проверки списка сверяет измерение текста с настоящим Chromium
и потому требует установленных браузеров Playwright и шрифтов
в `apps/web/public/fonts`. В обычный прогон они не входят — запускаются флагом:

```bash
CHROMIUM_TESTS=1 pnpm --filter @gramota/server test
```

Гонять их стоит после правок метрик шрифтов, вёрстки листа и самой проверки:
именно они подтверждают, что мы не обещаем «влезет» там, где текст обрежется.
Локально может понадобиться `PLAYWRIGHT_CHANNEL=chrome`, если браузеры
Playwright не скачаны.

## Где что

- Правила для кода и ИИ — `CLAUDE.md`
- Эксплуатация: выкат, бэкапы, восстановление — `RUNBOOK.md`
- Установка с нуля и передача проекта — `ПЕРЕДАЧА.md`, `docs/установка-по-шагам.md`
- Идеи на потом — `docs/бэклог.md`

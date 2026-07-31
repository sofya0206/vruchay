# Gramota — сервис массовой генерации именных грамот и сертификатов

Собственный аналог gramotadel.express: конструктор документов, таблица получателей,
массовая генерация PDF, рассылка с собственного домена, интеграция с Tilda.
Хостинг и обработка персональных данных — в РФ (152-ФЗ, РБ 99-З).

## Структура

- `apps/server` — API (NestJS + Fastify) и worker (BullMQ, с Фазы 2)
- `apps/web` — SPA (React + Vite)
- `packages/shared` — общие типы и Zod-схема макета листа (контракт редактор ⇄ PDF-рендер)

## Локальная разработка

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d   # postgres, redis, minio, mailpit
cp .env.example apps/server/.env
pnpm --filter @gramota/server prisma:migrate     # миграции БД
pnpm dev                                          # server:3000 + web:5173
```

- Веб: http://localhost:5173 (проксирует /api и /health на сервер)
- Mailpit (перехват писем): http://localhost:8025
- MinIO console: http://localhost:9001 (gramota / gramota-secret)

## Проверки

```bash
pnpm lint && pnpm -r test && pnpm -r build
```

## Документы

- План проекта и фаз: `~/.claude/plans/generic-snuggling-sun.md`
- Эксплуатация (деплой, бэкапы, восстановление): `RUNBOOK.md`

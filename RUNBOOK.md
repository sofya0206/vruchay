# RUNBOOK — эксплуатация сервиса

Единственный источник правды об инфраструктуре. Обновляется при каждом изменении.

## Окружения

| Окружение | Где | Как деплоится |
|---|---|---|
| dev | локальный Mac (colima + docker compose dev) | `pnpm dev` |
| staging | VPS (куплен? — см. чек-лист ниже) | GitHub Actions `Deploy staging` после CI на main |
| prod | VPS | вручную запуском workflow (после появления) |

## Чек-лист внешних сервисов (Фаза 0, выполняет владелец)

- [ ] Домен для сервиса (реестр .ru, ~700 ₽/год)
- [ ] VPS prod: Timeweb Cloud или Selectel, 4 vCPU / 8 ГБ / 80 ГБ NVMe
- [ ] VPS staging: 2 vCPU / 4 ГБ
- [ ] Managed PostgreSQL (тот же провайдер), минимальный тариф
- [ ] S3-бакет в РФ (тот же провайдер): `gramota-prod`, `gramota-backups`
- [ ] GitHub-репозиторий + секреты STAGING_SSH_HOST/USER/KEY
- [ ] DashaMail: включить транзакционный API (на платном тарифе), проверить
      отправку письма с PDF-вложением и вебхуки; записать API-ключ в .env prod
- [ ] Уведомление оператора ПДн в Роскомнадзор — до публичного запуска Тильда-форм

## Первичная настройка VPS (staging и prod одинаково)

```bash
# на сервере (Ubuntu 24.04):
curl -fsSL https://get.docker.com | sh
mkdir -p /opt/gramota && cd /opt/gramota
# скопировать docker-compose.prod.yml и заполнить .env (см. .env.example + прод-секреты)
docker login ghcr.io -u <github-user> -p <PAT с read:packages>
docker compose -f docker-compose.prod.yml up -d
```

## Деплой

- push в main → CI (lint, тесты, build, docker-образы в GHCR) → Deploy staging.
- Prod: вручную через workflow_dispatch (появится в Фазе 5) или на сервере:
  `IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml up -d`.
- Откат: тот же compose с предыдущим IMAGE_TAG (sha из истории CI).

## Бэкапы (включаются в Фазе 5)

- Managed PostgreSQL: автобэкапы провайдера + ночной `pg_dump | gzip | aws s3 cp` в
  `gramota-backups` (cron на prod VPS, скрипт появится в infra/).
- Restore drill: раз в квартал восстановить свежий дамп на staging и прогнать smoke.

## Миграции БД

`prisma migrate deploy` выполняется в entrypoint api-контейнера перед стартом
(добавится при первом прод-деплое). Локально: `pnpm --filter @gramota/server prisma:migrate`.

## Мониторинг

- UptimeRobot: GET https://<домен>/health (алерт в Telegram владельцу) — настроить в Фазе 5.
- Ошибки: GlitchTip на staging-VPS — настроить в Фазе 5.

## Инциденты

1. Сервис лежит → `docker compose ps`, `docker compose logs api --tail 100`.
2. Очередь зависла → Bull Board (появится в Фазе 2), рестарт worker:
   `docker compose restart worker` — задания в Redis переживают рестарт.
3. Письма не уходят → статус DashaMail, лимиты тарифа, `docker compose logs api | grep mail`.

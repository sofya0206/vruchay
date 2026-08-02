# RUNBOOK — эксплуатация сервиса

Единственный источник правды об инфраструктуре. Обновляется при каждом изменении.

## Окружения

| Окружение | Где | Как деплоится |
|---|---|---|
| dev | локальный Mac (colima + docker compose dev) | `pnpm dev` |
| staging | VPS (куплен? — см. чек-лист ниже) | GitHub Actions `Deploy staging` после CI на main |
| prod | VPS | вручную запуском workflow (после появления) |

## Чек-лист внешних сервисов

Провайдер — **Selectel**, аккаунт 648072 (ИП Рязанцева Н. С., ИНН 740270417047),
локация Москва или Санкт-Петербург. Обоснование выбора — [ADR-0002](docs/adr/0002-hosting-provider.md).

- [x] Регистрация в Selectel как ИП — сделано, аккаунт верифицирован
- [x] **Заявка на грант до 30 000 ₽** — тикет в категории «Биллинг» создан 31.07.2026,
      ответ обещан в течение 15 минут. Ждём решения **до создания платных ресурсов**
- [ ] Домен `vruchay.ru` (+ `vruchay.by`, кириллические про запас), автопродление включить
- [ ] Облачный сервер prod: 4 vCPU / 8 ГБ / 80 ГБ NVMe
- [ ] Облачный сервер staging: 2 vCPU / 4 ГБ / 50 ГБ
- [ ] S3-бакеты: `vruchay-prod`, `vruchay-backups`
- [ ] Запросить у Selectel тикетом **договор-поручение на обработку ПДн** и акт оценки
      соответствия — выдают бесплатно
- [ ] GitHub-репозиторий (приватный) + секреты STAGING_SSH_HOST/USER/KEY
- [ ] DashaMail: перейти с тарифа «за подписчиков» на **пакеты писем**, включить
      транзакционный API, проверить письмо с PDF-вложением и вебхуки статусов
- [ ] ЮKassa: добавить `vruchay.ru` как **отдельный магазин**, получить свои shopId и ключ
- [ ] Уведомление оператора ПДн в Роскомнадзор — до начала обработки данных

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

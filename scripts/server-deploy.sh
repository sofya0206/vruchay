#!/usr/bin/env bash
#
# Первый выкат: собирает образы на самом сервере и поднимает приложение.
#
# Запускается НА СЕРВЕРЕ, от пользователя vruchay, из /opt/vruchay/src:
#   cd /opt/vruchay/src && ./scripts/server-deploy.sh
#
# Сборка на сервере — временное решение до появления GitHub Actions.
# Она занимает 10–20 минут на нашей конфигурации: основное время уходит
# на загрузку Chromium. Когда появится реестр образов, этот скрипт
# заменится на `docker compose pull`.
set -euo pipefail

APP_DIR=/opt/vruchay
SRC=$(cd "$(dirname "$0")/.." && pwd)

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

[ -f "$APP_DIR/.env" ] || die "Нет $APP_DIR/.env — скопируйте его с рабочей машины"
grep -q 'ЗАПОЛНИТЬ' "$APP_DIR/.env" && die "В .env остались незаполненные значения: $(grep -c 'ЗАПОЛНИТЬ' "$APP_DIR/.env")"

say "1/4 Сборка образов"
# Собираем с теми же именами, что ждёт compose при IMAGE_PREFIX=local.
docker build -f "$SRC/apps/server/Dockerfile" -t local/gramota-server:latest "$SRC"
docker build -f "$SRC/apps/web/Dockerfile" -t local/gramota-web:latest "$SRC"

say "2/4 Запуск"
cp "$SRC/docker-compose.prod.yml" "$APP_DIR/"
cd "$APP_DIR"
# Службы перечислены явно: миграции завершаются по замыслу, и ожидание
# «все контейнеры живы» приняло бы это за сбой.
docker compose -f docker-compose.prod.yml up -d --wait api worker web

say "3/4 Миграции"
docker compose -f docker-compose.prod.yml logs migrate 2>&1 | tail -3

say "4/4 Проверка"
sleep 3
docker compose -f docker-compose.prod.yml ps --format '  {{.Service}}: {{.State}}'
echo
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost/health || echo нет)
[ "$code" = 200 ] && echo "  ✓ приложение отвечает" || echo "  ✗ приложение не отвечает (код $code)"

cat <<INFO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Дальше:

1. Создать владельца сервиса:
     cd $APP_DIR && docker compose -f docker-compose.prod.yml run --rm \\
       -e OWNER_EMAIL='ваша@почта' -e OWNER_PASSWORD='пароль' \\
       -e ORG_NAME='Ассоциация тренеров' \\
       api node dist/cli.js create-owner

2. Проверить снаружи (TLS поднимется сам, когда DNS дойдёт):
     ./scripts/smoke.sh https://vruchay.ru

3. Включить резервные копии — docs/launch-day.md, шаг 8.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFO

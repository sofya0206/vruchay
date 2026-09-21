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

# ─── Место на диске ──────────────────────────────────────────────────────
#
# Собранный образ сервера весит около 3,2 ГБ, и каждая пересборка оставляет
# прежние слои. Несколько сборок подряд заполняют диск целиком, а первой
# от этого падает база: PostgreSQL не может записать контрольную точку,
# аварийно завершается и уходит в бесконечное восстановление. Сервис при
# этом отвечает пятисотой ошибкой на каждый вход.
#
# Так уже случилось однажды. Поэтому здесь два рубежа: убрать мусор перед
# сборкой и не начинать её, если места всё равно мало.

say "0/4 Место на диске"
# Убираем слои, на которые не ссылается ни один образ. Именно `image prune`
# без -a: базовые образы нужны следующей сборке, и удалять их значит
# каждый раз качать node и caddy заново.
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true

FREE_GB=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
printf '  свободно %s ГБ\n' "$FREE_GB"

# 8 ГБ — сборка сервера с Chromium плюс запас, чтобы база не осталась
# без места для журнала предзаписи в момент пика.
if [ "${FREE_GB:-0}" -lt 8 ]; then
  die "Мало места: ${FREE_GB} ГБ, нужно минимум 8.
     Освободить:  docker system prune -af
     Посмотреть:  docker system df"
fi

# Данные оператора для страницы политики обработки данных. Берём из того же
# .env, что и всё остальное: SELLER_* уже лежат там для счетов, а закон
# требует тех же сведений и в политике (ч. 2 ст. 18.1 152-ФЗ). Без них
# страница соберётся, но честно сообщит, что опубликована не полностью,
# и принимать первого участника будет нельзя.
#
# Читаем построчно, а не через `. .env`: значения там не в кавычках, потому
# что этот файл разбирает Docker Compose, а не шелл. На «+7 (903) …» и на
# адресе с пробелами шелл споткнулся бы, и выкат встал бы на ровном месте.
env_value() { sed -n "s/^$1=//p" "$APP_DIR/.env" | head -1; }

say "1/4 Сборка образов"
# Собираем с теми же именами, что ждёт compose при IMAGE_PREFIX=local.
docker build -f "$SRC/apps/server/Dockerfile" -t local/gramota-server:latest "$SRC"
docker build -f "$SRC/apps/web/Dockerfile" -t local/gramota-web:latest \
  --build-arg "VITE_OPERATOR_NAME=$(env_value SELLER_NAME)" \
  --build-arg "VITE_OPERATOR_INN=$(env_value SELLER_INN)" \
  --build-arg "VITE_OPERATOR_OGRNIP=$(env_value SELLER_OGRNIP)" \
  --build-arg "VITE_OPERATOR_ADDRESS=$(env_value SELLER_ADDRESS)" \
  --build-arg "VITE_OPERATOR_EMAIL=$(env_value OPERATOR_EMAIL)" \
  --build-arg "VITE_OPERATOR_PHONE=$(env_value OPERATOR_PHONE)" \
  --build-arg "VITE_POLICY_DATE=$(env_value POLICY_DATE)" \
  "$SRC"

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
# Спрашиваем api напрямую, минуя Caddy. Через Caddy по http приходит 308:
# он перенаправляет на https, и проверка ругалась бы на исправно работающее
# приложение. Заодно так видно, кто именно не отвечает, если что-то сломается.
code=$(docker compose -f docker-compose.prod.yml exec -T api node -e \
  "fetch('http://localhost:3000/health').then(r=>process.stdout.write(String(r.status))).catch(()=>process.stdout.write('нет'))" 2>/dev/null || echo нет)
[ "$code" = 200 ] && echo "  ✓ приложение отвечает" || echo "  ✗ приложение не отвечает (код $code)"

# И снаружи, целиком через Caddy с TLS. Пока записи DNS не разошлись,
# сертификата ещё нет — это ожидание, а не поломка, поэтому не ошибка.
ext=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${DOMAIN:-vruchay.ru}/health" 2>/dev/null || echo нет)
if [ "$ext" = 200 ]; then
  echo "  ✓ сайт доступен снаружи по https"
else
  echo "  … снаружи пока недоступен (код $ext) — ждём записи DNS и сертификат"
fi

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

3. Включить резервные копии — см. scripts/backup.sh и scripts/restore-drill.sh.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INFO

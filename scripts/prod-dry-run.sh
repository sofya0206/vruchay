#!/usr/bin/env bash
#
# Прогон боевой конфигурации на своей машине — до выката на сервер.
#
# Проверяет то, что нельзя проверить в разработке: собираются ли образы,
# применяются ли миграции отдельной службой, стартуют ли приложение и воркер
# после неё, отдаёт ли Caddy страницу и внутренний вход для печати.
# Работает на локальных образах, ничего никуда не выкладывает.
#
#   ./scripts/prod-dry-run.sh
#
# После прогона поднятое хозяйство удаляется вместе с данными: это проверка
# конфигурации, а не вторая среда разработки.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
PROJECT=vruchay-dryrun
cd "$ROOT"

cleanup() {
  docker compose -p "$PROJECT" -f "$WORK/docker-compose.prod.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "1/4 Сборка образов"
docker build -q -f apps/server/Dockerfile -t local/gramota-server:dryrun . > /dev/null
docker build -q -f apps/web/Dockerfile -t local/gramota-web:dryrun . > /dev/null

echo "2/4 Подготовка окружения"
cp docker-compose.prod.yml "$WORK/"
# Пароль генерируется один раз и подставляется в оба места: и в переменные
# контейнера базы, и в строку подключения. Разойдутся — миграции не подключатся.
PGPASS=$(openssl rand -hex 16)
cat > "$WORK/.env" <<ENV
IMAGE_PREFIX=local
IMAGE_TAG=dryrun
DOMAIN=:8081
PUBLIC_URL=http://localhost:8081
NODE_ENV=production
POSTGRES_USER=vruchay
POSTGRES_PASSWORD=${PGPASS}
POSTGRES_DB=vruchay
DATABASE_URL=postgresql://vruchay:${PGPASS}@postgres:5432/vruchay
REDIS_URL=redis://redis:6379
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
S3_ENDPOINT=http://minio:9000
S3_REGION=ru-1
S3_BUCKET=vruchay
S3_ACCESS_KEY=dryrun
S3_SECRET_KEY=dryrun-secret
S3_ORIGIN=http://localhost:9000
ENV

# Порты 80 и 443 на своей машине заняты чем угодно, да и сертификат
# для localhost получать не у кого: подменяем на один порт без TLS.
python3 - "$WORK/docker-compose.prod.yml" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
t = p.read_text()
t = t.replace("      - '80:80'\n      - '443:443'", "      - '8081:8081'")
p.write_text(t)
PY

echo "3/4 Запуск"
dc() { docker compose -p "$PROJECT" -f "$WORK/docker-compose.prod.yml" --env-file "$WORK/.env" "$@"; }

# Журналы при сбое — весь смысл проверки. Без них видно только «контейнер
# нездоров», а причина уезжает вместе с удалённым хозяйством.
if ! dc up -d --wait api worker web; then
  echo
  echo "--- журнал миграций ---"; dc logs --no-log-prefix migrate 2>&1 | tail -20
  echo "--- журнал приложения ---"; dc logs --no-log-prefix api 2>&1 | tail -30
  echo "--- журнал воркера ---"; dc logs --no-log-prefix worker 2>&1 | tail -20
  echo
  echo "Запуск не удался — смотрите журналы выше."
  exit 1
fi

echo "4/4 Проверки"
FAILED=0
say() { if [ "$2" = ok ]; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s — %s\n' "$1" "$2"; FAILED=1; fi; }

logs=$(dc logs migrate 2>&1)
say "миграции применены" "$(echo "$logs" | grep -qiE 'migrations? (have been )?(successfully )?applied|already in sync' && echo ok || echo 'смотрите logs migrate')"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:8081/health || echo нет)
say "приложение отвечает" "$([ "$code" = 200 ] && echo ok || echo "код $code")"

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:8081/ || echo нет)
say "страница отдаётся" "$([ "$code" = 200 ] && echo ok || echo "код $code")"

state=$(dc ps --format '{{.Service}} {{.State}}' | grep '^worker' || true)
say "воркер работает" "$(echo "$state" | grep -q running && echo ok || echo "${state:-не запущен}")"

wlogs=$(dc logs worker 2>&1)
say "воркер без ошибок запуска" "$(echo "$wlogs" | grep -qiE 'error|ошибк' && echo 'есть ошибки в журнале' || echo ok)"

echo
[ "$FAILED" = 0 ] && echo "Конфигурация рабочая." || { echo "Есть замечания — до выката не идти."; exit 1; }

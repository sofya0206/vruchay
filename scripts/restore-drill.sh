#!/usr/bin/env bash
#
# Учебное восстановление. Раз в квартал, обязательно.
#
# Резервная копия, которую ни разу не разворачивали, — это не копия, а
# предположение. Типовые сюрпризы, которые всплывают только здесь: не тот
# ключ шифрования, дамп без прав на расширения, несовпадение версии
# PostgreSQL, обрезанный при выгрузке файл.
#
# Запускать на staging, а не на боевом сервере. Восстанавливает в отдельную
# базу того же контейнера — боевую не трогает.
#
#   BACKUP_S3_BUCKET=s3://vruchay-backups \
#   AGE_IDENTITY=/path/to/key.txt \
#   POSTGRES_USER=vruchay \
#   RESTORE_DATABASE=vruchay_drill \
#   ./scripts/restore-drill.sh [имя-файла]
set -euo pipefail

: "${BACKUP_S3_BUCKET:?не задан бакет}"
: "${AGE_IDENTITY:?не задан файл с секретным ключом}"
RESTORE_DATABASE="${RESTORE_DATABASE:-vruchay_drill}"

# Тот же системный набор корневых сертификатов, что и в backup.sh — там же
# подробности и оговорка, что для текущего провайдера (Timeweb) это не
# перепроверялось.
export AWS_CA_BUNDLE="${AWS_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE=$(aws s3 ls "${BACKUP_S3_BUCKET}/db/" \
    ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"} \
    | sort | tail -1 | awk '{print $4}')
  echo "Беру последнюю копию: $FILE"
fi

aws s3 cp "${BACKUP_S3_BUCKET}/db/${FILE}" "$WORK/dump.age" \
  ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"}

age --decrypt --identity "$AGE_IDENTITY" "$WORK/dump.age" | gunzip > "$WORK/dump.sql"
echo "Расшифровано: $(wc -c < "$WORK/dump.sql") байт"

COMPOSE_FILE="${COMPOSE_FILE:-/opt/vruchay/docker-compose.prod.yml}"
PGUSER="${POSTGRES_USER:-vruchay}"
dc() { docker compose -f "$COMPOSE_FILE" exec -T postgres "$@"; }

dc dropdb -U "$PGUSER" --if-exists "$RESTORE_DATABASE"
dc createdb -U "$PGUSER" "$RESTORE_DATABASE"
dc psql -U "$PGUSER" --quiet --dbname "$RESTORE_DATABASE" < "$WORK/dump.sql" > /dev/null

echo
echo "Что восстановилось:"
dc psql -U "$PGUSER" --dbname "$RESTORE_DATABASE" --tuples-only --command "
  select 'организаций: ' || count(*) from organizations
  union all select 'пользователей: ' || count(*) from users
  union all select 'документов: ' || count(*) from documents
  union all select 'получателей: ' || count(*) from recipient_rows
  union all select 'согласий: ' || count(*) from consents;
"

echo
echo "Проверьте глазами: числа похожи на боевые? Если да — учение пройдено."
echo "Запишите дату и результат учебного восстановления."

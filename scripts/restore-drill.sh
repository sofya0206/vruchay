#!/usr/bin/env bash
#
# Учебное восстановление. Раз в квартал, обязательно.
#
# Резервная копия, которую ни разу не разворачивали, — это не копия, а
# предположение. Типовые сюрпризы, которые всплывают только здесь: не тот
# ключ шифрования, дамп без прав на расширения, несовпадение версии
# PostgreSQL, обрезанный при выгрузке файл.
#
# Запускать на staging, а не на боевом сервере.
#
#   BACKUP_S3_BUCKET=s3://vruchay-backups \
#   AGE_IDENTITY=/path/to/key.txt \
#   RESTORE_DATABASE=vruchay_drill \
#   ./scripts/restore-drill.sh [имя-файла]
set -euo pipefail

: "${BACKUP_S3_BUCKET:?не задан бакет}"
: "${AGE_IDENTITY:?не задан файл с секретным ключом}"
RESTORE_DATABASE="${RESTORE_DATABASE:-vruchay_drill}"

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

dropdb --if-exists "$RESTORE_DATABASE"
createdb "$RESTORE_DATABASE"
psql --quiet --dbname "$RESTORE_DATABASE" --file "$WORK/dump.sql" > /dev/null

echo
echo "Что восстановилось:"
psql --dbname "$RESTORE_DATABASE" --tuples-only --command "
  select 'организаций: ' || count(*) from organizations
  union all select 'пользователей: ' || count(*) from users
  union all select 'документов: ' || count(*) from documents
  union all select 'получателей: ' || count(*) from recipient_rows
  union all select 'согласий: ' || count(*) from consents;
"

echo
echo "Проверьте глазами: числа похожи на боевые? Если да — учение пройдено."
echo "Запишите дату и результат в RUNBOOK.md."

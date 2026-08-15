#!/usr/bin/env bash
#
# Ночная резервная копия базы: дамп → сжатие → шифрование → S3.
#
# Дамп содержит всё, что о людях знает сервис: фамилии участников, адреса
# почты, журнал согласий. Класть такой файл в объектное хранилище без
# шифрования нельзя — ключ доступа к бакету утекает легче, чем сервер, а
# по 152-ФЗ утечка дампа и утечка базы это одно и то же событие.
#
# Шифрование — age с открытым ключом. Смысл именно в асимметричном ключе:
# на боевом сервере лежит только публичная половина, поэтому взломавший
# сервер может создать копию, но не прочитать ни одну из прежних.
# Секретный ключ хранится вне сервера — у владельца.
#
# База живёт в контейнере и наружу порт не публикует, поэтому дамп снимается
# через `docker compose exec`, а не клиентом с хоста. Так же он снимется и
# после переезда на управляемую базу — тогда достаточно задать COMPOSE_FILE
# пустым и обычные переменные PG*.
#
# Установка на сервере:
#   apt-get install -y age awscli
#
# Запуск из crontab (03:00 по времени сервера):
#   0 3 * * * /opt/vruchay/src/scripts/backup.sh >> /var/log/vruchay-backup.log 2>&1
#
# Обязательные переменные окружения (кладутся в /etc/vruchay-backup.env):
#   POSTGRES_USER POSTGRES_DB   — те же, что у compose
#   BACKUP_AGE_RECIPIENT        — публичный ключ age (age1...)
#   BACKUP_S3_BUCKET            — например s3://vruchay-backups
#   AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL
set -euo pipefail

# Настройки читаем сами, а не полагаемся на строку в crontab.
#
# Там стояло «. /etc/vruchay-backup.env && backup.sh», и это не сработало
# ни одной ночи: точка присваивает переменные оболочке, но не экспортирует
# их, а скрипт запускается отдельным процессом и не видит ничего. Копия
# падала на «не задана база» каждую ночь — молча, потому что сообщение
# уходило в журнал, который никто не открывает.
#
# `set -a` включает экспорт всего присваиваемого. Без него та же ошибка
# вернулась бы при первой правке crontab.
ENV_FILE="${BACKUP_ENV_FILE:-/etc/vruchay-backup.env}"
if [ -z "${POSTGRES_DB:-}" ] && [ -r "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PGDATABASE="${POSTGRES_DB:?не задана база}"
PGUSER="${POSTGRES_USER:?не задан пользователь базы}"
: "${BACKUP_AGE_RECIPIENT:?не задан публичный ключ шифрования}"
: "${BACKUP_S3_BUCKET:?не задан бакет}"

COMPOSE_FILE="${COMPOSE_FILE:-/opt/vruchay/docker-compose.prod.yml}"

# AWS CLI v2 ходит со своим набором корневых сертификатов, и сертификат
# хранилища Selectel им не принимается: любая команда падает на «self-signed
# certificate in certificate chain». Системный набор тот же сертификат
# проверяет без нареканий, поэтому указываем его явно.
#
# Это не мелочь: без этой строки копирование падало бы каждую ночь, а
# выяснилось бы это в тот день, когда копия понадобилась.
export AWS_CA_BUNDLE="${AWS_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}"

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
NAME="vruchay-${PGDATABASE}-${STAMP}.sql.gz.age"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "[$(date -uIs)] Дамп базы ${PGDATABASE}"
# --no-owner: восстанавливать будем в другую роль, на staging или на новом сервере.
# Конвейер целиком под `set -o pipefail`: упавший pg_dump не должен превратиться
# в маленький, но «успешно» зашифрованный файл.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --no-owner --clean --if-exists -U "$PGUSER" "$PGDATABASE" \
  | gzip -9 \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$WORK/$NAME"

SIZE=$(wc -c < "$WORK/$NAME")
# Пустой или подозрительно маленький файл — это не копия, а ложное спокойствие.
if [ "$SIZE" -lt 4096 ]; then
  echo "ОШИБКА: копия всего $SIZE байт, выгрузка отменена" >&2
  exit 1
fi

echo "[$(date -uIs)] Выгрузка ${NAME} (${SIZE} байт)"
aws s3 cp "$WORK/$NAME" "${BACKUP_S3_BUCKET}/db/${NAME}" \
  ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"}

# Копия уже в хранилище — дальше идёт только уборка. Всё, что ниже, не должно
# ронять скрипт: неудачная уборка это лишние файлы, а прерванный после выгрузки
# скрипт выглядит как несостоявшееся копирование и заставляет искать поломку
# там, где её нет.
#
# Право на удаление у ключа может быть намеренно отобрано: тогда взломавший
# сервер не сотрёт прежние копии. В этом случае уборку делает срок жизни
# объектов, настроенный на самом бакете, а здесь мы просто говорим об этом
# вслух и идём дальше.
prune() {
  local cutoff day file
  cutoff=$(date -u -d "${KEEP_DAYS} days ago" +%Y-%m-%d 2>/dev/null \
        || date -u -v-"${KEEP_DAYS}"d +%Y-%m-%d)
  aws s3 ls "${BACKUP_S3_BUCKET}/db/" ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"} \
    | awk '{print $1, $4}' \
    | while read -r day file; do
        [ -z "$file" ] && continue
        if [[ "$day" < "$cutoff" ]]; then
          echo "[$(date -uIs)] Удаляю устаревшую копию $file"
          aws s3 rm "${BACKUP_S3_BUCKET}/db/${file}" \
            ${AWS_ENDPOINT_URL:+--endpoint-url "$AWS_ENDPOINT_URL"} \
            || echo "[$(date -uIs)] Удалить $file не вышло — уборку делает срок жизни объектов бакета"
        fi
      done
}
prune || echo "[$(date -uIs)] Уборка старых копий не удалась; сама копия выгружена"

echo "[$(date -uIs)] Готово"

#!/usr/bin/env bash
#
# Готовит боевой .env: генерирует секреты, подставляет реквизиты продавца,
# оставляет пустыми только то, что знаете вы.
#
#   ./scripts/make-prod-env.sh
#
# Результат — docs/business/generated/prod.env. Папка не коммитится.
# Секреты генерируются здесь, а не на сервере, по одной причине: пароль,
# созданный на машине, к которой у вас есть доступ, вы сможете восстановить.
# Пароль, созданный внутри скрипта на сервере и никуда не записанный,
# теряется вместе с сервером.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SELLER="$ROOT/docs/business/generated/seller.env"
OUT="$ROOT/docs/business/generated/prod.env"

[ -f "$SELLER" ] || {
  echo "Нет $SELLER — сначала: node docs/business/render-documents.mjs"
  exit 1
}

PGPASS=$(openssl rand -hex 24)
SESSION=$(openssl rand -base64 48 | tr -d '\n')
MAIL_WEBHOOK=$(openssl rand -hex 32)

REQ="$ROOT/docs/business/requisites.md"
OPERATOR_EMAIL=$(grep -oE '^Email для документов:\s*\S+' "$REQ" 2>/dev/null | awk '{print $NF}')
OPERATOR_EMAIL=${OPERATOR_EMAIL:-ЗАПОЛНИТЬ}
OPERATOR_PHONE=$(grep -oE '^Телефон:\s*\S+' "$REQ" 2>/dev/null | awk '{print $NF}')
OPERATOR_PHONE=${OPERATOR_PHONE:-ЗАПОЛНИТЬ}

cat > "$OUT" <<ENV
# Боевое окружение «Вручай». Скопировать на сервер как /opt/vruchay/.env
# и закрыть: chmod 600 /opt/vruchay/.env
#
# Сгенерировано $(date '+%d.%m.%Y'). В репозиторий не попадает.

# ─── Образы ──────────────────────────────────────────────────────────────
# Пока образы собираются на самом сервере, префикс локальный.
# Когда появится GitHub: IMAGE_PREFIX=ghcr.io/<ваш-логин>
IMAGE_PREFIX=local
IMAGE_TAG=latest

# ─── Домен ───────────────────────────────────────────────────────────────
DOMAIN=vruchay.ru
PUBLIC_URL=https://vruchay.ru
NODE_ENV=production
PORT=3000

# ─── База ────────────────────────────────────────────────────────────────
POSTGRES_USER=vruchay
POSTGRES_PASSWORD=${PGPASS}
POSTGRES_DB=vruchay
DATABASE_URL=postgresql://vruchay:${PGPASS}@postgres:5432/vruchay

REDIS_URL=redis://redis:6379

# ─── Секрет сессий ───────────────────────────────────────────────────────
# Смена значения разлогинивает всех.
SESSION_SECRET=${SESSION}

# ─── Объектное хранилище (Timeweb S3) ─────────────────────────────────────
# Создайте два бакета в панели Timeweb (vruchay-prod, vruchay-backups —
# с раздельными ключами доступа) и сервисного пользователя с доступом.
# Эндпоинт и регион проверены вживую запросом к реальному бакету на
# аккаунте, не по документации Timeweb (см. скилл timeweb).
S3_ENDPOINT=https://s3.timeweb.cloud
S3_REGION=ru-1
S3_BUCKET=vruchay-prod
S3_ACCESS_KEY=ЗАПОЛНИТЬ
S3_SECRET_KEY=ЗАПОЛНИТЬ
S3_ORIGIN=https://s3.timeweb.cloud

# ─── Почта ───────────────────────────────────────────────────────────────
# Основной путь — транзакционное API DashaMail: оно ходит по HTTPS, и
# блокировки почтовых портов у провайдера сервера его не касаются. Без
# ключа сервер с MAIL_PROVIDER=dashamail не стартует — это нарочно.
# Ключ: кабинет DashaMail → «Интеграции» → «Транзакционные письма».
MAIL_PROVIDER=dashamail
DASHAMAIL_API_KEY=ЗАПОЛНИТЬ

# Секрет вебхука приёма статусов писем от DashaMail. Пустое значение
# выключает приём.
MAIL_WEBHOOK_SECRET=${MAIL_WEBHOOK}

# Запасной путь — SMTP-шлюз того же DashaMail, включается строкой
# MAIL_PROVIDER=smtp. Держим заполненным, чтобы переключиться за минуту.
#
# Адрес шлюза — dashasender.ru, а не dashamail.ru: почтовый шлюз живёт
# на отдельном домене. Значения из кабинета: «Email-транспорт» → SMTP.
#
# Порт 2525, а не указанные в кабинете 465 или 587 — запасной порт подачи
# на случай, если хостер блокирует исходящие почтовые порты (было так
# у Selectel). Для текущего провайдера (Timeweb) это не проверено — если
# 465/587 открыты, использовать их напрямую вместо 2525.
SMTP_HOST=smtps.dashasender.ru
SMTP_PORT=2525
SMTP_SECURE=false
# Логин SMTP — почта аккаунта DashaMail, пароль — отдельный, из того же раздела.
SMTP_USER=ЗАПОЛНИТЬ
SMTP_PASSWORD=ЗАПОЛНИТЬ
# Что клиенты пропишут в своей записи SPF: «Настройки» → «Настройка домена».
SMTP_SPF_INCLUDE=_spf.dashasender.ru

# ─── Браузер для печати ──────────────────────────────────────────────────
PLAYWRIGHT_CHANNEL=

# ─── Реквизиты продавца для счетов ───────────────────────────────────────
$(grep '^SELLER_' "$SELLER")

# ─── Оператор персональных данных ────────────────────────────────────────
# Подставляются в страницу /privacy при сборке образа. Наименование, ИНН,
# ОГРНИП и адрес берутся из SELLER_* выше — это те же сведения. Здесь только
# то, чего в реквизитах для счетов нет.
OPERATOR_EMAIL=${OPERATOR_EMAIL}
OPERATOR_PHONE=${OPERATOR_PHONE}
# Дата публикации политики. Меняется только вместе с текстом политики.
POLICY_DATE=$(date '+%d.%m.%Y')
ENV

chmod 600 "$OUT"

echo "✓ Готово: $OUT"
echo
echo "Заполнено автоматически:"
echo "  • пароль базы, секрет сессий и секрет вебхука почты — сгенерированы"
echo "  • реквизиты продавца — из requisites.md"
echo "  • домен, адреса хранилища и почты — из наших решений"
echo
echo "Осталось вписать вручную ($(grep -c 'ЗАПОЛНИТЬ' "$OUT") значений):"
grep -n 'ЗАПОЛНИТЬ' "$OUT" | sed 's/=ЗАПОЛНИТЬ//' | sed 's/^/  • /'
echo
echo "Затем скопировать на сервер:"
echo "  scp -i ~/.ssh/vruchay '$OUT' vruchay@СЕРВЕР:/opt/vruchay/.env"

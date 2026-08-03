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

# ─── Объектное хранилище ─────────────────────────────────────────────────
# Создайте два бакета в Selectel (ru-1) и сервисного пользователя с доступом.
S3_ENDPOINT=https://s3.ru-1.storage.selcloud.ru
S3_REGION=ru-1
S3_BUCKET=vruchay-prod
S3_ACCESS_KEY=ЗАПОЛНИТЬ
S3_SECRET_KEY=ЗАПОЛНИТЬ
S3_ORIGIN=https://s3.ru-1.storage.selcloud.ru

# ─── Почта ───────────────────────────────────────────────────────────────
# Данные SMTP из кабинета DashaMail, субаккаунт для транзакционных писем.
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.dashamail.ru
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ЗАПОЛНИТЬ
SMTP_PASSWORD=ЗАПОЛНИТЬ
# Что клиенты пропишут в своей записи SPF. Значение берётся у провайдера.
SMTP_SPF_INCLUDE=ЗАПОЛНИТЬ

# ─── Браузер для печати ──────────────────────────────────────────────────
PLAYWRIGHT_CHANNEL=

# ─── Реквизиты продавца для счетов ───────────────────────────────────────
$(grep '^SELLER_' "$SELLER")
ENV

chmod 600 "$OUT"

echo "✓ Готово: $OUT"
echo
echo "Заполнено автоматически:"
echo "  • пароль базы и секрет сессий — сгенерированы"
echo "  • реквизиты продавца — из requisites.md"
echo "  • домен, адреса хранилища и почты — из наших решений"
echo
echo "Осталось вписать вручную ($(grep -c 'ЗАПОЛНИТЬ' "$OUT") значений):"
grep -n 'ЗАПОЛНИТЬ' "$OUT" | sed 's/=ЗАПОЛНИТЬ//' | sed 's/^/  • /'
echo
echo "Затем скопировать на сервер:"
echo "  scp -i ~/.ssh/vruchay '$OUT' vruchay@СЕРВЕР:/opt/vruchay/.env"

#!/usr/bin/env bash
#
# Проверка сервиса сразу после развёртывания.
#
# Отвечает на вопрос «поднялось ли то, что мы выкатили», а не «работает ли
# сервис целиком» — сквозные проверки в docs/e2e-*.md и делаются руками.
# Здесь только то, что можно спросить снаружи и что ломается чаще всего:
# доступность, сертификат, заголовки безопасности, версия образа.
#
#   ./scripts/smoke.sh https://vruchay.ru
set -euo pipefail

BASE="${1:-https://vruchay.ru}"
FAILED=0

check() {
  local name="$1" result="$2"
  if [ "$result" = "ok" ]; then
    printf '  ✓ %s\n' "$name"
  else
    printf '  ✗ %s — %s\n' "$name" "$result"
    FAILED=1
  fi
}

echo "Проверяю $BASE"

# 1. Приложение отвечает.
code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/health" || echo "нет ответа")
check "здоровье приложения" "$([ "$code" = "200" ] && echo ok || echo "код $code")"

# 2. Страница отдаётся и это наше приложение, а не заглушка провайдера.
html=$(curl -fsS --max-time 15 "$BASE/" || true)
check "страница приложения" "$(echo "$html" | grep -qi 'vruchay\|Вручай' && echo ok || echo 'не похоже на наше приложение')"

# 3. HTTP переводится на HTTPS. Без этого сессионная cookie однажды уйдёт открытым текстом.
if [[ "$BASE" == https://* ]]; then
  plain="${BASE/https:/http:}"
  redirect=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$plain/health" || echo "-")
  check "переход на HTTPS" "$([[ "$redirect" =~ ^30 ]] && echo ok || echo "код $redirect")"
fi

# 4. Заголовки безопасности на месте — их легко потерять при правке Caddyfile.
headers=$(curl -fsSI --max-time 15 "$BASE/" || true)
for h in "content-security-policy" "strict-transport-security" "x-frame-options" "x-content-type-options"; do
  check "заголовок $h" "$(echo "$headers" | grep -qi "^$h:" && echo ok || echo 'отсутствует')"
done

# 5. Заголовок сервера скрыт: незачем сообщать версию тому, кто ищет уязвимости.
check "версия сервера скрыта" "$(echo "$headers" | grep -qiE '^server:.*(caddy|nginx)/[0-9]' && echo 'видна' || echo ok)"

# 6. База доступна приложению: команда идёт внутрь контейнера.
if [ -n "${COMPOSE_FILE:-}" ]; then
  db=$(docker compose -f "$COMPOSE_FILE" run --rm --no-deps api node dist/cli.js check 2>&1 || true)
  check "база отвечает" "$(echo "$db" | grep -q 'база: отвечает' && echo ok || echo "$db")"
fi

echo
if [ "$FAILED" = "0" ]; then
  echo "Всё в порядке."
else
  echo "Есть замечания — смотрите строки со знаком ✗."
  exit 1
fi

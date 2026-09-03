---
method: POST
path: /api/mail/domains/{id}/check
title: Проверить DNS-записи домена
group: mail
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/mail/domains/{id}/check

Запрашивает DNS домена и сверяет записи из `dnsRecords` с тем, что реально опубликовано. Результат записывается в `status`: `verified`, если найдены все записи, иначе `failed`. Проверка синхронная — ответ приходит после опроса DNS.

Записи после правки у регистратора расходятся до 48 часов, поэтому `failed` сразу после добавления — обычное дело; проверку можно повторять сколько угодно. Обратное тоже верно: если записи из DNS убрали, повторная проверка вернёт домен в `failed`, и отправка с его отправителей станет невозможна — статус домена проверяется перед каждой рассылкой.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| id | string (UUID) | да | Идентификатор домена из `GET /api/mail/domains` |

Тела нет.

## Ответ

`201 Created` — обновлённый домен (те же поля, что в `POST /api/mail/domains`, без списка отправителей). `lastCheckedAt` — время этой проверки; `verifiedAt` ставится при первом успешном подтверждении и сохраняется при последующих, а при `failed` сбрасывается в `null`.

```json
{
  "id": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "domain": "example.ru",
  "provider": "smtp",
  "status": "verified",
  "dnsRecords": [
    { "type": "TXT", "host": "_vruchay-verify", "value": "vruchay-verify=00000000-0000-4000-8000-0000000000cd", "purpose": "Подтверждение владения доменом. Уникальна для вашей организации" },
    { "type": "TXT", "host": "@", "value": "v=spf1 include:vruchay.ru ~all", "purpose": "SPF: разрешает нашему серверу отправлять письма от вашего домена" },
    { "type": "TXT", "host": "_dmarc", "value": "v=DMARC1; p=none; rua=mailto:postmaster@example.ru", "purpose": "DMARC: политика для писем, не прошедших проверку. Начинаем с p=none" }
  ],
  "providerRef": null,
  "verificationToken": "00000000-0000-4000-8000-0000000000cd",
  "verifiedAt": "2026-08-20T09:15:00.000Z",
  "lastCheckedAt": "2026-08-20T09:15:00.000Z",
  "createdAt": "2026-08-19T14:02:11.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `id` не UUID: «Некорректный идентификатор» |
| 401 | Нет токена или сессии |
| 403 | Роль `member`: «Недостаточно прав для этого действия» |
| 404 | Домена нет или он принадлежит другой организации: «Домен не найден» |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/mail/domains/$DOMAIN_ID/check" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

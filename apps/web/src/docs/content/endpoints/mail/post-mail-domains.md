---
method: POST
path: /api/mail/domains
title: Добавить почтовый домен
group: mail
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/mail/domains

Заявляет домен организации для отправки писем от его имени. В ответ приходит набор DNS-записей, которые нужно прописать у регистратора: уникальная TXT-запись подтверждения владения, SPF и DMARC. Сам факт добавления ничего не подтверждает — домен создаётся в состоянии `pending`, а проверка запускается отдельно через `POST /api/mail/domains/{id}/check`.

Имя домена нормализуется: обрезаются пробелы, приводится к нижнему регистру, отбрасываются `http(s)://` и всё после первой косой черты. Домен, который уже подтверждён другой организацией, заявить нельзя.

## Запрос

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| domain | string | да | Имя домена, 4–253 символа после обрезки пробелов. Допустимы буквы, цифры и дефис, минимум одна точка |

```json
{ "domain": "example.ru" }
```

## Ответ

`201 Created` — созданный домен (без списка отправителей).

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор домена |
| orgId | string (UUID) | Организация |
| domain | string | Нормализованное имя |
| provider | string | Всегда `smtp` |
| status | string | Всегда `pending` при создании |
| dnsRecords | array | Три записи `{type, host, value, purpose}` — их нужно прописать в DNS |
| providerRef | null | Для `smtp` не используется |
| verificationToken | string (UUID) | Секрет, входящий в значение записи `_vruchay-verify` |
| verifiedAt | null | Пока не подтверждён |
| lastCheckedAt | null | Проверка ещё не запускалась |
| createdAt | string (ISO 8601) | Дата добавления |

```json
{
  "id": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "domain": "example.ru",
  "provider": "smtp",
  "status": "pending",
  "dnsRecords": [
    { "type": "TXT", "host": "_vruchay-verify", "value": "vruchay-verify=00000000-0000-4000-8000-0000000000cd", "purpose": "Подтверждение владения доменом. Уникальна для вашей организации" },
    { "type": "TXT", "host": "@", "value": "v=spf1 include:vruchay.ru ~all", "purpose": "SPF: разрешает нашему серверу отправлять письма от вашего домена" },
    { "type": "TXT", "host": "_dmarc", "value": "v=DMARC1; p=none; rua=mailto:postmaster@example.ru", "purpose": "DMARC: политика для писем, не прошедших проверку. Начинаем с p=none" }
  ],
  "providerRef": null,
  "verificationToken": "00000000-0000-4000-8000-0000000000cd",
  "verifiedAt": null,
  "lastCheckedAt": null,
  "createdAt": "2026-08-19T14:02:11.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | Поле `domain` отсутствует: «Invalid input: expected string, received undefined» |
| 400 | Короче 4 символов: «Too small: expected string to have >=4 characters»; длиннее 253: «Too big: expected string to have <=253 characters» |
| 400 | После нормализации имя не похоже на домен: «Некорректное имя домена» |
| 400 | «Этот домен уже подтверждён другой организацией. Если он принадлежит вам, напишите в поддержку» |
| 401 | Нет токена или сессии |
| 403 | Роль `member`: «Недостаточно прав для этого действия» |
| 500 | Тот же домен уже добавлен в этой организации — уникальность `(orgId, domain)` в коде не перехватывается, Nest отдаёт общую ошибку |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/mail/domains" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.ru"}'
```

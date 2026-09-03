---
method: GET
path: /api/mailing/log
title: Журнал доставки писем
group: mailing
auth: token
roles: any
rate_limit: none
---

# GET /api/mailing/log

Последние 200 писем организации, новые первыми, с переведённой на человеческий язык причиной недоставки и сводкой по состояниям. Пагинации нет; `take: 200` не настраивается.

Отличие от `GET /api/mail/emails`: там сырые записи журнала целиком (включая `provider`, `providerMessageId`, `attachFile`), здесь — витрина разбора: только нужные поля, название материала подставлено, а вместо ответа шлюза («550 5.1.1 … User unknown») стоит объяснение и признак, есть ли смысл повторять. Именно этим признаком пользуется `POST /api/mailing/resend`.

Сводка `summary` считается по всем письмам организации (или по материалу, если он указан) — она не ограничена ни двумя сотнями строк, ни фильтром `problemsOnly`.

## Запрос

Строка запроса — строгая схема: неизвестный параметр отвергается.

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | нет | Только письма по этому материалу; материал проверяется на принадлежность организации |
| problemsOnly | `true` \| `false` | нет | `true` — только `bounced` и `failed`. Любое другое значение из списка равно «показывать всё» |

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| items | array | Письма, новые первыми |
| items[].id | string (UUID) | Идентификатор письма |
| items[].documentId | string (UUID) \| null | Материал |
| items[].documentTitle | string | Название материала; пустая строка, если материала нет |
| items[].toEmail | string | Адрес получателя; после срока хранения обезличивается в пустую строку |
| items[].subject | string | Тема с подставленными переменными |
| items[].status | string | `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed` |
| items[].kind | `transactional` \| `marketing` | Поток письма |
| items[].queuedAt | string (ISO 8601) | Постановка в очередь |
| items[].sentAt | string (ISO 8601) \| null | Приём шлюзом |
| items[].problem | object \| null | Разбор недоставки; `null` — с письмом всё в порядке |
| items[].problem.reason | string | Причина словами |
| items[].problem.retryable | boolean | Есть ли смысл повторять отправку на этот адрес |
| items[].problem.details | string \| null | Ответ шлюза как есть; `null`, если провайдер причину не сообщил |
| summary | object | Число писем по каждому состоянию: `{"sent": 120, "bounced": 3}` |

```json
{
  "items": [
    {
      "id": "c0ffee00-1111-4222-8333-444455556666",
      "documentId": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b",
      "documentTitle": "Грамоты участникам",
      "toEmail": "petrov@example.com",
      "subject": "Ваш сертификат, Петров Олег Иванович",
      "status": "bounced",
      "kind": "transactional",
      "queuedAt": "2026-08-21T10:05:00.000Z",
      "sentAt": "2026-08-21T10:05:12.000Z",
      "problem": {
        "reason": "Такого адреса не существует",
        "retryable": false,
        "details": "550 5.1.1 Recipient address rejected: User unknown"
      }
    }
  ],
  "summary": { "sent": 120, "delivered": 96, "bounced": 3 }
}
```

Значения `problem.reason`: «Ящик получателя переполнен — письмо не поместилось», «Такого адреса не существует», «Почта получателя отклонила письмо по своим правилам», «Почта получателя временно недоступна — попробуйте позже», «Не удалось связаться с почтовым сервером получателя», «Домен получателя не принимает почту», «Письмо не доставлено» (причина не разобрана), «Письмо не доставлено, причину почта получателя не сообщила» (провайдер её не прислал).

## Ошибки

| Код | Когда |
|---|---|
| 400 | `documentId` не UUID: «Invalid UUID» |
| 400 | `problemsOnly` не `true` и не `false`: «Invalid option: expected one of "true"\|"false"» |
| 400 | Неизвестный параметр строки запроса: «Unrecognized key: "…"» |
| 401 | Нет токена или сессии |
| 404 | Материала нет, он удалён или чужой: «Материал не найден» |

## Пример

```bash
curl "https://vruchay.ru/api/mailing/log?documentId=$DOCUMENT_ID&problemsOnly=true" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

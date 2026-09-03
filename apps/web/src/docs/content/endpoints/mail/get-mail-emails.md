---
method: GET
path: /api/mail/emails
title: Письма организации
group: mail
auth: token
roles: any
rate_limit: none
---

# GET /api/mail/emails

Последние 200 писем организации, новые первыми, — сырые записи журнала без перевода причин отказа. Для разбора доставки удобнее `GET /api/mailing/log`: там причина недоставки переведена на понятный язык и есть сводка по состояниям. Пагинации нет.

Состояния письма: `queued` → `sent` → `delivered` → `opened`; `bounced` и `failed` — конечные. Назад состояние не откатывается. `sent` ставит воркер после приёма письма шлюзом; `delivered` и `bounced` приходят от почтового провайдера, `opened` — по пикселю открытия.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | нет | Только письма по этому материалу. Значение, не похожее на UUID, молча игнорируется — вернутся все письма |

## Ответ

`200 OK` — массив писем.

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор письма |
| orgId | string (UUID) | Организация |
| documentId | string (UUID) \| null | Материал |
| rowId | string (UUID) \| null | Строка получателя; `null` для адреса из ручного списка или после переимпорта таблицы |
| templateId | string (UUID) \| null | Шаблон на момент постановки |
| fileId | string (UUID) \| null | Приложенный файл |
| kind | `transactional` \| `marketing` | Поток письма на момент постановки |
| toEmail | string | Адрес получателя; после срока хранения обезличивается в пустую строку |
| subject | string | Тема с подставленными переменными |
| provider | string | `smtp` |
| providerMessageId | string \| null | Идентификатор у шлюза после отправки |
| bodyHtml | string \| null | Готовый текст только у служебных писем сервиса (уведомление о сроке); иначе `null` — тело собирается из шаблона |
| attachFile | boolean | Прикладывать ли файл при отправке |
| status | string | Состояние, см. выше |
| error | string \| null | Текст ошибки шлюза, обезличенный, до 500 символов |
| queuedAt | string (ISO 8601) | Постановка в очередь |
| sentAt | string (ISO 8601) \| null | Приём шлюзом |
| statusUpdatedAt | string (ISO 8601) | Последняя смена состояния |

```json
[
  {
    "id": "c0ffee00-1111-4222-8333-444455556666",
    "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
    "documentId": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b",
    "rowId": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "templateId": "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
    "fileId": "f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b",
    "kind": "transactional",
    "toEmail": "petrov@example.com",
    "subject": "Ваш сертификат, Пётр Петров",
    "provider": "smtp",
    "providerMessageId": "<20260821100512.abc@smtp.vruchay.ru>",
    "bodyHtml": null,
    "attachFile": true,
    "status": "sent",
    "error": null,
    "queuedAt": "2026-08-21T10:05:00.000Z",
    "sentAt": "2026-08-21T10:05:12.000Z",
    "statusUpdatedAt": "2026-08-21T10:05:12.000Z"
  }
]
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/mail/emails?documentId=$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

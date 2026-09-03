---
method: GET
path: /api/documents/{id}/registry
title: Реестр выданных документов
group: documents
auth: token
roles: any
rate_limit: none
---

# GET /api/documents/{id}/registry

Реестр выдач по документу: по одной строке на каждого получателя, у которого есть
выпущенный файл (`lastFileId`), в порядке строк таблицы. Строка знает свой последний
экземпляр (публичный идентификатор, код, время выпуска, отзыв, чем заменён при
перевыпуске) и состояние последнего письма. Пагинации нет — реестр отдаётся целиком.
Та же таблица в CSV — `GET /api/documents/{id}/registry.csv`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `document` | `{ id, title }` | |
| `total` | integer | число строк реестра |
| `items[].rowId` | UUID | строка получателя |
| `items[].name` | string | значение колонки `name` (пусто, если нет) |
| `items[].email` | string | адрес последнего письма, иначе колонка `email`, иначе пусто |
| `items[].fields` | object | все данные строки как есть (имя колонки → значение) |
| `items[].fileId` | UUID | последний выпущенный файл |
| `items[].publicId` | UUID | публичный идентификатор экземпляра |
| `items[].code` | string | короткий проверочный код (`K7M2-9QXR-4TVB`); у старых экземпляров без кода — `publicId` |
| `items[].verifyPath` | string | путь страницы проверки: `/c/<code>` или `/verify/<publicId>` |
| `items[].issuedAt` | string | время выпуска файла |
| `items[].revoked` | boolean | проверка отозвана |
| `items[].replacedBy` | `{ publicId, code, verifyPath, issuedAt }` \| null | действующий двойник после перевыпуска |
| `items[].mailStatus` | string \| null | статус последнего письма: `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed`; `null` — не отправлялось |
| `items[].mailSentAt` | string \| null | |
| `items[].mailError` | string \| null | |

```json
{
  "document": { "id": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c", "title": "Грамота за место" },
  "total": 1,
  "items": [
    {
      "rowId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "name": "Иванов Пётр Ильич",
      "email": "ivanov@example.com",
      "fields": { "name": "Иванов Пётр Ильич", "email": "ivanov@example.com", "place": "1" },
      "fileId": "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b",
      "publicId": "f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c",
      "code": "K7M2-9QXR-4TVB",
      "verifyPath": "/c/K7M2-9QXR-4TVB",
      "issuedAt": "2026-06-19T12:00:00.000Z",
      "revoked": false,
      "replacedBy": null,
      "mailStatus": "delivered",
      "mailSentAt": "2026-06-19T12:01:10.000Z",
      "mailError": null
    }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `id` не UUID |
| 401 | нет токена или сессии |
| 404 | «Документ не найден» — нет такого, чужой или в корзине |

## Пример

```bash
curl "https://vruchay.ru/api/documents/$DOCUMENT_ID/registry" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

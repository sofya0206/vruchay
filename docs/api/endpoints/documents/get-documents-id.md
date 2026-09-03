---
method: GET
path: /api/documents/{id}
title: Карточка документа
group: documents
auth: token
roles: any
rate_limit: none
---

# GET /api/documents/{id}

Документ целиком с листами (и их макетами) в порядке `position`. Документы из корзины
этим маршрутом не отдаются — сначала `POST /api/documents/{id}/restore`. Реестр выдач
и получатели в карточку не входят — у них свои маршруты.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | |
| `orgId` | UUID | организация |
| `title` | string | |
| `pageWidthMm`, `pageHeightMm` | number | размер листа, мм |
| `verifyEnabled` | boolean | страница проверки подлинности включена |
| `verifyFields` | string[] | имена полей получателя, которые раскрывает страница проверки |
| `eventName`, `eventDate`, `eventPlace`, `eventHours` | string | мероприятие (переменные `%event`, `%event_date`, `%event_place`, `%hours`) |
| `issueDate` | string \| null | дата выдачи (день, в JSON — полночь UTC); `null` — день выпуска |
| `expiresIn` | string \| null | срок действия от выдачи, ISO 8601 (`P1Y`) |
| `expiresAt` | string \| null | срок действия фиксированной датой; если заданы оба, побеждает дата |
| `category` | string \| null | раздел |
| `sourceDocumentId` | UUID \| null | исходник копии (сырое поле; для показа удобнее `source`) |
| `source` | `{ id, title }` \| null | исходный бланк, если он не в корзине |
| `ruleSetId` | UUID \| null | привязанный набор правил награждения |
| `createdAt`, `updatedAt` | string | |
| `deletedAt` | null | у живого документа всегда `null` |
| `sheets` | object[] | листы: `id`, `documentId`, `position`, `backgroundFileId` (UUID \| null), `layout` (массив элементов), `schemaVersion` |

```json
{
  "id": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
  "orgId": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  "title": "Грамота за место",
  "pageWidthMm": 297,
  "pageHeightMm": 210,
  "verifyEnabled": true,
  "verifyFields": ["name", "place"],
  "eventName": "Первенство области по плаванию",
  "eventDate": "17–19 июня 2026",
  "eventPlace": "г. Челябинск",
  "eventHours": "",
  "issueDate": "2026-06-19T00:00:00.000Z",
  "expiresIn": null,
  "expiresAt": null,
  "category": "sport",
  "sourceDocumentId": null,
  "source": null,
  "ruleSetId": "7c1f7d1e-2b5e-4c3a-9c1a-8d2f0a6b1e11",
  "createdAt": "2026-08-01T08:00:00.000Z",
  "updatedAt": "2026-08-30T10:12:44.000Z",
  "deletedAt": null,
  "sheets": [
    {
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "documentId": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
      "position": 0,
      "backgroundFileId": "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      "layout": [],
      "schemaVersion": 2
    }
  ]
}
```

`layout` хранится в том виде, в каком его сохранили: у листов, записанных до версии 2,
текстовые блоки могут содержать `props.text` вместо `props.doc`. Форма элементов —
в [справочнике макета](../../reference/layout.md).

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `id` не UUID |
| 401 | нет токена или сессии |
| 404 | «Документ не найден» — нет такого, чужой или в корзине |

## Пример

```bash
curl "https://vruchay.ru/api/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

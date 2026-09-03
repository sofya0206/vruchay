---
method: POST
path: /api/documents
title: Создать документ
group: documents
auth: token
roles: any
rate_limit: none
---

# POST /api/documents

Создаёт материал сразу с одним листом и колонками таблицы получателей. Без `presetId`
лист пустой (`layout: []`), колонки — `name` и `email`. С `presetId` сервер сам
раскладывает по листу текст заготовки и заводит её колонки (у `sport-award` — ещё
`place`); раздел берётся из заготовки, если `category` не передан.

## Запрос

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `title` | string | да | 1–200 символов после обрезки пробелов. Ошибка: «Введите название» |
| `pageWidthMm` | number | нет | 50…600, по умолчанию 297 |
| `pageHeightMm` | number | нет | 50…600, по умолчанию 210 |
| `category` | `sport` \| `contest` \| `education` \| `corporate` \| `accreditation` | нет | раздел библиотеки |
| `presetId` | `sport-award` \| `contest-participant` \| `course-certificate` \| `corporate-thanks` | нет | заготовка макета |

```json
{
  "title": "Грамота за место",
  "pageWidthMm": 297,
  "pageHeightMm": 210,
  "presetId": "sport-award"
}
```

## Ответ

`201 Created` — документ с листами и колонками.

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | |
| `orgId` | UUID | организация |
| `title` | string | |
| `pageWidthMm`, `pageHeightMm` | number | |
| `verifyEnabled` | boolean | страница проверки подлинности включена (по умолчанию `true`) |
| `verifyFields` | string[] | какие поля получателя раскрывать на странице проверки (по умолчанию `[]`) |
| `eventName`, `eventDate`, `eventPlace`, `eventHours` | string | мероприятие; пустые строки |
| `issueDate` | string \| null | дата выдачи; `null` — день выпуска |
| `expiresIn` | string \| null | срок действия длительностью (`P1Y`) |
| `expiresAt` | string \| null | срок действия фиксированной датой |
| `category` | string \| null | |
| `sourceDocumentId` | UUID \| null | исходник копии |
| `ruleSetId` | UUID \| null | привязанный набор правил награждения |
| `createdAt`, `updatedAt` | string | |
| `deletedAt` | null | |
| `sheets` | object[] | листы по порядку: `id`, `documentId`, `position`, `backgroundFileId` (null), `layout`, `schemaVersion` (2) |
| `columns` | object[] | колонки таблицы получателей: `id`, `documentId`, `position`, `name`, `title` (null) |

```json
{
  "id": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
  "orgId": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  "title": "Грамота за место",
  "pageWidthMm": 297,
  "pageHeightMm": 210,
  "verifyEnabled": true,
  "verifyFields": [],
  "eventName": "",
  "eventDate": "",
  "eventPlace": "",
  "eventHours": "",
  "issueDate": null,
  "expiresIn": null,
  "expiresAt": null,
  "category": "sport",
  "sourceDocumentId": null,
  "ruleSetId": null,
  "createdAt": "2026-09-03T09:00:00.000Z",
  "updatedAt": "2026-09-03T09:00:00.000Z",
  "deletedAt": null,
  "sheets": [
    {
      "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
      "documentId": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
      "position": 0,
      "backgroundFileId": null,
      "layout": [ { "id": "…", "type": "text", "x": 20, "y": 40, "w": 257, "h": 20, "props": { "doc": { "type": "doc", "content": [] }, "fontFamily": "PT Sans", "fontSize": 16 } } ],
      "schemaVersion": 2
    }
  ],
  "columns": [
    { "id": "c1…", "documentId": "6f1c3b2a-…", "position": 0, "name": "name", "title": null },
    { "id": "c2…", "documentId": "6f1c3b2a-…", "position": 1, "name": "email", "title": null },
    { "id": "c3…", "documentId": "6f1c3b2a-…", "position": 2, "name": "place", "title": null }
  ]
}
```

Элементы `layout` заготовки показаны схематично; полная форма — в
[справочнике макета](../../reference/layout.md).

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Введите название» — пустой `title`; `title` длиннее 200; размер листа вне 50…600; неизвестный `category` или `presetId` |
| 401 | нет токена или сессии |
| 413 | тело больше 1 МБ |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Грамота за место","presetId":"sport-award"}'
```

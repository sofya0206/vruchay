---
method: POST
path: /api/documents/{id}/sheets
title: Добавить лист
group: documents
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/sheets

Добавляет в конец документа пустой лист (`layout: []`, `schemaVersion: 2`). Размер листа
у всех листов документа общий — `pageWidthMm` × `pageHeightMm` карточки. Макет
заполняется отдельным `PATCH /api/documents/{id}/sheets/{sheetId}`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |

Тела нет.

## Ответ

`201 Created` — созданный лист.

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | |
| `documentId` | UUID | |
| `position` | integer | порядковый номер, с нуля |
| `backgroundFileId` | null | |
| `layout` | `[]` | |
| `schemaVersion` | `2` | |

```json
{
  "id": "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
  "documentId": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
  "position": 1,
  "backgroundFileId": null,
  "layout": [],
  "schemaVersion": 2
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
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/sheets" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

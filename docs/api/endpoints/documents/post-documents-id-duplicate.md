---
method: POST
path: /api/documents/{id}/duplicate
title: Копия документа под новое мероприятие
group: documents
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/duplicate

Создаёт новый документ на основе существующего: копируются размер листа, настройки
проверки, раздел, все листы с макетами и колонки таблицы получателей. Фон листа
переиспользуется ссылкой на тот же файл, без копии в хранилище. **Не копируются**
получатели, название/даты/место мероприятия, дата выдачи, срок действия и привязка
к набору правил. Название копии — `«<исходное> — новое мероприятие»`, у копии
выставляется `sourceDocumentId` на исходник.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор исходного документа (не в корзине) |

Тела нет.

## Ответ

`201 Created` — новый документ с листами. Форма — как у `GET /api/documents/{id}`,
но без `source` и без `columns`.

```json
{
  "id": "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  "orgId": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  "title": "Грамота за место — новое мероприятие",
  "pageWidthMm": 297,
  "pageHeightMm": 210,
  "verifyEnabled": true,
  "verifyFields": ["name", "place"],
  "eventName": "",
  "eventDate": "",
  "eventPlace": "",
  "eventHours": "",
  "issueDate": null,
  "expiresIn": null,
  "expiresAt": null,
  "category": "sport",
  "sourceDocumentId": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
  "ruleSetId": null,
  "createdAt": "2026-09-03T09:10:00.000Z",
  "updatedAt": "2026-09-03T09:10:00.000Z",
  "deletedAt": null,
  "sheets": [
    { "id": "…", "documentId": "9e8d7c6b-…", "position": 0, "backgroundFileId": "d4e5f6a7-…", "layout": [], "schemaVersion": 2 }
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
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/duplicate" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

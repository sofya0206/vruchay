---
method: PATCH
path: /api/documents/{id}
title: Изменить свойства документа
group: documents
auth: token
roles: any
rate_limit: none
---

# PATCH /api/documents/{id}

Частичное обновление карточки: название, размер листа, настройки проверки подлинности,
мероприятие, дата выдачи, срок действия, раздел. Передаются только меняемые поля;
пустое тело отклоняется. Макет листа этим маршрутом не меняется — для него
`PATCH /api/documents/{id}/sheets/{sheetId}`. Документ из корзины править нельзя (404).

Срок действия — правило на момент выпуска: изменение не трогает уже выданные файлы.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |

Тело — любое непустое подмножество полей:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `title` | string | нет | 1–200 символов. Ошибка: «Введите название» |
| `pageWidthMm` | number | нет | 50…600 |
| `pageHeightMm` | number | нет | 50…600 |
| `verifyEnabled` | boolean | нет | показывать ли страницу проверки |
| `verifyFields` | string[] | нет | до 10 имён полей, каждое до 64 символов; эти значения получателя раскрываются на странице проверки |
| `eventName` | string | нет | до 300 |
| `eventDate` | string | нет | до 100, живым текстом («17–19 июня 2026») |
| `eventPlace` | string | нет | до 200 |
| `eventHours` | string | нет | до 50 |
| `issueDate` | string \| null | нет | `ГГГГ-ММ-ДД`; `null` — печатать день выпуска. Ошибки: «Дата в виде ГГГГ-ММ-ДД», «Такой даты нет» |
| `folderId` | string (UUID) \| null | нет | папка из `GET /api/folders`; `null` — вынуть материал в корень |
| `expiresIn` | string \| null | нет | длительность ISO 8601 от даты выдачи: `P1Y`, `P6M`, `P2W`, `P30D`, `P1Y6M`; до 20 символов, приводится к верхнему регистру; не больше 100 лет; `null` — снять. Ошибка: «Срок задаётся как P1Y, P6M, P2W или P30D» |
| `expiresAt` | string \| null | нет | фиксированная дата окончания (любая запись, которую разбирает `Date`); `null` — снять. Ошибка: «Не удалось разобрать дату окончания срока» |

```json
{
  "eventName": "Первенство области по плаванию",
  "eventDate": "17–19 июня 2026",
  "eventPlace": "г. Челябинск",
  "issueDate": "2026-06-19",
  "verifyFields": ["name", "place"]
}
```

## Ответ

`200 OK` — обновлённый документ с листами. Форма — как у `GET /api/documents/{id}`,
но **без** поля `source` (есть только сырой `sourceDocumentId`).

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
  "folderId": "9f1c0c8e-0f3c-4a1a-9c1f-1f7d2a3b4c5d",
  "sourceDocumentId": null,
  "ruleSetId": null,
  "createdAt": "2026-08-01T08:00:00.000Z",
  "updatedAt": "2026-09-03T09:05:00.000Z",
  "deletedAt": null,
  "sheets": [
    { "id": "b2c3d4e5-…", "documentId": "6f1c3b2a-…", "position": 0, "backgroundFileId": null, "layout": [], "schemaVersion": 2 }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Нечего обновлять» — пустое тело; «Некорректный идентификатор»; «Введите название»; «Дата в виде ГГГГ-ММ-ДД»; «Такой даты нет»; «Срок задаётся как P1Y, P6M, P2W или P30D»; «Не удалось разобрать дату окончания срока»; выход за пределы длины/диапазона; `folderId` не UUID |
| 401 | нет токена или сессии |
| 404 | Папки с таким `folderId` в вашей организации нет: «Папка не найдена». |
| 404 | «Документ не найден» — нет такого, чужой или в корзине |
| 413 | тело больше 1 МБ |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventName":"Первенство области по плаванию","issueDate":"2026-06-19","expiresIn":"P1Y"}'
```

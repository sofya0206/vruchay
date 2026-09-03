---
method: DELETE
path: /api/documents/{id}/sheets/{sheetId}
title: Удалить лист
group: documents
auth: token
roles: any
rate_limit: none
---

# DELETE /api/documents/{id}/sheets/{sheetId}

Удаляет лист документа и перенумеровывает оставшиеся (`position` без дыр).
Единственный лист удалить нельзя.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |
| `sheetId` | UUID | да | идентификатор листа |

Тела нет.

## Ответ

`200 OK`

```json
{ "ok": true }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — параметр не UUID |
| 401 | нет токена или сессии |
| 404 | «Документ не найден» — нет такого, чужой или в корзине; «Нельзя удалить единственный лист документа» (проверяется до поиска листа); «Лист не найден» — лист не из этого документа |

## Пример

```bash
curl -X DELETE "https://vruchay.ru/api/documents/$DOCUMENT_ID/sheets/$SHEET_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

---
method: DELETE
path: /api/documents/{id}/recipients/rows/{rowId}
title: Удалить строку
group: recipients
auth: token
roles: any
rate_limit: none
---

# DELETE /api/documents/{id}/recipients/rows/{rowId}

Удаляет строку из таблицы получателей. `position` остальных строк не пересчитывается. Выпущенные по строке файлы остаются; если по ней шёл выпуск, строка попадёт в список неудач задания как «Строки больше нет в таблице».

Если строку нужно лишь исключить из выпуска, снимите отметку: `PATCH …/rows/{rowId}` с `{"checked": false}` или `POST /api/documents/{id}/validation/exclude`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |
| `rowId` | UUID (путь) | да | Идентификатор строки |

Тела нет.

## Ответ

`200 OK`

```json
{ "ok": true }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` или `rowId` не UUID |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |
| 404 | `Строка не найдена` — строки нет или она из другого документа |

## Пример

```bash
curl -X DELETE "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients/rows/$ROW_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

---
method: DELETE
path: /api/documents/{id}/recipients/columns/{columnId}
title: Удалить колонку
group: recipients
auth: token
roles: any
rate_limit: none
---

# DELETE /api/documents/{id}/recipients/columns/{columnId}

Удаляет колонку и пересчитывает `position` у оставшихся, чтобы нумерация шла подряд. Значения в `data` строк под именем удалённой колонки не вычищаются, макеты листов не правятся — поле макета, ссылавшееся на колонку, останется без источника данных.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |
| `columnId` | UUID (путь) | да | Идентификатор колонки |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `ok` | boolean | Всегда `true` |

```json
{ "ok": true }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` или `columnId` не UUID |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |
| 404 | `Колонка не найдена` — колонки нет или она из другого документа |

## Пример

```bash
curl -X DELETE "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients/columns/$COLUMN_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

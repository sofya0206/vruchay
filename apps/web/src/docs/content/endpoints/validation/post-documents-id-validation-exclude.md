---
method: POST
path: /api/documents/{id}/validation/exclude
title: Снять отметку с проблемных строк
group: validation
auth: token
roles: any
rate_limit: «80 запросов за 5 минут с одного IP»
---

# POST /api/documents/{id}/validation/exclude

Снимает отметку к выпуску (`checked: false`) с перечисленных строк — «выпустить только чистые». Строки остаются в таблице со своими данными; вернуть их в выпуск можно через `POST …/recipients/checked` или `PATCH …/recipients/rows/{rowId}`. Идентификаторы чужих или несуществующих строк молча пропускаются.

Действие записывается в журнал аудита организации (`validation.exclude`).

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `rowIds` | UUID[] | да | 1–5000 идентификаторов строк (например, `rows[].rowId` из отчёта проверки) |

```json
{ "rowIds": ["b1c2…", "c3d4…"] }
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `excluded` | number | Со скольких строк снята отметка |

```json
{ "excluded": 2 }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` не UUID |
| 400 | `rowIds` пуст или больше 5000; элемент не UUID (сообщения Zod) |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |
| 429 | `Слишком много попыток. Повторите через N с.` — больше 80 запросов за 5 минут с одного IP |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/validation/exclude" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rowIds":["'$ROW_ID'"]}'
```

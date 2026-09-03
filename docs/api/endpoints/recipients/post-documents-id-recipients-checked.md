---
method: POST
path: /api/documents/{id}/recipients/checked
title: Отметить строки к выпуску
group: recipients
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/recipients/checked

Ставит или снимает отметку к выпуску сразу у многих строк. Без `rowIds` (или с пустым массивом) отметка применяется ко всем строкам документа. Идентификаторы чужих или несуществующих строк молча пропускаются — по `updated` видно, сколько строк реально изменено.

В выпуск (`POST /api/documents/{id}/generate`) попадают только строки с `checked: true`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `checked` | boolean | да | Что поставить |
| `rowIds` | UUID[] | нет | Каких строк это касается, до 10 000. Пусто — всех строк документа |

```json
{ "checked": false, "rowIds": ["b1c2…", "c3d4…"] }
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `updated` | number | Сколько строк обновлено |

```json
{ "updated": 2 }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` не UUID |
| 400 | `checked` не boolean; элемент `rowIds` не UUID; больше 10 000 элементов (сообщения Zod) |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients/checked" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"checked":true}'
```

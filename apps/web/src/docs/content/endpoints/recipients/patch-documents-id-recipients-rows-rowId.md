---
method: PATCH
path: /api/documents/{id}/recipients/rows/{rowId}
title: Изменить строку
group: recipients
auth: token
roles: any
rate_limit: none
---

# PATCH /api/documents/{id}/recipients/rows/{rowId}

Правит одну строку: значения ячеек и/или отметку к выпуску. `data` объединяется с уже сохранёнными значениями — передавать нужно только изменившиеся ячейки, остальные не затираются. Удалить ключ из `data` этим запросом нельзя, только записать пустую строку.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |
| `rowId` | UUID (путь) | да | Идентификатор строки |

Тело — хотя бы одно из полей:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `data` | object | нет | Изменяемые ячейки: ключ — латинское имя колонки, значение — строка до 1000 символов |
| `checked` | boolean | нет | Отметка к выпуску |

```json
{ "data": { "email": "ivanova@example.com" }, "checked": true }
```

## Ответ

`200 OK` — обновлённая строка, той же формы, что в `GET /api/documents/{id}/recipients`.

```json
{
  "id": "b1c2…",
  "documentId": "9a2b…",
  "position": 0,
  "data": { "name": "Иванова Мария Сергеевна", "email": "ivanova@example.com" },
  "checked": true,
  "lastFileId": null,
  "createdAt": "2026-09-03T10:15:00.000Z",
  "updatedAt": "2026-09-03T10:20:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` или `rowId` не UUID |
| 400 | `Нечего обновлять` — пустое тело `{}` |
| 400 | Ключ `data` не по шаблону: `Латинские буквы, цифры и подчёркивание; первым символом — буква`; значение длиннее 1000 символов |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |
| 404 | `Строка не найдена` — строки нет или она из другого документа |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients/rows/$ROW_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"email":"ivanova@example.com"}}'
```

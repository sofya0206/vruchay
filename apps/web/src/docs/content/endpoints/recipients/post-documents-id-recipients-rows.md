---
method: POST
path: /api/documents/{id}/recipients/rows
title: Добавить строку
group: recipients
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/recipients/rows

Добавляет одну строку в конец таблицы получателей. Строка создаётся отмеченной к выпуску (`checked: true`). Ключи `data` — имена колонок; сервер не проверяет, что такие колонки существуют в документе: значение под неизвестным ключом просто сохранится и в макет не попадёт.

Для загрузки списка целиком используйте `POST /api/documents/{id}/recipients/import`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `data` | object | нет | Значения по именам колонок; по умолчанию `{}`. Ключ — латинское имя (буквы, цифры, `_`, первый символ буква, до 64 символов); значение — строка до 1000 символов |

```json
{ "data": { "name": "Иванова Мария Сергеевна", "email": "ivanova@example.com" } }
```

## Ответ

`201 Created` — созданная строка.

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | Идентификатор строки |
| `documentId` | UUID | Документ |
| `position` | number | Порядковый номер, от нуля |
| `data` | object | Сохранённые значения |
| `checked` | boolean | `true` |
| `lastFileId` | null | Файлов по строке ещё нет |
| `createdAt`, `updatedAt` | string (ISO 8601) | Даты |

```json
{
  "id": "b1c2…",
  "documentId": "9a2b…",
  "position": 12,
  "data": { "name": "Иванова Мария Сергеевна", "email": "ivanova@example.com" },
  "checked": true,
  "lastFileId": null,
  "createdAt": "2026-09-03T10:15:00.000Z",
  "updatedAt": "2026-09-03T10:15:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` не UUID |
| 400 | Ключ `data` не по шаблону имени колонки: `Латинские буквы, цифры и подчёркивание; первым символом — буква` |
| 400 | Значение длиннее 1000 символов или не строка (сообщение Zod) |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients/rows" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"name":"Иванова Мария Сергеевна","email":"ivanova@example.com"}}'
```

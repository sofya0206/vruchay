---
method: GET
path: /api/documents/{id}/recipients
title: Получить таблицу получателей
group: recipients
auth: token
roles: any
rate_limit: none
---

# GET /api/documents/{id}/recipients

Возвращает таблицу получателей документа целиком: колонки по порядку, строки по порядку (не больше 10 000) и число отмеченных строк. Отмеченные строки (`checked: true`) — это те, что попадут в выпуск. Пагинации нет; строки сверх 10 000 в ответ не входят.

У нового документа уже есть две колонки — `name` и `email`: по ним работает выдача документов и рассылка.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `columns` | array | Колонки, отсортированы по `position` |
| `columns[].id` | UUID | Идентификатор колонки |
| `columns[].documentId` | UUID | Документ |
| `columns[].position` | number | Порядковый номер, от нуля |
| `columns[].name` | string | Имя переменной для макета без знака процента (`name`, `email`, `course`) |
| `columns[].title` | string \| null | Заголовок из загруженного файла («Год рождения»); `null` — колонка заведена руками |
| `rows` | array | Строки, отсортированы по `position`, не больше 10 000 |
| `rows[].id` | UUID | Идентификатор строки |
| `rows[].documentId` | UUID | Документ |
| `rows[].position` | number | Порядковый номер, от нуля |
| `rows[].data` | object | Значения по именам колонок: `{"name": "…", "email": "…"}` |
| `rows[].checked` | boolean | Отмечена к выпуску |
| `rows[].lastFileId` | UUID \| null | Последний выпущенный по строке файл |
| `rows[].createdAt`, `rows[].updatedAt` | string (ISO 8601) | Даты создания и изменения |
| `checkedCount` | number | Сколько строк отмечено (считается по всей таблице, без предела в 10 000) |

```json
{
  "columns": [
    { "id": "3f1c…", "documentId": "9a2b…", "position": 0, "name": "name", "title": "ФИО" },
    { "id": "5d7e…", "documentId": "9a2b…", "position": 1, "name": "email", "title": null }
  ],
  "rows": [
    {
      "id": "b1c2…",
      "documentId": "9a2b…",
      "position": 0,
      "data": { "name": "Иванова Мария Сергеевна", "email": "ivanova@example.com" },
      "checked": true,
      "lastFileId": null,
      "createdAt": "2026-09-03T10:15:00.000Z",
      "updatedAt": "2026-09-03T10:15:00.000Z"
    }
  ],
  "checkedCount": 1
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` не UUID |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` — документа нет, он удалён или принадлежит другой организации |

## Пример

```bash
curl "https://vruchay.ru/api/documents/$DOCUMENT_ID/recipients" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

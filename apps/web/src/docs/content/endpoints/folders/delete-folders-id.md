---
method: DELETE
path: /api/folders/{id}
title: Удалить папку
group: folders
auth: token
roles: any
rate_limit: none
---

# DELETE /api/folders/{id}

Удаляет папку. **Материалы при этом не удаляются**: они возвращаются в корень библиотеки, и их видно в общем списке `GET /api/documents` без `folderId`. Отменить удаление нечем — папку заводят заново.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| id | string (UUID) | да | Идентификатор папки. |

Тела нет.

## Ответ

`200 OK` — удалённая папка: `id`, `name`, `position`.

## Ошибки

| Код | Когда |
|---|---|
| 400 | `id` не UUID: «Некорректный идентификатор». |
| 401 | Нет токена или cookie-сессии. |
| 404 | Папки с таким `id` в вашей организации нет: «Папка не найдена». Чужая папка тоже даёт 404. |

## Пример

```bash
curl -X DELETE "https://vruchay.ru/api/folders/$FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

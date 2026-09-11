---
method: PATCH
path: /api/folders/{id}
title: Переименовать папку
group: folders
auth: token
roles: any
rate_limit: none
---

# PATCH /api/folders/{id}

Меняет название папки. Материалы внутри не трогает.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| id | string (UUID) | да | Идентификатор папки. |
| name | string | да | 1…100 знаков. |

```json
{ "name": "Обучение и семинары" }
```

## Ответ

`200 OK` — папка с новым названием.

## Ошибки

| Код | Когда |
|---|---|
| 400 | Пустое или слишком длинное название; `id` не UUID. |
| 401 | Нет токена или cookie-сессии. |
| 404 | Папки с таким `id` в вашей организации нет: «Папка не найдена». Чужая папка тоже даёт 404. |
| 409 | «Папка с таким названием уже есть». |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/folders/$FOLDER_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Обучение и семинары"}'
```

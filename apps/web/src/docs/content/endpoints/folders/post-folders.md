---
method: POST
path: /api/folders
title: Завести папку
group: folders
auth: token
roles: any
rate_limit: none
---

# POST /api/folders

Заводит папку в конце списка. Названия в пределах организации не повторяются: две папки с одним именем различить нечем.

## Запрос

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| name | string | да | 1…100 знаков. Пробелы по краям убираются. |

```json
{ "name": "Обучение" }
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор новой папки. |
| name | string | Название. |
| position | number | Порядок в колонке. |

## Ошибки

| Код | Когда |
|---|---|
| 400 | Пустое название: «Введите название папки»; длиннее 100 знаков. |
| 401 | Нет токена или cookie-сессии. |
| 409 | «Папка с таким названием уже есть». |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/folders" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Обучение"}'
```

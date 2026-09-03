---
method: DELETE
path: /api/documents/{id}
title: Отправить документ в корзину
group: documents
auth: token
roles: owner, admin
rate_limit: none
---

# DELETE /api/documents/{id}

Мягкое удаление: документ помечается `deletedAt` и пропадает из списка, но остаётся
в корзине (`GET /api/documents?trashed=true`). Выданные файлы и ссылки проверки
продолжают работать. Вернуть — `POST /api/documents/{id}/restore`; удалить насовсем —
`DELETE /api/documents/{id}/purge`. Документы, пролежавшие в корзине дольше срока,
чистятся по расписанию.

Действие пишется в журнал организации (`document.trash`).

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `ok` | `true` | |
| `title` | string | название удалённого документа |

```json
{ "ok": true, "title": "Грамота за место" }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `id` не UUID |
| 401 | нет токена или сессии |
| 403 | «Недостаточно прав для этого действия» — роль `member` |
| 404 | «Документ не найден» — нет такого, чужой или уже в корзине |

## Пример

```bash
curl -X DELETE "https://vruchay.ru/api/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

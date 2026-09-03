---
method: POST
path: /api/documents/{id}/restore
title: Вернуть документ из корзины
group: documents
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/restore

Снимает пометку удаления с документа в корзине. Работает только для документов
с `deletedAt`; живой документ этим маршрутом не найдётся.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа в корзине |

Тела нет.

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `ok` | `true` | |

```json
{ "ok": true }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `id` не UUID |
| 401 | нет токена или сессии |
| 404 | «Документ не найден» — нет такого, чужой или не в корзине |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/restore" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

---
method: POST
path: /api/registry/revoke/preview
title: Предпросмотр отзыва
group: registry
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/registry/revoke/preview

Что будет отозвано, до того как это станет необратимым: число документов по
цели, сколько из них уже отозваны и первые двадцать имён. Ничего не меняет.
Полученное `count` передаётся в `expectedCount` при вызове
`POST /api/registry/revoke`.

## Запрос

Тело — JSON, та же цель, что у отзыва.

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `fileIds` | UUID[] 1…500 | либо оно, либо `filter` | Отмеченные документы. |
| `filter` | object | либо оно, либо `fileIds` | Отбор реестра ([reference/registry-filter.md](../../reference/registry-filter.md)); должен содержать хотя бы одно из `documentId`, `event`, `from`, `to`. |

```json
{ "filter": { "event": "Городской конкурс «Мастер года»", "from": "2026-06-01", "to": "2026-06-30" } }
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `count` | number | Сколько документов попадёт под действие. |
| `alreadyRevoked` | number | Сколько из них уже отозваны. |
| `sample` | array | До 20 документов, новые выпуски первыми. |
| `sample[].fileId` | string (UUID) | Файл. |
| `sample[].name` | string | Имя получателя (может быть пустым). |
| `sample[].code` | string | Проверочный код с бумаги. |
| `sample[].documentTitle` | string | Название материала или «Материал удалён». |
| `sample[].state` | `valid` \| `revoked` \| `replaced` \| `expired` | Текущее состояние. |

```json
{
  "count": 640,
  "alreadyRevoked": 2,
  "sample": [
    {
      "fileId": "7d4c6e0a-1b2f-4c3d-9e8f-0a1b2c3d4e5f",
      "name": "Иванова Мария Петровна",
      "code": "K7M2-9QXR-4TVB",
      "documentTitle": "Сертификат участника",
      "state": "valid"
    }
  ]
}
```

Если по цели ничего не нашлось, ответ `{ "count": 0, "alreadyRevoked": 0, "sample": [] }` — это не ошибка.

## Ошибки

| Код | Когда |
|---|---|
| 400 | Переданы и `fileIds`, и `filter`, или ни одно — «Укажите либо документы, либо отбор». |
| 400 | Отбор без `documentId`/`event`/`from`/`to` — «Отбор для массового отзыва должен быть сужен материалом, мероприятием или периодом». |
| 400 | Пустой `fileIds` — «Не отмечено ни одного документа»; больше 500 — «За раз можно обработать не больше 500 документов»; элемент не UUID — «Некорректный идентификатор документа». |
| 400 | Ошибки внутри `filter`: «Некорректный идентификатор материала», «Неизвестное состояние документа», «Неизвестное состояние письма», «Не удалось разобрать дату начала периода», «Не удалось разобрать дату конца периода». |
| 401 | Нет токена или сессии. |
| 403 | Роль `member` — «Недостаточно прав для этого действия». |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/registry/revoke/preview" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filter":{"documentId":"'"$DOCUMENT_ID"'"}}'
```

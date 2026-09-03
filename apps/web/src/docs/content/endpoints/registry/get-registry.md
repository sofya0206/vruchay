---
method: GET
path: /api/registry
title: Реестр выданных документов
group: registry
auth: token
roles: any
rate_limit: none
---

# GET /api/registry

Страница реестра выданного по всей организации: каждый выпущенный документ
одной строкой — кому, по какому материалу, когда, в каком состоянии, что с
письмом и сколько раз проверяли. В отличие от реестра внутри материала, здесь
можно найти «грамоту Ивановой», не помня, в каком материале она выпускалась.

Выборка постранична: не больше 100 строк за запрос, сортировка — по дате
выпуска, новые первыми. Внутренняя причина отзыва (`revokedReasonInternal`)
отдаётся только владельцу и управляющему; сотруднику с ролью `member` в этом
поле всегда `null`.

## Запрос

Параметры строки запроса — общий отбор реестра (подробно:
[reference/registry-filter.md](../../reference/registry-filter.md)) плюс
постраничность.

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `search` | string ≤ 200 | нет | Имя, почта или проверочный код целиком. |
| `documentId` | UUID | нет | Материал. |
| `event` | string ≤ 200 | нет | Мероприятие, точное совпадение. |
| `state` | `valid` \| `revoked` \| `replaced` \| `expired` | нет | Состояние документа. |
| `mail` | `none` \| `queued` \| `sent` \| `delivered` \| `opened` \| `bounced` \| `failed` | нет | Состояние письма. |
| `from` | дата | нет | Выпущен не раньше этого дня (по Москве). |
| `to` | дата | нет | Выпущен не позже этого дня включительно. |
| `limit` | integer 1…100 | нет | Размер страницы. По умолчанию 50. |
| `offset` | integer ≥ 0 | нет | Смещение. По умолчанию 0. |

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `items` | array | Строки реестра — см. [reference/registry-row.md](../../reference/registry-row.md). |
| `total` | number | Сколько всего строк подходит под отбор (без учёта `limit`/`offset`). |
| `limit` | number | Применённый размер страницы. |
| `offset` | number | Применённое смещение. |

```json
{
  "items": [
    {
      "fileId": "7d4c6e0a-1b2f-4c3d-9e8f-0a1b2c3d4e5f",
      "publicId": "3f9a2b1c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
      "code": "K7M2-9QXR-4TVB",
      "verifyPath": "/c/K7M2-9QXR-4TVB",
      "name": "Иванова Мария Петровна",
      "email": "ivanova@example.com",
      "documentId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
      "documentTitle": "Сертификат участника",
      "eventName": "Открытый кубок города",
      "eventDate": "14.06.2026",
      "issuedAt": "2026-06-15T09:12:44.000Z",
      "expiresAt": null,
      "printedName": null,
      "revokedAt": null,
      "revokedReasonPublic": null,
      "revokedReasonInternal": null,
      "signedAt": "2026-06-15T09:12:45.000Z",
      "state": "valid",
      "reissuePending": false,
      "replacedBy": null,
      "mail": { "status": "delivered", "sentAt": "2026-06-15T09:13:10.000Z", "error": null },
      "verifyCount": 3,
      "verifyLastAt": "2026-08-02T17:40:01.000Z",
      "downloadCount": 1,
      "retention": null
    }
  ],
  "total": 1284,
  "limit": 50,
  "offset": 0
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `documentId` не UUID — «Некорректный идентификатор материала»; неизвестный `state` — «Неизвестное состояние документа»; неизвестный `mail` — «Неизвестное состояние письма»; нечитаемые `from`/`to` — «Не удалось разобрать дату начала периода» / «Не удалось разобрать дату конца периода»; `limit` вне 1…100, `offset` < 0 или не целое, `search`/`event` длиннее 200 знаков — стандартное сообщение Zod. |
| 401 | Нет токена или сессии. |

## Пример

```bash
curl "https://vruchay.ru/api/registry?state=valid&event=%D0%9E%D1%82%D0%BA%D1%80%D1%8B%D1%82%D1%8B%D0%B9%20%D0%BA%D1%83%D0%B1%D0%BE%D0%BA&limit=100&offset=0" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

Следующая страница — тот же запрос с `offset=100`; останавливайтесь, когда
`offset + items.length >= total`.

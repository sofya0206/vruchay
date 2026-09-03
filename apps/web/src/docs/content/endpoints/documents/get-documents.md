---
method: GET
path: /api/documents
title: Список документов организации
group: documents
auth: token
roles: any
rate_limit: none
---

# GET /api/documents

Библиотека материалов организации: страница списка с итоговым числом. По умолчанию
отдаются живые документы, отсортированные по времени правки; параметр `trashed=true`
показывает корзину тем же списком. У каждого элемента — превью первого листа (макет
и подписанная ссылка на фон), число листов и получателей.

## Запрос

Параметры строки запроса:

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `limit` | integer | нет | 1…100, по умолчанию 50 |
| `offset` | integer | нет | ≥ 0, по умолчанию 0 |
| `search` | string | нет | до 200 символов; поиск по названию без учёта регистра (подстрока) |
| `category` | `sport` \| `contest` \| `education` \| `corporate` \| `accreditation` | нет | фильтр по разделу |
| `sort` | `updated` \| `created` \| `title` | нет | `updated` — по правке (новые сверху), `created` — по созданию, `title` — по названию. По умолчанию `updated` |
| `trashed` | `true` \| `false` | нет | `true` — только корзина, `false` (по умолчанию) — только живые |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `items` | object[] | документы страницы |
| `items[].id` | UUID | |
| `items[].title` | string | |
| `items[].pageWidthMm`, `items[].pageHeightMm` | number | размер листа, мм |
| `items[].updatedAt`, `items[].createdAt` | string (ISO 8601) | |
| `items[].category` | string \| null | раздел |
| `items[].eventName`, `items[].eventDate` | string | мероприятие (пустые строки, если не заполнены) |
| `items[].deletedAt` | string \| null | когда отправлен в корзину; `null` у живых |
| `items[].sheetCount` | integer | число листов |
| `items[].recipientCount` | integer | число строк получателей |
| `items[].source` | `{ id, title }` \| null | исходный бланк, с которого снята копия; `null`, если копии нет или исходник в корзине |
| `items[].preview.layout` | array | макет первого листа (см. [макет листа](../../reference/layout.md)); `[]`, если листов нет |
| `items[].preview.backgroundUrl` | string \| null | подписанная ссылка на фон первого листа (действует 15 минут); `null`, если фона нет или подпись не удалась |
| `total` | integer | всего документов под фильтром |
| `limit`, `offset` | integer | как в запросе |

```json
{
  "items": [
    {
      "id": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
      "title": "Грамота за место",
      "pageWidthMm": 297,
      "pageHeightMm": 210,
      "updatedAt": "2026-08-30T10:12:44.000Z",
      "createdAt": "2026-08-01T08:00:00.000Z",
      "category": "sport",
      "eventName": "Первенство области по плаванию",
      "eventDate": "17–19 июня 2026",
      "deletedAt": null,
      "sheetCount": 1,
      "recipientCount": 214,
      "source": null,
      "preview": {
        "layout": [],
        "backgroundUrl": "https://storage.example/…?X-Amz-Signature=…"
      }
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | параметр не прошёл проверку: `limit` вне 1…100, `offset` < 0, `search` длиннее 200, неизвестный `category`/`sort`, `trashed` не `true`/`false` |
| 401 | нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/documents?limit=20&category=sport&sort=title" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

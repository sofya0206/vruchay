---
method: GET
path: /api/registry/analytics
title: Сводка по выданным документам
group: registry
auth: token
roles: any
rate_limit: none
---

# GET /api/registry/analytics

Цифры под таблицей реестра: сколько выдано, отозвано, заменено, истекло,
как дошли письма, сколько раз документы проверяли и скачивали, и разбивка по
материалам. Считается по тому же отбору, что и `GET /api/registry`, — сводка
относится ровно к тому, что видно в таблице.

Ничего о проверяющих сервис не хранит: только обезличенные счётчики на
документе.

## Запрос

Параметры строки запроса — общий отбор реестра
([reference/registry-filter.md](../../reference/registry-filter.md)).

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `search` | string ≤ 200 | нет | Имя, почта или проверочный код целиком. |
| `documentId` | UUID | нет | Материал. |
| `event` | string ≤ 200 | нет | Мероприятие, точное совпадение. |
| `state` | `valid` \| `revoked` \| `replaced` \| `expired` | нет | Состояние документа. |
| `mail` | `none` \| `queued` \| `sent` \| `delivered` \| `opened` \| `bounced` \| `failed` | нет | Состояние письма. |
| `from` | дата | нет | Выпущен не раньше этого дня (по Москве). |
| `to` | дата | нет | Выпущен не позже этого дня включительно. |

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `issued` | number | Документов в отборе. |
| `revoked` | number | С отозванной проверкой. |
| `replaced` | number | С выданной заменой. Считается независимо от отзыва: документ, который заменили и затем отозвали, входит в оба числа. |
| `expired` | number | С истёкшим сроком среди не отозванных и не заменённых. |
| `mail` | object | Воронка писем нарастающим итогом, а не по текущему состоянию: прочитанное письмо входит и в `sent`, и в `delivered`. |
| `mail.queued` | number | В очереди. |
| `mail.sent` | number | Ушло с сервера: `sent` + `delivered` + `opened` + `bounced`. |
| `mail.delivered` | number | Доставлено: `delivered` + `opened`. |
| `mail.opened` | number | Прочитано. |
| `mail.bounced` | number | Не доставлено (вернулось). |
| `mail.failed` | number | Не отправилось. |
| `downloads.total` | number | Сумма скачиваний по всем документам отбора. |
| `downloads.files` | number | Сколько документов скачивали хотя бы раз. |
| `verifications.total` | number | Сумма проверок по QR/коду. |
| `verifications.files` | number | Сколько документов проверяли хотя бы раз. |
| `documents` | array | До 10 материалов с наибольшим числом выданных документов. |
| `documents[].documentId` | string (UUID) \| null | Материал; null — документы без материала («Без материала»). |
| `documents[].title` | string | Название; «Материал удалён», если его больше нет. |
| `documents[].eventName` | string | Мероприятие. |
| `documents[].issued` | number | Выдано по материалу. |
| `documents[].verifications` | number | Проверок по документам материала. |

```json
{
  "issued": 1284,
  "revoked": 3,
  "replaced": 12,
  "expired": 0,
  "mail": { "queued": 0, "sent": 1270, "delivered": 1251, "opened": 904, "bounced": 19, "failed": 2 },
  "downloads": { "total": 316, "files": 288 },
  "verifications": { "total": 2410, "files": 913 },
  "documents": [
    {
      "documentId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
      "title": "Сертификат участника",
      "eventName": "Городской конкурс «Мастер года»",
      "issued": 640,
      "verifications": 1502
    }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | Те же ошибки отбора, что у `GET /api/registry`: «Некорректный идентификатор материала», «Неизвестное состояние документа», «Неизвестное состояние письма», «Не удалось разобрать дату начала периода», «Не удалось разобрать дату конца периода». |
| 401 | Нет токена или сессии. |

## Пример

```bash
curl "https://vruchay.ru/api/registry/analytics?from=2026-06-01&to=2026-06-30" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

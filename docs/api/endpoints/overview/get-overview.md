---
method: GET
path: /api/overview
title: Сводка по организации
group: overview
auth: token
roles: any
rate_limit: none
---

# GET /api/overview

Сводка для рабочего стола кабинета одним запросом: остаток пробы, счётчики выпуска и рассылки, пять последних материалов и пять последних заданий выпуска. Входных параметров нет — организация берётся из токена или сессии. Всё считается агрегатами, поэтому ответ одинаково быстрый у новой организации и у организации с сотнями тысяч документов.

Месяц для `issuedMonth` считается по московскому времени (UTC+3), с первого числа.

## Запрос

Параметров нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| usage | object | Остаток пробы — ровно то, что отвечает `GET /api/org/usage` (`plan`, `used`, `limit`, `left`, `bonus`). |
| issuedTotal | number | Выпущено документов за всё время (равно `usage.used`). |
| issuedMonth | number | Выпущено с начала текущего месяца по Москве. |
| emailsSent | number | Писем, принятых почтовым шлюзом, за всё время: статусы `sent`, `delivered`, `opened`. В очереди и отказанные не считаются. |
| materials | number | Материалов (документов) в работе — без удалённых в корзину. |
| documents | array | До 5 последних по времени изменения материалов. |
| documents[].id | string (UUID) | Идентификатор материала. |
| documents[].title | string | Название. |
| documents[].eventName | string | Название мероприятия (пустая строка — не задано). |
| documents[].eventDate | string | Дата мероприятия как введена (пустая строка — не задана). |
| documents[].updatedAt | string (ISO 8601) | Когда менялся. |
| jobs | array | До 5 последних заданий выпуска. |
| jobs[].id | string (UUID) | Идентификатор задания. |
| jobs[].documentId | string (UUID) | Материал. |
| jobs[].documentTitle | string | Название материала. |
| jobs[].status | string | `queued`, `running`, `done`, `failed` или `canceled`. |
| jobs[].total | number | Строк в задании. |
| jobs[].done | number | Выпущено. |
| jobs[].failed | number | Не удалось выпустить. |
| jobs[].createdAt | string (ISO 8601) | Когда поставлено. |

```json
{
  "usage": { "plan": "free", "used": 37, "limit": 100, "left": 63, "bonus": 50 },
  "issuedTotal": 37,
  "issuedMonth": 12,
  "emailsSent": 30,
  "materials": 3,
  "documents": [
    {
      "id": "0c9b7a65-4d3e-4f21-8b0a-1e2f3a4b5c6d",
      "title": "Грамоты первенства области",
      "eventName": "Первенство Самарской области",
      "eventDate": "14 сентября 2026",
      "updatedAt": "2026-09-02T14:20:05.000Z"
    }
  ],
  "jobs": [
    {
      "id": "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918",
      "documentId": "0c9b7a65-4d3e-4f21-8b0a-1e2f3a4b5c6d",
      "documentTitle": "Грамоты первенства области",
      "status": "done",
      "total": 12,
      "done": 12,
      "failed": 0,
      "createdAt": "2026-09-02T14:21:00.000Z"
    }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет действующего токена и нет cookie-сессии. `{"statusCode":401,"message":"Требуется вход в систему","error":"Unauthorized"}` |

## Пример

```bash
curl "https://vruchay.ru/api/overview" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

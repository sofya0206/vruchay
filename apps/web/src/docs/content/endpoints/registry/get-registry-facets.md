---
method: GET
path: /api/registry/facets
title: Значения для фильтров реестра
group: registry
auth: token
roles: any
rate_limit: none
---

# GET /api/registry/facets

Что подставлять в отбор реестра: материалы и мероприятия, по которым
что-то выдано. Материалы без выпущенных документов сюда не попадают —
фильтр по ним дал бы пустую таблицу. Материалы в корзине попадают (у них
заполнен `deletedAt`): их документы всё ещё в реестре, пока не истёк срок
хранения.

## Запрос

Параметров нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `documents` | array | До 300 материалов с выпущенными документами, новые первыми. |
| `documents[].id` | string (UUID) | Значение для параметра `documentId`. |
| `documents[].title` | string | Название материала. |
| `documents[].eventName` | string | Мероприятие. |
| `documents[].eventDate` | string | Дата мероприятия — строкой, как её ввели. |
| `documents[].deletedAt` | string (дата) \| null | Когда материал отправили в корзину; null — материал жив. |
| `events` | string[] | Уникальные непустые названия мероприятий из этих материалов — значения для параметра `event`. |
| `trashDays` | number | Срок хранения в корзине в днях (7): через столько дней после `deletedAt` документы материала удаляются. |

```json
{
  "documents": [
    {
      "id": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
      "title": "Сертификат участника",
      "eventName": "Городской конкурс «Мастер года»",
      "eventDate": "14.06.2026",
      "deletedAt": null
    }
  ],
  "events": ["Городской конкурс «Мастер года»"],
  "trashDays": 7
}
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет токена или сессии. |

## Пример

```bash
curl "https://vruchay.ru/api/registry/facets" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

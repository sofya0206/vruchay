---
method: GET
path: /api/integrations/tilda/requests
title: Заявки с форм на сайте
group: integrations
auth: token
roles: any
rate_limit: none
---

# GET /api/integrations/tilda/requests

Последние 200 заявок организации, новые первыми, — журнал выдачи документов посторонним людям через формы на сайте. Заявка создаётся публичным маршрутом формы; здесь её только читают. Пагинации нет, ограничение в 200 записей не настраивается.

Фильтры складываются: можно смотреть заявки одной интеграции, одного материала или их пересечение. Чужие заявки не покажет и точный идентификатор — выборка всегда сужена организацией из сессии.

Путь `requests` разбирается раньше `/{id}`, поэтому за заявками ходят сюда, а не в `GET /api/integrations/tilda/{id}`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| integrationId | string (UUID) | нет | Только заявки этой интеграции |
| documentId | string (UUID) | нет | Только заявки по этому материалу |

Неизвестные параметры строки запроса отбрасываются молча.

## Ответ

`200 OK` — массив заявок.

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор заявки |
| email | string | Адрес, который человек указал в форме |
| fields | object | Остальные поля формы: имя переменной → значение. Становятся переменными документа |
| status | string | `pending_otp` — ждём код из письма; `processing` — документ готовится; `done` — выдан; `failed` — не получилось; `rejected` — заявка отклонена |
| error | string \| null | Что пошло не так при выпуске |
| createdAt | string (ISO 8601) | Когда заявка принята |
| doneAt | string (ISO 8601) \| null | Когда документ выдан |
| documentId | string (UUID) | Материал, документ по которому запрашивали |

Адрес учётной записи площадки, IP и user-agent в ответ не попадают — они нужны только для разбора злоупотреблений.

```json
[
  {
    "id": "d4e5f607-1829-4a3b-8c4d-5e6f70819243",
    "email": "ivanova@example.com",
    "fields": { "name": "Иванова Мария Сергеевна", "place": "1" },
    "status": "done",
    "error": null,
    "createdAt": "2026-08-21T10:00:00.000Z",
    "doneAt": "2026-08-21T10:00:34.000Z",
    "documentId": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"
  }
]
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `integrationId` или `documentId` не UUID: «Invalid UUID» |
| 401 | Нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/integrations/tilda/requests?integrationId=$INTEGRATION_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

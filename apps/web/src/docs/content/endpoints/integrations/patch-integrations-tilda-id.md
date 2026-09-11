---
method: PATCH
path: /api/integrations/tilda/{id}
title: Изменить интеграцию с формой
group: integrations
auth: token
roles: owner, admin
rate_limit: none
---

# PATCH /api/integrations/tilda/{id}

Меняет настройки интеграции. Право владельца и администратора — как и создание: настройка формы решает, кому и какие документы выдаются без входа в сервис.

**Частичным обновление здесь только выглядит.** Все поля необязательны, но у большинства из них есть значение по умолчанию, и это значение подставляется схемой, когда поле не передано. То есть запрос `{"name": "Другое название"}` заодно вернёт к умолчанию `authMode`, `singleFilePerEmail`, `dailyLimit`, `successMessage`, `showDownload`, `sendEmail` и `active`. Чтобы этого не случилось, присылайте настройки целиком — например, взяв их из `GET /api/integrations/tilda/{id}` и заменив нужные. Сохраняются как есть только те поля, у которых умолчания нет: `name`, `allowedDomains`, `documentIds`, `copyToEmail`.

`token` и `orgId` не меняются. Поля `prefillFromAccount`, `allowEdit`, `showShare` и `showVerifyLink` схемой не принимаются, поэтому этим маршрутом их не изменить и не сбросить. Домены нормализуются, материалы проверяются на принадлежность организации — как при создании.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| id | string (UUID) | да | Идентификатор интеграции |

Тело — те же поля, что в `POST /api/integrations/tilda`, все необязательные; ограничения и умолчания те же. Неизвестные поля отбрасываются молча.

```json
{
  "name": "Форма на странице мероприятия",
  "allowedDomains": ["example.ru", "edu.example.ru"],
  "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
  "authMode": "none",
  "singleFilePerEmail": true,
  "dailyLimit": 1000,
  "successMessage": "Спасибо! Грамота отправлена на вашу почту",
  "showDownload": true,
  "sendEmail": true,
  "copyToEmail": "arhiv@example.ru",
  "active": false
}
```

## Ответ

`200 OK` — интеграция после изменения; поля перечислены в `GET /api/integrations/tilda` (кроме `_count`).

```json
{
  "id": "3f9a1b2c-4d5e-4f60-8a71-2b3c4d5e6f70",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "name": "Форма на странице мероприятия",
  "token": "00000000-0000-4000-8000-0000000000ab",
  "allowedDomains": ["example.ru", "edu.example.ru"],
  "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
  "authMode": "none",
  "singleFilePerEmail": true,
  "dailyLimit": 1000,
  "successMessage": "Спасибо! Грамота отправлена на вашу почту",
  "showDownload": true,
  "sendEmail": true,
  "copyToEmail": "arhiv@example.ru",
  "active": false,
  "prefillFromAccount": true,
  "allowEdit": true,
  "showShare": true,
  "showVerifyLink": false,
  "createdAt": "2026-08-20T09:20:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `id` не UUID: «Некорректный идентификатор» |
| 400 | `name` пустой: «Введите название»; `allowedDomains` пуст: «Укажите хотя бы один домен, иначе форма не будет работать»; `documentIds` пуст: «Выберите хотя бы один документ» |
| 400 | После нормализации доменов не осталось ничего: «Укажите домен страницы, на которой стоит форма» |
| 400 | Прочие нарушения границ — те же сообщения, что в `POST /api/integrations/tilda` |
| 401 | Нет токена или сессии |
| 403 | Роль `member`: «Недостаточно прав для этого действия» |
| 404 | Интеграции нет или она чужая: «Интеграция не найдена» |
| 404 | В `documentIds` попал чужой, удалённый или несуществующий материал: «Документ не найден» |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/integrations/tilda/$INTEGRATION_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Форма на странице мероприятия","allowedDomains":["example.ru"],"documentIds":["'"$DOCUMENT_ID"'"],"active":false}'
```

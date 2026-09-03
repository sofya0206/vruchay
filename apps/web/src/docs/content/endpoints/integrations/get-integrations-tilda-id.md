---
method: GET
path: /api/integrations/tilda/{id}
title: Настройки одной интеграции
group: integrations
auth: token
roles: any
rate_limit: none
---

# GET /api/integrations/tilda/{id}

Одна интеграция организации целиком. Поля те же, что в списке, но без счётчика заявок (`_count`).

Из `token` в ответе собираются адреса для вставки на страницу: стили `/api/v1/tilda-css/{token}` и скрипт `/api/v1/tilda-js/{token}`. Скрипт по этому адресу отдаёт форме её публичные настройки — способ подтверждения, текст окна успеха, текст согласия, — поэтому выключенная интеграция (`active: false`) перестаёт работать сразу, без правки страницы.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| id | string (UUID) | да | Идентификатор интеграции |

## Ответ

`200 OK` — поля перечислены в `GET /api/integrations/tilda`, кроме `_count`.

```json
{
  "id": "3f9a1b2c-4d5e-4f60-8a71-2b3c4d5e6f70",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "name": "Форма на странице соревнований",
  "token": "00000000-0000-4000-8000-0000000000ab",
  "allowedDomains": ["example.ru"],
  "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
  "authMode": "email_code",
  "singleFilePerEmail": true,
  "dailyLimit": 500,
  "successMessage": "Спасибо! Документ отправлен на вашу почту",
  "showDownload": true,
  "sendEmail": true,
  "copyToEmail": null,
  "active": true,
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
| 401 | Нет токена или сессии |
| 404 | Интеграции нет или она чужая: «Интеграция не найдена» |

## Пример

```bash
curl "https://vruchay.ru/api/integrations/tilda/$INTEGRATION_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

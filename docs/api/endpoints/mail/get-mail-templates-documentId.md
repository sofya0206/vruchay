---
method: GET
path: /api/mail/templates/{documentId}
title: Письмо о выдаче документа для материала
group: mail
auth: token
roles: any
rate_limit: none
---

# GET /api/mail/templates/{documentId}

Возвращает транзакционный шаблон письма (поток `transactional` — «выдача документа») для материала, вместе с выбранным отправителем. Этот же шаблон используют `POST /api/mail/send/{documentId}`, выдача по заявке с формы на сайте и уведомления о сроке документа.

Рекламный шаблон (`marketing`) этим маршрутом не виден — за обоими потоками ходите в `GET /api/mailing/templates/{documentId}?kind=…`.

Принадлежность материала организации отдельно не проверяется: шаблон ищется по паре «организация + материал», и для чужого или несуществующего материала ответ просто пустой.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | да | Идентификатор материала |

## Ответ

`200 OK`. Если шаблон ещё не сохранён — тело ответа пустое (сервис возвращает `null`).

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор шаблона |
| orgId | string (UUID) | Организация |
| documentId | string (UUID) | Материал |
| senderId | string (UUID) \| null | Отправитель организации; `null` — письма идут с отправителя по умолчанию |
| kind | string | Всегда `transactional` |
| advertiserName | null | У транзакционного шаблона не заполняется |
| subject | string | Тема; допускает переменные строки получателя |
| bodyHtml | string | HTML тела после санитизации |
| attachGeneratedFile | boolean | Прикладывать ли выпущенный файл |
| createdAt, updatedAt | string (ISO 8601) | Даты |
| sender | object \| null | Отправитель целиком (поля — как в `POST /api/mail/senders`) |

```json
{
  "id": "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "documentId": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b",
  "senderId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "kind": "transactional",
  "advertiserName": null,
  "subject": "Ваш сертификат, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}!</p><p>Сертификат во вложении.</p>",
  "attachGeneratedFile": true,
  "createdAt": "2026-08-21T10:00:00.000Z",
  "updatedAt": "2026-08-21T10:00:00.000Z",
  "sender": {
    "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
    "domainId": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
    "email": "awards@example.ru",
    "displayName": "Центр «Развитие»",
    "isDefault": false,
    "createdAt": "2026-08-20T09:20:00.000Z"
  }
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `documentId` не UUID: «Некорректный идентификатор» |
| 401 | Нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/mail/templates/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

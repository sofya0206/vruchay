---
method: GET
path: /api/mailing/templates/{documentId}
title: Шаблон письма выбранного потока
group: mailing
auth: token
roles: any
rate_limit: none
---

# GET /api/mailing/templates/{documentId}

Возвращает шаблон письма для материала в указанном потоке — вместе с отправителем. Поток обязателен: у материала может быть два шаблона, транзакционный (`transactional`, выдача документа) и рекламный (`marketing`), и они хранятся отдельными записями, которые никогда не перезаписывают друг друга.

Чем раздел `mailing` отличается от `mail`: `mail` — это настройка почты материала (домены, отправители, письмо о выдаче) и отправка со страницы материала, и там поток всегда транзакционный. `mailing` — самостоятельный раздел «Рассылка»: оба потока, несколько материалов за раз, список адресов руками, проверка согласия на рекламу и журнал доставки с переведёнными причинами. Транзакционный шаблон здесь и в `GET /api/mail/templates/{documentId}` — одна и та же запись, читаемая двумя маршрутами.

Ещё одно отличие от `mail`: здесь материал сначала проверяется на принадлежность организации, поэтому чужой или удалённый даёт 404, а не пустой ответ.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | да | Материал организации (не удалённый) |
| kind | `transactional` \| `marketing` | да | Поток письма; параметр строки запроса |

## Ответ

`200 OK`. Шаблона этого потока ещё нет — тело пустое (сервис возвращает `null`).

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор шаблона |
| orgId | string (UUID) | Организация |
| documentId | string (UUID) | Материал |
| senderId | string (UUID) \| null | Отправитель организации; `null` — письма идут с общего адреса сервиса |
| kind | `transactional` \| `marketing` | Поток |
| advertiserName | string \| null | Рекламодатель; заполнен только у рекламного шаблона |
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
  "kind": "marketing",
  "advertiserName": "ООО «Развитие»",
  "subject": "Мероприятия сезона, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}!</p>",
  "attachGeneratedFile": false,
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
| 400 | `kind` не передан или не из списка: «Invalid option: expected one of "transactional"\|"marketing"» |
| 401 | Нет токена или сессии |
| 404 | Материала нет, он удалён или чужой: «Материал не найден» |

## Пример

```bash
curl "https://vruchay.ru/api/mailing/templates/$DOCUMENT_ID?kind=marketing" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

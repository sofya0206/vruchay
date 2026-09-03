---
method: POST
path: /api/mailing/templates/{documentId}
title: Сохранить письмо рассылки
group: mailing
auth: token
roles: any
rate_limit: none
---

# POST /api/mailing/templates/{documentId}

Создаёт или обновляет шаблон письма для материала в указанном потоке. У материала по одному шаблону на поток: повторный вызов с тем же `kind` перезаписывает свою запись и не трогает чужую — правка рекламного текста не меняет письмо о выдаче документа. HTML тела очищается от опасной разметки при сохранении, поэтому в ответе может прийти не то, что было отправлено.

Отличие от `POST /api/mail/templates/{documentId}`: там поток всегда `transactional` и лишние поля тела молча игнорируются. Здесь поток указывается явно, а схема строгая — попытка передать рекламодателя вместе с письмом о выдаче документа отклоняется на входе, а не «проходит и не применяется». Транзакционный шаблон при этом один и тот же: сохранённое здесь с `kind: "transactional"` видно и в `GET /api/mail/templates/{documentId}`.

Для рекламного письма `advertiserName` обязателен: получатель должен видеть, чья это реклама. Рекламное письмо сервис дополняет при отправке пометкой «Реклама», именем рекламодателя и ссылкой отписки — в тексте шаблона их писать не нужно.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | да | Материал организации (не удалённый) |

Тело — размеченное объединение по полю `kind`; лишние поля запрещены.

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| kind | `transactional` \| `marketing` | да | Поток письма |
| subject | string | да | Тема, 1–300 символов после обрезки пробелов |
| bodyHtml | string | да | HTML тела, до 50 000 символов |
| attachGeneratedFile | boolean | нет | Прикладывать выпущенный файл; по умолчанию `true` |
| senderId | string (UUID) | нет | Отправитель организации из `POST /api/mail/senders`. Не указан — общий адрес сервиса |
| advertiserName | string | только при `kind: "marketing"` | Рекламодатель, 1–200 символов после обрезки пробелов; в транзакционном теле поле запрещено |

```json
{
  "kind": "marketing",
  "subject": "Соревнования сезона, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}! Приглашаем на осенний старт.</p>",
  "attachGeneratedFile": false,
  "senderId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "advertiserName": "ООО «Федерация плавания»"
}
```

## Ответ

`201 Created` — сохранённый шаблон (без вложенного отправителя).

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор шаблона |
| orgId | string (UUID) | Организация |
| documentId | string (UUID) | Материал |
| senderId | string (UUID) \| null | Отправитель |
| kind | `transactional` \| `marketing` | Поток |
| advertiserName | string \| null | Рекламодатель; у транзакционного шаблона всегда `null` |
| subject | string | Тема |
| bodyHtml | string | HTML после санитизации |
| attachGeneratedFile | boolean | Прикладывать ли файл |
| createdAt, updatedAt | string (ISO 8601) | Даты |

```json
{
  "id": "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "documentId": "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b",
  "senderId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "kind": "marketing",
  "advertiserName": "ООО «Федерация плавания»",
  "subject": "Соревнования сезона, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}! Приглашаем на осенний старт.</p>",
  "attachGeneratedFile": false,
  "createdAt": "2026-08-21T10:00:00.000Z",
  "updatedAt": "2026-08-21T10:05:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `documentId` не UUID: «Некорректный идентификатор» |
| 400 | `kind` отсутствует или не из списка: «Invalid discriminator value. Expected 'transactional' \| 'marketing'» |
| 400 | Лишнее поле в теле (например, `advertiserName` при `kind: "transactional"`): «Unrecognized key: "advertiserName"» |
| 400 | `subject` пустой: «Введите тему письма»; длиннее 300: «Too big: expected string to have <=300 characters» |
| 400 | `bodyHtml` отсутствует: «Invalid input: expected string, received undefined»; длиннее 50 000: «Too big: expected string to have <=50000 characters» |
| 400 | `advertiserName` при `kind: "marketing"` пуст: «Укажите рекламодателя: получатель должен видеть, чья это реклама»; из сервиса — «Укажите рекламодателя: по закону получатель должен видеть, чья это реклама» |
| 400 | `senderId` не UUID: «Invalid UUID»; `attachGeneratedFile` не булево: «Invalid input: expected boolean, received string» |
| 401 | Нет токена или сессии |
| 404 | Материала нет, он удалён или чужой: «Материал не найден» |
| 404 | `senderId` не принадлежит организации: «Отправитель не найден» |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/mailing/templates/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"marketing","subject":"Соревнования сезона, {{name}}","bodyHtml":"<p>Здравствуйте, {{name}}!</p>","attachGeneratedFile":false,"advertiserName":"ООО «Федерация плавания»"}'
```

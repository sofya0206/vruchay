---
method: POST
path: /api/mail/templates/{documentId}
title: Сохранить письмо о выдаче документа
group: mail
auth: token
roles: any
rate_limit: none
---

# POST /api/mail/templates/{documentId}

Создаёт или обновляет транзакционный шаблон письма для материала — у материала он один, повторный вызов перезаписывает его. HTML тела очищается от опасной разметки при сохранении, поэтому в ответе может прийти не то, что было отправлено.

Поток здесь фиксирован: `transactional`. Рекламное письмо с обязательным рекламодателем сохраняется через `POST /api/mailing/templates/{documentId}`. Лишние поля в теле игнорируются (схема не строгая), в отличие от `mailing`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| documentId | string (UUID) | да | Материал организации (не удалённый) |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| senderId | string (UUID) | нет | Отправитель организации из `POST /api/mail/senders`. Не указан — отправитель по умолчанию |
| subject | string | да | Тема, 1–300 символов после обрезки пробелов |
| bodyHtml | string | да | HTML тела, до 50 000 символов |
| attachGeneratedFile | boolean | нет | Прикладывать выпущенный файл; по умолчанию `true` |

```json
{
  "senderId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "subject": "Ваш сертификат, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}!</p><p>Сертификат во вложении.</p>",
  "attachGeneratedFile": true
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
| kind | string | `transactional` |
| advertiserName | null | Не используется |
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
  "kind": "transactional",
  "advertiserName": null,
  "subject": "Ваш сертификат, {{name}}",
  "bodyHtml": "<p>Здравствуйте, {{name}}!</p><p>Сертификат во вложении.</p>",
  "attachGeneratedFile": true,
  "createdAt": "2026-08-21T10:00:00.000Z",
  "updatedAt": "2026-08-21T10:05:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `documentId` не UUID: «Некорректный идентификатор» |
| 400 | `subject` пустой: «Введите тему письма»; длиннее 300: «Too big: expected string to have <=300 characters» |
| 400 | `bodyHtml` отсутствует: «Invalid input: expected string, received undefined»; длиннее 50 000: «Too big: expected string to have <=50000 characters» |
| 400 | `senderId` не UUID: «Invalid UUID»; `attachGeneratedFile` не булево: «Invalid input: expected boolean, received string» |
| 401 | Нет токена или сессии |
| 404 | Материала нет, он удалён или чужой: «Документ не найден» |
| 404 | `senderId` не принадлежит организации: «Отправитель не найден» |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/mail/templates/$DOCUMENT_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Ваш сертификат, {{name}}","bodyHtml":"<p>Здравствуйте, {{name}}!</p>","attachGeneratedFile":true}'
```

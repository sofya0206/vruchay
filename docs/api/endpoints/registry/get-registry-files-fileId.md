---
method: GET
path: /api/registry/files/{fileId}
title: Карточка выданного документа
group: registry
auth: token
roles: any
rate_limit: none
---

# GET /api/registry/files/{fileId}

Что с документом было и что с ним стало: строка реестра, письма с ним и
лента событий, сведённая из трёх источников — выпуска, событий писем и
журнала действий организации (по самому файлу и по его материалу).

Имена сотрудников в ленте (`actor`) видят только владелец и управляющий;
для роли `member` поле всегда пустое. Внутренняя причина отзыва в `row`
тоже отдаётся только им.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `fileId` | UUID (путь) | да | Идентификатор файла из реестра. |

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `row` | object | Строка реестра — см. [reference/registry-row.md](../../reference/registry-row.md). |
| `verifyCount` | number | Сколько раз документ проверяли. |
| `verifyLastAt` | string (дата) \| null | Последняя проверка. |
| `emails` | array | Все письма с этим документом, старые первыми. |
| `emails[].id` | string (UUID) | Идентификатор письма. |
| `emails[].toEmail` | string | Адрес получателя. |
| `emails[].status` | string | `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed`. |
| `emails[].error` | string \| null | Текст ошибки отправки, если была. |
| `emails[].queuedAt` | string (дата) | Когда поставлено в очередь. |
| `history` | array | До 100 событий, новые первыми. |
| `history[].at` | string (дата) | Когда произошло. |
| `history[].kind` | `issued` \| `mail` \| `action` | Выпуск, событие письма, действие сотрудника. |
| `history[].title` | string | «Документ выпущен»; «Письмо отправлено» / «Письмо доставлено» / «Письмо прочитано» / «Письмо не доставлено» / «Письмо не отправилось»; для действий — текст записи журнала. |
| `history[].detail` | string | Для событий письма — адрес получателя; иначе пустая строка. |
| `history[].actor` | string | Имя или почта сотрудника для `action` (только владельцу и управляющему); иначе пустая строка. |

```json
{
  "row": {
    "fileId": "7d4c6e0a-1b2f-4c3d-9e8f-0a1b2c3d4e5f",
    "code": "K7M2-9QXR-4TVB",
    "state": "valid",
    "name": "Иванова Мария Петровна",
    "…": "остальные поля строки реестра"
  },
  "verifyCount": 3,
  "verifyLastAt": "2026-08-02T17:40:01.000Z",
  "emails": [
    {
      "id": "0c9d8e7f-6a5b-4c3d-2e1f-0a9b8c7d6e5f",
      "toEmail": "ivanova@example.com",
      "status": "delivered",
      "error": null,
      "queuedAt": "2026-06-15T09:13:02.000Z"
    }
  ],
  "history": [
    {
      "at": "2026-06-15T09:13:31.000Z",
      "kind": "mail",
      "title": "Письмо доставлено",
      "detail": "ivanova@example.com",
      "actor": ""
    },
    {
      "at": "2026-06-15T09:12:44.000Z",
      "kind": "issued",
      "title": "Документ выпущен",
      "detail": "",
      "actor": ""
    }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `fileId` не UUID — «Некорректный идентификатор». |
| 401 | Нет токена или сессии. |
| 404 | Документа нет, он удалён или принадлежит другой организации — «Документ не найден». |

## Пример

```bash
curl "https://vruchay.ru/api/registry/files/$FILE_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

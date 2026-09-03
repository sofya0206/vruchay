---
method: GET
path: /api/documents/files/{fileId}/url
title: Подписанная ссылка на файл
group: documents
auth: token
roles: any
rate_limit: none
---

# GET /api/documents/files/{fileId}/url

Возвращает временную подписанную ссылку на файл организации в хранилище — в первую
очередь на фон листа (`backgroundFileId`), чтобы показать его в превью. Ссылка действует
15 минут; за новой нужно обращаться снова. Файл ищется по организации текущего
пользователя, удалённые (`deletedAt`) не отдаются.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `fileId` | UUID | да | идентификатор файла |

Тела нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| `url` | string | подписанная ссылка GET на объект хранилища |

```json
{ "url": "https://storage.example/…?X-Amz-Signature=…" }
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `fileId` не UUID |
| 401 | нет токена или сессии |
| 404 | «Файл не найден» — нет такого, чужой или удалён |

## Пример

```bash
curl "https://vruchay.ru/api/documents/files/$FILE_ID/url" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

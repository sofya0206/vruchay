---
method: GET
path: /api/registry/files/{fileId}/download
title: Скачать один документ
group: registry
auth: token
roles: any
rate_limit: none
---

# GET /api/registry/files/{fileId}/download

Отдать файл одного выданного документа — посмотреть или переслать вручную.
Ответ — сам PDF или JPEG, не JSON. У документа увеличивается `downloadCount`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `fileId` | UUID (путь) | да | Идентификатор файла из реестра (`fileId` строки). |

## Ответ

`200 OK`, файл потоком.

| Заголовок | Значение |
|---|---|
| `Content-Type` | MIME выпущенного файла: `application/pdf` или `image/jpeg`. |
| `Content-Disposition` | `attachment; filename="..."; filename*=UTF-8''...` — исходное имя файла либо `Документ.pdf` / `Документ.jpg`. |

## Ошибки

| Код | Когда |
|---|---|
| 400 | `fileId` не UUID — «Некорректный идентификатор». |
| 400 | Документа нет, он удалён, не выпущен или принадлежит другой организации — «Документ не найден». Именно 400, а не 404. |
| 401 | Нет токена или сессии. |

## Пример

```bash
curl "https://vruchay.ru/api/registry/files/$FILE_ID/download" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -o certificate.pdf
```

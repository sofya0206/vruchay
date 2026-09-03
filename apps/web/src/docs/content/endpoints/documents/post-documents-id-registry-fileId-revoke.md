---
method: POST
path: /api/documents/{id}/registry/{fileId}/revoke
title: Отозвать или вернуть проверку экземпляра
group: documents
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/documents/{id}/registry/{fileId}/revoke

Отзывает проверку подлинности конкретного выданного файла (`revoked: true`) или
возвращает её (`revoked: false`). Сам файл остаётся — он мог быть уже скачан
и распечатан; меняется ответ страницы проверки: предъявленный документ перестаёт
подтверждаться. Нужно, когда документ выдан по ошибке. Файл должен быть выпущенным
(`kind: generated`) экземпляром именно этого документа. Действие пишется в журнал
(`verify.revoke` / `verify.restore`).

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |
| `fileId` | UUID | да | выданный файл (`items[].fileId` из реестра) |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `revoked` | boolean | да | `true` — отозвать, `false` — вернуть |

```json
{ "revoked": true }
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `ok` | `true` | |
| `revoked` | boolean | новое состояние |
| `name` | string | ФИО получателя из строки (пусто, если нет) |
| `publicId` | UUID | публичный идентификатор экземпляра |
| `code` | string | проверочный код; у старых экземпляров — `publicId` |

```json
{
  "ok": true,
  "revoked": true,
  "name": "Иванов Пётр Ильич",
  "publicId": "f6a7b8c9-d0e1-4f2a-9b3c-4d5e6f7a8b9c",
  "code": "K7M2-9QXR-4TVB"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — параметр не UUID; `revoked` не boolean |
| 401 | нет токена или сессии |
| 403 | «Недостаточно прав для этого действия» — роль `member` |
| 404 | «Документ не найден» — файл не найден, не выпущенный, не этого документа, чужой или удалён |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/registry/$FILE_ID/revoke" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"revoked":true}'
```

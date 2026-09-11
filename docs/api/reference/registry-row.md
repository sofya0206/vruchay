# Строка реестра выданного

Форма одной строки, которую возвращают `GET /api/registry` (в `items[]`) и
`GET /api/registry/files/{fileId}` (в `row`). Собирается в
`apps/server/src/registry/registry.service.ts` (`RegistryRow`).

Все даты — строки ISO 8601 в UTC.

| Поле | Тип | Описание |
|---|---|---|
| `fileId` | string (UUID) | Идентификатор выданного файла. Им же адресуются скачивание, карточка, отзыв, перевыпуск и переотправка. |
| `publicId` | string (UUID) | Прежний публичный идентификатор; напечатан в QR у документов, выпущенных до появления короткого кода. |
| `code` | string | Код, напечатанный на бумаге: короткий вида `K7M2-9QXR-4TVB` у новых выпусков, `publicId` у старых. |
| `verifyPath` | string | Путь страницы проверки — тот же, что закодирован в QR: `/c/<код>` или `/verify/<uuid>`. |
| `name` | string | Имя получателя из строки таблицы (`data.name`); пустая строка, если нет. |
| `email` | string | Адрес почты из строки таблицы (`data.email`); пустая строка, если нет. |
| `documentId` | string (UUID) \| null | Материал, по макету которого выпущен документ. Null, если материал удалён окончательно. |
| `documentTitle` | string | Название материала; «Материал удалён», если его больше нет. |
| `eventName` | string | Мероприятие из карточки материала. |
| `eventDate` | string | Дата мероприятия из карточки материала — строкой, как её ввели. |
| `issuedAt` | string (дата) | Когда документ выпущен. |
| `expiresAt` | string (дата) \| null | Когда документ перестаёт действовать. Null — бессрочный. |
| `printedName` | string \| null | Имя, напечатанное на документе, если оно отличается от текущей строки таблицы (строку могли поправить после выпуска). Null — совпадает или снимка нет. |
| `revokedAt` | string (дата) \| null | Когда проверку отозвали. Остаётся и после возврата проверки. |
| `revokedReasonPublic` | string \| null | Причина отзыва, которую видит человек на странице проверки. |
| `revokedReasonInternal` | string \| null | Внутренняя причина. Только владельцу и управляющему; сотруднику с ролью `member` всегда null. |
| `signedAt` | string (дата) \| null | Когда PDF подписан электронной подписью сервиса. Null — без подписи. |
| `state` | `valid` \| `revoked` \| `replaced` \| `expired` | Состояние документа. Выводится из фактов, а не хранится: отзыв сильнее замены, замена сильнее срока. |
| `reissuePending` | boolean | Перевыпуск заказан, но новый документ ещё не выпущен. |
| `replacedBy` | object \| null | Документ, выданный вместо этого: `{ fileId, publicId, code, verifyPath, issuedAt }`. |
| `mail` | object \| null | Последнее письмо с этим документом: `{ status, sentAt, error }`. Null — письмо не отправлялось. `status`: `queued`, `sent`, `delivered`, `opened`, `bounced`, `failed`. |
| `verifyCount` | number | Сколько раз документ проверяли по QR/коду. Обезличенный счётчик. |
| `verifyLastAt` | string (дата) \| null | Когда проверяли в последний раз. |
| `downloadCount` | number | Сколько раз документ скачивали из реестра (по одному или в архиве). |
| `retention` | object \| null | Срок хранения, если материал в корзине: `{ trashedAt, purgeAt, daysLeft }`. Через 7 дней после `trashedAt` файлы и записи удаляются. Null — материал не в корзине. |

## Состояния

- `valid` — документ действителен;
- `revoked` — организация отозвала проверку; замены нет;
- `replaced` — выдан новый документ вместо этого (`replacedBy`);
- `expired` — `expiresAt` наступил; документ был настоящим, но подтверждает прошлое.

Документ действителен до самого момента `expiresAt` и перестаёт быть действительным с него.

## Пример

```json
{
  "fileId": "7d4c6e0a-1b2f-4c3d-9e8f-0a1b2c3d4e5f",
  "publicId": "3f9a2b1c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
  "code": "K7M2-9QXR-4TVB",
  "verifyPath": "/c/K7M2-9QXR-4TVB",
  "name": "Иванова Мария Петровна",
  "email": "ivanova@example.com",
  "documentId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
  "documentTitle": "Сертификат участника",
  "eventName": "Городской конкурс «Мастер года»",
  "eventDate": "14.06.2026",
  "issuedAt": "2026-06-15T09:12:44.000Z",
  "expiresAt": null,
  "printedName": null,
  "revokedAt": null,
  "revokedReasonPublic": null,
  "revokedReasonInternal": null,
  "signedAt": "2026-06-15T09:12:45.000Z",
  "state": "valid",
  "reissuePending": false,
  "replacedBy": null,
  "mail": { "status": "delivered", "sentAt": "2026-06-15T09:13:10.000Z", "error": null },
  "verifyCount": 3,
  "verifyLastAt": "2026-08-02T17:40:01.000Z",
  "downloadCount": 1,
  "retention": null
}
```

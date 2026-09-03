---
method: POST
path: /api/org/public-profile/logo
title: Загрузить логотип
group: org
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/org/public-profile/logo

Загружает логотип для публичной страницы организации. Принимаются только PNG и JPEG — тип определяется по первым байтам файла, а не по заголовку или расширению. Предел размера — 2 МБ.

Прежний логотип удаляется из хранилища после того, как новый записан и привязан к организации. Ответ — полный публичный профиль (как у `GET /api/org/public-profile`) со свежей ссылкой `logoUrl`; ссылка временная, действует 15 минут.

## Запрос

`multipart/form-data`, один файл в поле `file`. Имя файла сохраняется как исходное название (обрезается до 255 знаков).

## Ответ

`201 Created` — профиль целиком, поля те же, что у `GET /api/org/public-profile`.

```json
{
  "name": "Федерация гимнастики Самарской области",
  "slug": "fgso",
  "description": "",
  "inn": "",
  "website": "",
  "contactEmail": "",
  "contactPhone": "",
  "logoFileId": "8a5f0e1c-2b3d-4e5f-9a6b-7c8d9e0f1a2b",
  "logoUrl": "https://storage.example.com/…?X-Amz-Signature=…",
  "verifiedIssuer": false,
  "verifiedAt": null,
  "publicPageEnabled": true,
  "publicSearchByName": false,
  "publicIndexable": false,
  "verifyNameMode": "full"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | В запросе нет файла: «Файл не передан». |
| 400 | Файл больше 2 МБ: «Файл слишком большой, максимум 2 МБ». |
| 400 | Не PNG и не JPEG по сигнатуре: «Поддерживаются только изображения PNG и JPEG». |
| 401 | Нет действующего токена и нет cookie-сессии. `{"statusCode":401,"message":"Требуется вход в систему","error":"Unauthorized"}` |
| 403 | Роль `member`: «Недостаточно прав для этого действия». |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/org/public-profile/logo" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -F "file=@logo.png"
```

---
method: GET
path: /api/org/public-profile
title: Публичный профиль организации
group: org
auth: token
roles: any
rate_limit: none
---

# GET /api/org/public-profile

Что организация показывает о себе снаружи: на публичной странице `/org/<slug>` и на странице проверки документа. Читать могут все сотрудники — им надо знать, что видят проверяющие; менять — только владелец и управляющий (`PATCH /api/org/public-profile`).

Все настройки видимости выключены по умолчанию: организация сама решает, показываться ли ей наружу. Значок верифицированного эмитента (`verifiedIssuer`) проставляет владелец сервиса после проверки домена и ИНН; через API организация его изменить не может.

## Запрос

Параметров нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| name | string | Название организации. |
| slug | string \| null | Адрес публичной страницы: `/org/<slug>`. `null` — адрес не задан. |
| description | string | Описание для публичной страницы (пустая строка — нет). |
| inn | string | ИНН: 10 или 12 цифр; пустая строка — не указан. |
| website | string | Сайт организации; пустая строка — не указан. |
| contactEmail | string | Почта для связи проверяющего («сообщить о проблеме»); пустая — нет. |
| contactPhone | string | Телефон для связи; пустая — нет. |
| logoFileId | string (UUID) \| null | Идентификатор файла логотипа. |
| logoUrl | string \| null | Временная ссылка на логотип (действует 15 минут). `null` — логотипа нет. |
| verifiedIssuer | boolean | Значок «Верифицированный эмитент». |
| verifiedAt | string (ISO 8601) \| null | Когда значок был выдан. |
| publicPageEnabled | boolean | Показывать ли публичную страницу организации. |
| publicSearchByName | boolean | Разрешён ли поиск документов по ФИО в публичном реестре. |
| publicIndexable | boolean | Пускать ли поисковики на страницу организации и страницы проверки. `false` — везде `noindex`. |
| verifyNameMode | string | Как показывать получателя на странице проверки: `full` — как в материале, `initials` — фамилия и инициалы, `none` — только факт подлинности и название организации. |

```json
{
  "name": "Федерация гимнастики Самарской области",
  "slug": "fgso",
  "description": "Региональная федерация. Соревнования и аттестации с 2004 года.",
  "inn": "6316123456",
  "website": "https://fgso.example.org",
  "contactEmail": "info@fgso.example.org",
  "contactPhone": "+7 846 000-00-00",
  "logoFileId": "8a5f0e1c-2b3d-4e5f-9a6b-7c8d9e0f1a2b",
  "logoUrl": "https://storage.example.com/…?X-Amz-Signature=…",
  "verifiedIssuer": false,
  "verifiedAt": null,
  "publicPageEnabled": true,
  "publicSearchByName": false,
  "publicIndexable": false,
  "verifyNameMode": "initials"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет действующего токена и нет cookie-сессии. `{"statusCode":401,"message":"Требуется вход в систему","error":"Unauthorized"}` |

## Пример

```bash
curl "https://vruchay.ru/api/org/public-profile" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

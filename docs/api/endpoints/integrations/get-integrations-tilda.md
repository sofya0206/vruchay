---
method: GET
path: /api/integrations/tilda
title: Интеграции с формами на сайте
group: integrations
auth: token
roles: any
rate_limit: none
---

# GET /api/integrations/tilda

Все интеграции организации, новые первыми, вместе со счётчиком принятых заявок. Интеграция — это настройка формы на чужом сайте (Тильда, WordPress, любая страница), через которую посторонний человек запрашивает свой документ: белый список доменов страниц, белый список материалов, способ подтверждения адреса и суточный предел.

`token` в ответе — публичный: из него собираются адреса стилей и скрипта для вставки на страницу (`/api/v1/tilda-css/{token}` и `/api/v1/tilda-js/{token}`), поэтому он и виден в HTML страницы клиента. Секретом он не является, а защиту держат список разрешённых доменов, подтверждение адреса кодом и лимиты. Сами публичные маршруты формы описаны отдельно.

Пагинации и фильтров нет.

## Запрос

Параметров нет.

## Ответ

`200 OK` — массив интеграций.

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор интеграции |
| orgId | string (UUID) | Организация |
| name | string | Название для кабинета |
| token | string (UUID) | Публичный токен интеграции; попадает в адрес скрипта на странице |
| allowedDomains | string[] | Домены страниц, с которых принимаются заявки; поддомены считаются своими |
| documentIds | string[] (UUID) | Материалы, которые разрешено запрашивать через эту форму |
| authMode | `none` \| `email_code` | Подтверждать ли адрес кодом из письма |
| singleFilePerEmail | boolean | Один документ в руки: повторная заявка отдаёт выданное |
| dailyLimit | number | Предел заявок по интеграции за сутки |
| successMessage | string | Текст окна успеха |
| showDownload | boolean | Показывать ли кнопку скачивания в окне |
| sendEmail | boolean | Слать ли документ письмом |
| copyToEmail | string \| null | Адрес для копии заявки; `null` — копию не слать |
| active | boolean | Выключенная интеграция заявки не принимает |
| prefillFromAccount | boolean | Подставлять имя и почту из личного кабинета площадки |
| allowEdit | boolean | Можно ли править подставленные данные |
| showShare | boolean | Кнопки «поделиться» в окне успеха |
| showVerifyLink | boolean | Ссылка на проверку подлинности в окне успеха |
| createdAt | string (ISO 8601) | Дата создания |
| _count.requests | number | Сколько заявок принято за всё время |

```json
[
  {
    "id": "3f9a1b2c-4d5e-4f60-8a71-2b3c4d5e6f70",
    "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
    "name": "Форма на странице соревнований",
    "token": "00000000-0000-4000-8000-0000000000ab",
    "allowedDomains": ["example.ru"],
    "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
    "authMode": "email_code",
    "singleFilePerEmail": true,
    "dailyLimit": 500,
    "successMessage": "Спасибо! Документ отправлен на вашу почту",
    "showDownload": true,
    "sendEmail": true,
    "copyToEmail": null,
    "active": true,
    "prefillFromAccount": true,
    "allowEdit": true,
    "showShare": true,
    "showVerifyLink": false,
    "createdAt": "2026-08-20T09:20:00.000Z",
    "_count": { "requests": 143 }
  }
]
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/integrations/tilda" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

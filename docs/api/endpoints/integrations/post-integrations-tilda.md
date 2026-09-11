---
method: POST
path: /api/integrations/tilda
title: Создать интеграцию с формой
group: integrations
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/integrations/tilda

Заводит интеграцию: форма на указанных доменах сможет запрашивать документы из указанного списка материалов. Интеграция открывает выдачу документов посторонним людям, поэтому создавать её вправе только владелец и администратор.

Токен интеграции сервис выдаёт сам — задать его нельзя. Из токена собираются адреса для вставки на страницу: стили `/api/v1/tilda-css/{token}` и скрипт `/api/v1/tilda-js/{token}`.

Домены нормализуются при сохранении: убираются `http://`, `https://`, `www.`, путь после первой косой черты, регистр приводится к нижнему, повторы отбрасываются. Поддомены разрешённого домена считаются своими, то есть `example.ru` открывает и `edu.example.ru`. Материалы проверяются на принадлежность организации: чужой идентификатор в белый список не запишется.

Поля `prefillFromAccount`, `allowEdit`, `showShare` и `showVerifyLink` этой схемой не задаются — новая интеграция получает их значения по умолчанию (`true`, `true`, `true`, `false`).

## Запрос

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| name | string | да | Название для кабинета, 1–100 символов после обрезки пробелов |
| allowedDomains | string[] | да | Домены страниц с формой, 1–20 штук, каждый 3–253 символа |
| documentIds | string[] (UUID) | да | Материалы организации, 1–50 штук |
| authMode | `none` \| `email_code` | нет | Подтверждение адреса кодом из письма; по умолчанию `email_code` |
| singleFilePerEmail | boolean | нет | Один документ в руки; по умолчанию `true` |
| dailyLimit | number | нет | Предел заявок за сутки, 1–10 000; по умолчанию 500. Числовая строка принимается |
| successMessage | string | нет | Текст окна успеха, до 300 символов; по умолчанию «Спасибо! Документ отправлен на вашу почту» |
| showDownload | boolean | нет | Кнопка скачивания в окне; по умолчанию `true` |
| sendEmail | boolean | нет | Слать ли документ письмом; по умолчанию `true` |
| copyToEmail | string | нет | Адрес для копии, до 254 символов; пустая строка означает «копию не слать» и сохраняется как `null` |
| active | boolean | нет | Принимать ли заявки; по умолчанию `true` |

```json
{
  "name": "Форма на странице мероприятия",
  "allowedDomains": ["https://www.example.ru/events"],
  "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
  "authMode": "email_code",
  "singleFilePerEmail": true,
  "dailyLimit": 500,
  "successMessage": "Спасибо! Грамота отправлена на вашу почту",
  "showDownload": true,
  "sendEmail": true,
  "copyToEmail": "",
  "active": true
}
```

## Ответ

`201 Created` — созданная интеграция; поля перечислены в `GET /api/integrations/tilda` (кроме `_count`). В примере видно, во что превратился домен из запроса.

```json
{
  "id": "3f9a1b2c-4d5e-4f60-8a71-2b3c4d5e6f70",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "name": "Форма на странице мероприятия",
  "token": "00000000-0000-4000-8000-0000000000ab",
  "allowedDomains": ["example.ru"],
  "documentIds": ["9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b"],
  "authMode": "email_code",
  "singleFilePerEmail": true,
  "dailyLimit": 500,
  "successMessage": "Спасибо! Грамота отправлена на вашу почту",
  "showDownload": true,
  "sendEmail": true,
  "copyToEmail": null,
  "active": true,
  "prefillFromAccount": true,
  "allowEdit": true,
  "showShare": true,
  "showVerifyLink": false,
  "createdAt": "2026-08-20T09:20:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `name` пуст: «Введите название»; длиннее 100: «Too big: expected string to have <=100 characters» |
| 400 | `allowedDomains` пуст: «Укажите хотя бы один домен, иначе форма не будет работать»; больше 20; элемент короче 3 символов: «Too small: expected string to have >=3 characters» |
| 400 | После нормализации доменов не осталось ничего: «Укажите домен страницы, на которой стоит форма» |
| 400 | `documentIds` пуст: «Выберите хотя бы один документ»; больше 50; элемент не UUID: «Invalid UUID» |
| 400 | `dailyLimit` вне 1–10 000: «Too small: expected number to be >=1» / «Too big: expected number to be <=10000» |
| 400 | `copyToEmail` не адрес и не пустая строка: «Invalid email address» |
| 400 | `authMode` не из списка: «Invalid option: expected one of "none"\|"email_code"» |
| 401 | Нет токена или сессии |
| 403 | Роль `member`: «Недостаточно прав для этого действия» |
| 404 | В `documentIds` попал чужой, удалённый или несуществующий материал: «Документ не найден» |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/integrations/tilda" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Форма на странице мероприятия","allowedDomains":["example.ru"],"documentIds":["'"$DOCUMENT_ID"'"]}'
```

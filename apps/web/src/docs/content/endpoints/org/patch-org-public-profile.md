---
method: PATCH
path: /api/org/public-profile
title: Изменить публичный профиль
group: org
auth: token
roles: owner, admin
rate_limit: none
---

# PATCH /api/org/public-profile

Правит публичное лицо организации. Все поля необязательны, передаются только меняемые, но хотя бы одно быть должно. Ответ — полный профиль в той же форме, что у `GET /api/org/public-profile`.

Два ограничения по существу:

- `slug` должен быть уникален среди всех организаций и не совпадать со служебными адресами сервиса (`api`, `org`, `verify`, `c`, `login`, `register`, `settings`, `admin`, `vruchay`, `support`, `help`, `about`, `privacy`, `search`). Значение приводится к нижнему регистру. `null` снимает адрес.
- `publicSearchByName: true` принимается только вместе с `consentConfirmed: true` — подтверждением, что согласия участников на распространение персональных данных собраны (ст. 10.1 152-ФЗ). Само поле `consentConfirmed` не хранится.

Значок `verifiedIssuer` этим запросом не меняется.

## Запрос

Тело (`application/json`), все поля необязательны:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| slug | string \| null | нет | Адрес публичной страницы: латиница, цифры и дефис, 3–50 знаков, не начинается и не заканчивается дефисом. `null` — убрать адрес. |
| description | string | нет | До 2000 знаков. |
| inn | string | нет | 10 или 12 цифр, либо пустая строка. |
| website | string | нет | Ссылка, начинающаяся с `http://` или `https://`, до 300 знаков, либо пустая строка. |
| contactEmail | string | нет | Адрес почты (приводится к нижнему регистру), до 254 знаков, либо пустая строка. |
| contactPhone | string | нет | До 40 знаков, формат не проверяется. |
| publicPageEnabled | boolean | нет | Показывать публичную страницу. |
| publicSearchByName | boolean | нет | Разрешить поиск по ФИО. `true` — только вместе с `consentConfirmed: true`. |
| consentConfirmed | boolean | нет | Подтверждение сбора согласий. Не сохраняется. |
| publicIndexable | boolean | нет | Разрешить индексацию поисковиками. |
| verifyNameMode | string | нет | `full`, `initials` или `none`. |

```json
{
  "slug": "fgso",
  "publicPageEnabled": true,
  "verifyNameMode": "initials",
  "contactEmail": "info@fgso.example.org"
}
```

## Ответ

`200 OK` — профиль целиком, поля те же, что у `GET /api/org/public-profile`.

```json
{
  "name": "Учебный центр «Развитие»",
  "slug": "fgso",
  "description": "",
  "inn": "",
  "website": "",
  "contactEmail": "info@fgso.example.org",
  "contactPhone": "",
  "logoFileId": null,
  "logoUrl": null,
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
| 400 | Пустое тело `{}`: «Нечего обновлять» (поле `""` в `errors`). |
| 400 | `publicSearchByName: true` без `consentConfirmed: true`: «Поиск по ФИО включается только с подтверждением, что согласия участников собраны» (поле `""`). |
| 400 | `slug` не по форме: «Адрес: латиница, цифры и дефис, от 3 до 50 знаков». |
| 400 | `slug` из служебного списка: «Этот адрес занят сервисом». |
| 400 | `slug` уже занят другой организацией: «Этот адрес уже занят другой организацией» (проверяет база при записи). |
| 400 | `website` не ссылка: «Ссылка должна начинаться с http:// или https://». |
| 400 | `contactEmail` не адрес: «Некорректный адрес почты». |
| 400 | `inn` не 10/12 цифр: «ИНН — десять или двенадцать цифр». |
| 400 | Превышена длина `description`/`website`/`contactEmail`/`contactPhone`, неверный тип, `verifyNameMode` не из списка — стандартное сообщение Zod. |
| 401 | Нет действующего токена и нет cookie-сессии. `{"statusCode":401,"message":"Требуется вход в систему","error":"Unauthorized"}` |
| 403 | Роль `member`: «Недостаточно прав для этого действия». |
| 413 | Тело больше 1 МБ. |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/org/public-profile" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"slug":"fgso","publicPageEnabled":true,"verifyNameMode":"initials"}'
```

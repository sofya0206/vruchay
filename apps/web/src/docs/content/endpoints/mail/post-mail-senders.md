---
method: POST
path: /api/mail/senders
title: Добавить отправителя на подтверждённом домене
group: mail
auth: token
roles: owner, admin
rate_limit: none
---

# POST /api/mail/senders

Создаёт отправителя — адрес и отображаемое имя, от которых уходят письма. Отправитель привязан к домену организации, и домен обязан быть уже подтверждён (`status: verified`), а адрес — заканчиваться на `@<домен>`. Так письма от чужого имени не уходят с нашей инфраструктуры.

Адрес приводится к нижнему регистру. Поле `isDefault` через API не выставляется — отправителем по умолчанию считается самый ранний созданный на подтверждённом домене. Отправителя нельзя удалить отдельно — только вместе с доменом (`DELETE /api/mail/domains/{id}`).

## Запрос

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| domainId | string (UUID) | да | Подтверждённый домен организации |
| email | string | да | Адрес на этом домене, до 254 символов |
| displayName | string | да | Имя отправителя, 1–100 символов |

```json
{
  "domainId": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
  "email": "awards@example.ru",
  "displayName": "Центр «Развитие»"
}
```

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор отправителя — его указывают в `senderId` шаблонов писем |
| orgId | string (UUID) | Организация |
| domainId | string (UUID) | Домен |
| email | string | Адрес в нижнем регистре |
| displayName | string | Имя отправителя |
| isDefault | boolean | Всегда `false` |
| createdAt | string (ISO 8601) | Дата создания |

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
  "domainId": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
  "email": "awards@example.ru",
  "displayName": "Центр «Развитие»",
  "isDefault": false,
  "createdAt": "2026-08-20T09:20:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `domainId` не UUID: «Invalid UUID» |
| 400 | `email` не похож на адрес: «Некорректный адрес»; длиннее 254: «Too big: expected string to have <=254 characters» |
| 400 | `displayName` пустой: «Укажите имя отправителя»; длиннее 100: «Too big: expected string to have <=100 characters» |
| 400 | Домен не в состоянии `verified`: «Домен ещё не подтверждён. Пропишите DNS-записи и нажмите «Проверить»» |
| 400 | Адрес не на этом домене: «Адрес должен быть на домене example.ru» |
| 401 | Нет токена или сессии |
| 403 | Роль `member`: «Недостаточно прав для этого действия» |
| 404 | Домена нет или он чужой: «Домен не найден» |
| 500 | Такой адрес уже заведён в организации — уникальность `(orgId, email)` в коде не перехватывается |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/mail/senders" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domainId":"'"$DOMAIN_ID"'","email":"awards@example.ru","displayName":"Центр «Развитие»"}'
```

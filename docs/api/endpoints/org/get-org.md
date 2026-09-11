---
method: GET
path: /api/org
title: Организация и свой профиль
group: org
auth: token
roles: any
rate_limit: none
---

# GET /api/org

Название организации, её тариф и данные текущего сотрудника. Тариф здесь — только имя плана (`free` или `paid`); сколько документов осталось на бесплатной пробе, отвечает `GET /api/org/usage`.

При входе по токену API `userName` и `email` — это данные сотрудника, который выдал токен. Если его уже удалили из организации, оба поля пустые.

## Запрос

Параметров нет.

## Ответ

`200 OK`

| Поле | Тип | Описание |
|---|---|---|
| orgName | string | Название организации. |
| plan | string | Тариф: `free` (бесплатная проба) или `paid` (оплаченный доступ). |
| userName | string | Имя сотрудника. |
| email | string | Почта сотрудника. |

```json
{
  "orgName": "Учебный центр «Развитие»",
  "plan": "free",
  "userName": "Мария Иванова",
  "email": "maria@example.org"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет действующего токена и нет cookie-сессии. `{"statusCode":401,"message":"Требуется вход в систему","error":"Unauthorized"}` |

## Пример

```bash
curl "https://vruchay.ru/api/org" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

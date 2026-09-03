---
method: GET
path: /api/mail/domains
title: Список почтовых доменов организации
group: mail
auth: token
roles: any
rate_limit: none
---

# GET /api/mail/domains

Возвращает все домены, которые организация заявила для отправки писем от своего имени, вместе с отправителями на каждом из них. Порядок — по дате добавления.

Группа `mail` — это настройка почты (домены, отправители) и простая транзакционная отправка со страницы материала. Массовая рассылка с двумя потоками писем, ручными списками адресов и журналом доставки живёт в группе `mailing`; оба раздела ставят письма в одну и ту же очередь.

Пока у организации нет ни одного подтверждённого домена, письма уходят с общего адреса сервиса (`noreply@vruchay.ru`, имя отправителя — название организации, обратный адрес — почта владельца). У общего адреса есть суточный и разовый лимит писем; со своего домена лимита нет.

## Запрос

Параметров нет.

## Ответ

`200 OK` — массив доменов.

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор домена |
| orgId | string (UUID) | Организация |
| domain | string | Имя домена в нижнем регистре |
| provider | string | Почтовый провайдер, сейчас всегда `smtp` |
| status | `pending` \| `verified` \| `failed` | Результат последней проверки DNS; новый домен — `pending` |
| dnsRecords | array | Записи, которые нужно прописать в DNS: `{type, host, value, purpose}` |
| providerRef | string \| null | Идентификатор у провайдера; для `smtp` всегда `null` |
| verificationToken | string (UUID) | Секрет подтверждения владения; он же входит в значение записи `_vruchay-verify` |
| verifiedAt | string (ISO 8601) \| null | Когда домен впервые подтверждён |
| lastCheckedAt | string (ISO 8601) \| null | Когда последний раз нажимали «Проверить» |
| createdAt | string (ISO 8601) | Дата добавления |
| senders | array | Отправители на этом домене (поля — как в ответе `POST /api/mail/senders`) |

```json
[
  {
    "id": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
    "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
    "domain": "example.ru",
    "provider": "smtp",
    "status": "verified",
    "dnsRecords": [
      { "type": "TXT", "host": "_vruchay-verify", "value": "vruchay-verify=00000000-0000-4000-8000-0000000000cd", "purpose": "Подтверждение владения доменом. Уникальна для вашей организации" },
      { "type": "TXT", "host": "@", "value": "v=spf1 include:vruchay.ru ~all", "purpose": "SPF: разрешает нашему серверу отправлять письма от вашего домена" },
      { "type": "TXT", "host": "_dmarc", "value": "v=DMARC1; p=none; rua=mailto:postmaster@example.ru", "purpose": "DMARC: политика для писем, не прошедших проверку. Начинаем с p=none" }
    ],
    "providerRef": null,
    "verificationToken": "00000000-0000-4000-8000-0000000000cd",
    "verifiedAt": "2026-08-20T09:15:00.000Z",
    "lastCheckedAt": "2026-08-20T09:15:00.000Z",
    "createdAt": "2026-08-19T14:02:11.000Z",
    "senders": [
      {
        "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "orgId": "7b2a4c6e-1d3f-4e5a-9b8c-0d1e2f3a4b5c",
        "domainId": "0f6d1e3a-9c1b-4a4e-8b6a-2f1a5c7d9e01",
        "email": "awards@example.ru",
        "displayName": "Федерация плавания",
        "isDefault": false,
        "createdAt": "2026-08-20T09:20:00.000Z"
      }
    ]
  }
]
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет токена или сессии |

## Пример

```bash
curl "https://vruchay.ru/api/mail/domains" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

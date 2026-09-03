---
method: GET
path: /api/reviews/mine
title: Отзыв своей организации
group: reviews
auth: token
roles: any
rate_limit: none
---

# GET /api/reviews/mine

Отзыв, который оставила ваша организация: текст, состояние проверки и замечание
модератора, если отзыв отклонили. Отзыв один на организацию — он говорит от её
лица, а не от лица сотрудника, — поэтому и ответ здесь один объект, а не список.

Читать и править отзыв может любой сотрудник, роль не проверяется.

## Запрос

Параметров нет.

## Ответ

`200 OK`. Отзыва ещё нет — в теле `null`.

| Поле | Тип | Описание |
|---|---|---|
| id | string (UUID) | Идентификатор отзыва. Нужен для `DELETE /api/reviews/{id}`. |
| authorName | string | Как подписан автор. |
| authorRole | string | Должность автора. |
| orgName | string | Организация, от лица которой написан отзыв. |
| text | string | Текст отзыва. |
| rating | number \| null | Оценка 1…5. `null` — не поставлена. |
| status | string | `pending` — на проверке; `published` — опубликован на сайте; `rejected` — отклонён. |
| moderatorNote | string \| null | Что не так с отзывом. Заполняется при отклонении, чтобы автор знал, что править. |
| createdAt | string (ISO 8601) | Когда отзыв создан. |
| publishedAt | string (ISO 8601) \| null | Когда опубликован. `null` — пока нет. |

```json
{
  "id": "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f",
  "authorName": "Мария Петрова",
  "authorRole": "Главный секретарь соревнований",
  "orgName": "Федерация гимнастики Самарской области",
  "text": "Раньше на двести грамот уходило два дня. Теперь загружаем таблицу и через полчаса рассылка уже ушла.",
  "rating": 5,
  "status": "published",
  "moderatorNote": null,
  "createdAt": "2026-05-18T12:40:11.000Z",
  "publishedAt": "2026-05-20T10:03:00.000Z"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 401 | Нет действующего токена и нет cookie-сессии. |

## Пример

```bash
curl "https://vruchay.ru/api/reviews/mine" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN"
```

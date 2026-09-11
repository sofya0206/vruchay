---
method: POST
path: /api/documents/{id}/awards/suggest
title: Заготовка правил по колонкам таблицы
group: awards
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/awards/suggest

Собирает черновик набора правил по колонкам уже загруженной таблицы получателей. Ничего не сохраняет: конструктор показывает предложенное, человек дописывает шаблоны и сохраняет сам через `POST /api/award-rules`. Молча заведённый в базе набор пришлось бы потом искать и удалять тому, кто просто посмотрел.

Как узнаются колонки (берётся первая существующая из списка, иначе `""`):

| Что ищем | Кандидаты по порядку |
|---|---|
| колонка группы (`groupColumn`) | `category`, `group`, `age_group` |
| колонка статуса (`statusColumn`) | `status`, `result_status` |
| колонка места (в условиях правил) | `place`, `rank` |

Какие правила предлагаются: «Снятые и не стартовавшие» (`action: skip`, условие `statusIn` со всеми статусами без награды) — только если нашлась колонка статуса; «Победители» (`placeEquals` 1) и «Призёры» (`placeBetween` 2–3) — только если нашлась колонка места; «Все остальные участники» без условий последним правилом. Порядок здесь не косметика: выигрывает первое совпавшее, и стой правило про места выше правила про снятых, дисквалифицированный получил бы грамоту участника.

Шаблоны в заготовке не проставлены (`outputs: []`) — какие бланки у организации, сервер не знает. Правила без шаблона конструктор помечает как незаконченные, и `POST …/awards/preview` на таком наборе сообщит, что шаблон не выбран.

Различие с превью: `suggest` предлагает правила по колонкам и не смотрит на строки, `preview` применяет уже готовые правила к строкам и показывает результат.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID (путь) | да | Идентификатор документа-мероприятия |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `name` | string | нет | Название будущего набора, 1–200 символов после обрезки пробелов. Без него — `Награждение по протоколу` |

Пустое тело `{}` — законный запрос.

```json
{ "name": "Конкурс «Мастер года», весна" }
```

## Ответ

`201 Created` — черновик в контракте `AwardRuleSet` (см. [reference/award-rules.md](../../reference/award-rules.md)). В базе его нет: `id` набора и `id` правил выданы на лету и станут постоянными, только если прислать этот набор в `POST /api/award-rules`.

```json
{
  "id": "b3f1c8a2-aaaa-4d10-9e45-1a2b3c4d5e6f",
  "name": "Конкурс «Мастер года», весна",
  "schemaVersion": 1,
  "groupColumn": "category",
  "statusColumn": "status",
  "rules": [
    {
      "id": "c4a2d9b3-bbbb-4e21-8f56-2b3c4d5e6f70",
      "position": 0,
      "enabled": true,
      "label": "Снятые и не стартовавшие",
      "match": "any",
      "conditions": [{ "field": "status", "op": "statusIn", "value": ["dsq", "dns", "dnf", "dnq", "withdrawn"] }],
      "action": "skip",
      "outputs": []
    },
    {
      "id": "d5b3eac4-cccc-4f32-9a67-3c4d5e6f7081",
      "position": 1,
      "enabled": true,
      "label": "Победители",
      "match": "all",
      "conditions": [{ "field": "place", "op": "placeEquals", "value": 1, "withinGroup": false }],
      "action": "issue",
      "outputs": []
    },
    {
      "id": "e6c4fbd5-dddd-4043-8b78-4d5e6f708192",
      "position": 2,
      "enabled": true,
      "label": "Призёры",
      "match": "all",
      "conditions": [{ "field": "place", "op": "placeBetween", "value": { "from": 2, "to": 3 }, "withinGroup": false }],
      "action": "issue",
      "outputs": []
    },
    {
      "id": "f7d50ce6-eeee-4154-9c89-5e6f70819203",
      "position": 3,
      "enabled": true,
      "label": "Все остальные участники",
      "match": "all",
      "conditions": [],
      "action": "issue",
      "outputs": []
    }
  ]
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Некорректный идентификатор` — `id` не UUID |
| 400 | `name` пустой или длиннее 200 символов (сообщение Zod) |
| 401 | Нет токена или сессии |
| 404 | `Документ не найден` |
| 413 | Тело больше 1 МБ |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/awards/suggest" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Конкурс «Мастер года», весна"}'
```

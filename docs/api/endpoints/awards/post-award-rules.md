---
method: POST
path: /api/award-rules
title: Создать набор правил награждения
group: awards
auth: token
roles: any
rate_limit: none
---

# POST /api/award-rules

Заводит набор правил награждения у организации. Набор — это упорядоченный список правил «при каком условии какой документ выдать»: выигрывает первое совпавшее правило сверху вниз, поэтому «снятых не награждаем» обязано стоять выше, чем «всем участникам». Правила приходят списком целиком, а приоритет берётся из порядка в массиве — отдельного поля с номером в запросе нет, сервер проставляет `position` сам.

Заготовку набора под конкретную таблицу удобно получить через `POST /api/documents/{id}/awards/suggest` и прислать сюда, дополнив шаблонами.

Все шаблоны из `outputs[].templateDocumentId` проверяются на принадлежность организации до записи: чужой или удалённый документ — 400 на весь запрос. При `isDefault: true` признак «по умолчанию» снимается со всех остальных наборов организации, всё в одной транзакции.

## Запрос

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `name` | string | да | 1–200 символов после обрезки пробелов |
| `groupColumn` | string | нет | имя колонки группировки или `""` (по умолчанию) |
| `statusColumn` | string | нет | имя колонки статуса или `""` (по умолчанию) |
| `isDefault` | boolean | нет | предлагать по умолчанию, по умолчанию `false` |
| `rules` | Rule[] | нет | до 50 правил, порядок в массиве — приоритет; по умолчанию `[]` |

Структура правила (`id`, `enabled`, `label`, `match`, `conditions`, `action`, `outputs`), список операций условий и поля выхода — в [reference/award-rules.md](../../reference/award-rules.md). Идентификатор правила задаёт клиент (конструктор заводит правило до сохранения); сервер пересоздаёт правила набора целиком, поэтому идентификатор живёт только внутри своего набора.

```json
{
  "name": "Награждение по протоколу",
  "groupColumn": "category",
  "statusColumn": "status",
  "isDefault": true,
  "rules": [
    {
      "id": "0b6a1d2e-1111-4a5b-8c9d-0e1f2a3b4c5d",
      "label": "Снятые и не стартовавшие",
      "match": "any",
      "conditions": [{ "field": "status", "op": "statusIn", "value": ["dsq", "dns", "dnf", "dnq", "withdrawn"] }],
      "action": "skip",
      "outputs": []
    },
    {
      "id": "1c7b2e3f-2222-4b6c-9d0e-1f2a3b4c5d6e",
      "label": "Победители",
      "conditions": [{ "field": "place", "op": "placeEquals", "value": 1 }],
      "action": "issue",
      "outputs": [{ "templateDocumentId": "3a9e0c4d-3333-4c7d-8e1f-2a3b4c5d6e7f", "label": "Диплом победителя" }]
    },
    {
      "id": "2d8c3f40-4444-4c8e-9f20-3b4c5d6e7f80",
      "label": "Все остальные участники",
      "conditions": [],
      "action": "issue",
      "outputs": [{ "templateDocumentId": "4b0f1d5e-5555-4d8e-9f21-4c5d6e7f8091" }]
    }
  ]
}
```

## Ответ

`201 Created` — созданный набор в контракте `AwardRuleSet` (`id`, `name`, `schemaVersion`, `groupColumn`, `statusColumn`, `rules[]` с проставленными значениями по умолчанию и `position` по порядку). Форма и пример — в [reference/award-rules.md](../../reference/award-rules.md). Признака `isDefault` в ответе нет, он виден в `GET /api/award-rules`.

## Ошибки

| Код | Когда |
|---|---|
| 400 | `Введите название набора` — пустое `name` |
| 400 | `Выберите колонку` / `Некорректное имя колонки` — `groupColumn`, `statusColumn` или `conditions[].field` не по шаблону `^[a-zA-Z][a-zA-Z0-9_]*$` |
| 400 | `Выберите шаблон` — `outputs[].templateDocumentId` не UUID |
| 400 | `Добавьте хотя бы одно значение` — пустой массив у условия `oneOf` |
| 400 | `Начало интервала больше конца` — у `placeBetween` `from > to` |
| 400 | `rules` длиннее 50; `conditions` длиннее 20; `outputs` длиннее 10; `name` длиннее 200; `label` длиннее 120; место вне 1…300; `op`, `match`, `action`, `dedupeScope` или код статуса не из списка (сообщения Zod) |
| 400 | `Выбранный шаблон недоступен: он удалён или лежит в корзине` — шаблон другой организации или в корзине |
| 401 | Нет токена или сессии |
| 413 | Тело больше 1 МБ |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/award-rules" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Награждение по протоколу","groupColumn":"category","statusColumn":"status","rules":[{"id":"1c7b2e3f-2222-4b6c-9d0e-1f2a3b4c5d6e","label":"Победители","conditions":[{"field":"place","op":"placeEquals","value":1}],"outputs":[{"templateDocumentId":"3a9e0c4d-3333-4c7d-8e1f-2a3b4c5d6e7f"}]}]}'
```

---
title: Набор правил награждения
group: reference
---

# Набор правил награждения

Контракт живёт в `packages/shared/src/awards/rules.ts` (схемы `awardRuleSet`, `awardRule`,
`awardCondition`, `awardOutput`) и `plan.ts` (форма раскладки `AwardPlan`). Его читают
конструктор в кабинете, движок раскладки на сервере и превью. Версия формата —
`schemaVersion: 1` (`AWARD_RULES_SCHEMA_VERSION`).

Набор принадлежит организации, а не документу: один набор применяется к каждому
следующему протоколу через привязку `POST /api/documents/{id}/awards/rule-set`.

## Набор правил на входе (`POST /api/award-rules`, `PATCH`, `preview.ruleSet`)

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `name` | string | да | 1–200 символов после обрезки пробелов. Ошибка: «Введите название набора» |
| `groupColumn` | string | нет | имя колонки таблицы получателей (`^[a-zA-Z][a-zA-Z0-9_]*$`, до 64) или `""` — весь протокол одна группа. По умолчанию `""`. Группа задаёт область дедупликации, подпись строки в отчёте и круг строк для `withinGroup` |
| `statusColumn` | string | нет | имя колонки со статусом (DSQ/DNS/«снят») или `""`. По умолчанию `""` |
| `isDefault` | boolean | нет | предлагать по умолчанию для нового мероприятия. По умолчанию `false`. Набор по умолчанию у организации один: при сохранении с `true` признак снимается с остальных |
| `rules` | Rule[] | нет | до 50 правил; **порядок в массиве — приоритет**, `position` сервер проставляет сам. По умолчанию `[]` |

### Правило (`Rule`)

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `id` | UUID | да | задаёт клиент; сервер пересоздаёт правила набора целиком, поэтому идентификатор живёт только внутри своего набора |
| `enabled` | boolean | нет | по умолчанию `true` |
| `label` | string | нет | до 120 символов, подпись в превью («Победители»). По умолчанию `""` |
| `match` | `all` \| `any` | нет | как соединять условия. По умолчанию `all` |
| `conditions` | Condition[] | да | до 20; **пустой список — правило «иначе», срабатывает всегда** |
| `action` | `issue` \| `skip` | нет | `issue` — выдать `outputs`; `skip` — ничего не выдавать и остановиться. По умолчанию `issue` |
| `outputs` | Output[] | нет | до 10. По умолчанию `[]` |

Выигрывает первое совпавшее правило сверху вниз.

### Условие (`Condition`) — различается по `op`

Во всех вариантах `field` — имя колонки (`^[a-zA-Z][a-zA-Z0-9_]*$`, 1–64; ошибки «Выберите колонку», «Некорректное имя колонки»). Сравнение строк — без учёта регистра, ё = е, лишние пробелы схлопываются.

| `op` | `value` | Дополнительно | Смысл |
|---|---|---|---|
| `equals` | string ≤ 200 | | значение равно |
| `notEquals` | string ≤ 200 | | значение не равно |
| `oneOf` | string[] 1…50, каждая ≤ 200 | | одно из. Ошибка: «Добавьте хотя бы одно значение» |
| `contains` | string 1…200 | | содержит подстроку |
| `filled` | — | | ячейка не пуста |
| `empty` | — | | ячейка пуста |
| `placeEquals` | integer 1…300 | `withinGroup: boolean` (по умолчанию `false`) | место равно числу; делёжка «2-3» равна и 2, и 3 |
| `placeBetween` | `{ from: 1…300, to: 1…300 }`, `from ≤ to` («Начало интервала больше конца») | `withinGroup: boolean` | место в интервале включительно |
| `statusIn` | массив 1…6 из `ok`, `dsq`, `dns`, `dnf`, `dnq`, `withdrawn` | | статус из словаря; написания из файла («дисквалифицирован», «DQ») приводятся к коду |

`withinGroup: true` — считать место внутри группы по порядку строк, а не брать из ячейки.
Нужно только для протоколов со сквозной нумерацией; в обычном протоколе места уже
расставлены по группам.

### Выход (`Output`)

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `templateDocumentId` | UUID | да | документ-шаблон **той же организации**, не в корзине. Ошибка: «Выберите шаблон»; чужой или удалённый — 400 «Выбранный шаблон недоступен: он удалён или лежит в корзине» |
| `subjectColumn` | string | нет | `""` (по умолчанию) — документ самому участнику; иначе имя колонки, откуда брать получателя (`coach`, `team`). По значению этой колонки идёт дедупликация |
| `dedupeScope` | `all` \| `group` | нет | где искать повторы получателя. По умолчанию `all` |
| `label` | string | нет | до 120, подпись для превью («Благодарность наставнику»). По умолчанию `""` |

## Набор правил в ответе (`AwardRuleSet`)

Так его отдают `GET /api/award-rules/{id}`, `POST`, `PATCH`, `duplicate` и `suggest`.

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | |
| `name` | string | |
| `schemaVersion` | integer | версия формата, сейчас 1 |
| `groupColumn` | string | `""` — не выбрана |
| `statusColumn` | string | `""` — не выбрана |
| `rules` | Rule[] | каждое правило с полями `id`, `position` (0…200, по порядку), `enabled`, `label`, `match`, `conditions`, `action`, `outputs` — уже с подставленными значениями по умолчанию |

Пример:

```json
{
  "id": "7c1f7d1e-2b5e-4c3a-9c1a-8d2f0a6b1e11",
  "name": "Награждение по протоколу",
  "schemaVersion": 1,
  "groupColumn": "category",
  "statusColumn": "status",
  "rules": [
    {
      "id": "0b6a1d2e-1111-4a5b-8c9d-0e1f2a3b4c5d",
      "position": 0,
      "enabled": true,
      "label": "Снятые и не стартовавшие",
      "match": "any",
      "conditions": [{ "field": "status", "op": "statusIn", "value": ["dsq", "dns", "dnf", "dnq", "withdrawn"] }],
      "action": "skip",
      "outputs": []
    },
    {
      "id": "1c7b2e3f-2222-4b6c-9d0e-1f2a3b4c5d6e",
      "position": 1,
      "enabled": true,
      "label": "Победители",
      "match": "all",
      "conditions": [{ "field": "place", "op": "placeEquals", "value": 1, "withinGroup": false }],
      "action": "issue",
      "outputs": [
        { "templateDocumentId": "3a9e0c4d-3333-4c7d-8e1f-2a3b4c5d6e7f", "subjectColumn": "", "dedupeScope": "all", "label": "" }
      ]
    },
    {
      "id": "2d8c3f40-4444-4c8e-9f20-3b4c5d6e7f80",
      "position": 2,
      "enabled": true,
      "label": "Все остальные участники",
      "match": "all",
      "conditions": [],
      "action": "issue",
      "outputs": [
        { "templateDocumentId": "4b0f1d5e-5555-4d8e-9f21-4c5d6e7f8091", "subjectColumn": "", "dedupeScope": "all", "label": "" }
      ]
    }
  ]
}
```

## Раскладка (`AwardPlan`) — ответ `POST /api/documents/{id}/awards/preview`

Считается по строкам получателей документа с `checked: true` (не больше 5000), в порядке
`position`. План самодостаточен: в нём подписи правил и названия шаблонов на момент расчёта.

| Поле | Тип | Описание |
|---|---|---|
| `schemaVersion` | integer | версия формата правил |
| `items` | PlanItem[] | запланированные документы |
| `summary` | `{ templateDocumentId, templateTitle, ruleLabels: string[], count }[]` | сводка «шаблон — сколько» |
| `issues` | Issue[] | замечания по строкам |
| `totals.rows` | integer | строк рассмотрено |
| `totals.issuingRows` | integer | строк, по которым выдаётся хоть один документ |
| `totals.excludedRows` | integer | снято правилом `skip` |
| `totals.unmatchedRows` | integer | не подошло ни под одно правило |
| `totals.blockedRows` | integer | остановлено ошибкой до правил (например, неизвестный статус) |
| `totals.documents` | integer | документов после дедупликации |
| `totals.deduplicated` | integer | сколько документов дедупликация убрала |

`PlanItem`: `rowId`, `rowNumber` (с единицы), `group` (string \| null), `subject` (кому —
ФИО или значение колонки получателя), `templateDocumentId`, `templateTitle`, `ruleId`,
`ruleLabel`, `outputLabel`, `mergedRowIds` (строки, слитые дедупликацией в этот документ).

`Issue`: `code`, `severity` (`error` мешает выпуску, `warning` — нет), `rowId`, `rowNumber`,
`group`, `subject`, `message` (готовое пояснение по-русски), `ruleId?`.

Коды `Issue.code`: `no-rule` (ни одно правило не совпало), `excluded-by-rule` (сработал
`skip`), `missing-group` (колонка группы выбрана, а в строке пуста), `unparsable-place`,
`unknown-status`, `no-template` (шаблон удалён или недоступен), `empty-subject` (колонка
получателя в строке пуста), `duplicate-subject` (несколько строк дали одного получателя).

Серьёзность у кода всегда одна и та же: `error` — `no-rule`, `unknown-status`, `no-template`,
`empty-subject` (по такой строке документ не выйдет); `warning` — `excluded-by-rule`,
`missing-group`, `unparsable-place`, `duplicate-subject` (выпуску не мешают, но человек должен
их увидеть).

## Замечания к набору (`problems`) — второе поле ответа превью

Рядом с планом `POST /api/documents/{id}/awards/preview` отдаёт `problems: string[]` —
готовые к показу претензии к самому набору, а не к строкам (функция `lintRuleSet`):

- «Правило «…» срабатывает всегда, поэтому правила под ним никогда не проверятся. Перенесите его в конец» — включённое правило без условий стоит не последним;
- «У правила «…» не выбран ни один шаблон» — `action: issue` без `outputs`;
- «В правиле «…» повторы ищутся внутри группы, но колонка группы не выбрана» — `dedupeScope: group` при пустом `groupColumn`;
- «Правило «…» проверяет статус, но колонка статуса не выбрана» — условие `statusIn` при пустом `statusColumn`;
- «Правило «…» считает место внутри группы, но колонка группы не выбрана — место посчитается по всему протоколу» — `withinGroup: true` при пустом `groupColumn`;
- «Отмечено строк: N, в раскладку взяты первые 5000…» — протокол обрезан пределом раскладки.

Повторы в списке убираются, порядок — по правилам сверху вниз.

---
method: PATCH
path: /api/documents/{id}/sheets/{sheetId}
title: Сохранить макет листа
group: documents
auth: token
roles: any
rate_limit: none
---

# PATCH /api/documents/{id}/sheets/{sheetId}

Заменяет макет листа целиком: в `layout` передаётся весь массив элементов, а не
разница. Макет проверяется общей Zod-схемой `sheetLayout`, нормализуется (подставляются
значения по умолчанию, строка `props.text` превращается в дерево `props.doc`) и
сохраняется уже в таком виде с `schemaVersion: 2`. Именно этот сохранённый макет потом
печатает воркер.

Структура элементов, дерево текста и переменные подстановки —
в [справочнике макета](../../reference/layout.md).

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |
| `sheetId` | UUID | да | идентификатор листа этого документа |

Тело:

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `layout` | Element[] | да | до 500 элементов типов `text`, `image`, `qr`, `link`, `shape` |

```json
{
  "layout": [
    {
      "id": "title",
      "type": "text",
      "x": 20, "y": 40, "w": 257, "h": 25,
      "props": {
        "fontSize": 40,
        "bold": true,
        "uppercase": true,
        "doc": {
          "type": "doc",
          "content": [
            { "type": "paragraph", "content": [ { "type": "text", "text": "Грамота" } ] }
          ]
        }
      }
    },
    {
      "id": "name",
      "type": "text",
      "x": 20, "y": 90, "w": 257, "h": 20,
      "props": {
        "fontSize": 28,
        "doc": {
          "type": "doc",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Награждается " },
                { "type": "mergeField", "attrs": { "source": "name" } },
                { "type": "text", "text": ", занявший " },
                { "type": "mergeField", "attrs": { "source": "place_word" } },
                { "type": "text", "text": " место" }
              ]
            }
          ]
        }
      }
    },
    {
      "id": "qr",
      "type": "qr",
      "x": 260, "y": 170, "w": 25, "h": 25,
      "props": { "template": "" }
    }
  ]
}
```

## Ответ

`200 OK` — лист с нормализованным макетом.

| Поле | Тип | Описание |
|---|---|---|
| `id` | UUID | |
| `documentId` | UUID | |
| `position` | integer | |
| `backgroundFileId` | UUID \| null | фон листа |
| `layout` | Element[] | макет после нормализации: у каждого элемента заполнены `rotation`, `z`, `opacity`, `locked`, `hidden`, `groupId`, `name`; у текста — `doc` и все стили |
| `schemaVersion` | `2` | |

```json
{
  "id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  "documentId": "6f1c3b2a-9d4e-4f5a-8b6c-7d8e9f0a1b2c",
  "position": 0,
  "backgroundFileId": null,
  "layout": [
    {
      "id": "qr",
      "type": "qr",
      "x": 260, "y": 170, "w": 25, "h": 25,
      "rotation": 0, "z": 0, "opacity": 1, "locked": false, "hidden": false,
      "groupId": null, "name": null,
      "props": { "template": "", "color": "#000000" }
    }
  ],
  "schemaVersion": 2
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — `id` или `sheetId` не UUID; макет не прошёл схему: больше 500 элементов, неизвестный `type`, координаты вне −5000…5000, «У текстового блока нет ни текста, ни дерева», «Текст блока длиннее 5000 символов», «В блоке больше 1000 узлов», «Списки вложены глубже 6 уровней», «Недопустимое имя поля», «Ссылка должна начинаться с http:// или https://» и прочие сообщения Zod с путём до поля в `errors[].field` (например `layout.1.props.fontSize`) |
| 401 | нет токена или сессии |
| 404 | «Лист не найден» — лист не принадлежит этому документу, документ чужой или в корзине |
| 413 | тело больше 1 МБ |

## Пример

```bash
curl -X PATCH "https://vruchay.ru/api/documents/$DOCUMENT_ID/sheets/$SHEET_ID" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d @layout.json
```

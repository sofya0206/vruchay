---
method: POST
path: /api/documents/{id}/sheets/{sheetId}/background
title: Загрузить фон листа
group: documents
auth: token
roles: any
rate_limit: none
---

# POST /api/documents/{id}/sheets/{sheetId}/background

Загружает картинку фона листа (бланк) и ставит её листу в `backgroundFileId`.
Прежний фон, если был, помечается удалённым и убирается из хранилища. Тип файла
определяется по сигнатуре первых байтов, а не по расширению или `Content-Type`:
принимаются только PNG и JPEG, до 20 МБ.

Загруженный файл — обычный файл организации: его `fileId` подойдёт и в элемент
`image` макета, и в `GET /api/documents/files/{fileId}/url`.

## Запрос

| Параметр | Тип | Обязателен | Описание |
|---|---|---|---|
| `id` | UUID | да | идентификатор документа |
| `sheetId` | UUID | да | идентификатор листа |

Тело — `multipart/form-data`, одно поле-файл (`file`), не больше одного файла в запросе.

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `file` | файл PNG или JPEG | да | до 20 МБ; имя файла сохраняется как `originalName` (до 255 символов) только для показа |

## Ответ

`201 Created`

| Поле | Тип | Описание |
|---|---|---|
| `fileId` | UUID | идентификатор файла фона |
| `url` | string | подписанная ссылка на файл, действует 15 минут |

```json
{
  "fileId": "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
  "url": "https://storage.example/…/background/d4e5f6a7-….png?X-Amz-Signature=…"
}
```

## Ошибки

| Код | Когда |
|---|---|
| 400 | «Некорректный идентификатор» — параметр не UUID; «Файл не передан» — в теле нет файла; «Файл слишком большой, максимум 20 МБ»; «Поддерживаются только изображения PNG и JPEG» |
| 401 | нет токена или сессии |
| 404 | «Лист не найден» — лист не из этого документа, документ чужой или в корзине |

## Пример

```bash
curl -X POST "https://vruchay.ru/api/documents/$DOCUMENT_ID/sheets/$SHEET_ID/background" \
  -H "Authorization: Bearer $VRUCHAY_TOKEN" \
  -F "file=@blank.png"
```

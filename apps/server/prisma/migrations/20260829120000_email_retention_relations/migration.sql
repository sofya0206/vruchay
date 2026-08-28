-- Связи и индексы под сроки хранения писем.
--
-- До этой миграции emails.document_id, emails.row_id, tilda_requests.document_id
-- и invoices.lead_id были просто полями типа uuid без внешних ключей. Из-за
-- этого удаление материала не забирало связанные письма, и адреса участников
-- оставались в базе бессрочно — вопреки сроку хранения, который остальным
-- таблицам считает ночная задача.
--
-- Раз ключей не было, в этих полях могли накопиться ссылки в никуда. Добавить
-- внешний ключ поверх такой строки нельзя: миграция упадёт посреди выката.
-- Поэтому сначала подчищаем осиротевшие ссылки, и только потом ставим ключи.
--
-- Откат (если понадобится вернуть прежнее состояние — данные при этом
-- не восстанавливаются, они уже подчищены):
--   ALTER TABLE "emails" DROP CONSTRAINT "emails_document_id_fkey";
--   ALTER TABLE "emails" DROP CONSTRAINT "emails_row_id_fkey";
--   ALTER TABLE "tilda_requests" DROP CONSTRAINT "tilda_requests_document_id_fkey";
--   ALTER TABLE "tilda_requests" DROP CONSTRAINT "tilda_requests_file_id_fkey";
--   ALTER TABLE "tilda_requests" DROP CONSTRAINT "tilda_requests_email_id_fkey";
--   ALTER TABLE "invoices" DROP CONSTRAINT "invoices_lead_id_fkey";
--   DROP INDEX "emails_file_id_idx";
--   DROP INDEX "emails_queued_at_idx";
--   DROP INDEX "invoices_lead_id_idx";

-- ─── Осиротевшие ссылки ────────────────────────────────────────────────────

-- Письмо по удалённому материалу: связь обнуляем, саму запись оставляем —
-- её заберёт ночная уборка по сроку хранения, как и все прочие.
UPDATE "emails" SET "document_id" = NULL
WHERE "document_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."id" = "emails"."document_id");

UPDATE "emails" SET "row_id" = NULL
WHERE "row_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "recipient_rows" r WHERE r."id" = "emails"."row_id");

UPDATE "tilda_requests" SET "file_id" = NULL
WHERE "file_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "files" f WHERE f."id" = "tilda_requests"."file_id");

UPDATE "tilda_requests" SET "email_id" = NULL
WHERE "email_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "emails" e WHERE e."id" = "tilda_requests"."email_id");

UPDATE "invoices" SET "lead_id" = NULL
WHERE "lead_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."id" = "invoices"."lead_id");

-- Заявка ссылается на материал обязательным полем, обнулить его нельзя.
-- Заявка на удалённый материал не отвечает уже ни на один вопрос, а поля
-- формы в ней — персональные данные участника: удаляем вместе с согласиями,
-- которые к ней привязаны (у них внешний ключ с SET NULL, поэтому сначала
-- отвязываем — сами согласия остаются, они доказательство).
UPDATE "consents" SET "request_id" = NULL
WHERE "request_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "tilda_requests" t
    WHERE t."id" = "consents"."request_id"
      AND NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."id" = t."document_id")
  );

DELETE FROM "tilda_requests"
WHERE NOT EXISTS (SELECT 1 FROM "documents" d WHERE d."id" = "tilda_requests"."document_id");

-- ─── Индексы ───────────────────────────────────────────────────────────────

-- CreateIndex
CREATE INDEX "emails_file_id_idx" ON "emails"("file_id");

-- CreateIndex
CREATE INDEX "emails_queued_at_idx" ON "emails"("queued_at");

-- CreateIndex
CREATE INDEX "invoices_lead_id_idx" ON "invoices"("lead_id");

-- ─── Внешние ключи ─────────────────────────────────────────────────────────

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "recipient_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tilda_requests" ADD CONSTRAINT "tilda_requests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tilda_requests" ADD CONSTRAINT "tilda_requests_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tilda_requests" ADD CONSTRAINT "tilda_requests_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

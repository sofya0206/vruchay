-- Рассылка без документа и сводка по письмам.
--
-- Шаблон без материала уже допускался схемой, но письму без материала
-- не от чего было защититься от повтора: уникальный индекс
-- emails_document_to_kind_live стоит на document_id, а NULL в уникальном
-- индексе Postgres с другим NULL не совпадает никогда. Два нажатия
-- «Отправить» подряд ушли бы двумя письмами каждому.
--
-- Откат:
--   DROP INDEX "emails_template_to_kind_live";
--   DROP INDEX "emails_template_id_idx";
--   DROP INDEX "emails_org_id_queued_at_idx";
--   ALTER TABLE "email_templates" DROP COLUMN "name";

ALTER TABLE "email_templates" ADD COLUMN "name" TEXT;

CREATE INDEX "emails_org_id_queued_at_idx" ON "emails"("org_id", "queued_at");

CREATE INDEX "emails_template_id_idx" ON "emails"("template_id");

-- Тот же смысл, что у индекса по материалу: одно живое письмо на адрес
-- в потоке — только в пределах рассылки без документа.
CREATE UNIQUE INDEX "emails_template_to_kind_live"
  ON "emails" ("template_id", lower("to_email"), "kind")
  WHERE "document_id" IS NULL
    AND "template_id" IS NOT NULL
    AND "status" IN ('queued', 'sent', 'delivered', 'opened')
    AND "to_email" <> '';

-- Шаблон — тот же документ с флагом: листы, фон и колонки общие по устройству.
ALTER TABLE "documents" ADD COLUMN "is_template" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "documents_org_id_is_template_deleted_at_idx" ON "documents"("org_id", "is_template", "deleted_at");

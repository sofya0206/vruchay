-- Срок действия документов.
--
-- У материала — правило (длительность ISO 8601 от выдачи либо фиксированная
-- дата), у выданного файла — факт, посчитанный в момент выпуска. Состояние
-- «истёк» не хранится: оно выводится из даты и часов, как и остальные.
ALTER TABLE "documents" ADD COLUMN "expires_in" TEXT,
ADD COLUMN "expires_at" TIMESTAMP(3);

ALTER TABLE "files" ADD COLUMN "expires_at" TIMESTAMP(3),
ADD COLUMN "expiry_notice_at" TIMESTAMP(3);

-- Ночная задача ищет документы, срок которых выходит в ближайшие недели.
CREATE INDEX "files_expires_at_idx" ON "files"("expires_at");

-- Служебные письма о самом документе (уведомление о сроке) пишет сервис,
-- а не организация: у них готовый текст и нет вложения.
ALTER TABLE "emails" ADD COLUMN "body_html" TEXT,
ADD COLUMN "attach_file" BOOLEAN NOT NULL DEFAULT true;

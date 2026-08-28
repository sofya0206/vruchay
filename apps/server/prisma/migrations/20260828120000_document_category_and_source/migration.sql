-- Библиотека шаблонов: раздел материала и связь «сделан на основе».
--
-- Раздел — строка, а не перечисление: набор разделов живёт в общем пакете
-- рядом с заготовками и правится вместе с ними. Перечисление в базе значило бы
-- миграцию на каждый новый раздел, а проверку значения всё равно делает Zod
-- на входе.
--
-- Ссылка на исходный материал — на себя же, а не на отдельную модель шаблона.
-- Полное разделение «бланк отдельно, мероприятие отдельно» задело бы только что
-- слитое ядро выпуска и делается отдельной задачей; пока этого столбца хватает,
-- чтобы показать человеку, с какого бланка снята копия.
--
-- ON DELETE SET NULL, а не CASCADE: исходник могли стереть из корзины насовсем,
-- и копии от этого пропадать не должны — это самостоятельные материалы
-- с собственными списками получателей и выданными файлами.

ALTER TABLE "documents" ADD COLUMN "category" TEXT;
ALTER TABLE "documents" ADD COLUMN "source_document_id" UUID;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_source_document_id_fkey"
    FOREIGN KEY ("source_document_id") REFERENCES "documents"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "documents_org_id_category_idx" ON "documents"("org_id", "category");

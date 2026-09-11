-- Папки библиотеки вместо зашитого в код набора разделов.
--
-- Разделы были перечислением на пять значений («sport», «contest», …),
-- и организация, которая проводит семинары, видела в колонке чужой шаблон
-- со спортивными соревнованиями. Здесь они становятся обычными папками,
-- которые заводят и удаляют сами.

CREATE TABLE "document_folders" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_folders_org_id_name_key" ON "document_folders"("org_id", "name");
CREATE INDEX "document_folders_org_id_position_idx" ON "document_folders"("org_id", "position");

ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" ADD COLUMN "folder_id" UUID;

-- Разложенное по разделам не теряем: у каждой организации из её же значений
-- заводятся настоящие папки с теми названиями, которые человек видел в
-- интерфейсе. Ненужные он удалит сам — материалы при этом вернутся в корень.
INSERT INTO "document_folders" ("id", "org_id", "name", "position", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    d."org_id",
    CASE d."category"
        WHEN 'sport'         THEN 'Спортивные соревнования'
        WHEN 'contest'       THEN 'Олимпиады и конкурсы'
        WHEN 'education'     THEN 'Обучение и семинары'
        WHEN 'corporate'     THEN 'Корпоративные благодарности'
        WHEN 'accreditation' THEN 'Аккредитации и пропуска'
        ELSE d."category"
    END,
    ROW_NUMBER() OVER (PARTITION BY d."org_id" ORDER BY d."category") - 1,
    NOW(),
    NOW()
FROM (SELECT DISTINCT "org_id", "category" FROM "documents" WHERE "category" IS NOT NULL) AS d;

UPDATE "documents" AS doc
SET "folder_id" = f."id"
FROM "document_folders" AS f
WHERE f."org_id" = doc."org_id"
  AND f."name" = CASE doc."category"
        WHEN 'sport'         THEN 'Спортивные соревнования'
        WHEN 'contest'       THEN 'Олимпиады и конкурсы'
        WHEN 'education'     THEN 'Обучение и семинары'
        WHEN 'corporate'     THEN 'Корпоративные благодарности'
        WHEN 'accreditation' THEN 'Аккредитации и пропуска'
        ELSE doc."category"
      END;

DROP INDEX IF EXISTS "documents_org_id_category_idx";
ALTER TABLE "documents" DROP COLUMN "category";

CREATE INDEX "documents_org_id_folder_id_idx" ON "documents"("org_id", "folder_id");

ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_fkey"
    FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

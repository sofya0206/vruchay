-- Дата выдачи, регистрационный номер и счётчик номеров.
--
-- Дата выдачи у материала: грамоты за прошедшее мероприятие печатают
-- позже, а стоять на них должна дата награждения, а не день выпуска.
-- Пусто — день выпуска, как было.
ALTER TABLE "documents" ADD COLUMN "issue_date" DATE;

-- Регистрационный номер экземпляра: «142/2026», сквозной у организации
-- за год. Выделяется при выпуске и печатается на документе.
ALTER TABLE "files" ADD COLUMN "reg_number" TEXT;

-- Счётчик номеров: отдельная таблица, а не MAX()+1, потому что воркеры
-- выпускают параллельно и взяли бы один номер на двоих.
CREATE TABLE "issue_counters" (
    "org_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "issue_counters_pkey" PRIMARY KEY ("org_id","year")
);

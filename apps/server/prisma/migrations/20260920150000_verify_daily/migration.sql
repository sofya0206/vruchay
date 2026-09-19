-- Проверки по QR по дням: обезличенный агрегат на документ и день.
CREATE TABLE "verify_daily" (
    "file_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "uniques" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "verify_daily_pkey" PRIMARY KEY ("file_id","day")
);

CREATE INDEX "verify_daily_org_id_day_idx" ON "verify_daily"("org_id", "day");

ALTER TABLE "verify_daily" ADD CONSTRAINT "verify_daily_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verify_daily" ADD CONSTRAINT "verify_daily_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

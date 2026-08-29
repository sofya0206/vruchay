-- Планы организаций: условия как данные, а не как код.

CREATE TYPE "PlanPeriod" AS ENUM ('package', 'year');

CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document_limit" INTEGER NOT NULL,
    "period" "PlanPeriod" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "features" TEXT[],
    "never_expires" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "assigned_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- Действующий план ищется по организации и дате начала.
CREATE INDEX "plans_org_id_starts_at_idx" ON "plans"("org_id", "starts_at");

ALTER TABLE "plans" ADD CONSTRAINT "plans_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Поля заявки «Обсудить условия» (ветка 10-B): миграции блока делает ветка A.
ALTER TABLE "leads" ADD COLUMN "event_kinds" TEXT[];
ALTER TABLE "leads" ADD COLUMN "call_time" TEXT;
ALTER TABLE "leads" ADD COLUMN "consent_text_version" TEXT;

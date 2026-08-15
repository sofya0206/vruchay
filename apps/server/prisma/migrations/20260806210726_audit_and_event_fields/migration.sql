-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "event_date" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "event_hours" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "event_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "event_place" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID,
    "actor_name" TEXT NOT NULL DEFAULT '',
    "actor_email" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_org_id_created_at_idx" ON "audit_events"("org_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_target_type_target_id_idx" ON "audit_events"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

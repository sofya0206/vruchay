-- CreateEnum
CREATE TYPE "AwardRuleAction" AS ENUM ('issue', 'skip');

-- CreateEnum
CREATE TYPE "AwardConditionMatch" AS ENUM ('all', 'any');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "rule_set_id" UUID;

-- CreateTable
CREATE TABLE "award_rule_sets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group_column" TEXT NOT NULL DEFAULT '',
    "status_column" TEXT NOT NULL DEFAULT '',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "award_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "award_rules" (
    "id" UUID NOT NULL,
    "rule_set_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT NOT NULL DEFAULT '',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "match" "AwardConditionMatch" NOT NULL DEFAULT 'all',
    "action" "AwardRuleAction" NOT NULL DEFAULT 'issue',
    "outputs" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "award_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "award_rule_sets_org_id_deleted_at_idx" ON "award_rule_sets"("org_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "award_rules_rule_set_id_position_key" ON "award_rules"("rule_set_id", "position");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "award_rule_sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "award_rule_sets" ADD CONSTRAINT "award_rule_sets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "award_rules" ADD CONSTRAINT "award_rules_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "award_rule_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Саморегистрация: подтверждение адреса и бесплатная проба.

CREATE TYPE "OrgPlan" AS ENUM ('free', 'paid');

-- Новые организации по умолчанию на бесплатной пробе.
ALTER TABLE "organizations" ADD COLUMN "plan" "OrgPlan" NOT NULL DEFAULT 'free';

ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- Всё, что уже есть в базе, заведено оператором из консоли: адреса он вводил
-- сам, подтверждать нечего, и лимит бесплатной пробы к ним не относится.
-- Без этих двух строк действующий владелец при первом же входе получил бы
-- «адрес не подтверждён», а его документы упёрлись бы в чужой лимит.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
UPDATE "organizations" SET "plan" = 'paid';

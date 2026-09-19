-- Push-уведомления (ADR-0004): подписки браузеров и автор выпуска.
--
-- Уведомление «документы готовы» уходит тому, кто запустил выпуск, а не
-- всей организации: коллегам чужие выпуски в телефоне ни к чему. Поле
-- автора пустое у старых заданий и у выпусков по форме на сайте — им
-- уведомлять некого, и это нормально.

ALTER TABLE "generation_jobs" ADD COLUMN "created_by_id" UUID;

ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_user_id_org_id_idx" ON "push_subscriptions"("user_id", "org_id");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

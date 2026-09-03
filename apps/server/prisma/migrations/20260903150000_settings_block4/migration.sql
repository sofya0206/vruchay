-- Блок 4, страница настроек.
--
-- У пользователя: второй фактор входа (зашифрованный секрет TOTP и дата
-- включения; резервные коды — отдельной таблицей, хешами), тема кабинета
-- и формат дат. Сессии и журнал авторизаций — тоже таблицами: cookie
-- сессии шифрованная и сама по себе не отзывается, а «завершить сессию
-- на другом устройстве» без записи в базе невозможно.
--
-- У организации: домен для страницы проверки и реквизиты плательщика
-- (юрлицо / ИП / самозанятый / физлицо) для счетов и закрывающих.
--
-- Обратная связь: обращения в поддержку с историей сообщений и дорожная
-- карта с голосованием — один голос на организацию.

-- CreateEnum
CREATE TYPE "BillingKind" AS ENUM ('legal', 'ie', 'self_employed', 'individual');

-- CreateEnum
CREATE TYPE "UiTheme" AS ENUM ('system', 'light', 'dark');

-- CreateEnum
CREATE TYPE "DateFormat" AS ENUM ('numeric', 'long', 'iso');

-- CreateEnum
CREATE TYPE "LoginOutcome" AS ENUM ('success', 'wrong_password', 'wrong_code', 'not_verified');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('open', 'answered', 'closed');

-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('planned', 'in_progress', 'done');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "billing_address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "billing_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "billing_inn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "billing_kind" "BillingKind",
ADD COLUMN     "billing_kpp" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "billing_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "billing_ogrn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "verify_domain" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "date_format" "DateFormat" NOT NULL DEFAULT 'numeric',
ADD COLUMN     "theme" "UiTheme" NOT NULL DEFAULT 'system',
ADD COLUMN     "totp_enabled_at" TIMESTAMP(3),
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "totp_backup_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip" INET,
    "user_agent" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "outcome" "LoginOutcome" NOT NULL,
    "ip" INET,
    "user_agent" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID,
    "subject" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "user_id" UUID,
    "from_support" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_items" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "RoadmapStatus" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_votes" (
    "item_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roadmap_votes_pkey" PRIMARY KEY ("item_id","org_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "totp_backup_codes_code_hash_key" ON "totp_backup_codes"("code_hash");

-- CreateIndex
CREATE INDEX "totp_backup_codes_user_id_idx" ON "totp_backup_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "login_events_user_id_created_at_idx" ON "login_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_org_id_updated_at_idx" ON "support_tickets"("org_id", "updated_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_updated_at_idx" ON "support_tickets"("status", "updated_at");

-- CreateIndex
CREATE INDEX "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "roadmap_items_status_created_at_idx" ON "roadmap_items"("status", "created_at");

-- CreateIndex
CREATE INDEX "roadmap_votes_org_id_idx" ON "roadmap_votes"("org_id");

-- AddForeignKey
ALTER TABLE "totp_backup_codes" ADD CONSTRAINT "totp_backup_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_votes" ADD CONSTRAINT "roadmap_votes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "roadmap_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_votes" ADD CONSTRAINT "roadmap_votes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


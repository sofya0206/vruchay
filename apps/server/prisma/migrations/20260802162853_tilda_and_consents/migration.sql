-- CreateEnum
CREATE TYPE "TildaAuthMode" AS ENUM ('none', 'email_code');

-- CreateEnum
CREATE TYPE "TildaRequestStatus" AS ENUM ('pending_otp', 'processing', 'done', 'failed', 'rejected');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('certificate', 'marketing', 'verification');

-- CreateTable
CREATE TABLE "tilda_integrations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token" UUID NOT NULL,
    "allowed_domains" TEXT[],
    "document_ids" UUID[],
    "auth_mode" "TildaAuthMode" NOT NULL DEFAULT 'email_code',
    "single_file_per_email" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER NOT NULL DEFAULT 500,
    "success_message" TEXT NOT NULL DEFAULT 'Спасибо! Документ отправлен на вашу почту',
    "show_download" BOOLEAN NOT NULL DEFAULT true,
    "send_email" BOOLEAN NOT NULL DEFAULT true,
    "copy_to_email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tilda_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tilda_requests" (
    "id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "ip" INET,
    "user_agent" TEXT,
    "status" "TildaRequestStatus" NOT NULL DEFAULT 'processing',
    "file_id" UUID,
    "email_id" UUID,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMP(3),

    CONSTRAINT "tilda_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "request_id" UUID,
    "document_id" UUID,
    "subject_email" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "text_version" TEXT NOT NULL,
    "form_id" TEXT,
    "ip" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tilda_integrations_token_key" ON "tilda_integrations"("token");

-- CreateIndex
CREATE INDEX "tilda_integrations_org_id_idx" ON "tilda_integrations"("org_id");

-- CreateIndex
CREATE INDEX "tilda_requests_integration_id_created_at_idx" ON "tilda_requests"("integration_id", "created_at");

-- CreateIndex
CREATE INDEX "tilda_requests_document_id_email_idx" ON "tilda_requests"("document_id", "email");

-- CreateIndex
CREATE INDEX "consents_org_id_subject_email_idx" ON "consents"("org_id", "subject_email");

-- CreateIndex
CREATE INDEX "consents_document_id_idx" ON "consents"("document_id");

-- AddForeignKey
ALTER TABLE "tilda_integrations" ADD CONSTRAINT "tilda_integrations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tilda_requests" ADD CONSTRAINT "tilda_requests_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "tilda_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tilda_requests" ADD CONSTRAINT "tilda_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "tilda_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'canceled');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "job_id" UUID;

-- CreateTable
CREATE TABLE "recipient_columns" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "recipient_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_rows" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "checked" BOOLEAN NOT NULL DEFAULT true,
    "last_file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipient_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipient_columns_document_id_position_key" ON "recipient_columns"("document_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_columns_document_id_name_key" ON "recipient_columns"("document_id", "name");

-- CreateIndex
CREATE INDEX "recipient_rows_document_id_checked_idx" ON "recipient_rows"("document_id", "checked");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_rows_document_id_position_key" ON "recipient_rows"("document_id", "position");

-- CreateIndex
CREATE INDEX "generation_jobs_org_id_status_idx" ON "generation_jobs"("org_id", "status");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_columns" ADD CONSTRAINT "recipient_columns_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_rows" ADD CONSTRAINT "recipient_rows_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_rows" ADD CONSTRAINT "recipient_rows_last_file_id_fkey" FOREIGN KEY ("last_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

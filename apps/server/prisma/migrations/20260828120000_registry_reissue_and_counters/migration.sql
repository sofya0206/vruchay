-- AlterTable
ALTER TABLE "files" ADD COLUMN     "download_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replaced_by_id" UUID,
ADD COLUMN     "replaced_by_job_id" UUID,
ADD COLUMN     "verify_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verify_last_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "files_org_id_kind_created_at_idx" ON "files"("org_id", "kind", "created_at");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

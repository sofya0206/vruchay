-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('background', 'asset', 'generated', 'font');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "page_width_mm" DOUBLE PRECISION NOT NULL DEFAULT 297,
    "page_height_mm" DOUBLE PRECISION NOT NULL DEFAULT 210,
    "verify_enabled" BOOLEAN NOT NULL DEFAULT true,
    "verify_fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheets" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "background_file_id" UUID,
    "layout" JSONB NOT NULL DEFAULT '[]',
    "schema_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "document_id" UUID,
    "kind" "FileKind" NOT NULL,
    "s3_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "original_name" TEXT NOT NULL DEFAULT '',
    "public_id" UUID NOT NULL,
    "verify_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_org_id_deleted_at_idx" ON "documents"("org_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sheets_document_id_position_key" ON "sheets"("document_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "files_public_id_key" ON "files"("public_id");

-- CreateIndex
CREATE INDEX "files_org_id_kind_idx" ON "files"("org_id", "kind");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_background_file_id_fkey" FOREIGN KEY ("background_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

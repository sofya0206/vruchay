-- AlterTable
ALTER TABLE "tilda_integrations" ADD COLUMN     "allow_edit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "prefill_from_account" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_share" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_verify_link" BOOLEAN NOT NULL DEFAULT false;


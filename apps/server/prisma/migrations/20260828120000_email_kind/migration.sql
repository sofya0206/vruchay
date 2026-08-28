-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('transactional', 'marketing');

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "advertiser_name" TEXT,
ADD COLUMN     "kind" "EmailKind" NOT NULL DEFAULT 'transactional';

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "kind" "EmailKind" NOT NULL DEFAULT 'transactional';

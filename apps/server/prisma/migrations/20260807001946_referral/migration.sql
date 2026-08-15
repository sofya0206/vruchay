-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "referral_code" TEXT,
ADD COLUMN     "referred_by_org_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_referral_code_key" ON "organizations"("referral_code");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_referred_by_org_id_fkey" FOREIGN KEY ("referred_by_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


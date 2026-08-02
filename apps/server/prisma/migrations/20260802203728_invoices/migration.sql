-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "inn" TEXT,
ADD COLUMN     "tariff" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "lead_id" UUID,
    "number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_inn" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tariff" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_kopecks" INTEGER NOT NULL,
    "paid_at" TIMESTAMP(3),
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_email_idx" ON "invoices"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_year_number_key" ON "invoices"("year", "number");

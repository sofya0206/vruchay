/*
  Warnings:

  - The required column `verification_token` was added to the `mail_domains` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "mail_domains" ADD COLUMN     "verification_token" TEXT NOT NULL;

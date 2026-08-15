-- AlterTable
ALTER TABLE "tilda_requests" ADD COLUMN     "account_email" TEXT;


-- Один выданный документ на одну учётную запись площадки.
-- Частичный индекс Prisma в схеме не описывает, поэтому пишем руками.
-- Условие то же, что и у индекса по адресу доставки: считаем только
-- завершённые заявки — незавершённая ничего человеку не дала.
CREATE UNIQUE INDEX "tilda_requests_one_per_account"
  ON "tilda_requests" ("document_id", lower("account_email"))
  WHERE "status" = 'done' AND "account_email" IS NOT NULL;

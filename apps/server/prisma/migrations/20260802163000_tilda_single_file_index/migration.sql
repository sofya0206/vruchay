-- Один выданный документ на пару «документ + адрес», но только среди завершённых
-- заявок: отклонённые и неудачные попытки не должны блокировать повторный запрос.
-- Частичный индекс Prisma в схеме не описывает, поэтому пишем вручную.
CREATE UNIQUE INDEX "tilda_requests_one_per_email"
  ON "tilda_requests" ("document_id", lower("email"))
  WHERE "status" = 'done';

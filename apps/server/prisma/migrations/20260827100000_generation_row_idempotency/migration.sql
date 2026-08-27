-- Ключ идемпотентности выпуска: пара (job_id, row_id).
--
-- Квота считается по числу файлов kind='generated', поэтому дубликат файла
-- списывает документ повторно. Проверки в коде для денег мало: воркер может
-- быть перезапущен посреди задания, и BullMQ отдаст задание второй раз,
-- пока первый процесс ещё жив. Ограничение в базе закрывает и этот случай.

ALTER TABLE "files" ADD COLUMN "row_id" UUID;

-- Уже выпущенным файлам проставляем строку по обратной ссылке.
-- Дубликатов пары появиться не может: у строки ровно один last_file_id,
-- а значит на одну строку приходится не больше одного файла.
UPDATE "files" f
SET "row_id" = r."id"
FROM "recipient_rows" r
WHERE r."last_file_id" = f."id" AND f."job_id" IS NOT NULL;

-- NULL в PostgreSQL не конфликтует с NULL, поэтому файлы вне заданий
-- (фоны, вложения, счета) ограничение не задевает.
CREATE UNIQUE INDEX "files_job_id_row_id_key" ON "files"("job_id", "row_id");

ALTER TABLE "files"
  ADD CONSTRAINT "files_row_id_fkey" FOREIGN KEY ("row_id")
  REFERENCES "recipient_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

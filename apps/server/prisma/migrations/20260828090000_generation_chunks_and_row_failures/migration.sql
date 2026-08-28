-- Пакет режется на части, а неудачи строк становятся фактом.
--
-- Части нужны, чтобы запущенный выпуск на десять тысяч строк не держал
-- воркер часами: пакет на пять грамот, поставленный следом, должен успеть
-- между частями, а не ждать чужой пакет целиком.
--
-- Из-за частей перестал работать прежний способ понять, что выпуск
-- закончился: счётчик ошибок нельзя сложить из частей, идущих вразнобой.
-- Поэтому неудача строки теперь запись, а не приращение счётчика: строка
-- либо стала файлом, либо попала в generation_row_failures, и пока сумма
-- меньше обещанного, какая-то часть ещё в пути.

ALTER TABLE "generation_jobs" ADD COLUMN "chunks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "generation_jobs" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "generation_row_failures" (
    "job_id" UUID NOT NULL,
    "row_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_row_failures_pkey" PRIMARY KEY ("job_id","row_id")
);

-- Пакет удалён — вместе с ним уходят и причины его неудач.
ALTER TABLE "generation_row_failures"
  ADD CONSTRAINT "generation_row_failures_job_id_fkey" FOREIGN KEY ("job_id")
  REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Записи, оставшиеся от прежнего порядка: файл заводился до отправки байтов
-- в хранилище, и при убийстве воркера по памяти оставался пустой ключ.
-- Такой файл числится выпущенным и съедает квоту, а скачать его нельзя.
-- Убираем: строка вернётся в очередь при следующем выпуске.
DELETE FROM "files" WHERE "kind" = 'generated' AND "s3_key" = '';

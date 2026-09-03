-- Публичная страница проверки и публичное лицо эмитента.
--
-- У файла: отпечаток SHA-256 выпущенных байтов (сверка файла на руках
-- прямо в браузере), снимок данных получателя на момент выпуска (страница
-- проверки показывает то, что напечатано, а не то, что потом поправили
-- в таблице), отзыв с датой и двумя причинами (публичная — человеку
-- с бумагой, внутренняя — сотрудникам), порядковый номер для списка
-- состояний (задел под офлайн-проверку) и отметка подписи PDF.
--
-- У организации: адрес публичной страницы, описание, ИНН, контакты,
-- логотип, значок верифицированного эмитента (ставит владелец сервиса
-- руками), переключатели публичной страницы, поиска по ФИО (ст. 10.1
-- 152-ФЗ, по умолчанию выключен) и индексации поисковиками, и режим
-- показа получателя на странице проверки. Всё наружу — выключено.

-- CreateEnum
CREATE TYPE "VerifyNameMode" AS ENUM ('full', 'initials', 'none');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "issued_data" JSONB,
ADD COLUMN     "pdf_sha256" TEXT,
ADD COLUMN     "revoked_at" TIMESTAMP(3),
ADD COLUMN     "revoked_reason_internal" TEXT,
ADD COLUMN     "revoked_reason_public" TEXT,
ADD COLUMN     "signed_at" TIMESTAMP(3),
ADD COLUMN     "status_index" BIGSERIAL NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "contact_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contact_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "inn" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "logo_file_id" UUID,
ADD COLUMN     "public_indexable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_page_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "public_search_by_name" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_issuer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verify_name_mode" "VerifyNameMode" NOT NULL DEFAULT 'full',
ADD COLUMN     "website" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "files_status_index_key" ON "files"("status_index");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

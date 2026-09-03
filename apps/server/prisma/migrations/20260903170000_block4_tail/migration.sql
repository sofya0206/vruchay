-- Хвост блока 4: то, что было в описании эпика, но не попало в подзадачи.
--
-- Плотность интерфейса — рядом с темой и форматом дат, настройка человека.
-- Языка здесь нет намеренно: переключатель без перевода интерфейса обещал бы
-- то, чего сервис не умеет.
--
-- Обратный адрес и подпись отправителя: письма часто уходят с noreply,
-- а отвечать человек должен живому адресату. Подпись дописывается только
-- к транзакционному письму — рекламный низ живёт отдельно.
--
-- Срок хранения в корзине переезжает из общей константы в настройку
-- организации: хранить дольше, чем требует цель, запрещает ч. 7 ст. 5
-- 152-ФЗ, а решает срок оператор — то есть сама организация. Семь дней
-- по умолчанию — столько было до появления настройки.

-- CreateEnum
CREATE TYPE "UiDensity" AS ENUM ('comfortable', 'compact');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "trash_days" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "senders" ADD COLUMN     "reply_to" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signature" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "density" "UiDensity" NOT NULL DEFAULT 'comfortable';


-- Отзыв рассылки: удаление отправленного сообщения у водителей (issue #150).
--
-- Состояние отзыва хранится отдельно от исхода отправки. `outcome` остаётся тем, чем кончилась
-- отправка: отзыв его не затирает, иначе из истории водителя пропал бы факт, что сообщение
-- ему дошло.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "mailing_recipients" ADD COLUMN     "recalled_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "mailings" ADD COLUMN     "recall_finished_at" TIMESTAMPTZ(6),
ADD COLUMN     "recall_started_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Отзывают только прошедшую рассылку: у черновика отзывать нечего, идущую сначала
-- останавливают. Конец отзыва без начала — запись, которой нечему соответствовать.
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_recall_times_check"
    CHECK (
        ("recall_started_at" IS NULL OR "status" IN ('stopped', 'finished'))
        AND ("recall_finished_at" IS NULL OR "recall_started_at" IS NOT NULL)
    );

-- Снять можно только то, что дошло: отметка отзыва есть лишь у `sent` с `message_id`.
ALTER TABLE "mailing_recipients" ADD CONSTRAINT "mailing_recipients_recalled_at_check"
    CHECK ("recalled_at" IS NULL OR "outcome" = 'sent');

COMMENT ON COLUMN "mailings"."recall_started_at" IS
    'Когда запущен отзыв. Заполнено — второй отзыв не запускается.';

COMMENT ON COLUMN "mailing_recipients"."recalled_at" IS
    'Когда сообщение удалено у получателя отзывом. Исход при этом остаётся sent.';

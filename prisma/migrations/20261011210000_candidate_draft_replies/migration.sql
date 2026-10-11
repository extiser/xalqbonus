-- «Не закончили» в заявках (issue #475): ответ из админки тому, кто не дошёл до заявки в чате бота,
-- «Убрать из списка» и кто ведёт.
--
-- Сообщения черновика теперь в обе стороны: автор — человек или сотрудник, у ответа сотрудника —
-- исход доставки, как у переписки с кандидатом. У черновика — сообщение-контакт, по которому он
-- взял номер, кто ведёт и кто убрал его из списка.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "candidate_draft_message_author" AS ENUM ('person', 'employee');

-- AlterTable
ALTER TABLE "candidate_chat_drafts" ADD COLUMN     "dismissed_at" TIMESTAMPTZ(6),
ADD COLUMN     "dismissed_by_employee_id" UUID,
ADD COLUMN     "handled_by_employee_id" UUID,
ADD COLUMN     "phone_message_id" UUID;

-- AlterTable
-- Существующие сообщения черновика — сообщения человека, и все они пришли: значение по умолчанию
-- заполняет их и сразу снимается — новые строки называют автора и доставку сами.
ALTER TABLE "candidate_draft_messages" ADD COLUMN     "author" "candidate_draft_message_author" NOT NULL DEFAULT 'person',
ADD COLUMN     "delivery" "candidate_message_delivery" NOT NULL DEFAULT 'delivered',
ADD COLUMN     "employee_id" UUID,
ADD COLUMN     "failure" "candidate_message_failure",
ALTER COLUMN "candidate_message_id" DROP NOT NULL;

ALTER TABLE "candidate_draft_messages" ALTER COLUMN "author" DROP DEFAULT,
ALTER COLUMN "delivery" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "candidate_draft_messages_draft_id_created_at_idx" ON "candidate_draft_messages"("draft_id", "created_at");

-- AddForeignKey
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_phone_message_id_fkey" FOREIGN KEY ("phone_message_id") REFERENCES "candidate_draft_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_handled_by_employee_id_fkey" FOREIGN KEY ("handled_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_dismissed_by_employee_id_fkey" FOREIGN KEY ("dismissed_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_draft_messages" ADD CONSTRAINT "candidate_draft_messages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: перенос данных и проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Черновики на шаге имени взяли номер контактом. Момент смены шага не хранился, и сообщением номера
-- считается последний контакт черновика: отклонённые чужие контакты приходят до своего.
UPDATE "candidate_chat_drafts" AS draft
   SET "phone_message_id" = (
         SELECT message."id"
           FROM "candidate_draft_messages" AS message
          WHERE message."draft_id" = draft."id"
            AND message."kind" = 'contact'
          ORDER BY message."created_at" DESC, message."id" DESC
          LIMIT 1
       )
 WHERE draft."step" = 'awaiting_name';

-- Автор-сотрудник — ровно у ответа сотрудника.
ALTER TABLE "candidate_draft_messages" ADD CONSTRAINT "candidate_draft_messages_employee_check"
    CHECK (("author" = 'employee') = ("employee_id" IS NOT NULL));

-- Причина недоставки — ровно у недоставленного.
ALTER TABLE "candidate_draft_messages" ADD CONSTRAINT "candidate_draft_messages_failure_check"
    CHECK (("delivery" = 'failed') = ("failure" IS NOT NULL));

-- «Убрать из списка» — момент и кто убрал вместе.
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_dismissed_check"
    CHECK (("dismissed_at" IS NULL) = ("dismissed_by_employee_id" IS NULL));

COMMENT ON TABLE "candidate_draft_messages" IS
    'Сообщения черновика заявки в чате бота, кроме /start: человека и ответы сотрудников из админки.';

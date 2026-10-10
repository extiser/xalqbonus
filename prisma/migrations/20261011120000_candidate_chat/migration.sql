-- Переписка с кандидатом (issue #463): тема заявки в группе сотрудников и сообщения в обе стороны.
-- Тема, карточка и приветствие заводятся при подаче заявки; каждое сообщение пишется до отправки,
-- и админка заявок показывает разговор из базы.
--
-- Существующие заявки остаются с пустыми новыми колонками: темы у них нет, и задним числом
-- её никто не заводит.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "candidate_message_author" AS ENUM ('candidate', 'employee', 'bot');

-- CreateEnum
CREATE TYPE "candidate_message_kind" AS ENUM ('text', 'photo', 'video', 'animation', 'voice', 'audio', 'document', 'sticker', 'video_note', 'contact', 'location', 'other');

-- CreateEnum
CREATE TYPE "candidate_message_delivery" AS ENUM ('pending', 'delivered', 'failed', 'refused');

-- CreateEnum
CREATE TYPE "candidate_message_failure" AS ENUM ('no_topic', 'cannot_write', 'telegram_error');

-- AlterTable
ALTER TABLE "candidate_applications" ADD COLUMN     "forum_chat_id" BIGINT,
ADD COLUMN     "forum_topic_id" INTEGER,
ADD COLUMN     "handled_by_employee_id" UUID,
ADD COLUMN     "topic_card_message_id" INTEGER;

-- CreateTable
CREATE TABLE "candidate_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "author" "candidate_message_author" NOT NULL,
    "employee_id" UUID,
    "kind" "candidate_message_kind" NOT NULL,
    "text" TEXT,
    "file_id" TEXT,
    "candidate_message_id" INTEGER,
    "topic_message_id" INTEGER,
    "delivery" "candidate_message_delivery" NOT NULL,
    "failure" "candidate_message_failure",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_messages_application_id_created_at_idx" ON "candidate_messages"("application_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_applications_forum_chat_id_forum_topic_id_key" ON "candidate_applications"("forum_chat_id", "forum_topic_id");

-- AddForeignKey
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_handled_by_employee_id_fkey" FOREIGN KEY ("handled_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "candidate_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичные индексы и проверки.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Telegram повторяет webhook, если ответ не пришёл вовремя. Повтор одного апдейта гасится здесь:
-- сообщение кандидата одно на своё сообщение в личке, сообщение сотрудника — одно на своё
-- сообщение в теме. Вставка, отбитая индексом, — `ON CONFLICT DO NOTHING`, и второй отправки нет.
CREATE UNIQUE INDEX "candidate_messages_candidate_key"
    ON "candidate_messages" ("application_id", "candidate_message_id")
    WHERE "author" = 'candidate';

CREATE UNIQUE INDEX "candidate_messages_employee_key"
    ON "candidate_messages" ("application_id", "topic_message_id")
    WHERE "author" = 'employee';

-- Сотрудник у сообщения — ровно у сообщения сотрудника.
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_employee_check"
    CHECK (("author" = 'employee') = ("employee_id" IS NOT NULL));

-- Причина — ровно у недоставленного: отправка не прошла или бот отказался слать.
ALTER TABLE "candidate_messages" ADD CONSTRAINT "candidate_messages_failure_check"
    CHECK (("delivery" IN ('failed', 'refused')) = ("failure" IS NOT NULL));

COMMENT ON TABLE "candidate_messages" IS
    'Переписка с кандидатом в обе стороны и приветствие бота. Пишется до отправки, исход доставки — после.';

COMMENT ON COLUMN "candidate_applications"."handled_by_employee_id" IS
    'Кто ведёт заявку — сотрудник, ответивший кандидату первым. Приветствие бота ответом не считается.';

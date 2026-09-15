-- Рассылки участникам программы в Telegram: сама рассылка и снимок адресатов на момент
-- запуска с исходом отправки по каждому (issue #136).
--
-- Снимок — отдельная таблица, а не счётчики в строке рассылки: счётчики сходятся с тем,
-- что лежит построчно, повтор задания после рестарта воркера упирается в первичный ключ
-- и условие «ещё pending», а водитель, вступивший в программу во время рассылки, в неё
-- не попадает.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "mailing_status" AS ENUM ('draft', 'running', 'stopped', 'finished');

-- CreateEnum
CREATE TYPE "mailing_recipient_outcome" AS ENUM ('pending', 'sent', 'skipped_disabled', 'invalid_chat', 'failed');

-- CreateTable
CREATE TABLE "mailings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "text_ru" TEXT NOT NULL,
    "text_uz" TEXT,
    "photo_path" TEXT,
    "status" "mailing_status" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mailings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mailing_recipients" (
    "mailing_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "outcome" "mailing_recipient_outcome" NOT NULL,
    "outcome_at" TIMESTAMPTZ(6),
    "message_id" BIGINT,

    CONSTRAINT "mailing_recipients_pkey" PRIMARY KEY ("mailing_id","person_id")
);

-- CreateIndex
CREATE INDEX "mailings_created_at_idx" ON "mailings"("created_at" DESC);

-- CreateIndex
CREATE INDEX "mailing_recipients_mailing_id_outcome_idx" ON "mailing_recipients"("mailing_id", "outcome");

-- CreateIndex
CREATE INDEX "mailing_recipients_person_id_idx" ON "mailing_recipients"("person_id");

-- AddForeignKey
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailing_recipients" ADD CONSTRAINT "mailing_recipients_mailing_id_fkey" FOREIGN KEY ("mailing_id") REFERENCES "mailings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailing_recipients" ADD CONSTRAINT "mailing_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Статус и отметки времени согласованы. Без этой проверки «идёт ли рассылка» начинает
-- зависеть от того, какую колонку прочитали.
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_status_times_check"
    CHECK (
        CASE "status"
            WHEN 'draft' THEN "started_at" IS NULL AND "finished_at" IS NULL
            WHEN 'running' THEN "started_at" IS NOT NULL AND "finished_at" IS NULL
            WHEN 'stopped' THEN "started_at" IS NOT NULL AND "finished_at" IS NOT NULL
            WHEN 'finished' THEN "started_at" IS NOT NULL AND "finished_at" IS NOT NULL
        END
    );

-- Пустой текст — это сообщение, которое Telegram не примет. Узбекский пуст значением NULL,
-- а не пустой строкой: «всем на русском» записывается одним способом.
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_texts_check"
    CHECK (btrim("text_ru") <> '' AND ("text_uz" IS NULL OR btrim("text_uz") <> ''));

-- Время исхода есть ровно у тех, у кого исход уже есть.
ALTER TABLE "mailing_recipients" ADD CONSTRAINT "mailing_recipients_outcome_at_check"
    CHECK (("outcome" = 'pending') = ("outcome_at" IS NULL));

-- `message_id` есть ровно у отправленного. Отправленное без него не отозвать никогда,
-- а идентификатор у неотправленного — запись, которой нечему соответствовать.
ALTER TABLE "mailing_recipients" ADD CONSTRAINT "mailing_recipients_message_id_check"
    CHECK (("outcome" = 'sent') = ("message_id" IS NOT NULL));

COMMENT ON TABLE "mailings" IS
    'Рассылки участникам программы в Telegram. Остановленная не возобновляется — копируется в новый черновик.';

COMMENT ON TABLE "mailing_recipients" IS
    'Снимок адресатов рассылки на момент запуска с исходом отправки. Счётчики экрана считаются отсюда.';

COMMENT ON COLUMN "mailing_recipients"."message_id" IS
    'message_id от Telegram у исхода sent. Удалить сообщение у водителя можно только по нему.';

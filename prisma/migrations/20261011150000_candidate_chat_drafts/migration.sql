-- Заявка кандидата в чате бота (issue #467): вход у метки рекламы и черновик заявки в чате.
--
-- Вход решает, куда ведёт ссылка метки: в Mini App (`?startapp=`) или в чат бота (`?start=`).
-- Выбирается только у рекламы в Telegram; уже заведённые метки рекламы получают `miniapp` —
-- так они и работали, — остальные метки — `bot`.
--
-- Черновик держит ход диалога «номер кнопкой, имя текстом» до заявки, а каждое сообщение
-- кандидата в незаконченном черновике пишется рядом: менеджер увидит, где человек остановился.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "promo_entry" AS ENUM ('miniapp', 'bot');

-- CreateEnum
CREATE TYPE "candidate_draft_step" AS ENUM ('awaiting_contact', 'awaiting_name');

-- AlterTable
ALTER TABLE "promo_links" ADD COLUMN     "entry" "promo_entry" NOT NULL DEFAULT 'bot';

-- CreateTable
CREATE TABLE "candidate_chat_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" BIGINT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_name" TEXT NOT NULL,
    "telegram_username" TEXT,
    "promo_code" TEXT NOT NULL,
    "language" "language" NOT NULL,
    "step" "candidate_draft_step" NOT NULL,
    "phone_raw" TEXT,
    "phone_e164" TEXT,
    "application_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_chat_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_draft_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "draft_id" UUID NOT NULL,
    "kind" "candidate_message_kind" NOT NULL,
    "text" TEXT,
    "file_id" TEXT,
    "candidate_message_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_draft_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidate_draft_messages_draft_id_candidate_message_id_key" ON "candidate_draft_messages"("draft_id", "candidate_message_id");

-- AddForeignKey
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "candidate_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_draft_messages" ADD CONSTRAINT "candidate_draft_messages_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "candidate_chat_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: перенос данных, частичные индексы
-- и проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Метки рекламы, заведённые до выбора входа, вели в Mini App — вход у них тот же.
UPDATE "promo_links" SET "entry" = 'miniapp' WHERE "medium" = 'telegram_ad';

-- Вход в приложение — только у рекламы в Telegram: остальные носители ведут в чат бота.
ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_entry_check"
    CHECK ("medium" = 'telegram_ad' OR "entry" = 'bot');

-- Незаконченный черновик — один на Telegram: `/start` по метке начинает его заново той же
-- строкой (`ON CONFLICT … DO UPDATE`), а не заводит второй.
CREATE UNIQUE INDEX "candidate_chat_drafts_open_key"
    ON "candidate_chat_drafts" ("telegram_user_id")
    WHERE "application_id" IS NULL;

-- Номер — ровно на шаге имени: он туда и переводит. `/start` заново номер стирает.
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_phone_check"
    CHECK (
        ("step" = 'awaiting_name') = ("phone_raw" IS NOT NULL)
        AND ("step" = 'awaiting_name') = ("phone_e164" IS NOT NULL)
    );

-- Номер черновика — узбекский в каноническом виде, как у заявки.
ALTER TABLE "candidate_chat_drafts" ADD CONSTRAINT "candidate_chat_drafts_phone_e164_check"
    CHECK ("phone_e164" ~ '^\+998[0-9]{9}$');

COMMENT ON TABLE "candidate_chat_drafts" IS
    'Ход заявки кандидата в чате бота: шаг, номер и метка. Пустая заявка — черновик не закончен.';

COMMENT ON TABLE "candidate_draft_messages" IS
    'Сообщения кандидата в незаконченном черновике заявки, кроме /start.';

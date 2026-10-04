-- Переходы по промо-меткам (issue #377): строка на каждый `/start p_<код>`.
--
-- Пишется каждое касание, а не первое, и касание участника программы тоже — с признаком,
-- что он уже был участником. Уникальности нет: повторное нажатие того же QR — своя строка.
-- Справочника меток нет — код пишется как пришёл; справочник появится с разделом «Промо».
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "promo_touches" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "person_id" UUID,
    "was_participant" BOOLEAN NOT NULL,
    "touched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_touches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promo_touches_code_touched_at_idx" ON "promo_touches"("code", "touched_at");

-- CreateIndex
CREATE INDEX "promo_touches_telegram_user_id_touched_at_idx" ON "promo_touches"("telegram_user_id", "touched_at");

-- AddForeignKey
ALTER TABLE "promo_touches" ADD CONSTRAINT "promo_touches_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMENT ON TABLE "promo_touches" IS
    'Переход по промо-метке: строка на каждый /start p_<код>. Каждое касание, включая повторные и касания участников программы.';

COMMENT ON COLUMN "promo_touches"."person_id" IS
    'Человек с живой привязкой этого Telegram на момент касания. Привязка ищется по telegram_user_id, у привязок без него — по telegram_chat_id.';

COMMENT ON COLUMN "promo_touches"."was_participant" IS
    'У этого Telegram на момент касания была хоть одна привязка, живая или закрытая.';

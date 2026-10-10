-- Заявка кандидата (issue #456): человек, которого в программе нет, приходит из рекламы в Telegram
-- по ссылке Mini App с промо-меткой и оставляет имя и номер. С ней — носитель «Реклама в Telegram»
-- и касание метки из Mini App.
--
-- Значение `promo_medium.telegram_ad` добавляется здесь же, а значение, добавленное
-- `ALTER TYPE … ADD VALUE`, нельзя использовать в той же транзакции. Ниже оно и не используется.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "promo_touch_channel" AS ENUM ('bot', 'miniapp');

-- CreateEnum
CREATE TYPE "candidate_application_status" AS ENUM ('new', 'in_progress', 'hired', 'rejected');

-- CreateEnum
CREATE TYPE "candidate_application_channel" AS ENUM ('miniapp', 'bot');

-- CreateEnum
CREATE TYPE "candidate_phone_source" AS ENUM ('telegram_contact', 'manual');

-- CreateEnum
CREATE TYPE "candidate_match" AS ENUM ('not_in_park', 'not_in_registry', 'working', 'former', 'no_trips', 'lookup_failed');

-- AlterEnum
ALTER TYPE "promo_medium" ADD VALUE 'telegram_ad' BEFORE 'other';

-- AlterTable
ALTER TABLE "promo_touches" ADD COLUMN     "channel" "promo_touch_channel" NOT NULL DEFAULT 'bot',
ADD COLUMN     "launched_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "candidate_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "status" "candidate_application_status" NOT NULL DEFAULT 'new',
    "channel" "candidate_application_channel" NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_name" TEXT NOT NULL,
    "telegram_username" TEXT,
    "name" TEXT NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "phone_source" "candidate_phone_source" NOT NULL,
    "write_allowed" BOOLEAN NOT NULL,
    "language" "language" NOT NULL,
    "promo_code" TEXT NOT NULL,
    "match" "candidate_match" NOT NULL,
    "matched_person_id" UUID,
    "matched_profile_id" TEXT,
    "last_trip_day" DATE,
    "former_link_person_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_applications_created_at_idx" ON "candidate_applications"("created_at");

-- AddForeignKey
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_matched_person_id_fkey" FOREIGN KEY ("matched_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_matched_profile_id_fkey" FOREIGN KEY ("matched_profile_id") REFERENCES "park_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_former_link_person_id_fkey" FOREIGN KEY ("former_link_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичные индексы и проверки.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Касание из Mini App — одно на запуск приложения: запуск узнаётся по `auth_date` подписанной
-- `initData`, а приложение за запуск перечитывает состояние много раз. Касание из бота —
-- как раньше, строка на каждый `/start`, поэтому индекс частичный.
CREATE UNIQUE INDEX "promo_touches_miniapp_launch_key"
    ON "promo_touches" ("telegram_user_id", "code", "launched_at")
    WHERE "channel" = 'miniapp';

-- Время запуска есть ровно у касания из Mini App.
ALTER TABLE "promo_touches" ADD CONSTRAINT "promo_touches_launched_at_check"
    CHECK (("channel" = 'miniapp') = ("launched_at" IS NOT NULL));

-- Открытая заявка — «Новая» или «В работе» — одна на Telegram.
CREATE UNIQUE INDEX "candidate_applications_open_telegram_key"
    ON "candidate_applications" ("telegram_user_id")
    WHERE "status" IN ('new', 'in_progress');

-- И одна на номер, подтверждённый Telegram. Номер, введённый руками, не подтверждён ничем
-- и чужую заявку не закрывает.
CREATE UNIQUE INDEX "candidate_applications_open_phone_key"
    ON "candidate_applications" ("phone_e164")
    WHERE "status" IN ('new', 'in_progress') AND "phone_source" = 'telegram_contact';

-- Те же правила, что проверяет сервис (`shared/candidateApplications.ts`, `shared/phone.ts`):
-- имя обрезано по краям, от 1 до 60 знаков; номер — узбекский в каноническом виде.
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_name_check"
    CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 60);

ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_phone_e164_check"
    CHECK ("phone_e164" ~ '^\+998[0-9]{9}$');

-- Найденный человек и профиль — у тех итогов сверки, где профиль нашёлся, и только у них;
-- последние сутки с поездкой — у работающего и работавшего раньше.
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_match_check"
    CHECK (
        CASE
            WHEN "match" IN ('working', 'former') THEN
                    "matched_person_id" IS NOT NULL
                AND "matched_profile_id" IS NOT NULL
                AND "last_trip_day" IS NOT NULL
            WHEN "match" = 'no_trips' THEN
                    "matched_person_id" IS NOT NULL
                AND "matched_profile_id" IS NOT NULL
                AND "last_trip_day" IS NULL
            ELSE
                    "matched_person_id" IS NULL
                AND "matched_profile_id" IS NULL
                AND "last_trip_day" IS NULL
        END
    );

COMMENT ON TABLE "candidate_applications" IS
    'Заявка кандидата: имя и номер человека, которого в программе нет. Не создаёт водителя, привязки Telegram и участия.';

COMMENT ON COLUMN "candidate_applications"."former_link_person_id" IS
    'Человек последней закрытой привязки этого Telegram. Пусто — Telegram в программе не был.';

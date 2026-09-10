-- Регистрация водителя в боте: журнал попыток привязки и точечный прогон реестра.
--
-- `telegram_link_attempts` — журнал того, чем кончилась каждая попытка привязать Telegram,
-- включая удачные. Отказ без записи неотличим от «водитель не приходил», а два числа —
-- доля автопривязок и доля дошедших до бота — решают, работает ли довод «зарегистрируйся»
-- при обзвоне парка. У старого бота этой таблицы не было вовсе: отказ уходил в лог строкой
-- и исчезал вместе с ротацией.
--
-- Ключ — bigint identity, а не uuid: на журнальную таблицу никто не ссылается, ровно как
-- на `point_entries` и `sync_skips`. Внешних ключей на профиль и человека тоже нет
-- намеренно — это запись о том, что мы видели в момент попытки, и она обязана уцелеть
-- даже когда профиль в реестр так и не завёлся.
--
-- Два индекса отвечают на два разных вопроса: по чату — «что было с этим человеком»,
-- по паре `(outcome, created_at)` — «сколько отказов какого вида за период».
--
-- `link_attempt_outcome` — наш словарь и меняется нашей же миграцией, в отличие
-- от значений Fleet API, которые лежат текстом (docs/decisions.md).
--
-- `registry_profile` — вид прогона синхронизации, а не флаг у `registry`: точечный прогон
-- видел один профиль, а не окно, и **отметку синхронизации не двигает вовсе**. Сдвиг
-- отметки после него потерял бы всех остальных, кто изменился за то же время, — а
-- `registry_full` для этого не годится ровно потому, что отметку `registry` он двигает.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "link_attempt_outcome" AS ENUM ('linked', 'contact_not_own', 'not_in_registry', 'not_in_park', 'profile_fired', 'several_profiles', 'person_already_linked', 'telegram_already_linked', 'park_api_unavailable');

-- AlterEnum
ALTER TYPE "sync_kind" ADD VALUE 'registry_profile';

-- CreateTable
CREATE TABLE "telegram_link_attempts" (
    "id" BIGSERIAL NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT,
    "phone_raw" TEXT NOT NULL,
    "phone_e164" TEXT,
    "outcome" "link_attempt_outcome" NOT NULL,
    "profile_id" TEXT,
    "person_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_link_attempts_telegram_chat_id_idx" ON "telegram_link_attempts"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "telegram_link_attempts_outcome_created_at_idx" ON "telegram_link_attempts"("outcome", "created_at");

COMMENT ON TABLE "telegram_link_attempts" IS
    'Попытки привязать Telegram — все, включая удачные. Журнал без внешних ключей: запись о том, что мы видели в момент попытки.';

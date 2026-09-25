-- Лог устройств Mini App (issue #223): с чего человек открывал приложение и прошёл ли его
-- браузер проверку движка. Строка — на сочетание Telegram-аккаунта и строки браузера.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "client_platform" AS ENUM ('android', 'ios', 'desktop', 'other');

-- CreateTable
CREATE TABLE "client_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "telegram_user_id" BIGINT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "platform" "client_platform" NOT NULL,
    "os_version" TEXT,
    "engine_version" INTEGER,
    "bot_api_version" TEXT,
    "engine_ok" BOOLEAN NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "visits" INTEGER NOT NULL,

    CONSTRAINT "client_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_devices_telegram_user_id_idx" ON "client_devices"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_devices_telegram_user_id_user_agent_key" ON "client_devices"("telegram_user_id", "user_agent");

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Строка появляется первым входом, поэтому входов не меньше одного.
ALTER TABLE "client_devices"
  ADD CONSTRAINT "client_devices_visits_positive" CHECK ("visits" >= 1);

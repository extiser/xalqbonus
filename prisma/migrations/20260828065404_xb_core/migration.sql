-- Схема ядра XalqBonus. Наши таблицы живут только в `xb`; схема `public` принадлежит
-- старому боту, читается и не изменяется ничем и никогда (CLAUDE.md → «Важные ограничения»).
CREATE SCHEMA IF NOT EXISTS "xb";

-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения,
-- который выставляет по `?schema=xb`. Ставим его здесь явно: миграция не должна уехать
-- в `public` ни при каких условиях, включая прогон соединением с дефолтным путём поиска.
SET search_path TO "xb";

-- ---------------------------------------------------------------------------
-- Откуда берутся данные при переносе из `public` (сам перенос — следующий issue)
-- ---------------------------------------------------------------------------
--
--  сущность                       | источник
--  -------------------------------|-------------------------------------------------------
--  persons                        | по одному на человека из реестра парка; двойники старой
--                                 | базы дают одного
--  person_licenses                | `driver_license` из реестра; номер из `public."Drivers"` —
--                                 | закрытой строкой истории, если разошёлся
--  park_profiles                  | реестр парка целиком, все 25 390
--  profile_phones                 | `driver_profile.phones` из реестра
--  profile_status_events          | первая запись на профиль со `status_from IS NULL`
--  telegram_links                 | `public."Drivers".chat_id` — 4 091 годная привязка из 4 099
--  person_settings                | `language` и `createdAt` из `public."Drivers"`; только для
--                                 | перенесённых из старой базы
--  accounts                       | водительский счёт на каждого человека с настройками;
--                                 | три системных — сидом в этой миграции
--  point_transfers / point_entries| одна операция `opening` на человека, `emission` → водитель,
--                                 | сумма 9 105 694 на 4 049 положительных балансов
--  trips / trip_events /          | только Fleet API. 1.19 млн старых поездок не переносятся:
--  trip_route_points              | 20% зависли в промежуточном статусе, 59 812 дублируются
--  legacy_driver_map              | по строке на каждую из 4 099 записей `public."Drivers"`
--
-- Краевые случаи переноса разобраны в _reference/legacy/public-schema-2026-08-27.md:
-- ключ сопоставления — `Drivers.profile_id` (4 098 из 4 099), тестовый аккаунт один
-- (id 76184, `profile_id` длиной 31 символ, в реестре отсутствует), двойников двенадцать
-- пар (восемь по общему `profile_id`, четыре — только по номеру ВУ), семь `chat_id`
-- непригодны, семь `NULL` в `points` переносятся как ноль.

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('driver', 'emission', 'redemption', 'raffle_bank');

-- CreateEnum
CREATE TYPE "point_reason" AS ENUM ('opening', 'trip', 'welcome', 'order_spend', 'order_refund', 'manual', 'recon', 'expire', 'merge', 'raffle');

-- CreateEnum
CREATE TYPE "link_close_reason" AS ENUM ('rebind', 'merge', 'operator', 'invalid_chat');

-- CreateEnum
CREATE TYPE "link_confirmed_by" AS ENUM ('phone_auto', 'operator', 'driver_reply');

-- CreateEnum
CREATE TYPE "language" AS ENUM ('ru', 'uz');

-- CreateEnum
CREATE TYPE "sync_kind" AS ENUM ('registry', 'orders', 'orders_catchup');

-- CreateEnum
CREATE TYPE "sync_status" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "match_method" AS ENUM ('profile_id', 'license', 'none');

-- CreateEnum
CREATE TYPE "legacy_telegram_status" AS ENUM ('linked', 'invalid_chat', 'pending_confirmation', 'skipped');

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_licenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "number_raw" TEXT NOT NULL,
    "number_canonical" TEXT NOT NULL,
    "country" TEXT,
    "issue_date" DATE,
    "expiration_date" DATE,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "source" TEXT NOT NULL,

    CONSTRAINT "person_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "park_profiles" (
    "profile_id" TEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "park_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "work_status" TEXT NOT NULL,
    "employment_type" TEXT NOT NULL,
    "is_selfemployed" BOOLEAN NOT NULL,
    "work_rule_id" TEXT NOT NULL,
    "work_rule_name" TEXT,
    "hire_date" DATE,
    "fire_date" DATE,
    "current_status" TEXT NOT NULL,
    "current_status_updated_at" TIMESTAMPTZ(6),
    "callsign" TEXT,
    "car_id" TEXT,
    "car_number" TEXT,
    "car_brand_model" TEXT,
    "api_created_at" TIMESTAMPTZ(6) NOT NULL,
    "api_modified_at" TIMESTAMPTZ(6) NOT NULL,
    "api_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "park_profiles_pkey" PRIMARY KEY ("profile_id")
);

-- CreateTable
CREATE TABLE "profile_phones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" TEXT NOT NULL,
    "phone_raw" TEXT NOT NULL,
    "phone_e164" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "profile_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_status_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id" TEXT NOT NULL,
    "status_from" TEXT,
    "status_to" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sync_run_id" UUID,

    CONSTRAINT "profile_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_id" UUID NOT NULL,
    "telegram_chat_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT,
    "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" "link_close_reason",
    "confirmed_by" "link_confirmed_by" NOT NULL,
    "operator_ref" TEXT,

    CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_settings" (
    "person_id" UUID NOT NULL,
    "language" "language" NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_source" TEXT NOT NULL,

    CONSTRAINT "person_settings_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "account_type" NOT NULL,
    "person_id" UUID,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reason" "point_reason" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trip_order_id" TEXT,
    "legacy_order_id" INTEGER,
    "actor" TEXT,
    "note" TEXT,

    CONSTRAINT "point_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_entries" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "transfer_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "delta" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" TEXT NOT NULL,
    "short_id" INTEGER,
    "profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "order_type_id" TEXT,
    "order_type_name" TEXT,
    "work_rule_id" TEXT,
    "booked_at" TIMESTAMPTZ(6) NOT NULL,
    "api_created_at" TIMESTAMPTZ(6) NOT NULL,
    "driving_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "price" DECIMAL(12,2) NOT NULL,
    "mileage" DECIMAL(12,2),
    "car_id" TEXT NOT NULL,
    "car_callsign" TEXT,
    "car_license_number" TEXT NOT NULL,
    "car_brand_model" TEXT NOT NULL,
    "address_from_text" TEXT NOT NULL,
    "address_from_lat" DOUBLE PRECISION NOT NULL,
    "address_from_lon" DOUBLE PRECISION NOT NULL,
    "cancellation_description" TEXT,
    "flags" TEXT[],
    "amenities" TEXT[],
    "sync_run_id" UUID,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_events" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "trip_id" UUID NOT NULL,
    "order_status" TEXT NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trip_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_route_points" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY,
    "trip_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "trip_route_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "sync_kind" NOT NULL,
    "status" "sync_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "window_from" TIMESTAMPTZ(6),
    "window_to" TIMESTAMPTZ(6),
    "requests" INTEGER NOT NULL DEFAULT 0,
    "rate_limited" INTEGER NOT NULL DEFAULT 0,
    "items_seen" INTEGER NOT NULL DEFAULT 0,
    "items_written" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "kind" "sync_kind" NOT NULL,
    "watermark" TIMESTAMPTZ(6),
    "last_run_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "legacy_driver_map" (
    "legacy_driver_id" INTEGER NOT NULL,
    "profile_id" TEXT,
    "person_id" UUID,
    "match_method" "match_method" NOT NULL,
    "merged_into_legacy_driver_id" INTEGER,
    "telegram_status" "legacy_telegram_status" NOT NULL,
    "legacy_points" INTEGER NOT NULL,
    "note" TEXT,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_driver_map_pkey" PRIMARY KEY ("legacy_driver_id")
);

-- CreateIndex
CREATE INDEX "person_licenses_person_id_idx" ON "person_licenses"("person_id");

-- CreateIndex
CREATE INDEX "person_licenses_number_canonical_idx" ON "person_licenses"("number_canonical");

-- CreateIndex
CREATE INDEX "park_profiles_person_id_idx" ON "park_profiles"("person_id");

-- CreateIndex
CREATE INDEX "park_profiles_api_updated_at_idx" ON "park_profiles"("api_updated_at");

-- CreateIndex
CREATE INDEX "park_profiles_work_status_idx" ON "park_profiles"("work_status");

-- CreateIndex
CREATE INDEX "park_profiles_callsign_idx" ON "park_profiles"("callsign");

-- CreateIndex
CREATE INDEX "park_profiles_car_number_idx" ON "park_profiles"("car_number");

-- CreateIndex
CREATE INDEX "profile_phones_profile_id_idx" ON "profile_phones"("profile_id");

-- CreateIndex
CREATE INDEX "profile_status_events_profile_id_observed_at_idx" ON "profile_status_events"("profile_id", "observed_at");

-- CreateIndex
CREATE INDEX "telegram_links_person_id_idx" ON "telegram_links"("person_id");

-- CreateIndex
CREATE INDEX "telegram_links_telegram_chat_id_idx" ON "telegram_links"("telegram_chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_transfers_idempotency_key_key" ON "point_transfers"("idempotency_key");

-- CreateIndex
CREATE INDEX "point_transfers_reason_occurred_at_idx" ON "point_transfers"("reason", "occurred_at");

-- CreateIndex
CREATE INDEX "point_entries_account_id_id_idx" ON "point_entries"("account_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "point_entries_transfer_id_account_id_key" ON "point_entries"("transfer_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "trips_order_id_key" ON "trips"("order_id");

-- CreateIndex
CREATE INDEX "trips_profile_id_ended_at_idx" ON "trips"("profile_id", "ended_at");

-- CreateIndex
CREATE INDEX "trips_ended_at_idx" ON "trips"("ended_at");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trip_events_trip_id_event_at_idx" ON "trip_events"("trip_id", "event_at");

-- CreateIndex
CREATE UNIQUE INDEX "trip_events_trip_id_order_status_event_at_key" ON "trip_events"("trip_id", "order_status", "event_at");

-- CreateIndex
CREATE UNIQUE INDEX "trip_route_points_trip_id_seq_key" ON "trip_route_points"("trip_id", "seq");

-- CreateIndex
CREATE INDEX "sync_runs_kind_started_at_idx" ON "sync_runs"("kind", "started_at" DESC);

-- CreateIndex
CREATE INDEX "legacy_driver_map_person_id_idx" ON "legacy_driver_map"("person_id");

-- CreateIndex
CREATE INDEX "legacy_driver_map_profile_id_idx" ON "legacy_driver_map"("profile_id");

-- AddForeignKey
ALTER TABLE "person_licenses" ADD CONSTRAINT "person_licenses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "park_profiles" ADD CONSTRAINT "park_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_phones" ADD CONSTRAINT "profile_phones_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "park_profiles"("profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_status_events" ADD CONSTRAINT "profile_status_events_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "park_profiles"("profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_status_events" ADD CONSTRAINT "profile_status_events_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_settings" ADD CONSTRAINT "person_settings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "point_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "park_profiles"("profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_route_points" ADD CONSTRAINT "trip_route_points_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_last_run_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_driver_map" ADD CONSTRAINT "legacy_driver_map_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "park_profiles"("profile_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_driver_map" ADD CONSTRAINT "legacy_driver_map_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичные уникальные индексы,
-- проверки, сид системных счетов и комментарии к таблицам. Меняется руками.
-- ---------------------------------------------------------------------------

-- Одно активное водительское удостоверение на человека.
CREATE UNIQUE INDEX "person_licenses_active_person_key"
    ON "person_licenses" ("person_id") WHERE "closed_at" IS NULL;

-- Один активный номер принадлежит одному человеку. Закрытые строки истории
-- ограничением не связаны: номер перевыпускается и переходит между написаниями.
CREATE UNIQUE INDEX "person_licenses_active_number_key"
    ON "person_licenses" ("number_canonical") WHERE "closed_at" IS NULL;

-- В API телефоны приходят массивом: сегодня двух ни у кого нет, но структура это допускает.
CREATE UNIQUE INDEX "profile_phones_active_raw_key"
    ON "profile_phones" ("profile_id", "phone_raw") WHERE "closed_at" IS NULL;

-- По этому индексу идёт автопривязка Telegram по подтверждённому телефону.
CREATE INDEX "profile_phones_active_e164_idx"
    ON "profile_phones" ("phone_e164") WHERE "closed_at" IS NULL;

-- Одна активная привязка на человека и один активный Telegram на человека.
-- Проверка отправителя контакта остаётся в коде, но она — последняя линия, а не
-- единственная: даже если её сломают рефакторингом, вторую привязку база не пропустит
-- (docs/drivers.md → «Одна привязка на человека — ограничением, а не проверкой»).
CREATE UNIQUE INDEX "telegram_links_active_person_key"
    ON "telegram_links" ("person_id") WHERE "closed_at" IS NULL;

CREATE UNIQUE INDEX "telegram_links_active_chat_key"
    ON "telegram_links" ("telegram_chat_id") WHERE "closed_at" IS NULL;

-- Один водительский счёт на человека и один системный счёт каждого типа.
CREATE UNIQUE INDEX "accounts_driver_person_key"
    ON "accounts" ("person_id") WHERE "type" = 'driver';

CREATE UNIQUE INDEX "accounts_system_type_key"
    ON "accounts" ("type") WHERE "type" <> 'driver';

-- Водительский счёт принадлежит человеку, системный не принадлежит никому.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_driver_has_person_check"
    CHECK (("type" = 'driver') = ("person_id" IS NOT NULL));

-- Водительский счёт не уходит в минус. Эмиссионный уходит глубоко, и это норма:
-- его отрицательный баланс и есть объём выданных баллов.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_driver_balance_check"
    CHECK ("type" <> 'driver' OR "balance" >= 0);

-- Перевод всегда положителен и всегда между двумя разными счетами: направление
-- задаётся парой счетов, а не знаком суммы.
ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_amount_check"
    CHECK ("amount" > 0);

ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_accounts_differ_check"
    CHECK ("from_account_id" <> "to_account_id");

-- Нулевая запись журнала не выражает ничего и только мешает сверке.
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_delta_check"
    CHECK ("delta" <> 0);

-- Сид системных счетов. Заводятся миграцией, а не кодом: без них журнал не может
-- записать ни одной операции, а код, который «создаёт счёт, если его нет», —
-- это второе место, где счёт может появиться.
-- `raffle_bank` заводится сразу, хотя розыгрыш ещё не спроектирован: счёт без операций
-- ничего не стоит, а сгорание баллов уже упирается в него.
INSERT INTO "accounts" ("type") VALUES ('emission'), ('redemption'), ('raffle_bank')
    ON CONFLICT DO NOTHING;

COMMENT ON TABLE "persons" IS
    'Человек. Баланс баллов принадлежит ему, а не учётке в парке и не мессенджеру.';

COMMENT ON TABLE "person_licenses" IS
    'Журнал водительских удостоверений. Канонический номер живёт только здесь, одной активной строкой: дубля в записи человека нет намеренно.';

COMMENT ON COLUMN "person_licenses"."number_canonical" IS
    'Наша нормализация (server/utils/licenseNumber.ts). normalized_number из Fleet API не используется: он побайтово равен number у всех 25 390 профилей.';

COMMENT ON TABLE "person_settings" IS
    'Участие в программе. Наличие строки и есть граница «известен парку / в программе»: реестр парка живёт без неё.';

COMMENT ON TABLE "telegram_links" IS
    'Журнал привязок Telegram. Строки не удаляются и не правятся на месте: перепривязка — закрытие прежней строки и новая рядом.';

COMMENT ON TABLE "accounts" IS
    'Счета. balance — кэш журнала, а не значение: меняется только вместе с записью в point_entries, в одной транзакции.';

COMMENT ON TABLE "point_transfers" IS
    'Перевод между двумя счетами. Ключ идемпотентности — по схеме из docs/points.md; новых схем ключа не бывает без правки документа.';

COMMENT ON TABLE "point_entries" IS
    'Записи журнала. На перевод приходится ровно две строки, их сумма ноль — ограничением базы это не выражается, проверяется scripts/invariants.sql.';

COMMENT ON TABLE "trips" IS
    'Заказы из Fleet API. Наполняется только тем, что пришло из API: 1.19 млн старых поездок не переносятся.';

COMMENT ON COLUMN "trips"."order_id" IS
    'Идентификатор заказа в Fleet API. Уникальность здесь — то самое ограничение, отсутствие которого в старой базе дало 59 812 лишних строк и 4 877 повторно засчитанных поездок.';

COMMENT ON TABLE "sync_state" IS
    'Отметка синхронизации. Двигается ТОЛЬКО после успешного прогона. Её сдвиг при неуспехе породил в старом боте счётчик дней простоя и скрыл отказы по лимиту: пропущенное окно больше никогда не перечитывалось.';

COMMENT ON TABLE "legacy_driver_map" IS
    'Соответствие записи старой базы новой сущности. Создаётся этой миграцией, наполняется скриптом переноса: без неё перенос не идемпотентен.';

-- Граница со старым ботом — по засчитанным заказам (issue #274).
--
-- Баланс переносится одной операцией `opening`, и в нём уже лежат все баллы старого бота
-- за поездки. Первый догоняющий прогон сборщика берёт неделю назад, а ключ `trip:<order_id>`
-- знает только наш журнал: без границы неделя поездок начислилась бы второй раз.
--
-- `legacy_awarded_trips` наполняется шагом переноса из `public."Trips"` (`status = 'complete'`
-- за 14 дней), начисление такие заказы пропускает. Внешнего ключа на `trips` нет: заказа
-- там может ещё не быть, когда таблица наполняется.
--
-- `sync_run_orders.awarded_by_legacy` — сколько заказов прогон пропустил по этой причине.
-- Ноль у прошедших прогонов — правда: границы тогда не было.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

CREATE TABLE "legacy_awarded_trips" (
    "order_id" TEXT NOT NULL,
    "legacy_driver_id" INTEGER NOT NULL,
    "booked_at" TIMESTAMPTZ(6) NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_awarded_trips_pkey" PRIMARY KEY ("order_id")
);

ALTER TABLE "sync_run_orders" ADD COLUMN "awarded_by_legacy" INTEGER NOT NULL DEFAULT 0;

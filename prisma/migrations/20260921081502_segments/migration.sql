-- Сегменты водителей: сохранённые условия отбора, а не список людей (issue #165).
--
-- Состав берётся запросом в тот момент, когда понадобился, — поэтому колонок с людьми здесь
-- нет ни в каком виде, в том числе кэшем. Условия лежат явными колонками, а не `jsonb`:
-- колонка с разнородным содержимым не проверяется ни типом, ни запросом.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "segments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "days_since_trip_min" INTEGER,
    "days_since_trip_max" INTEGER,
    "program_member" BOOLEAN,
    "telegram_linked" BOOLEAN,
    "balance_min" BIGINT,
    "balance_max" BIGINT,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Сегмент без единого условия — это весь реестр парка под видом среза, и однажды по нему
-- уйдёт рассылка на двадцать пять тысяч человек. Держит это база, а не форма: форма —
-- не единственный путь записи.
ALTER TABLE "segments" ADD CONSTRAINT "segments_has_condition_check"
    CHECK (
        "days_since_trip_min" IS NOT NULL
        OR "days_since_trip_max" IS NOT NULL
        OR "program_member" IS NOT NULL
        OR "telegram_linked" IS NOT NULL
        OR "balance_min" IS NOT NULL
        OR "balance_max" IS NOT NULL
    );

-- Границы давности: неотрицательны, нижняя не выше верхней. Перевёрнутые границы дали бы
-- пустой состав, который выглядит как «таких водителей нет».
ALTER TABLE "segments" ADD CONSTRAINT "segments_days_since_trip_check"
    CHECK (
        ("days_since_trip_min" IS NULL OR "days_since_trip_min" >= 0)
        AND ("days_since_trip_max" IS NULL OR "days_since_trip_max" >= 0)
        AND ("days_since_trip_min" IS NULL OR "days_since_trip_max" IS NULL
             OR "days_since_trip_min" <= "days_since_trip_max")
    );

-- Границы баланса: нижняя не выше верхней. Знак не ограничивается — водительский счёт
-- в минус не уходит и без этого (`accounts`), а граница ниже нуля просто ничего не отсекает.
ALTER TABLE "segments" ADD CONSTRAINT "segments_balance_check"
    CHECK ("balance_min" IS NULL OR "balance_max" IS NULL OR "balance_min" <= "balance_max");

-- Пустое имя — строка списка, по которой сегмент не выбрать.
ALTER TABLE "segments" ADD CONSTRAINT "segments_name_check"
    CHECK (btrim("name") <> '');

COMMENT ON TABLE "segments" IS
    'Сегменты водителей: условия отбора, склейка «и». Состав считается запросом на момент обращения и здесь не хранится.';

COMMENT ON COLUMN "segments"."days_since_trip_min" IS
    'Сутки парка (с 05:00 по Ташкенту) с последней завершённой поездки — не меньше. Без поездок человек не подходит.';

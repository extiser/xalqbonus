-- Расходы парка на найм — плитка «Окупается ли найм» на «Глубине» (issue #445).
--
-- `dashboard_hire_costs` — сумма за один месяц: за закрытый — по факту, на идущий — бюджет. Сумма
-- месяца — только его строка, на другие месяцы она не действует. Месяц — первое число, сумма —
-- больше нуля: держит база, а не только ручка.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "dashboard_hire_costs" (
    "month" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "updated_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_hire_costs_pkey" PRIMARY KEY ("month"),
    CONSTRAINT "dashboard_hire_costs_month_check" CHECK (extract(day FROM "month") = 1),
    CONSTRAINT "dashboard_hire_costs_amount_check" CHECK ("amount" > 0)
);

-- AddForeignKey
ALTER TABLE "dashboard_hire_costs" ADD CONSTRAINT "dashboard_hire_costs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

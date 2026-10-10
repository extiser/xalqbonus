-- Отмена ждущей награды сотрудником (issue #270): товар и произвольная в офисе (`awaiting`)
-- и незабранный подарок (`claimable`) уходят в `cancelled`, помня, кто и когда отменил.
--
-- Значение `reward_status.cancelled` добавляется здесь же, а значение, добавленное
-- `ALTER TYPE … ADD VALUE`, нельзя использовать в той же транзакции. Поэтому проверки ниже
-- сравнивают статус текстом (`"status"::text`), как в миграции подарков.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterEnum
ALTER TYPE "reward_status" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "rewards" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by_employee_id" UUID;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_cancelled_by_employee_id_fkey" FOREIGN KEY ("cancelled_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Вид согласован с полями. Отменяется только ждущее: подарок-баллы из `claimable`, товар
-- и произвольная из `awaiting`. Обычные баллы зачисляются сразу и отменённых не знают.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_kind_fields_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_kind_fields_check"
    CHECK (
        CASE "kind"
            WHEN 'points' THEN
                    "points" > 0
                AND "product_id" IS NULL
                AND "office_id" IS NULL
                AND "code" IS NULL
                AND (
                        (    "gift_grant_id" IS NULL
                         AND "expires_at" IS NULL
                         AND "status"::text = 'credited')
                     OR (    "gift_grant_id" IS NOT NULL
                         AND "expires_at" IS NOT NULL
                         AND "status"::text IN ('claimable', 'credited', 'cancelled'))
                    )
            WHEN 'product' THEN
                    "points" IS NULL
                AND "product_id" IS NOT NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "gift_grant_id" IS NULL
                AND "status"::text IN ('awaiting', 'issued', 'expired', 'cancelled')
            WHEN 'custom' THEN
                    "points" IS NULL
                AND "product_id" IS NULL
                AND "office_id" IS NOT NULL
                AND "code" IS NOT NULL
                AND "expires_at" IS NOT NULL
                AND "gift_grant_id" IS NULL
                AND "status"::text IN ('awaiting', 'issued', 'expired', 'cancelled')
        END
    );

-- Статус согласован с отметками. Отменённая помнит момент отмены и не несёт отметок выдачи,
-- сгорания и зачисления; у всех прочих отметок отмены нет. Отменившего может не остаться:
-- удалённый сотрудник обнуляет ссылку, как у выдавшего.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_status_fields_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_status_fields_check"
    CHECK (
        CASE "status"::text
            WHEN 'credited' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND ("claimed_at" IS NULL) = ("gift_grant_id" IS NULL)
                AND ("claim_mode" IS NULL) = ("gift_grant_id" IS NULL)
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            WHEN 'claimable' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            WHEN 'awaiting' THEN
                    "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            WHEN 'issued' THEN
                    "issued_at" IS NOT NULL AND "issued_by_employee_id" IS NOT NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            WHEN 'expired' THEN
                    "expired_at" IS NOT NULL AND "issued_at" IS NULL AND "issued_by_employee_id" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
                AND "cancelled_at" IS NULL AND "cancelled_by_employee_id" IS NULL
            WHEN 'cancelled' THEN
                    "cancelled_at" IS NOT NULL
                AND "issued_at" IS NULL AND "issued_by_employee_id" IS NULL AND "expired_at" IS NULL
                AND "claimed_at" IS NULL AND "claim_mode" IS NULL
        END
    );

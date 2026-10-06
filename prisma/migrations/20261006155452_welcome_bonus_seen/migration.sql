-- Отметка «Спасибо нажато» на слайде выданного приветственного бонуса (issue #421).
--
-- Тем, кто получил бонус до выката, праздник не показывается: отметка ставится им сразу,
-- временем перевода бонуса. Перевод находится по ключу идемпотентности выдачи
-- `welcome:<person_id>` (docs/points.md).
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "person_settings" ADD COLUMN "welcome_bonus_seen_at" TIMESTAMPTZ(6);

UPDATE xb.person_settings AS settings
   SET welcome_bonus_seen_at = transfer.occurred_at
  FROM xb.point_transfers AS transfer
 WHERE transfer.idempotency_key = 'welcome:' || settings.person_id;

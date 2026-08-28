-- Синхронизация профилей парка: полный обход отдельным видом прогона и свои детали.
--
-- Реестр залит разово из файла выгрузки от 27.08.2026 и с тех пор стоит: нанятые позже
-- системе неизвестны, уволенные числятся работающими. Прямое следствие видно в журнале
-- пропущенного — заказ водителя, которого нет в `xb.park_profiles`, не записывается вовсе
-- и ложится строкой `unknown_profile`. Эта миграция заводит то, чего не хватало прогону
-- профилей, чтобы вести реестр самому.
--
-- `registry_full` — вид прогона, а не флаг у `registry`: полный обход и инкрементальный
-- прогон различаются всем, кроме записи, и в журнале прогонов их надо различать глазами.
-- Своей отметки у него нет — он двигает отметку `registry`.
--
-- `license_conflict` — причина пропуска: профилю пришёл номер удостоверения, уже активный
-- у другого человека. Свести двух людей в одного — это перенос баллов, синхронизация его
-- не делает, а молча забыть такое нельзя.
--
-- Детали прогона профилей — отдельной таблицей, как у заказов: половина колонок одного
-- вида прогона у другого пуста всегда, и это «поле есть в таблице, но не для этой строки».
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterEnum
ALTER TYPE "sync_kind" ADD VALUE 'registry_full';

-- AlterEnum
ALTER TYPE "sync_skip_reason" ADD VALUE 'license_conflict';

-- CreateTable
CREATE TABLE "sync_run_registry" (
    "run_id" UUID NOT NULL,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "profiles_seen" INTEGER NOT NULL DEFAULT 0,
    "profiles_inserted" INTEGER NOT NULL DEFAULT 0,
    "profiles_updated" INTEGER NOT NULL DEFAULT 0,
    "persons_created" INTEGER NOT NULL DEFAULT 0,
    "status_events" INTEGER NOT NULL DEFAULT 0,
    "phones_opened" INTEGER NOT NULL DEFAULT 0,
    "phones_closed" INTEGER NOT NULL DEFAULT 0,
    "licenses_updated" INTEGER NOT NULL DEFAULT 0,
    "license_conflicts" INTEGER NOT NULL DEFAULT 0,
    "skipped_without_license" INTEGER NOT NULL DEFAULT 0,
    "malformed" INTEGER NOT NULL DEFAULT 0,
    "resolved_skips" INTEGER NOT NULL DEFAULT 0,
    "chunks_total" INTEGER NOT NULL DEFAULT 0,
    "chunks_windowed" INTEGER NOT NULL DEFAULT 0,
    "max_offset_depth" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sync_run_registry_pkey" PRIMARY KEY ("run_id")
);

-- AddForeignKey
ALTER TABLE "sync_run_registry" ADD CONSTRAINT "sync_run_registry_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sync_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

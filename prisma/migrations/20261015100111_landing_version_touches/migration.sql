-- Лендинг в Mini App (issue #484): касание запуска помнит показанную версию лендинга и первое
-- нажатие кнопки отправки, заявка — версию, которую видел кандидат (docs/decisions.md → «Лендинги
-- в „Промо“»). У существующих строк все три колонки пусты.
--
-- Индексов не нужно: строка касания ищется по ключу запуска, у которого индекс уже есть
-- (`promo_touches_miniapp_launch_key`).
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "candidate_applications" ADD COLUMN     "landing_version_id" UUID;

-- AlterTable
ALTER TABLE "promo_touches" ADD COLUMN     "landing_version_id" UUID,
ADD COLUMN     "pressed_at" TIMESTAMPTZ(6);

-- AddForeignKey
ALTER TABLE "promo_touches" ADD CONSTRAINT "promo_touches_landing_version_id_fkey" FOREIGN KEY ("landing_version_id") REFERENCES "landing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_applications" ADD CONSTRAINT "candidate_applications_landing_version_id_fkey" FOREIGN KEY ("landing_version_id") REFERENCES "landing_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON COLUMN "promo_touches"."landing_version_id" IS
    'Версия лендинга, отданная этому запуску Mini App. Пусто — экран заявки по умолчанию или экран не про заявку.';

COMMENT ON COLUMN "promo_touches"."pressed_at" IS
    'Первое за запуск нажатие кнопки отправки заявки. Пусто — не нажимали.';

COMMENT ON COLUMN "candidate_applications"."landing_version_id" IS
    'Версия лендинга из касания запуска, с которого подана заявка. Пусто — экран по умолчанию или чат бота.';

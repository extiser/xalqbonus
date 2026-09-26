-- Демо-доступ (issue #205): признак демо у водителей, сотрудников и офисов, список
-- демо-зрителей и роль, под которой зритель смотрит приложение.
--
-- Демо идёт тем же кодом, что живое: демо-водитель привязан к Telegram зрителя обычной
-- строкой `telegram_links`, и новых путей в приложении, боте и рассылках не появляется.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "demo_role" AS ENUM ('driver', 'manager');

-- AlterEnum
ALTER TYPE "link_close_reason" ADD VALUE 'demo';

-- AlterEnum
ALTER TYPE "link_confirmed_by" ADD VALUE 'demo';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "offices" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "demo_viewers" (
    "telegram_user_id" BIGINT NOT NULL,
    "label" TEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "current_role" "demo_role" NOT NULL DEFAULT 'driver',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(6),

    CONSTRAINT "demo_viewers_pkey" PRIMARY KEY ("telegram_user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_viewers_person_id_key" ON "demo_viewers"("person_id");

-- AddForeignKey
ALTER TABLE "demo_viewers" ADD CONSTRAINT "demo_viewers_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: частичный индекс и проверка.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Демо-сотрудник — один на роль. Зритель в роли менеджера входит под демо-менеджером,
-- найденным по признаку и роли, и второй такой учётке выбирать между собой было бы нечем.
CREATE UNIQUE INDEX "employees_demo_role_key" ON "employees" ("role") WHERE "is_demo";

-- Учётка, в которую нельзя войти ниоткуда, по-прежнему не заводится — кроме демо-сотрудника.
-- Своего входа у него нет намеренно: под ним входит демо-зритель, чья личность пришла
-- подписанной `initData`, а пароль или Telegram у выдуманной учётки означали бы вторую
-- дверь к ней, о которой никто не помнит.
ALTER TABLE "employees" DROP CONSTRAINT "employees_login_present_check";

ALTER TABLE "employees" ADD CONSTRAINT "employees_login_present_check"
    CHECK (
        ("password_hash" IS NOT NULL AND "phone_e164" IS NOT NULL)
        OR "telegram_user_id" IS NOT NULL
        OR "is_demo"
    );

-- И обратное: своего входа у демо-сотрудника не бывает. Пароль, заданный из экрана
-- сотрудника, открыл бы в демо-учётку дверь из веба тому, кому демо показывали, а Telegram
-- сделал бы её чьей-то живой учёткой в Mini App.
ALTER TABLE "employees" ADD CONSTRAINT "employees_demo_no_login_check"
    CHECK (NOT "is_demo" OR ("password_hash" IS NULL AND "telegram_user_id" IS NULL));

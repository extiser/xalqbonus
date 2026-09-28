-- Сотрудник принимает приглашение в вебе, пароль задаётся только через веб, Telegram
-- привязывается ссылкой (issue #267, docs/decisions.md → «Ссылка приглашения видна, пока
-- жива; сотрудник принимает приглашение в вебе»).
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "employee_access_link_kind" AS ENUM ('password', 'telegram');

-- AlterTable
ALTER TABLE "employee_invites" ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "phone_e164" TEXT,
ADD COLUMN     "token" TEXT;

-- CreateTable
CREATE TABLE "employee_access_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "kind" "employee_access_link_kind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "issued_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_access_links_token_hash_key" ON "employee_access_links"("token_hash");

-- CreateIndex
CREATE INDEX "employee_access_links_employee_id_idx" ON "employee_access_links"("employee_id");

-- CreateIndex
CREATE INDEX "employee_access_links_issued_by_id_idx" ON "employee_access_links"("issued_by_id");

-- AddForeignKey
ALTER TABLE "employee_access_links" ADD CONSTRAINT "employee_access_links_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_access_links" ADD CONSTRAINT "employee_access_links_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: данные, проверки и частичный
-- индекс. Меняется руками.
-- ---------------------------------------------------------------------------

-- Живые приглашения, выпущенные до приёма в вебе, отзываются: без имени и телефона
-- их в вебе не принять, а бот их больше не принимает. Ссылка на такое приглашение ведёт
-- в бота, и тот ответит общим приветствием.
UPDATE "employee_invites"
   SET "revoked_at" = now()
 WHERE "accepted_at" IS NULL
   AND "revoked_at" IS NULL
   AND "expires_at" > now();

-- Токен лежит только у живого приглашения: принятие и отзыв его стирают. Принятая или
-- отозванная ссылка в базе — готовый токен, которым уже никто не воспользуется, но который
-- уехал бы с любым дампом. Так же устроено `demo_invites_token_live_check`.
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_token_live_check"
    CHECK ("token" IS NULL OR ("accepted_at" IS NULL AND "revoked_at" IS NULL));

-- То же правило у ссылок к учётке: использование и отзыв стирают токен.
ALTER TABLE "employee_access_links" ADD CONSTRAINT "employee_access_links_token_live_check"
    CHECK ("token" IS NULL OR ("used_at" IS NULL AND "revoked_at" IS NULL));

-- Ссылка использована или отозвана — не то и другое сразу: иначе «чем кончилась ссылка»
-- зависело бы от того, какую колонку прочитали.
ALTER TABLE "employee_access_links" ADD CONSTRAINT "employee_access_links_single_end_check"
    CHECK ("used_at" IS NULL OR "revoked_at" IS NULL);

-- Одна живая ссылка каждого вида на учётку. Срок в условие индекса не входит — `now()`
-- в предикате индекса недопустим, — поэтому выпуск новой ссылки отзывает прежнюю, живую
-- или истёкшую, той же транзакцией. Две одновременные кнопки «Сбросить пароль» упираются
-- сюда, а не в порядок действий в коде.
CREATE UNIQUE INDEX "employee_access_links_open_key"
    ON "employee_access_links" ("employee_id", "kind")
    WHERE "used_at" IS NULL AND "revoked_at" IS NULL;

-- Проверка «пароль или Telegram» снимается: после сброса у сотрудника без Telegram нет
-- ни того, ни другого, пока он не задаст пароль по ссылке. Это законное состояние — такая
-- учётка просто не входит, как только что приглашённая. `employees_demo_no_login_check`
-- остаётся как есть.
ALTER TABLE "employees" DROP CONSTRAINT "employees_login_present_check";

COMMENT ON TABLE "employee_invites" IS
    'Одноразовые приглашения сотрудников. Принимаются в вебе; токен лежит рядом с хешем, пока приглашение живо.';

COMMENT ON TABLE "employee_access_links" IS
    'Одноразовые ссылки к существующей учётке сотрудника: задать пароль или привязать Telegram.';

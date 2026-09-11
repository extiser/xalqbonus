-- Учётка сотрудника и роли: таблицы сотрудников и приглашений, след сотрудника
-- в журналах, седьмой исход привязки водителя.
--
-- `employees` с `persons` не связана ничем и никогда. У сотрудника нет водительского
-- удостоверения, профиля в парке и счёта баллов, а `Person` в нашей модели — это человек,
-- которого мы знаем по номеру ВУ. Общая таблица ради экономии одной сущности размывала бы
-- личность водителя, на которой стоит весь журнал баллов (docs/decisions.md → «Учётка
-- сотрудника и роли»).
--
-- Правило «водителем и сотрудником одновременно быть нельзя» держится кодом, а не базой:
-- при двух несвязанных таблицах `telegram_links.telegram_chat_id` и
-- `employees.telegram_user_id` уникальным индексом не пересекаются. Проверка стоит
-- с обеих сторон сразу — при принятии приглашения и при привязке водителя — и дублируется
-- запросом в scripts/invariants.sql, чтобы пересечение не завелось молча.
--
-- `employee_invites` заводит учётку в момент принятия, а не при выпуске ссылки: `employee_id`
-- пуст до принятия, и неиспользованное приглашение не оставляет за собой мусорной учётки.
-- Токен лежит хешем `sha256` и показывается один раз при выпуске — дамп базы не должен
-- давать готовых приглашений.
--
-- Таблицы сессий нет и не планируется: отзыв держится на `disabled_at` (действует
-- на следующем же запросе, роль всё равно поднимается из базы каждый раз)
-- и на `password_changed_at` (cookie, выпущенный раньше, недействителен — это и есть
-- «выйти на всех устройствах»).
--
-- `operator_ref` в `telegram_links` заменяется ссылкой, а не переносится: колонка пустая
-- на всех строках и писателя не имеет. `actor` в `point_transfers` остаётся и смысла
-- не меняет — он описывает путь операции и заполняется в том числе автоматикой, у которой
-- учётки нет вовсе (`legacy_import`), — а `actor_employee_id` называет человека, когда
-- человек был.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "employee_role" AS ENUM ('owner', 'admin', 'manager');

-- AlterEnum
ALTER TYPE "link_attempt_outcome" ADD VALUE 'employee_account';

-- AlterTable
ALTER TABLE "point_transfers" ADD COLUMN     "actor_employee_id" UUID;

-- AlterTable
ALTER TABLE "telegram_links" DROP COLUMN "operator_ref",
ADD COLUMN     "operator_employee_id" UUID;

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "employee_role" NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "password_hash" TEXT,
    "password_changed_at" TIMESTAMPTZ(6),
    "telegram_user_id" BIGINT,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "employee_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "employee_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_phone_e164_key" ON "employees"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "employees_telegram_user_id_key" ON "employees"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_token_hash_key" ON "employee_invites"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_employee_id_key" ON "employee_invites"("employee_id");

-- CreateIndex
CREATE INDEX "employee_invites_invited_by_id_idx" ON "employee_invites"("invited_by_id");

-- AddForeignKey
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_operator_employee_id_fkey" FOREIGN KEY ("operator_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transfers" ADD CONSTRAINT "point_transfers_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- Телефон обязателен: учётка без него не заводится ни одним путём. При принятии
-- приглашения он приходит контактом из Telegram, в make-цели владельца — аргументом,
-- третьего способа завести сотрудника нет. Необязательная колонка, которую нечем оставить
-- пустой, — это разрешение на состояние, которого никто не проверял.
--
-- Учётка, в которую нельзя войти ниоткуда, заводиться не должна.
--
-- Проверка остаётся парной, хотя телефон теперь обязателен: способ входа в веб — это
-- пароль вместе с телефоном, и половина пары входом не является. Одного `password_hash`
-- в ней хватило бы ровно до дня, когда телефон снова станет необязательным.
ALTER TABLE "employees" ADD CONSTRAINT "employees_login_present_check"
    CHECK (
        ("password_hash" IS NOT NULL AND "phone_e164" IS NOT NULL)
        OR "telegram_user_id" IS NOT NULL
    );

-- Принятое приглашение называет заведённую учётку, непринятое — не называет никакой.
-- Без этой проверки `accepted_at` и `employee_id` разъезжаются, и «принято ли
-- приглашение» начинает зависеть от того, какую колонку прочитали.
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_accepted_check"
    CHECK (("accepted_at" IS NULL) = ("employee_id" IS NULL));

COMMENT ON TABLE "employees" IS
    'Сотрудники парка. С persons не связаны ничем: у сотрудника нет ВУ, профиля в парке и счёта баллов.';

COMMENT ON TABLE "employee_invites" IS
    'Одноразовые приглашения сотрудников. Токен хранится хешем sha256, учётка создаётся в момент принятия.';

COMMENT ON COLUMN "point_transfers"."actor" IS
    'Путь, которым пришла операция. Заполняется в том числе автоматикой без учётки (legacy_import).';

COMMENT ON COLUMN "point_transfers"."actor_employee_id" IS
    'Сотрудник, выполнивший операцию, — когда её выполнял человек.';

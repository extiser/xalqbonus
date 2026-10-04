-- Справочник промо-меток (issue #380): носитель — плакат, визитка, ролик — со ссылкой в бота
-- и QR для печати. Касания по меткам бот пишет в `promo_touches` с #377.
--
-- Внешнего ключа `promo_touches.code` → `promo_links` нет намеренно: бот пишет касание с любым
-- годным кодом, даже если метки в справочнике нет, — касание не теряется.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "promo_medium" AS ENUM ('poster', 'card', 'leaflet', 'video', 'sms', 'other');

-- CreateTable
CREATE TABLE "promo_links" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "medium" "promo_medium" NOT NULL,
    "placement" TEXT,
    "created_by_employee_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_links_pkey" PRIMARY KEY ("code")
);

-- AddForeignKey
ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Те же правила, что проверяет сервис (`shared/promo.ts`, `shared/promoLinks.ts`): код — префикс
-- `p_` и base64url, не длиннее параметра `start` Telegram; название непустое, до 80; место — до 120.
ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_code_check"
    CHECK ("code" ~ '^p_[A-Za-z0-9_-]+$' AND char_length("code") <= 64);

ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);

ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_placement_check"
    CHECK ("placement" IS NULL OR char_length("placement") BETWEEN 1 AND 120);

COMMENT ON TABLE "promo_links" IS
    'Промо-метка: носитель со ссылкой в бота t.me/<бот>?start=<код> и QR. Код и носитель после заведения не меняются, удаления нет.';

COMMENT ON COLUMN "promo_links"."created_by_employee_id" IS
    'Кто завёл. Пусто — заведена миграцией при выкате.';

-- Уже напечатанная метка: плакат висит с выката #377, и касания по нему бот пишет с тех пор.
-- Где он висит, неизвестно (Руслан, 05-10-2026) — место заполнят потом через «Изменить».
INSERT INTO "promo_links" ("code", "name", "medium")
VALUES ('p_poster1', 'Плакат у стойки', 'poster');

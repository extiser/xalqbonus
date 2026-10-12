-- Лендинги в «Промо» (issue #478): экраны заявки для рекламы в Telegram, загруженные архивом через
-- админку. Лендинг — название и архив; сам экран — в версиях: каждая загрузка и замена — новая
-- строка, метки показывают последнюю прошедшую проверку (docs/decisions.md → «Лендинги в „Промо“»).
-- Картинки версии — на томе `uploads`, в базе только очищенная разметка.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "promo_links" ADD COLUMN     "landing_id" UUID;

-- CreateTable
CREATE TABLE "landings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_by_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "landing_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "checks" JSONB NOT NULL,
    "uploaded_by_employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "landing_versions_landing_id_number_key" ON "landing_versions"("landing_id", "number");

-- CreateIndex
CREATE INDEX "promo_links_landing_id_idx" ON "promo_links"("landing_id");

-- AddForeignKey
ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_landing_id_fkey" FOREIGN KEY ("landing_id") REFERENCES "landings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landings" ADD CONSTRAINT "landings_created_by_employee_id_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_versions" ADD CONSTRAINT "landing_versions_landing_id_fkey" FOREIGN KEY ("landing_id") REFERENCES "landings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_versions" ADD CONSTRAINT "landing_versions_uploaded_by_employee_id_fkey" FOREIGN KEY ("uploaded_by_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Те же правила, что у сервиса (`shared/landings.ts`): название непустое, до 80, края обрезаны;
-- номер версии — с 1.
ALTER TABLE "landings" ADD CONSTRAINT "landings_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name"));

ALTER TABLE "landing_versions" ADD CONSTRAINT "landing_versions_number_check"
    CHECK ("number" >= 1);

-- Лендинг — экран Mini App, и стоит он только у метки, ссылка которой ведёт в Mini App.
ALTER TABLE "promo_links" ADD CONSTRAINT "promo_links_landing_check"
    CHECK ("landing_id" IS NULL OR ("medium" = 'telegram_ad' AND "entry" = 'miniapp'));

COMMENT ON TABLE "landings" IS
    'Лендинг «Промо»: экран заявки для рекламы. Удаляется только без меток, с метками — в архив.';

COMMENT ON TABLE "landing_versions" IS
    'Версия лендинга: каждая загрузка и замена. После записи не меняется; картинки — на томе uploads в landings/<id версии>/.';

COMMENT ON COLUMN "promo_links"."landing_id" IS
    'Лендинг метки. Пусто — экран заявки по умолчанию. Меняется до первого касания метки.';

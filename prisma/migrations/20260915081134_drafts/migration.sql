-- Черновики товара и рассылки: запись заводится первым набранным символом формы, и фото
-- кладётся к ней на том же экране, где набирается текст (issue #148).
--
-- Раньше фото грузилось вторым шагом, после сохранения: имя файла собирается из uuid записи,
-- а uuid рождается вставкой. Черновик в базе убирает второй шаг и переживает перезагрузку
-- страницы целиком — вместе с текстом и фото.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "mailings" ALTER COLUMN "title" DROP NOT NULL,
ALTER COLUMN "text_ru" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "published_at" TIMESTAMPTZ(6),
ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "price_points" DROP NOT NULL,
ALTER COLUMN "price_retail" DROP NOT NULL,
ALTER COLUMN "price_cost" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: данные и проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Всё, что заведено до черновиков, заводилось целиком и сразу жило в каталоге: такой товар
-- опубликован. Отметкой служит время заведения — другого времени публикации у него не было.
UPDATE "products" SET "published_at" = "created_at" WHERE "published_at" IS NULL;

-- Пустое название пишется одним способом — NULL, а не пробелами.
ALTER TABLE "products" ADD CONSTRAINT "products_name_check"
    CHECK ("name" IS NULL OR btrim("name") <> '');

-- Опубликованный товар целиком: витрина, заказ и отчёт парку читают название и все три цены,
-- и товар без любой из них на витрине — поломка, а не недописанное.
ALTER TABLE "products" ADD CONSTRAINT "products_published_complete_check"
    CHECK (
        "published_at" IS NULL
        OR ("name" IS NOT NULL
            AND "price_points" IS NOT NULL
            AND "price_retail" IS NOT NULL
            AND "price_cost" IS NOT NULL)
    );

-- Архивным бывает только опубликованный: архив значит «был живым, на него ссылаются заказы»,
-- а черновик живым не был никогда и удаляется, а не архивируется.
ALTER TABLE "products" ADD CONSTRAINT "products_archived_published_check"
    CHECK ("archived_at" IS NULL OR "published_at" IS NOT NULL);

-- Тексты рассылки: пустое пишется NULL, а не пробелами, и у всего, что не черновик, заголовок
-- и русский текст есть. Прежняя проверка требовала русский текст у любой рассылки — черновик,
-- заведённый выбором фото, её бы не прошёл.
ALTER TABLE "mailings" DROP CONSTRAINT "mailings_texts_check";

ALTER TABLE "mailings" ADD CONSTRAINT "mailings_texts_check"
    CHECK (
        ("title" IS NULL OR btrim("title") <> '')
        AND ("text_ru" IS NULL OR btrim("text_ru") <> '')
        AND ("text_uz" IS NULL OR btrim("text_uz") <> '')
        AND ("status" = 'draft' OR ("title" IS NOT NULL AND "text_ru" IS NOT NULL))
    );

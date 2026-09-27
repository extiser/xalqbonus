-- Награда из «Наград» — как подарок (issue #266): «Почему» на узбекском, свой текст сообщения
-- и обложка на каждом языке, отметка «шторку видел».
--
-- `source_note` остаётся русским: его читают стойка и карточка водителя в вебе. Узбекское
-- «Почему» — рядом, водителю на его языке. Текст и обложки — как `gift_grants.message_ru/uz`
-- и `cover_ru_path/uz_path`: у награды своей раздачи нет, и они лежат в ней самой.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

ALTER TABLE "rewards" ADD COLUMN "source_note_uz" TEXT;

ALTER TABLE "rewards" ADD COLUMN "message_ru" TEXT;

ALTER TABLE "rewards" ADD COLUMN "message_uz" TEXT;

ALTER TABLE "rewards" ADD COLUMN "cover_ru_path" TEXT;

ALTER TABLE "rewards" ADD COLUMN "cover_uz_path" TEXT;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Обложки — обе или ни одной, как у раздачи подарка. Пустое пишется одним способом — `NULL`.
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_message_covers_check"
    CHECK (
            ("source_note_uz" IS NULL OR btrim("source_note_uz") <> '')
        AND ("message_ru" IS NULL OR btrim("message_ru") <> '')
        AND ("message_uz" IS NULL OR btrim("message_uz") <> '')
        AND ("cover_ru_path" IS NULL OR btrim("cover_ru_path") <> '')
        AND ("cover_uz_path" IS NULL OR btrim("cover_uz_path") <> '')
        AND ("cover_ru_path" IS NULL) = ("cover_uz_path" IS NULL)
    );

-- Отметка «шторку видел» — у подарка и у ручной награды-товара и произвольной: их шторка
-- на главной показывает вместе с подарками.
ALTER TABLE "rewards" DROP CONSTRAINT "rewards_gift_shown_check";

ALTER TABLE "rewards" ADD CONSTRAINT "rewards_gift_shown_check"
    CHECK (
           "gift_shown_at" IS NULL
        OR "gift_grant_id" IS NOT NULL
        OR ("source"::text = 'manual' AND "kind" IN ('product', 'custom'))
    );

-- Награды, выданные до этой правки, в шторке не всплывают: о них водитель уже узнал
-- из приложения.
UPDATE "rewards"
   SET "gift_shown_at" = now()
 WHERE "source" = 'manual'
   AND "kind" IN ('product', 'custom')
   AND "gift_shown_at" IS NULL;

-- Свой текст сообщения о подарке и обложка на каждом языке (issue #236).
--
-- Сообщение о подарке говорит с водителем на его языке — теперь и картинкой: обложки две,
-- русская и узбекская, обе или ни одной. Свой текст необязателен и пишется на каждом языке
-- отдельно; `NULL` — водителю уходит системный текст.
--
-- Раздачи, сделанные до миграции, получают узбекскую обложку копией русской: файл тот же,
-- и водитель с узбекским языком видит ту же картинку, что видел до сих пор.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- Переименование, а не удаление и заведение: обложка прежних раздач остаётся русской.
ALTER TABLE "gift_grants" RENAME COLUMN "cover_path" TO "cover_ru_path";

ALTER TABLE "gift_grants" ADD COLUMN "cover_uz_path" TEXT;

UPDATE "gift_grants" SET "cover_uz_path" = "cover_ru_path";

ALTER TABLE "gift_grants" ADD COLUMN "message_ru" TEXT;

ALTER TABLE "gift_grants" ADD COLUMN "message_uz" TEXT;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Обложки — обе или ни одной. Пустая обложка и пустой свой текст пишутся одним способом — `NULL`.
ALTER TABLE "gift_grants" DROP CONSTRAINT "gift_grants_fields_check";

ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_fields_check"
    CHECK (
            "points" > 0
        AND btrim("reason_ru") <> ''
        AND btrim("reason_uz") <> ''
        AND ("cover_ru_path" IS NULL OR btrim("cover_ru_path") <> '')
        AND ("cover_uz_path" IS NULL OR btrim("cover_uz_path") <> '')
        AND ("cover_ru_path" IS NULL) = ("cover_uz_path" IS NULL)
        AND ("message_ru" IS NULL OR btrim("message_ru") <> '')
        AND ("message_uz" IS NULL OR btrim("message_uz") <> '')
        AND ("segment_id" IS NULL) <> ("person_id" IS NULL)
        AND "recipients" > 0
        AND "skipped" >= 0
        AND ("person_id" IS NULL OR ("recipients" = 1 AND "skipped" = 0))
    );

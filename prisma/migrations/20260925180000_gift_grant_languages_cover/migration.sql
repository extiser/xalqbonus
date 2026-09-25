-- Повод подарка на двух языках и обложка (issue #219, правка по прогону PR #232).
--
-- Сообщение о подарке и карточка в приложении говорят с водителем на его языке, поэтому повод
-- вводится на русском и узбекском, как тексты рассылки, и оба обязательны. Обложка
-- необязательна: картинка на томе, как фото рассылки, путь — в `cover_path`.
--
-- Отдельной миграцией: `20260925120000_gift_grants` уже применена на стенде, и правка в неё
-- туда не доехала бы. Раздачи, сделанные на стенде, получают узбекский повод копией русского:
-- `NOT NULL` без значения не встаёт, а выдумывать перевод миграция не должна.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- Переименование, а не удаление и заведение: повод раздач стенда остаётся русским поводом.
ALTER TABLE "gift_grants" RENAME COLUMN "reason" TO "reason_ru";

ALTER TABLE "gift_grants" ADD COLUMN "reason_uz" TEXT;

UPDATE "gift_grants" SET "reason_uz" = "reason_ru";

ALTER TABLE "gift_grants" ALTER COLUMN "reason_uz" SET NOT NULL;

ALTER TABLE "gift_grants" ADD COLUMN "cover_path" TEXT;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Повод написан на обоих языках. Пустая обложка пишется одним способом — `NULL`.
ALTER TABLE "gift_grants" DROP CONSTRAINT "gift_grants_fields_check";

ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_fields_check"
    CHECK (
            "points" > 0
        AND btrim("reason_ru") <> ''
        AND btrim("reason_uz") <> ''
        AND ("cover_path" IS NULL OR btrim("cover_path") <> '')
        AND ("segment_id" IS NULL) <> ("person_id" IS NULL)
        AND "recipients" > 0
        AND "skipped" >= 0
        AND ("person_id" IS NULL OR ("recipients" = 1 AND "skipped" = 0))
    );

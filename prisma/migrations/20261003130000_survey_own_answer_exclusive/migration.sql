-- «Свой вариант» у вопроса и исключающий вариант ответа (issue #335).
--
-- `allow_own_answer` — водитель может вписать ответ своими словами; бывает только у вопроса
-- с одним или несколькими ответами. `exclusive` — вариант, отметка которого снимает остальные
-- («Такого не было»); бывает только у вопроса с несколькими ответами, но тип вопроса лежит
-- в соседней таблице, и `CHECK` его не видит — правило держит разбор тела ручки.
--
-- Оба — содержимое опроса: у замороженного не правятся, как вопросы и варианты. Условия
-- заморозки (триггер `surveys_frozen_questions`) не меняются. У существующих строк оба
-- признака `false` — по умолчанию колонки.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "survey_options" ADD COLUMN     "exclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "survey_questions" ADD COLUMN     "allow_own_answer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_own_answer_check"
    CHECK (NOT "allow_own_answer" OR "type" IN ('single', 'multiple'));

-- Опросы водителей: опрос, его вопросы и варианты ответа (issue #320).
--
-- Опрос заводится черновиком и правится целиком; запуск рассылки с опросом ставит ему
-- `frozen_at`, и после этого вопросы, варианты и тексты не правятся — ответы до и после
-- правки несравнимы. Сам вызов заморозки — следующая задача; здесь — правило, что
-- замороженный опрос полон: все тексты на обоих языках, срок и название.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "survey_question_type" AS ENUM ('single', 'multiple', 'text', 'scale');

-- CreateTable
CREATE TABLE "surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT,
    "intro_ru" TEXT,
    "intro_uz" TEXT,
    "finish_ru" TEXT,
    "finish_uz" TEXT,
    "decline_button_ru" TEXT,
    "decline_button_uz" TEXT,
    "app_button_ru" TEXT,
    "app_button_uz" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "ends_on" DATE,
    "frozen_at" TIMESTAMPTZ(6),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "survey_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "survey_question_type" NOT NULL,
    "text_ru" TEXT,
    "text_uz" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text_ru" TEXT,
    "text_uz" TEXT,

    CONSTRAINT "survey_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "surveys_created_at_idx" ON "surveys"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "survey_questions_survey_id_position_key" ON "survey_questions"("survey_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "survey_options_question_id_position_key" ON "survey_options"("question_id", "position");

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Пусто пишется одним способом — `NULL`, а не пустой строкой: проверка полноты ниже иначе
-- пропустила бы текст из одних пробелов.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_texts_check"
    CHECK (
        ("title" IS NULL OR btrim("title") <> '')
        AND ("intro_ru" IS NULL OR btrim("intro_ru") <> '')
        AND ("intro_uz" IS NULL OR btrim("intro_uz") <> '')
        AND ("finish_ru" IS NULL OR btrim("finish_ru") <> '')
        AND ("finish_uz" IS NULL OR btrim("finish_uz") <> '')
        AND ("decline_button_ru" IS NULL OR btrim("decline_button_ru") <> '')
        AND ("decline_button_uz" IS NULL OR btrim("decline_button_uz") <> '')
        AND ("app_button_ru" IS NULL OR btrim("app_button_ru") <> '')
        AND ("app_button_uz" IS NULL OR btrim("app_button_uz") <> '')
    );

ALTER TABLE "surveys" ADD CONSTRAINT "surveys_points_check" CHECK ("points" >= 0);

-- Замороженный опрос полон: название, срок и все тексты строки опроса на обоих языках.
-- Тексты вопросов и вариантов лежат в других таблицах, и `CHECK` их не видит — их проверяет
-- триггер `surveys_frozen_questions` ниже.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_frozen_complete_check"
    CHECK (
        "frozen_at" IS NULL
        OR (
            "title" IS NOT NULL
            AND "ends_on" IS NOT NULL
            AND "intro_ru" IS NOT NULL AND "intro_uz" IS NOT NULL
            AND "finish_ru" IS NOT NULL AND "finish_uz" IS NOT NULL
            AND "decline_button_ru" IS NOT NULL AND "decline_button_uz" IS NOT NULL
            AND "app_button_ru" IS NOT NULL AND "app_button_uz" IS NOT NULL
        )
    );

ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_texts_check"
    CHECK (
        ("text_ru" IS NULL OR btrim("text_ru") <> '')
        AND ("text_uz" IS NULL OR btrim("text_uz") <> '')
    );

ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_position_check" CHECK ("position" > 0);

ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_texts_check"
    CHECK (
        ("text_ru" IS NULL OR btrim("text_ru") <> '')
        AND ("text_uz" IS NULL OR btrim("text_uz") <> '')
    );

ALTER TABLE "survey_options" ADD CONSTRAINT "survey_options_position_check" CHECK ("position" > 0);

-- Полнота вопросов и вариантов в момент заморозки. Тот же запрет, что `CHECK` выше, только
-- через границу таблиц: у замороженного опроса есть хотя бы один вопрос, у каждого вопроса
-- тексты на обоих языках, у вопроса с выбором есть варианты и у каждого варианта оба текста,
-- а у текста и шкалы вариантов нет. Без этого на опрос нельзя было бы ответить.
--
-- Срабатывает только на переходе «не заморожен → заморожен»: после него вопросы и варианты
-- не правятся.
CREATE FUNCTION "surveys_frozen_questions_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM xb.survey_questions WHERE "survey_id" = NEW."id"
    ) THEN
        RAISE EXCEPTION 'опрос % без вопросов нельзя заморозить', NEW."id"
            USING ERRCODE = 'check_violation', CONSTRAINT = 'surveys_frozen_questions_check';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM xb.survey_questions AS question
         WHERE question."survey_id" = NEW."id"
           AND (
                question."text_ru" IS NULL
             OR question."text_uz" IS NULL
             OR (question."type" IN ('single', 'multiple')
                 AND NOT EXISTS (
                     SELECT 1 FROM xb.survey_options AS option
                      WHERE option."question_id" = question."id"
                 ))
             OR (question."type" IN ('text', 'scale')
                 AND EXISTS (
                     SELECT 1 FROM xb.survey_options AS option
                      WHERE option."question_id" = question."id"
                 ))
             OR EXISTS (
                     SELECT 1 FROM xb.survey_options AS option
                      WHERE option."question_id" = question."id"
                        AND (option."text_ru" IS NULL OR option."text_uz" IS NULL)
                 )
           )
    ) THEN
        RAISE EXCEPTION 'у опроса % не заполнены вопросы или варианты', NEW."id"
            USING ERRCODE = 'check_violation', CONSTRAINT = 'surveys_frozen_questions_check';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "surveys_frozen_questions"
    BEFORE INSERT OR UPDATE OF "frozen_at" ON "surveys"
    FOR EACH ROW
    WHEN (NEW."frozen_at" IS NOT NULL)
    EXECUTE FUNCTION "surveys_frozen_questions_check"();

COMMENT ON TABLE "surveys" IS
    'Опрос водителей. Черновик правится целиком; frozen_at ставит запуск рассылки с опросом, после него правятся только title и ends_on.';
COMMENT ON COLUMN "surveys"."ends_on" IS
    'Последний день опроса. Закрыт с 00:00 следующего дня по Ташкенту, сутки механики с 05:00 не применяются.';

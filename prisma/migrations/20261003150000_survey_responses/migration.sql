-- Прохождение опроса и ответы (issue #323).
--
-- `survey_responses` — строка на пару «опрос + человек»: первичный ключ пары держит от второй
-- строки при двойном открытии. Метки воронки ставятся по одному разу условием «ещё пусто».
-- `survey_answers` — ответ на вопрос, один у человека; повторная отправка его заменяет.
-- `survey_answer_options` — выбранные варианты у `single` и `multiple`.
--
-- Тип вопроса лежит в соседней таблице, и `CHECK` его не видит: соответствие значения типу,
-- «Свой вариант» только у вопроса с `allow_own_answer` и исключающий вариант без соседей держит
-- сервис сохранения ответа. Здесь — то, что видно из самой строки.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateTable
CREATE TABLE "survey_responses" (
    "survey_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declined_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "app_clicked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("survey_id","person_id")
);

-- CreateTable
CREATE TABLE "survey_answers" (
    "survey_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "text_value" TEXT,
    "scale_value" SMALLINT,
    "own_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("survey_id","person_id","question_id")
);

-- CreateTable
CREATE TABLE "survey_answer_options" (
    "survey_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "survey_answer_options_pkey" PRIMARY KEY ("survey_id","person_id","question_id","option_id")
);

-- CreateIndex
CREATE INDEX "survey_responses_person_id_idx" ON "survey_responses"("person_id");

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_survey_id_person_id_fkey" FOREIGN KEY ("survey_id", "person_id") REFERENCES "survey_responses"("survey_id", "person_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "survey_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answer_options" ADD CONSTRAINT "survey_answer_options_survey_id_person_id_question_id_fkey" FOREIGN KEY ("survey_id", "person_id", "question_id") REFERENCES "survey_answers"("survey_id", "person_id", "question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_answer_options" ADD CONSTRAINT "survey_answer_options_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "survey_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Метки идут по порядку пути: пройден — только начатый, переход в приложение — только с финала.
-- Отказ порядку не подчиняется: отказавшийся может начать опрос позже.
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_marks_check"
    CHECK (
        ("completed_at" IS NULL OR "started_at" IS NOT NULL)
        AND ("app_clicked_at" IS NULL OR "completed_at" IS NOT NULL)
    );

-- Свободный ответ и «Свой вариант» — до 300 знаков. Пусто пишется одним способом — `NULL`,
-- а не пустой строкой: иначе ответ из одних пробелов считался бы значением обязательного вопроса.
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_text_value_check"
    CHECK ("text_value" IS NULL OR (btrim("text_value") <> '' AND char_length("text_value") <= 300));

ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_own_text_check"
    CHECK ("own_text" IS NULL OR (btrim("own_text") <> '' AND char_length("own_text") <= 300));

ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_scale_value_check"
    CHECK ("scale_value" IS NULL OR "scale_value" BETWEEN 1 AND 5);

-- Значение у ответа одно: колонки принадлежат разным типам вопроса и вместе не встречаются.
ALTER TABLE "survey_answers" ADD CONSTRAINT "survey_answers_single_value_check"
    CHECK (num_nonnulls("text_value", "scale_value", "own_text") <= 1);

COMMENT ON TABLE "survey_responses" IS
    'Прохождение опроса человеком: метки воронки, каждая ставится один раз. completed_at — одной транзакцией с баллами за опрос.';
COMMENT ON TABLE "survey_answers" IS
    'Ответ на вопрос опроса. Строка без значения — пропущенный необязательный вопрос.';

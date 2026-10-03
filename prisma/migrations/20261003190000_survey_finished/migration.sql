-- Досрочное завершение опроса (issue #348).
--
-- `finished_at` — когда нажали «Завершить опрос», `finished_by_id` — кто. Последний день
-- (`ends_on`) при этом не трогается: опрос закрыт, если прошёл последний день или стоит
-- `finished_at`. Отметка ставится один раз и не снимается — разовость держит условие
-- «ещё пусто» в `UPDATE`, а не проверка перед ним.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "surveys" ADD COLUMN     "finished_at" TIMESTAMPTZ(6),
ADD COLUMN     "finished_by_id" UUID;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_finished_by_id_fkey" FOREIGN KEY ("finished_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Отметка без автора не говорит, кто закрыл, автор без отметки — что он сделал: заполнены
-- обе колонки или ни одной. Завершается только замороженный опрос: черновик никуда не уходил,
-- и закрывать в нём нечего.
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_finished_check"
    CHECK (
        ("finished_at" IS NULL) = ("finished_by_id" IS NULL)
        AND ("finished_at" IS NULL OR "frozen_at" IS NOT NULL)
    );

-- Сегмент и опрос у рассылки (issue #321).
--
-- `segment_id` — кому уходит: пусто — все участники с привязкой Telegram, как раньше; задан —
-- пересечение состава сегмента с этой аудиторией. `survey_id` — опрос с кнопкой «Пройти
-- опрос»; запуск рассылки замораживает его. Обе правятся только у черновика — это сервис,
-- как у текстов и фото.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "mailings" ADD COLUMN     "segment_id" UUID,
ADD COLUMN     "survey_id" UUID;

-- AddForeignKey
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mailings" ADD CONSTRAINT "mailings_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

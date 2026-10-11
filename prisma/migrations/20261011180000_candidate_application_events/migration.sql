-- Журнал отметок в заявке кандидата (issue #471): «Оформлен», «Отказ» и «Вернуть в работу».
--
-- Статус по-прежнему живёт в `candidate_applications.status`; журнал хранит, кто и когда его
-- поставил. Отметка считается ответом сотрудника и снимает ожидание ответа (docs/decisions.md →
-- «Заявки в админке»).
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "candidate_application_event_kind" AS ENUM ('hired', 'rejected', 'reopened');

-- CreateTable
CREATE TABLE "candidate_application_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" UUID NOT NULL,
    "kind" "candidate_application_event_kind" NOT NULL,
    "employee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_application_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_application_events_application_id_created_at_idx" ON "candidate_application_events"("application_id", "created_at");

-- AddForeignKey
ALTER TABLE "candidate_application_events" ADD CONSTRAINT "candidate_application_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "candidate_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_application_events" ADD CONSTRAINT "candidate_application_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMENT ON TABLE "candidate_application_events" IS
    'Отметки сотрудников в заявке кандидата: оформлен, отказ, снова в работе. Статус меняется вместе со строкой.';

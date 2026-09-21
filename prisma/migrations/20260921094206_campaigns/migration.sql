-- Акции: акция, окна её половин и снимок участников с состоянием водителя (issue #166).
--
-- Состав снимается из сегмента один раз, при запуске, и больше не пересчитывается: давность
-- «20–90 дней» ползёт каждый день, и без заморозки к концу окна в волне оказались бы другие люди.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'running', 'finished');

-- CreateEnum
CREATE TYPE "campaign_half" AS ENUM ('a', 'b');

-- CreateEnum
CREATE TYPE "campaign_participant_state" AS ENUM ('invited', 'opened', 'joined', 'declined');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT,
    "title" TEXT,
    "status" "campaign_status" NOT NULL,
    "segment_id" UUID,
    "split_enabled" BOOLEAN NOT NULL DEFAULT false,
    "audience_size" INTEGER,
    "created_by_id" UUID NOT NULL,
    "launched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_halves" (
    "campaign_id" UUID NOT NULL,
    "half" "campaign_half" NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),

    CONSTRAINT "campaign_halves_pkey" PRIMARY KEY ("campaign_id","half")
);

-- CreateTable
CREATE TABLE "campaign_participants" (
    "campaign_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "half" "campaign_half" NOT NULL,
    "state" "campaign_participant_state" NOT NULL,
    "opened_at" TIMESTAMPTZ(6),
    "joined_at" TIMESTAMPTZ(6),
    "declined_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_participants_pkey" PRIMARY KEY ("campaign_id","person_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_created_at_idx" ON "campaigns"("created_at" DESC);

-- CreateIndex
CREATE INDEX "campaign_participants_campaign_id_half_state_idx" ON "campaign_participants"("campaign_id", "half", "state");

-- CreateIndex
CREATE INDEX "campaign_participants_person_id_idx" ON "campaign_participants"("person_id");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_halves" ADD CONSTRAINT "campaign_halves_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки и комментарии.
-- Меняется руками.
-- ---------------------------------------------------------------------------

-- `slug` уходит в ключ идемпотентности массовых операций (`campaign:<slug>:<persons.id>`,
-- docs/points.md): двоеточие или пробел в нём разломали бы ключ на части. Строчная латиница,
-- цифры и одиночные дефисы между ними.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_slug_check"
    CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_title_check"
    CHECK ("title" IS NULL OR btrim("title") <> '');

-- Статус согласован с полями: у черновика нет ни запуска, ни снимка; у запущенной есть всё,
-- что нужно, чтобы отвечать «что это за акция и из кого она снята», и снимок не пуст.
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status_check"
    CHECK (
        ("status" = 'draft' AND "launched_at" IS NULL AND "audience_size" IS NULL)
        OR (
            "status" IN ('running', 'finished')
            AND "launched_at" IS NOT NULL
            AND "audience_size" > 0
            AND "segment_id" IS NOT NULL
            AND "slug" IS NOT NULL
            AND "title" IS NOT NULL
        )
    );

-- Окно: начало раньше конца. Даты заполняются по отдельности — черновик сохраняет себя
-- по мере набора, и одна дата без второй — рабочее состояние формы. Без обеих окна нет.
ALTER TABLE "campaign_halves" ADD CONSTRAINT "campaign_halves_window_check"
    CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at");

-- Состояние согласовано с отметками. Отметка «открыл» может стоять и у вступившего,
-- и у отказавшегося — он сначала открыл экран; но вступивший не отказывался, и наоборот.
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_state_check"
    CHECK (
        ("state" = 'invited'  AND "opened_at" IS NULL AND "joined_at" IS NULL AND "declined_at" IS NULL)
        OR ("state" = 'opened'   AND "opened_at" IS NOT NULL AND "joined_at" IS NULL AND "declined_at" IS NULL)
        OR ("state" = 'joined'   AND "joined_at" IS NOT NULL AND "declined_at" IS NULL)
        OR ("state" = 'declined' AND "declined_at" IS NOT NULL AND "joined_at" IS NULL)
    );

COMMENT ON TABLE "campaigns" IS
    'Акции. Состав снимается из сегмента один раз при запуске — строки campaign_participants — и не пересчитывается.';

COMMENT ON TABLE "campaign_halves" IS
    'Окна половин акции. Метки начала суток механики (05:00 по Ташкенту): начало входит в окно, конец — нет.';

COMMENT ON COLUMN "campaigns"."audience_size" IS
    'Сколько человек попало в снимок на дату запуска. Факт, а не счётчик.';

COMMENT ON COLUMN "campaign_participants"."half" IS
    'Половина состава. Без деления у всех a; был ли контроль — campaigns.split_enabled.';

-- Раздел «Демо» (issue #252): приглашение зрителя ссылкой на бота и спрятанный
-- демо-водитель.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "demo_hidden_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "demo_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_telegram_user_id" BIGINT,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "demo_invites_token_hash_key" ON "demo_invites"("token_hash");

-- CreateIndex
CREATE INDEX "demo_invites_invited_by_id_idx" ON "demo_invites"("invited_by_id");

-- AddForeignKey
ALTER TABLE "demo_invites" ADD CONSTRAINT "demo_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Дальше — то, что Prisma в схеме выразить не умеет: проверки. Меняется руками.
-- ---------------------------------------------------------------------------

-- Прячется только демо-водитель. Живой, пропавший из поиска и из сегментов, — это водитель,
-- которого парк перестал видеть, и его баллы, которые никто не найдёт.
ALTER TABLE "persons" ADD CONSTRAINT "persons_demo_hidden_check"
    CHECK ("is_demo" OR "demo_hidden_at" IS NULL);

-- Принятие — отметка и Telegram принявшего одной записью: принятое без принявшего не
-- ответило бы, кому ушла ссылка.
ALTER TABLE "demo_invites" ADD CONSTRAINT "demo_invites_accepted_check"
    CHECK (("accepted_at" IS NULL) = ("accepted_telegram_user_id" IS NULL));

-- Принятое не отзывается, отозванное не принимается: у ссылки один конец.
ALTER TABLE "demo_invites" ADD CONSTRAINT "demo_invites_single_end_check"
    CHECK ("accepted_at" IS NULL OR "revoked_at" IS NULL);

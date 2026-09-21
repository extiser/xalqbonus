-- Половина участника связана с окном этой половины внешним ключом (ревью #170).
--
-- Без него пара «акция + половина» у участника и строка `campaign_halves` жили порознь:
-- участник, чьей половины нет в окнах, молча выпадал из соединения с окном — акции не видел,
-- в админке числился обычным приглашённым, а итог окна (#168) не дал бы ему исхода никогда.
--
-- Отдельной миграцией, а не правкой `20260921094206_campaigns`: та уже применена к локальной
-- базе с копией боевой, и приводить её в порядок через `migrate reset` нельзя.
--
-- Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения.
-- Ставим его явно: миграция не должна уехать в `public` ни при каких условиях.
SET search_path TO "xb";

-- AddForeignKey
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_half_fkey" FOREIGN KEY ("campaign_id", "half") REFERENCES "campaign_halves"("campaign_id", "half") ON DELETE RESTRICT ON UPDATE CASCADE;

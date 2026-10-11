import { countAdParticipants, listAdParticipantRows } from '#server/repositories/candidateApplicationAdmin';
import { deskDriverName } from '#server/repositories/deskDriver';
import { APPLICATIONS_PAGE_SIZE } from '#shared/candidateApplications';
import type { AdParticipantList } from '#shared/types/applications';

/**
 * Таблица «Участники программы, пришли по рекламе» раздела «Заявки» (issue #471): участники,
 * открывшие бота или приложение по метке рекламы в Telegram. Строка на человека — по его
 * последнему такому касанию, новые сверху. Имя и позывной — как у вступивших по метке.
 */
export const listAdParticipants = async (offset: number): Promise<AdParticipantList> => {
  const limit = APPLICATIONS_PAGE_SIZE;
  const [rows, total] = await Promise.all([listAdParticipantRows(offset, limit), countAdParticipants()]);

  return {
    rows: rows.map((row) => ({
      personId: row.personId,
      callsign: row.callsign,
      name: deskDriverName(row),
      promoName: row.promoName,
      promoCode: row.promoCode,
      touchedAt: row.touchedAt.toISOString(),
      lastTripAt: row.lastTripAt?.toISOString() ?? null,
    })),
    total,
    offset,
    limit,
  };
};

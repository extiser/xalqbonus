import { countUnfinished, listUnfinishedRows, type UnfinishedListRow } from '#server/repositories/candidateChatDrafts';
import { readApplicationSearch, unfinishedVisibleBefore } from '#server/services/candidates/listApplications';
import { APPLICATIONS_PAGE_SIZE } from '#shared/candidateApplications';
import { formatPhone } from '#shared/phone';
import type { UnfinishedList, UnfinishedRow } from '#shared/types/applications';

/**
 * Вкладка «Не закончили» раздела «Заявки» (issue #475): люди, нажавшие `/start` по метке рекламы
 * и не подавшие заявку, — страница строк под поиском. Поиск — тот же, что у заявок: подстрока
 * имени или цифры номера (docs/decisions.md → «„Не закончили“ в заявках»).
 */

const toRow = (row: UnfinishedListRow): UnfinishedRow => ({
  id: row.id,
  telegramName: row.telegramName,
  telegramUsername: row.telegramUsername,
  telegramUserId: row.telegramUserId,
  step: row.step,
  phone: row.phoneE164 === null ? null : formatPhone(row.phoneE164).display,
  promoName: row.promoName,
  promoCode: row.promoCode,
  startedAt: row.startedAt.toISOString(),
  handledBy: row.handledBy,
  waitingSince: row.waitingSince?.toISOString() ?? null,
});

export type ListUnfinishedInput = {
  query: string;
  offset: number;
  now?: Date;
};

export const listUnfinished = async ({ query, offset, now = new Date() }: ListUnfinishedInput): Promise<UnfinishedList> => {
  const search = readApplicationSearch(query);
  const visibleBefore = unfinishedVisibleBefore(now);
  const limit = APPLICATIONS_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    listUnfinishedRows({ visibleBefore, search, offset, limit }),
    countUnfinished({ visibleBefore, search }),
  ]);

  return { rows: rows.map(toRow), total, offset, limit };
};

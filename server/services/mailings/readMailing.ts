import { findMailing, listMailings } from '#server/repositories/mailings';
import { UnknownMailingError } from '#server/services/mailings/errors';
import { toMailing } from '#server/services/mailings/fields';
import type { Mailing } from '#shared/types/mailing';

/** Рассылка со счётчиками исходов. Нет такой — `UnknownMailingError`. */
export const readMailing = async (mailingId: string): Promise<Mailing> => {
  const row = await findMailing(mailingId);

  if (!row) {
    throw new UnknownMailingError(mailingId);
  }

  return toMailing(row);
};

/** Все рассылки, свежие первыми, со счётчиками. */
export const readMailingList = async (): Promise<Mailing[]> =>
  (await listMailings()).map(toMailing);

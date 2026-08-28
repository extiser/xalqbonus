import { findSystemAccount, type AccountRow } from '#server/repositories/points';
import type { AccountType } from '#server/generated/prisma/enums';
import { UnknownAccountError } from '#server/services/points/errors';

/** Системные счета: `emission`, `redemption`, `raffle_bank`. Водительский сюда не подходит. */
export type SystemAccountType = Exclude<AccountType, 'driver'>;

/**
 * Читает системный счёт по типу. Не создаёт его ни при каких условиях: три системных счёта
 * заведены миграцией ядра, и это единственное место их появления. Отсутствие счёта —
 * не «сейчас заведём», а непринятая миграция, и узнать об этом надо ошибкой.
 */
export const getSystemAccount = async (type: SystemAccountType): Promise<AccountRow> => {
  const account = await findSystemAccount(type);

  if (!account) {
    throw new UnknownAccountError(`системного счёта ${type} нет — миграция ядра не принята`);
  }

  return account;
};

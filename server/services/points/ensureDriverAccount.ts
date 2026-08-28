import { insertDriverAccount, type AccountRow } from '#server/repositories/points';
import { UnknownAccountError } from '#server/services/points/errors';
import { FOREIGN_KEY_VIOLATION, isConstraintViolation } from '#server/services/points/postgresErrors';

/**
 * Единственное место, где заводится водительский счёт.
 *
 * Системные счета сюда не относятся: они созданы миграцией и только читаются по типу
 * (`getSystemAccount`). Кода, который «создаёт системный счёт, если его нет», в проекте
 * быть не должно — это второе место, где счёт может появиться, а второй эмиссионный счёт
 * разваливает сверку журнала.
 *
 * Счёт принадлежит человеку, а не учётке в парке и не мессенджеру: у одного человека
 * может быть несколько профилей, баланс при этом один.
 */
export const ensureDriverAccount = async (personId: string): Promise<AccountRow> => {
  try {
    return await insertDriverAccount(personId);
  } catch (error) {
    if (isConstraintViolation(error, FOREIGN_KEY_VIOLATION, 'accounts_person_id_fkey')) {
      throw new UnknownAccountError(`человека ${personId} нет в базе`);
    }

    throw error;
  }
};

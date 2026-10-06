import { findEmployeeByTelegramUserId } from '#server/repositories/employees';

/**
 * Принадлежит ли этот Telegram сотруднику парка — для приветствия бота.
 *
 * Выключенная учётка тоже сотрудник: роль у Telegram одна, и приветствие водителя такому
 * человеку звало бы в экран, которого у него нет.
 */
export const isEmployeeTelegram = async (telegramUserId: bigint): Promise<boolean> =>
  (await findEmployeeByTelegramUserId(telegramUserId)) !== null;

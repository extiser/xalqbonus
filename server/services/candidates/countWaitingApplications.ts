import { countWaitingApplications as countWaiting } from '#server/repositories/candidateApplicationAdmin';
import type { ApplicationWaitingCount } from '#shared/types/applications';

/**
 * Счётчик у пункта меню «Заявки» (issue #471): заявки, ждущие ответа сотрудника. Те, кто
 * не закончил заявку, сюда не входят: менеджер по ним ничего сделать не может
 * (docs/decisions.md → «„Не закончили“ в заявках»).
 */
export const countWaitingApplications = async (): Promise<ApplicationWaitingCount> => ({
  count: await countWaiting(),
});

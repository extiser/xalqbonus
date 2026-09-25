import { findDemoViewer } from '#server/repositories/demo';
import { findDemoEmployee, type EmployeeRow } from '#server/repositories/employees';

/**
 * Демо-зритель, открывший приложение, — или `null` у всех остальных (issue #205).
 *
 * В роли водителя подменять нечего: зритель — участник по своей привязке, и приложение, бот,
 * уведомления и рассылки находят демо-водителя обычным путём. Подменяется личность только
 * в роли менеджера — на демо-менеджера, и поэтому он приходит отсюда же.
 *
 * Выключенный зритель — `null`: его привязка закрыта, и он снова тот, кем был до внесения
 * в список.
 */
export type DemoViewer =
  | { role: 'driver'; personId: string }
  | { role: 'manager'; personId: string; manager: EmployeeRow };

export const readDemoViewer = async (telegramUserId: bigint): Promise<DemoViewer | null> => {
  const viewer = await findDemoViewer(telegramUserId);

  if (!viewer || viewer.disabledAt !== null) {
    return null;
  }

  if (viewer.currentRole === 'driver') {
    return { role: 'driver', personId: viewer.personId };
  }

  const manager = await findDemoEmployee('manager');

  // Ошибкой, а не отказом: зритель в роли менеджера есть, а менеджера нет — значит, демо
  // не заведено, и молчаливое «в программе не состоит» увело бы разбор не туда.
  if (!manager) {
    throw new Error('демо не заведено: make demo-create');
  }

  return { role: 'manager', personId: viewer.personId, manager };
};

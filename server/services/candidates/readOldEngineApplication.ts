import { readApplicationScreen } from '#server/services/candidates/applicationScreen';
import { readLinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { readEmployeeScreen } from '#server/services/employees/readEmployeeScreen';
import type { TelegramLaunch } from '#server/utils/telegramInitData';
import type { OldEngineApplication, OldEngineOffice } from '#shared/types/miniapp';

/**
 * Экран заявки кандидата на старом движке (issue #460) — поле `application` ответа
 * `POST /api/miniapp/device`. Скрипт проверки движка рисует его вместо «обновите».
 *
 * Что показать — решает `readApplicationScreen`, та же функция, что у `GET /api/miniapp/me`,
 * и тем же порядком: сотрудник и участник проверяются раньше, экран заявки им не положен
 * (участнику на старом движке — «обновите»).
 *
 * Офисы — те же, что у «обновите»: их уже собрал вход в лог устройств, в показном виде
 * для скрипта на ES5.
 */

export type OldEngineApplicationInput = {
  launch: TelegramLaunch;
  /** Итог проверки движка. Новому движку экран не нужен — заявку покажет основной код. */
  engineOk: boolean;
  offices: OldEngineOffice[];
  now: Date;
};

export const readOldEngineApplication = async (
  input: OldEngineApplicationInput,
): Promise<OldEngineApplication | null> => {
  if (input.engineOk) {
    return null;
  }

  const telegramUserId = input.launch.user.id;

  if ((await readEmployeeScreen(telegramUserId)) || (await readLinkedDriver(telegramUserId))) {
    return null;
  }

  const screen = await readApplicationScreen(input.launch, input.now);

  if (!screen) {
    return null;
  }

  const base = {
    texts: screen.texts,
    language: screen.language,
    offices: input.offices,
    managerChatUrl: screen.managerChatUrl,
  };

  if (screen.screen === 'application') {
    return { kind: 'form', ...base };
  }

  return {
    kind: 'sent',
    ...base,
    name: screen.name,
    phone: screen.phone,
    writeAllowed: screen.writeAllowed,
    submittedAtText: screen.submittedAtText,
  };
};

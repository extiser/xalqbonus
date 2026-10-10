import { readApplicationScreen } from '#server/services/candidates/applicationScreen';
import { DEMO_MANAGER_LANGUAGE, demoScreen } from '#server/services/demo/demoScreen';
import { readDemoViewer } from '#server/services/demo/readDemoViewer';
import { readLinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { readMemberScreen } from '#server/services/drivers/readMemberScreen';
import { registrationScreenTexts } from '#server/services/drivers/registrationScreen';
import { buildEmployeeScreen, readEmployeeScreen } from '#server/services/employees/readEmployeeScreen';
import { recordMiniAppPromoTouch } from '#server/services/promo/recordPromoTouch';
import { requireTelegramLaunch } from '#server/utils/telegramAuth';
import type { MiniAppStateResponse } from '#shared/types/miniapp';

// Что показать открывшему приложение: экран сотрудника, экран участника, заявка кандидата или
// экран регистрации.
//
// Первым пишется переход по промо-метке из ссылки `?startapp=` (issue #456) — у участника тоже,
// с его человеком. На компьютере ручку `device` не зовёт никто, поэтому касание пишет и эта;
// строка одна на запуск, сколько бы раз приложение ни перечитало состояние.
//
// Демо-зритель проверяется первым, до поиска сотрудника и привязки (issue #205). В роли
// менеджера он получает экран демо-менеджера, в роли водителя идёт дальше обычным путём —
// к своему демо-водителю по привязке — и отличается от живого участника только полосой.
//
// Сотрудник ищется следом — по `employees.telegram_user_id` из той же проверенной `initData`, —
// и водительские ветки не проходит вовсе (issue #122).
//
// Участник узнаётся по активной строке в `telegram_links`, и номер у него не спрашивается
// ни разу — ни в первый раз после переноса из старой базы, ни потом. Ровно то же делал
// `/start` в боте: привязка есть — значит человек уже в программе.
//
// Поиск идёт по `telegram_chat_id`, а **не** по `telegram_user_id`: у привязок, перенесённых
// из старой базы, заполнен только чат — идентификатора пользователя в старой базе не было
// вовсе. Для личной переписки эти два числа совпадают, поэтому `user.id` из проверенной
// `initData` годится как идентификатор чата.
//
// Не участник и не сотрудник — заявка кандидата (issue #456): открытая заявка этого Telegram —
// «Заявка уже отправлена», с меткой и без; метка рекламы в Telegram — экран заявки. Иначе —
// регистрация, как раньше.

export default defineEventHandler(async (event): Promise<MiniAppStateResponse> => {
  const launch = requireTelegramLaunch(event);
  const { user } = launch;

  await recordMiniAppPromoTouch(launch);

  const viewer = await readDemoViewer(user.id);

  if (viewer?.role === 'manager') {
    return buildEmployeeScreen(viewer.manager, user.id, demoScreen('manager', DEMO_MANAGER_LANGUAGE));
  }

  const employeeScreen = await readEmployeeScreen(user.id);

  if (employeeScreen) {
    return employeeScreen;
  }

  const driver = await readLinkedDriver(user.id);

  // Состав экрана, а не готовое приветствие одной строкой: баланс на экране участника
  // стоит крупно и отдельно от имени, а истории он собирает свою ручка (issue #101).
  if (driver) {
    return readMemberScreen(driver, user.id, new Date(), viewer ? demoScreen('driver', driver.language) : null);
  }

  const applicationScreen = await readApplicationScreen(launch, new Date());

  if (applicationScreen) {
    return applicationScreen;
  }

  // Без предвыбора языка: шаг 1 показывает оба, и выбирает человек. В `person_settings`
  // уезжает выбранный там — при удачной привязке нового участника.
  return {
    screen: 'registration',
    texts: registrationScreenTexts(),
  };
});

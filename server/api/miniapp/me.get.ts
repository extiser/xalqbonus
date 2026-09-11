import { readLinkedDriver } from '#server/services/drivers/readLinkedDriver';
import {
  describeMember,
  registrationScreenTexts,
} from '#server/services/drivers/registrationScreen';
import { preferredLanguage } from '#server/utils/language';
import { requireTelegramUser } from '#server/utils/telegramAuth';
import type { MiniAppStateResponse } from '#shared/types/miniapp';

// Что показать открывшему приложение: экран участника или экран регистрации.
//
// Участник узнаётся по активной строке в `telegram_links`, и номер у него не спрашивается
// ни разу — ни в первый раз после переноса из старой базы, ни потом. Ровно то же делал
// `/start` в боте: привязка есть — значит человек уже в программе.
//
// Поиск идёт по `telegram_chat_id`, а **не** по `telegram_user_id`: у привязок, перенесённых
// из старой базы, заполнен только чат — идентификатора пользователя в старой базе не было
// вовсе. Для личной переписки эти два числа совпадают, поэтому `user.id` из проверенной
// `initData` годится как идентификатор чата.

export default defineEventHandler(async (event): Promise<MiniAppStateResponse> => {
  const user = requireTelegramUser(event);
  const driver = await readLinkedDriver(user.id);

  if (driver) {
    return {
      screen: 'member',
      language: driver.language,
      message: describeMember(driver),
    };
  }

  return {
    screen: 'registration',
    // Предвыбор, а не решение: язык переключается на экране, и уезжает в `person_settings`
    // именно выбранный там.
    language: preferredLanguage(user.languageCode),
    texts: registrationScreenTexts(),
  };
});

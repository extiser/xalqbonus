import { readBotToken } from '#server/bot/config';
import type { Language } from '#server/generated/prisma/enums';
import { registerDriverByContact } from '#server/services/drivers/registerDriverByContact';
import { describeRegistrationResult } from '#server/services/drivers/registrationScreen';
import { requireTelegramUser } from '#server/utils/telegramAuth';
import { checkContactData } from '#server/utils/telegramInitData';
import type { MiniAppRegisterRequestBody, MiniAppRegisterResponse } from '#shared/types/miniapp';

/**
 * Регистрация водителя из Mini App: две подписанные строки и ничего больше.
 *
 * `initData` говорит, кто пришёл. Строка контакта говорит, какой у него номер. Обе
 * проверяются здесь же, и ничему, кроме подписей, ручка не верит: телефон, имя и владелец
 * контакта берутся **только** из разобранных проверенных строк, а не из соседних полей
 * тела запроса — их содержимое целиком выбирает клиент.
 *
 * Исключение ровно одно и подтверждать его нечем: выбранный язык. Это решение, принятое
 * человеком на экране секунду назад, подписи у него нет и быть не может. Сверяется
 * со словарём — всё, что не `ru` и не `uz`, отвергается, а не превращается молча в русский.
 *
 * Идентификатор чата в запросе не участвует вовсе. В приложении чата нет, а для личной
 * переписки он равен `user.id`, и берётся именно из проверенной подписью `initData`:
 * поле, пришедшее от клиента, назначило бы привязку чужому каналу.
 *
 * Решение о том, привязывать или отправить в офис, целиком принимает
 * `registerDriverByContact` (docs/principles.md → «Слои и зависимости»).
 */

const isLanguage = (value: unknown): value is Language => value === 'ru' || value === 'uz';

export default defineEventHandler(async (event): Promise<MiniAppRegisterResponse> => {
  const user = requireTelegramUser(event);
  const body = await readBody<Partial<MiniAppRegisterRequestBody>>(event);
  const contactData = typeof body?.contactData === 'string' ? body.contactData : '';

  if (!isLanguage(body?.language)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'язык должен быть «ru» или «uz»',
    });
  }

  const language = body.language;
  const contact = checkContactData({ contactData, token: readBotToken() });

  if (contact.outcome === 'missing' || contact.outcome === 'malformed' || contact.outcome === 'no_contact') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'нужна подписанная строка контакта из requestContact',
    });
  }

  // Подпись не сошлась или строка просрочена — это не исход привязки и в журнал попыток
  // не пишется: попыткой является контакт, про который Telegram сказал, что он настоящий,
  // а тут он этого не сказал. Строкой попытки такой запрос стал бы способом набить журнал
  // чем угодно, не выходя из консоли браузера.
  if (contact.outcome !== 'valid') {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'подпись контакта не принята, поделитесь номером заново',
    });
  }

  const result = await registerDriverByContact({
    // В личной переписке идентификатор чата равен идентификатору пользователя, и оба
    // приходят из строки, прошедшей проверку подписи.
    telegramChatId: user.id,
    telegramUserId: user.id,
    // Сверку «контакт принадлежит отправителю» делает сервис — та же, что стояла для
    // контакта, присланного боту в чат. Несовпадение даёт исход `contact_not_own`.
    contactUserId: contact.contact.userId,
    phoneRaw: contact.contact.phoneNumber,
    language,
  });

  return describeRegistrationResult(result, language);
});

import { Api } from 'grammy';

/**
 * Имя бота — то, из чего собирается ссылка приглашения `t.me/<имя>?start=inv_<токен>`.
 *
 * Спрашивается у Telegram, а не задаётся переменной окружения: имя жёстко связано
 * с токеном, а токенов три — локальный, стендовый и боевой (docs/decisions.md →
 * «Тестовых ботов два»). Переменная рядом с токеном означала бы, что их можно выставить
 * вразнобой, и приглашение, выпущенное на стенде, вело бы в боевого бота.
 *
 * `Api`, а не `Bot`: второй экземпляр бота с тем же токеном поднимать нельзя ни при каких
 * условиях — у токена Telegram ровно один приёмник апдейтов (server/adapters/telegram/outgoing.ts).
 *
 * Ответ кэшируется на процесс: имя бота меняется в @BotFather руками и не меняется само,
 * а ходить в Telegram на каждый выпуск приглашения незачем.
 */

const globalForIdentity = globalThis as typeof globalThis & {
  botUsernameByToken?: Map<string, string>;
};

const cache = (): Map<string, string> => {
  globalForIdentity.botUsernameByToken ??= new Map<string, string>();

  return globalForIdentity.botUsernameByToken;
};

export const getBotUsername = async (token: string): Promise<string> => {
  const cached = cache().get(token);

  if (cached !== undefined) {
    return cached;
  }

  const me = await new Api(token).getMe();

  cache().set(token, me.username);

  return me.username;
};

import { recordClientDevice } from '#server/services/devices/recordClientDevice';
import { recordMiniAppPromoTouch } from '#server/services/promo/recordPromoTouch';
import { requireTelegramLaunch } from '#server/utils/telegramAuth';
import type { MiniAppDeviceRequestBody, MiniAppDeviceResponse } from '#shared/types/miniapp';

/**
 * Вход в Mini App с телефона (issue #223). Зовёт его скрипт проверки движка на каждом открытии,
 * до основного кода; на старом движке ответ несёт офисы для экрана «обновите».
 *
 * Личность — `requireTelegramLaunch`, а не `requireMember`: пишется и незарегистрированный,
 * и тот, кто в программе не состоит, — белый экран видят и они.
 *
 * Здесь же — переход по промо-метке из ссылки `?startapp=` (issue #456): ручку зовут до основного
 * кода и на старом телефоне, где до `/api/miniapp/me` дело не доходит.
 */

/** Потолок строк от клиента: в лог не должно уехать сколько угодно чего угодно. */
const CLIENT_STRING_LIMIT = 64;

/**
 * Строка от клиента, обрезанная до потолка. Не строка — пусто, а не отказ: у Telegram постарше
 * поля может не быть вовсе, и отказ оставил бы экран «обновите» без офисов.
 */
const readClientString = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, CLIENT_STRING_LIMIT) : '';

export default defineEventHandler(async (event): Promise<MiniAppDeviceResponse> => {
  const launch = requireTelegramLaunch(event);
  const { user } = launch;
  const body = await readBody<Partial<Record<keyof MiniAppDeviceRequestBody, unknown>>>(event);

  if (typeof body?.engineOk !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'engineOk должен быть булевым',
    });
  }

  await recordMiniAppPromoTouch(launch);

  return recordClientDevice({
    telegramUserId: user.id,
    userAgent: getHeader(event, 'user-agent') ?? '',
    platform: readClientString(body.platform),
    botApiVersion: readClientString(body.botApiVersion),
    engineOk: body.engineOk,
  });
});

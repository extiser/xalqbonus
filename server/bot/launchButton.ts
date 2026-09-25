import type { OpenAppButton } from '#server/adapters/telegram/outgoing';
import { readMiniAppUrl } from '#server/bot/config';
import { text } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';

/**
 * Кнопка запуска приложения на языке человека — одна на приветствие бота и уведомление
 * `app_relaunch` после сброса сессии (issue #216). Водитель, нажавший «Сбросить», получает
 * ровно то, что получил бы на /start, — и разойтись этим двум кнопкам негде.
 *
 * Отдельным модулем, а не в `greeting.ts`: уведомления шлёт воркер, и тянуть в него
 * обработчики бота незачем.
 *
 * `undefined` на машине без `TG_MINIAPP_URL`: Telegram открывает Mini App только по `https`,
 * и подсунуть ему локальный адрес нечем. Приветствие при этом приходит целиком — оно
 * про кнопку под собой не говорит ни слова именно поэтому (server/bot/texts.ts).
 */
export const launchButton = (language: Language): OpenAppButton | undefined => {
  const miniAppUrl = readMiniAppUrl();

  if (miniAppUrl === '') {
    return undefined;
  }

  return { text: text('button_open_app', language), url: miniAppUrl };
};

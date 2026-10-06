import type { OpenAppButton } from '#server/adapters/telegram/outgoing';
import { readMiniAppUrl } from '#server/bot/config';
import { text, type TextKey } from '#server/bot/texts';
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
 *
 * Подпись — «Открыть приложение» везде, кроме уведомления о приветственном бонусе: там
 * та же кнопка зовёт «Забрать бонус» (server/bot/notifications.ts).
 */
export const launchButton = (
  language: Language,
  labelKey: Extract<TextKey, 'button_open_app' | 'button_claim_bonus'> = 'button_open_app',
): OpenAppButton | undefined => {
  const miniAppUrl = readMiniAppUrl();

  if (miniAppUrl === '') {
    return undefined;
  }

  return { text: text(labelKey, language), url: miniAppUrl };
};

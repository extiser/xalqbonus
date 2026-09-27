import { consola } from 'consola';
import type { Bot, Context } from 'grammy';

import { openAppKeyboard } from '#server/adapters/telegram/outgoing';
import { launchButton } from '#server/bot/launchButton';
import { sendScreen } from '#server/bot/screen';
import { text, type TextKey } from '#server/bot/texts';
import type { Language } from '#server/generated/prisma/enums';
import { acceptDemoInvite, type AcceptDemoInviteOutcome } from '#server/services/demo/acceptDemoInvite';
import { readDemoInviteToken } from '#server/services/demo/demoInviteToken';

/**
 * Приём приглашения в демо в боте (issue #252): `/start demo_<токен>` — сразу, без контакта.
 * Личность — `from.id` апдейта: Telegram его подписывает, и руками он не вводится нигде.
 *
 * Регистрируется **перед** приглашением сотрудника и приветствием и уступает им всё, что
 * не про демо (`next()`): `/start` без параметра, `inv_…`, любое другое сообщение.
 *
 * Правила целиком в сервисе: обработчик разбирает апдейт, зовёт `acceptDemoInvite` и рисует
 * ответ (docs/principles.md → «Слои и зависимости»).
 */

const log = consola.withTag('bot:demo-invite');

/** Язык ответа — русский всегда: у зрителя до принятия языка нет. */
const DEMO_INVITE_LANGUAGE: Language = 'ru';

/**
 * Текст на каждый исход. Полнота таблицы — защита: новый исход сервиса сломает сборку здесь
 * и заставит написать текст.
 */
export const DEMO_INVITE_TEXT_KEYS: Readonly<Record<AcceptDemoInviteOutcome, TextKey>> = {
  accepted: 'demo_invite_accepted',
  invite_unknown: 'demo_invite_unknown',
  invite_used: 'demo_invite_used',
  invite_revoked: 'demo_invite_revoked',
  invite_expired: 'demo_invite_expired',
  telegram_linked: 'demo_invite_telegram_linked',
  telegram_employee: 'demo_invite_telegram_employee',
  no_source: 'demo_invite_no_source',
};

const chatIdOf = (context: Context): bigint | null =>
  context.chat === undefined ? null : BigInt(context.chat.id);

export const registerDemoInviteHandlers = (bot: Bot): void => {
  bot.command('start', async (context, next) => {
    const chatId = chatIdOf(context);
    const token = readDemoInviteToken(context.match ?? '');

    // Не приглашение в демо — апдейт уходит дальше нетронутым.
    if (chatId === null || token === null || context.from === undefined) {
      await next();

      return;
    }

    const result = await acceptDemoInvite({ token, telegramUserId: BigInt(context.from.id) });

    log.info('открыта ссылка приглашения в демо', { chatId: chatId.toString(), outcome: result.outcome });

    // Кнопка запуска — только принявшему: остальным открывать в приложении нечего.
    const button = result.outcome === 'accepted' ? launchButton(DEMO_INVITE_LANGUAGE) : undefined;

    await sendScreen(context, chatId, text(DEMO_INVITE_TEXT_KEYS[result.outcome], DEMO_INVITE_LANGUAGE), {
      reply_markup: openAppKeyboard(button),
    });
  });
};

import { db } from '#server/db';
import type { LinkAttemptOutcome } from '#server/generated/prisma/enums';

/**
 * Журнал попыток привязать Telegram.
 *
 * Пишутся все попытки, а не только отказы. Без удачных не считается ни доля автопривязок,
 * ни сколько людей дошло до бота и отвалилось, — а эти два числа решают, работает ли довод
 * «зарегистрируйся» при обзвоне парка.
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

export type TelegramLinkAttemptInput = {
  telegramChatId: bigint;
  /** Отправитель апдейта. Пуст, если Telegram его не показал. */
  telegramUserId: bigint | null;
  /** Номер ровно как пришёл в контакте. */
  phoneRaw: string;
  /** Наша нормализация. Пусто, если номер к каноническому виду не приводится. */
  phoneE164: string | null;
  outcome: LinkAttemptOutcome;
  profileId: string | null;
  personId: string | null;
};

/**
 * Кладёт строку попытки.
 *
 * Ничего не проверяет и ни на что не ссылается: это журнал того, что мы видели в момент
 * попытки. Профиль из ответа Fleet API мог в реестр так и не завестись, а строка попытки
 * обязана остаться в любом случае — на неё и смотрят, когда разбираются, почему водитель
 * пришёл в офис.
 */
export const insertTelegramLinkAttempt = async (
  attempt: TelegramLinkAttemptInput,
): Promise<void> => {
  await db.$executeRaw`
    INSERT INTO xb.telegram_link_attempts (
      "telegram_chat_id", "telegram_user_id", "phone_raw", "phone_e164",
      "outcome", "profile_id", "person_id"
    )
    VALUES (
      ${attempt.telegramChatId.toString()}::text::bigint,
      ${attempt.telegramUserId?.toString() ?? null}::text::bigint,
      ${attempt.phoneRaw},
      ${attempt.phoneE164},
      ${attempt.outcome}::xb.link_attempt_outcome,
      ${attempt.profileId},
      ${attempt.personId}::uuid
    )
  `;
};

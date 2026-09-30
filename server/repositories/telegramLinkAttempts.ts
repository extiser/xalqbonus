import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
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
  /**
   * Номер ровно как пришёл в контакте.
   *
   * `null` — номера в строке не будет вовсе: так пишется попытка с чужим контактом.
   * Не пустая строка: та означала бы «номер был, и он пустой».
   */
  phoneRaw: string | null;
  /** Наша нормализация. Пусто, если номер не приводится к каноническому виду или его нет. */
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

/**
 * Исходы, при которых человек определён однозначно по подтверждённому телефону (issue #305).
 *
 * `several_profiles` и `profile_fired` сюда не входят: у первого в `person_id` пишется первый
 * из найденных профилей, у второго — уволенный.
 */
const RELINK_OUTCOMES: readonly LinkAttemptOutcome[] = [
  'person_already_linked',
  'telegram_already_linked',
  'link_closed_in_history',
];

/** Сколько дней попытка годится для привязки из карточки. */
const RELINK_ATTEMPT_DAYS = 30;

export type RelinkAttemptRow = {
  telegramChatId: bigint;
  telegramUserId: bigint;
  phoneE164: string | null;
  phoneRaw: string | null;
  createdAt: Date;
};

/**
 * Попытка, на которую опирается привязка Telegram из карточки водителя (issue #305).
 *
 * Самая свежая за последние 30 дней, где этот человек делился номером с этого Telegram
 * и номер сошёлся с его номером в парке. Вбитый сотрудником ID лишь выбирает такую строку:
 * чат и отправитель новой привязки берутся отсюда, а не из ввода, поэтому подтверждённый
 * телефоном канал не подменить ни опечаткой, ни чужим ID.
 *
 * По `telegram_user_id`: экран отказа показывает водителю именно его.
 */
export const findRelinkAttempt = async (
  personId: string,
  telegramUserId: bigint,
  client: Prisma.TransactionClient = db,
): Promise<RelinkAttemptRow | null> => {
  const rows = await client.$queryRaw<RelinkAttemptRow[]>`
    SELECT "telegram_chat_id" AS "telegramChatId",
           "telegram_user_id" AS "telegramUserId",
           "phone_e164"       AS "phoneE164",
           "phone_raw"        AS "phoneRaw",
           "created_at"       AS "createdAt"
      FROM xb.telegram_link_attempts
     WHERE "person_id" = ${personId}::uuid
       AND "telegram_user_id" = ${telegramUserId.toString()}::text::bigint
       AND "outcome" = ANY(${RELINK_OUTCOMES}::text[]::xb.link_attempt_outcome[])
       AND "created_at" >= now() - make_interval(days => ${RELINK_ATTEMPT_DAYS}::int)
     ORDER BY "created_at" DESC, "id" DESC
     LIMIT 1
  `;

  return rows[0] ?? null;
};

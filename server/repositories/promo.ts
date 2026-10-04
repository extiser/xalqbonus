import { db } from '#server/db';

/**
 * Переходы по промо-меткам (issue #377).
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

export type PromoTouchInput = {
  /** Код метки целиком, с префиксом: `p_poster1`. */
  code: string;
  telegramUserId: bigint;
  telegramChatId: bigint;
};

export type PromoTouchRow = {
  personId: string | null;
  wasParticipant: boolean;
};

/**
 * Кладёт строку касания и тем же запросом определяет человека и признак участника.
 *
 * Привязка ищется по отправителю, а у строк, где он пуст, — по чату: у перенесённых
 * из старой базы привязок `telegram_user_id` нет, есть только `telegram_chat_id`.
 * Человек — с живой привязкой; участник — хоть одна привязка, живая или закрытая
 * (docs/decisions.md → «Баллы в метриках дашборда»).
 *
 * Живая привязка на Telegram одна — частичный уникальный индекс по чату; порядок по дате
 * только делает выбор однозначным, если отправитель и чат разойдутся.
 */
export const insertPromoTouch = async (touch: PromoTouchInput): Promise<PromoTouchRow> => {
  const telegramUserId = touch.telegramUserId.toString();
  const telegramChatId = touch.telegramChatId.toString();

  const rows = await db.$queryRaw<PromoTouchRow[]>`
    WITH links AS (
      SELECT link."person_id", link."closed_at", link."linked_at"
        FROM xb.telegram_links AS link
       WHERE link."telegram_user_id" = ${telegramUserId}::text::bigint
          OR (link."telegram_user_id" IS NULL AND link."telegram_chat_id" = ${telegramChatId}::text::bigint)
    )
    INSERT INTO xb.promo_touches (
      "code", "telegram_user_id", "telegram_chat_id", "person_id", "was_participant"
    )
    VALUES (
      ${touch.code},
      ${telegramUserId}::text::bigint,
      ${telegramChatId}::text::bigint,
      (SELECT links."person_id" FROM links WHERE links."closed_at" IS NULL
        ORDER BY links."linked_at" DESC LIMIT 1),
      EXISTS (SELECT 1 FROM links)
    )
    RETURNING "person_id" AS "personId", "was_participant" AS "wasParticipant"
  `;

  const row = rows[0];

  if (row === undefined) {
    throw new Error('вставка касания промо-метки не вернула строку');
  }

  return row;
};

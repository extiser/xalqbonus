import { db } from '#server/db';

/**
 * Фикстуры и уборка для тестов рассылок.
 *
 * Уборка по заведённым рассылкам, а не `TRUNCATE`: база общая с остальными тестами. Идёт
 * первой — снимок ссылается и на людей, и рассылка на сотрудника, и уборка по ним иначе
 * упёрлась бы во внешние ключи.
 */

const createdMailingIds = new Set<string>();

export const trackTestMailing = (mailingId: string): void => {
  createdMailingIds.add(mailingId);
};

export type RecipientSnapshot = { personId: string; outcome: string; outcomeAt: Date | null };

/** Строки снимка рассылки по этим людям, по порядку идентификатора. */
export const readTestRecipients = async (
  mailingId: string,
  personIds: string[],
): Promise<RecipientSnapshot[]> =>
  db.$queryRaw<RecipientSnapshot[]>`
    SELECT "person_id"     AS "personId",
           "outcome"::text AS "outcome",
           "outcome_at"    AS "outcomeAt"
      FROM xb.mailing_recipients
     WHERE "mailing_id" = ${mailingId}::uuid
       AND "person_id" = ANY(${personIds}::uuid[])
     ORDER BY "person_id"
  `;

/** Сколько строк в снимке рассылки всего — с тем, что посчитали счётчики, это и сверяется. */
export const countTestRecipients = async (mailingId: string): Promise<number> => {
  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS "total" FROM xb.mailing_recipients WHERE "mailing_id" = ${mailingId}::uuid
  `;

  return rows[0]?.total ?? 0;
};

export const setTestNotificationsEnabled = async (
  personId: string,
  enabled: boolean,
): Promise<void> => {
  await db.personSettings.update({ where: { personId }, data: { notificationsEnabled: enabled } });
};

/** Закрывает активную привязку человека — так выглядит канал, закрытый после снимка. */
export const closeTestLinks = async (personId: string): Promise<void> => {
  await db.$executeRaw`
    UPDATE xb.telegram_links
       SET "closed_at" = now(), "close_reason" = 'operator'::xb.link_close_reason
     WHERE "person_id" = ${personId}::uuid AND "closed_at" IS NULL
  `;
};

export const cleanupTestMailings = async (): Promise<void> => {
  const mailingIds = [...createdMailingIds];
  createdMailingIds.clear();

  if (mailingIds.length === 0) {
    return;
  }

  await db.$executeRaw`DELETE FROM xb.mailing_recipients WHERE "mailing_id" = ANY(${mailingIds}::uuid[])`;
  await db.$executeRaw`DELETE FROM xb.mailings WHERE "id" = ANY(${mailingIds}::uuid[])`;
};

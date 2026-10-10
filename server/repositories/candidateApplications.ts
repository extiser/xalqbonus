import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  CandidateApplicationChannel,
  CandidateMatch,
  CandidatePhoneSource,
  Language,
} from '#server/generated/prisma/enums';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';
import { parkDaySql } from '#server/utils/parkDaySql';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

/**
 * Заявки кандидатов (issue #456) и последняя поездка человека для сверки номера.
 *
 * Схема в сыром SQL указывается явно: у соединения драйверного адаптера `search_path`
 * дефолтный, и запрос без префикса молча ушёл бы в `public` (docs/decisions.md).
 */

/** Открытая заявка — «Новая» или «В работе»: та, что держат частичные уникальные индексы. */
const OPEN_STATUSES = ['new', 'in_progress'] as const;

/** То, что заявка показывает кандидату: экраны «Заявка принята» и «Заявка уже отправлена». */
export type CandidateApplicationRow = {
  id: string;
  name: string;
  phoneE164: string;
  writeAllowed: boolean;
  language: Language;
  createdAt: Date;
};

const APPLICATION_SELECT = {
  id: true,
  name: true,
  phoneE164: true,
  writeAllowed: true,
  language: true,
  createdAt: true,
} as const;

export type CandidateApplicationInput = {
  channel: CandidateApplicationChannel;
  telegramUserId: bigint;
  telegramChatId: bigint;
  telegramName: string;
  telegramUsername: string | null;
  name: string;
  phoneRaw: string;
  phoneE164: string;
  phoneSource: CandidatePhoneSource;
  writeAllowed: boolean;
  language: Language;
  promoCode: string;
  match: CandidateMatch;
  matchedPersonId: string | null;
  matchedProfileId: string | null;
  /** `YYYY-MM-DD`. */
  lastTripDay: string | null;
  formerLinkPersonId: string | null;
};

/**
 * Заводит заявку со статусом «Новая». `null` — вставку отбил индекс открытой заявки: у этого
 * Telegram или этого подтверждённого номера она уже есть. Это исход, а не ошибка — так кончается
 * гонка двух нажатий, и ответ на него — уже заведённая заявка.
 */
export const insertCandidateApplication = async (
  input: CandidateApplicationInput,
): Promise<CandidateApplicationRow | null> => {
  try {
    return await db.candidateApplication.create({
      data: {
        ...input,
        lastTripDay: input.lastTripDay === null ? null : new Date(`${input.lastTripDay}T00:00:00Z`),
      },
      select: APPLICATION_SELECT,
    });
  } catch (error) {
    // Уникальных ограничений у таблицы — первичный ключ со случайным значением и два индекса
    // открытой заявки, поэтому нарушение уникальности здесь — это индекс открытой заявки.
    if (describeDatabaseFailure(error)?.code === UNIQUE_VIOLATION) {
      return null;
    }

    throw error;
  }
};

/** Открытая заявка этого Telegram. */
export const findOpenApplicationByTelegram = async (
  telegramUserId: bigint,
): Promise<CandidateApplicationRow | null> =>
  db.candidateApplication.findFirst({
    where: { telegramUserId, status: { in: [...OPEN_STATUSES] } },
    select: APPLICATION_SELECT,
  });

/**
 * Открытая заявка с этим номером, подтверждённым Telegram. Заявка с номером, введённым руками,
 * не находится: номер в ней не подтверждён ничем.
 */
export const findOpenApplicationByPhone = async (phoneE164: string): Promise<CandidateApplicationRow | null> =>
  db.candidateApplication.findFirst({
    where: { phoneE164, phoneSource: 'telegram_contact', status: { in: [...OPEN_STATUSES] } },
    select: APPLICATION_SELECT,
  });

/**
 * Последние сутки по Ташкенту с поездкой человека — `YYYY-MM-DD`; `null` — поездок нет или
 * человек демо.
 *
 * Наибольшее из трёх: сутки `metric_person_days`, сутки до истории заказов `metric_person_prior`
 * и сутки завершённых поездок `trips` по всем профилям человека. Последнее — ради сегодняшних
 * поездок: метрики пересчитываются ночью. Ряд тот же, что у пула возврата на дашборде
 * (`winbackTripDaysSql`), плюс `trips`.
 */
export const findPersonLastTripDay = async (personId: string): Promise<string | null> => {
  const rows = await db.$queryRaw<{ lastDay: string | null }[]>`
    SELECT to_char(max(trip_day."day"), 'YYYY-MM-DD') AS "lastDay"
      FROM (
             SELECT person_day."day"
               FROM xb.metric_person_days AS person_day
              WHERE person_day."person_id" = ${personId}::uuid
             UNION ALL
             SELECT prior_trips."last_day" AS "day"
               FROM xb.metric_person_prior AS prior_trips
              WHERE prior_trips."person_id" = ${personId}::uuid
             UNION ALL
             SELECT ${parkDaySql(Prisma.sql`trip."ended_at"`)} AS "day"
               FROM xb.trips AS trip
               JOIN xb.park_profiles AS profile ON profile."profile_id" = trip."profile_id"
              WHERE profile."person_id" = ${personId}::uuid
                AND trip."status" = ${COMPLETED_TRIP_STATUS}
                AND trip."ended_at" IS NOT NULL
           ) AS trip_day
     WHERE NOT EXISTS (
             SELECT 1 FROM xb.persons AS person
              WHERE person."id" = ${personId}::uuid AND person."is_demo"
           )
  `;

  return rows[0]?.lastDay ?? null;
};

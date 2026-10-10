import { db } from '#server/db';
import { Prisma } from '#server/generated/prisma/client';
import type {
  CandidateApplicationChannel,
  CandidateApplicationStatus,
  CandidateMatch,
  CandidatePhoneSource,
  Language,
} from '#server/generated/prisma/enums';
import { describeDatabaseFailure, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';
import { parkDaySql } from '#server/utils/parkDaySql';
import { COMPLETED_TRIP_STATUS } from '#server/utils/tripStatus';

/**
 * Заявки кандидатов (issue #456), их темы в группе сотрудников (issue #463) и последняя
 * поездка человека для сверки номера.
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
    // Уникальных ограничений у таблицы — первичный ключ со случайным значением, два индекса
    // открытой заявки и пара темы в группе, при вставке пустая. Нарушение уникальности здесь —
    // это индекс открытой заявки.
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

/**
 * Заявка в переписке с кандидатом (issue #463): куда писать кандидату и где его тема.
 */
export type CandidateChatApplication = {
  id: string;
  status: CandidateApplicationStatus;
  telegramChatId: bigint;
  name: string;
  phoneE164: string;
  writeAllowed: boolean;
  language: Language;
  forumChatId: bigint | null;
  forumTopicId: number | null;
  topicCardMessageId: number | null;
  handledByEmployeeId: string | null;
};

const CHAT_APPLICATION_SELECT = {
  id: true,
  status: true,
  telegramChatId: true,
  name: true,
  phoneE164: true,
  writeAllowed: true,
  language: true,
  forumChatId: true,
  forumTopicId: true,
  topicCardMessageId: true,
  handledByEmployeeId: true,
} as const;

export const findChatApplicationById = async (applicationId: string): Promise<CandidateChatApplication | null> =>
  db.candidateApplication.findUnique({ where: { id: applicationId }, select: CHAT_APPLICATION_SELECT });

/**
 * Последняя по времени заявка этого Telegram при любом статусе: сообщения кандидата
 * после «Оформлен» и «Отказ» идут в тему его последней заявки (docs/decisions.md →
 * «Переписка с кандидатом»).
 */
export const findLatestApplicationByTelegram = async (
  telegramUserId: bigint,
): Promise<CandidateChatApplication | null> =>
  db.candidateApplication.findFirst({
    where: { telegramUserId },
    orderBy: { createdAt: 'desc' },
    select: CHAT_APPLICATION_SELECT,
  });

/** Заявка темы — по паре группы и `message_thread_id`, её держит уникальный индекс. */
export const findApplicationByTopic = async (
  forumChatId: bigint,
  forumTopicId: number,
): Promise<CandidateChatApplication | null> =>
  db.candidateApplication.findUnique({
    where: { forumChatId_forumTopicId: { forumChatId, forumTopicId } },
    select: CHAT_APPLICATION_SELECT,
  });

/** То, что карточка заявки в теме показывает сотрудникам сверх заявки в переписке. */
export type CandidateTopicCard = CandidateChatApplication & {
  telegramName: string;
  telegramUsername: string | null;
  promoCode: string;
  /** Название метки. Пусто — метки с таким кодом нет: внешнего ключа у кода нет. */
  promoLinkName: string | null;
  match: CandidateMatch;
  /** `YYYY-MM-DD`. */
  lastTripDay: string | null;
};

export const findCandidateTopicCard = async (applicationId: string): Promise<CandidateTopicCard | null> => {
  const application = await db.candidateApplication.findUnique({
    where: { id: applicationId },
    select: {
      ...CHAT_APPLICATION_SELECT,
      telegramName: true,
      telegramUsername: true,
      promoCode: true,
      match: true,
      lastTripDay: true,
    },
  });

  if (!application) {
    return null;
  }

  const promoLink = await db.promoLink.findUnique({
    where: { code: application.promoCode },
    select: { name: true },
  });

  return {
    ...application,
    promoLinkName: promoLink?.name ?? null,
    // Колонка `date`: Prisma отдаёт её полночью UTC, и день — первые десять знаков.
    lastTripDay: application.lastTripDay === null ? null : application.lastTripDay.toISOString().slice(0, 10),
  };
};

/**
 * Записывает тему заявки. Только если темы ещё нет: повтор задания, заведший вторую тему,
 * первую не перетирает.
 */
export const recordApplicationTopic = async (
  applicationId: string,
  forumChatId: bigint,
  forumTopicId: number,
): Promise<void> => {
  await db.candidateApplication.updateMany({
    where: { id: applicationId, forumTopicId: null },
    data: { forumChatId, forumTopicId },
  });
};

/** Записывает сообщение с карточкой заявки в теме. */
export const recordApplicationTopicCard = async (applicationId: string, messageId: number): Promise<void> => {
  await db.candidateApplication.update({
    where: { id: applicationId },
    data: { topicCardMessageId: messageId },
  });
};

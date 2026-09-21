import type {
  CampaignRow,
  CampaignStateCountRow,
  CampaignWindowRow,
} from '#server/repositories/campaigns';
import { InvalidCampaignFieldsError } from '#server/services/campaigns/errors';
import { readUuid } from '#server/utils/query';
import { CAMPAIGN_SLUG_PATTERN, isCalendarDay } from '#shared/campaign';
import type {
  Campaign,
  CampaignHalfBreakdown,
  CampaignParticipantState,
  CampaignWindow,
} from '#shared/types/campaign';

/**
 * Перевод между строкой базы, контрактом ручки и телом запроса. Операцией не является
 * и поэтому лежит отдельным файлом: нужен он всем ручкам акций сразу.
 */

const toWindow = (row: CampaignWindowRow): CampaignWindow => ({
  startsOn: row.startsOn,
  endsOn: row.endsOn,
  startsAt: row.startsAt?.toISOString() ?? null,
  endsAt: row.endsAt?.toISOString() ?? null,
});

export const toCampaign = (row: CampaignRow): Campaign => ({
  campaignId: row.id,
  slug: row.slug,
  title: row.title,
  status: row.status,
  segment:
    row.segmentId === null || row.segmentName === null
      ? null
      : {
          segmentId: row.segmentId,
          name: row.segmentName,
          archivedAt: row.segmentArchivedAt?.toISOString() ?? null,
        },
  splitEnabled: row.splitEnabled,
  audienceSize: row.audienceSize,
  createdByName: row.createdByName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  launchedAt: row.launchedAt?.toISOString() ?? null,
  halfA: toWindow(row.halfA),
  halfB: row.halfB ? toWindow(row.halfB) : null,
});

const EMPTY_STATES: Readonly<Record<CampaignParticipantState, number>> = {
  invited: 0,
  opened: 0,
  joined: 0,
  declined: 0,
};

/**
 * Разбивка по состояниям. Половина без единого участника в ответ не попадает: без деления
 * строки `b` нет вовсе, и нули по ней утверждали бы, что контроль был.
 */
export const toBreakdown = (rows: CampaignStateCountRow[]): CampaignHalfBreakdown[] => {
  const byHalf = new Map<CampaignHalfBreakdown['half'], CampaignHalfBreakdown>();

  for (const row of rows) {
    const current = byHalf.get(row.half) ?? { half: row.half, total: 0, states: { ...EMPTY_STATES } };

    current.states[row.state] += row.total;
    current.total += row.total;
    byHalf.set(row.half, current);
  }

  return [...byHalf.values()].sort((left, right) => left.half.localeCompare(right.half));
};

/** Что сервис заведения и правки черновика получает на вход — уже разобранным. */
export type CampaignFields = {
  title: string | null;
  slug: string | null;
  segmentId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  splitEnabled: boolean;
};

/**
 * Тело запроса так, как его видит разбор: всё `unknown`, типом присланному не верим.
 * Форма записана здесь, а не в `shared/types/campaign.ts`: там обещанное отправляющему,
 * здесь то, чему мы не верим.
 */
export type CampaignRequestFields = {
  title?: unknown;
  slug?: unknown;
  segmentId?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  splitEnabled?: unknown;
};

export type CampaignWindowRequestFields = {
  startsOn?: unknown;
  endsOn?: unknown;
};

/** Строка поля, обрезанная по краям. Пустое и не строка — `null`: пусто пишется одним способом. */
const readText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';

  return text === '' ? null : text;
};

const readDay = (value: unknown): string | null => {
  const day = readText(value);

  if (day !== null && !isCalendarDay(day)) {
    throw new InvalidCampaignFieldsError('day_invalid');
  }

  return day;
};

/** Последний день не раньше первого. Окно в один день — рабочее: первый день равен последнему. */
const assertWindowOrder = (startsOn: string | null, endsOn: string | null): void => {
  // Строки `YYYY-MM-DD` сравниваются как даты: порядок символов совпадает с порядком дней.
  if (startsOn !== null && endsOn !== null && startsOn > endsOn) {
    throw new InvalidCampaignFieldsError('window_reversed');
  }
};

/**
 * Поля черновика из тела запроса. Обязательных нет: черновик сохраняет себя по мере набора
 * (issue #148), и чего не хватает для запуска, решает запуск. То, что задано, проверяется
 * сразу: кривой `slug` отбила бы и база, но словами про ограничение, а не про поле.
 */
export const readCampaignFields = (
  body: CampaignRequestFields | null | undefined,
): CampaignFields => {
  const slug = readText(body?.slug);

  if (slug !== null && !CAMPAIGN_SLUG_PATTERN.test(slug)) {
    throw new InvalidCampaignFieldsError('slug_invalid');
  }

  const segmentText = readText(body?.segmentId);
  const segmentId = segmentText === null ? null : readUuid(segmentText);

  if (segmentText !== null && segmentId === null) {
    throw new InvalidCampaignFieldsError('segment_invalid');
  }

  const startsOn = readDay(body?.startsOn);
  const endsOn = readDay(body?.endsOn);

  assertWindowOrder(startsOn, endsOn);

  return {
    title: readText(body?.title),
    slug,
    segmentId,
    startsOn,
    endsOn,
    // Переключатель: всё, кроме явного `true`, — «не делить». Деление — решение, и включиться
    // от испорченного запроса оно не должно.
    splitEnabled: body?.splitEnabled === true,
  };
};

/** Окно половины Б: обе даты обязательны — назначается оно один раз и целиком. */
export const readCampaignWindow = (
  body: CampaignWindowRequestFields | null | undefined,
): { startsOn: string; endsOn: string } => {
  const startsOn = readDay(body?.startsOn);
  const endsOn = readDay(body?.endsOn);

  if (startsOn === null || endsOn === null) {
    throw new InvalidCampaignFieldsError('window_incomplete');
  }

  assertWindowOrder(startsOn, endsOn);

  return { startsOn, endsOn };
};

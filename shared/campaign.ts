/**
 * Правила акции, общие для сервера и экрана.
 *
 * Лежат в `shared/` по той же причине, что правила рассылки: экран по ним закрывает кнопку
 * запуска и называет причины рядом, а сервер по ним же отказывает. Два списка — серверный
 * и клиентский — разошлись бы на первой правке, и кнопка звала бы в заведомый отказ.
 */

/** Сколько строк участников на странице карточки акции. */
export const CAMPAIGN_PARTICIPANTS_LIMIT = 25;

/**
 * `slug`: строчная латиница, цифры и одиночные дефисы между ними — `comeback-wave-1`.
 * Уходит в ключ идемпотентности `campaign:<slug>:<persons.id>`, и двоеточие или пробел
 * в нём разломали бы ключ. То же правило стоит проверкой `campaigns_slug_check`.
 */
export const CAMPAIGN_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Дата окна, как её отдаёт поле `type="date"`: `YYYY-MM-DD`. */
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Настоящая ли это дата календаря: `2026-02-30` по шаблону проходит, а дня такого нет. */
export const isCalendarDay = (value: string): boolean => {
  const parsed = DAY_PATTERN.exec(value);

  if (!parsed) {
    return false;
  }

  const [, year, month, day] = parsed.map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }

  const moment = new Date(Date.UTC(year, month - 1, day));

  return (
    moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month - 1 &&
    moment.getUTCDate() === day
  );
};

/** Чего не хватает черновику для запуска. Все причины сразу — экран называет их списком. */
export type CampaignLaunchProblem =
  | 'title_missing'
  | 'slug_missing'
  | 'segment_missing'
  | 'window_missing';

/** Поля, по которым судит запуск: что на экране у формы и что в базе у сервера. */
export type CampaignLaunchFields = {
  title: string | null;
  slug: string | null;
  segmentId: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

const present = (value: string | null): boolean => value !== null && value.trim() !== '';

export const campaignLaunchProblems = (fields: CampaignLaunchFields): CampaignLaunchProblem[] => {
  const problems: CampaignLaunchProblem[] = [];

  if (!present(fields.title)) {
    problems.push('title_missing');
  }

  if (!present(fields.slug)) {
    problems.push('slug_missing');
  }

  if (!present(fields.segmentId)) {
    problems.push('segment_missing');
  }

  if (!present(fields.startsOn) || !present(fields.endsOn)) {
    problems.push('window_missing');
  }

  return problems;
};

const LAUNCH_PROBLEM_TEXT: Record<CampaignLaunchProblem, string> = {
  title_missing: 'Нужно название.',
  slug_missing: 'Нужно короткое имя латиницей.',
  segment_missing: 'Нужно выбрать сегмент.',
  window_missing: 'Нужны обе даты окна половины А.',
};

export const campaignLaunchProblemText = (problem: CampaignLaunchProblem): string =>
  LAUNCH_PROBLEM_TEXT[problem];

export const CAMPAIGN_SEGMENT_ARCHIVED_TEXT =
  'Сегмент в архиве. Выберите рабочий сегмент — по архивному акция не запускается.';

export const CAMPAIGN_AUDIENCE_EMPTY_TEXT =
  'По сегменту сейчас нет ни одного водителя — запускать не на ком.';

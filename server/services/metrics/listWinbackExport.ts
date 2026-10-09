import { listLeaderPeople, type LeaderPersonRow } from '#server/repositories/metrics';
import { WINBACK_MANY_RIDES } from '#server/services/metrics/constants';
import { readMetricsMonth } from '#server/services/metrics/monthPeriod';
import { readWinback, type WinbackCallPerson } from '#server/services/metrics/readWinbackPool';
import { formatReportDay } from '#server/services/reports/reportTable';
import { monthForms } from '#shared/monthNames';
import type { ReportColumn, ReportResult, ReportRow } from '#shared/types/reports';

/**
 * Выгрузка «Можно вернуть» для обзвона за месяц (issue #446) — кнопка «Выгрузить для обзвона»
 * на «Глубине». Строки — ушедшие 1–12 месяцев назад на день отсчёта, те же люди, что в цифрах
 * плитки: оба читают `readWinback`. «Больше года» в выгрузку не идёт (docs/decisions.md →
 * «Пул возврата на дашборде»). Книгу собирает `buildReportWorkbook`, как у списка лидеров.
 *
 * Контакты — как у списка лидеров (`listLeaderPeople`): позывной и ФИО — профиля последней
 * поездки, телефоны — все незакрытые номера всех профилей человека, «Программа» — привязка
 * Telegram, открытая сейчас.
 *
 * Порядок — сначала 100+ поездок, внутри — от недавно ушедших; затем остальные так же.
 *
 * Месяц приходит из запроса как есть; негодный — `MetricsMonthError` (`monthPeriod.ts`).
 * Цифр у пула нет — `WinbackPoolError` с причиной.
 */

/** Пул за месяц не считается: собраны не все сутки или прогона денег не было. Текст — готовый ответ. */
export class WinbackPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WinbackPoolError';
  }
}

const TITLE = 'Можно вернуть';

const COLUMNS: ReportColumn[] = [
  { key: 'callsign', label: 'Позывной', kind: 'text' },
  { key: 'lastName', label: 'Фамилия', kind: 'text' },
  { key: 'firstName', label: 'Имя', kind: 'text' },
  { key: 'middleName', label: 'Отчество', kind: 'text' },
  { key: 'phones', label: 'Телефон', kind: 'text' },
  { key: 'inProgram', label: 'Участник программы', kind: 'text' },
  { key: 'idleDays', label: 'Не ездит, дней', kind: 'count' },
  { key: 'lastTripDay', label: 'Последняя поездка', kind: 'text' },
  { key: 'band', label: 'Давность', kind: 'text' },
  { key: 'rides', label: 'Поездок с апреля 2024', kind: 'count' },
];

const toRow = (person: WinbackCallPerson, card: LeaderPersonRow | undefined): ReportRow => ({
  cells: {
    callsign: card?.callsign ?? null,
    lastName: card?.lastName ?? null,
    firstName: card?.firstName ?? null,
    middleName: card?.middleName ?? null,
    phones: card?.phones ?? null,
    inProgram: card?.inProgram === true ? 'да' : 'нет',
    idleDays: person.idleDays,
    lastTripDay: formatReportDay(person.lastDay),
    band: person.band.label,
    rides: person.rides,
  },
  kind: 'row',
});

export const listWinbackExport = async (monthParam: unknown, now: Date = new Date()): Promise<ReportResult> => {
  const month = readMetricsMonth(monthParam, now);
  const { pool, callList } = await readWinback(month, now);

  if (callList === null) {
    throw new WinbackPoolError(
      pool.computedAt === null
        ? 'Пул не считается: пересчёта денег ещё не было.'
        : 'Пул не считается: собраны не все сутки, нужные для расчёта.',
    );
  }

  const cards = new Map(
    (await listLeaderPeople(callList.map((person) => ({ personId: person.personId, lastDay: person.lastDay })))).map(
      (card) => [card.personId, card],
    ),
  );

  const rows = callList.map((person) => toRow(person, cards.get(person.personId)));

  return {
    report: 'winback',
    title: TITLE,
    subtitle: `Не ездят 1–12 месяцев на ${formatReportDay(pool.asOfDay)} · сначала ${WINBACK_MANY_RIDES}+ поездок с апреля 2024`,
    generatedAt: now.toISOString(),
    sections: [{ title: TITLE, columns: COLUMNS, rows, notes: [] }],
    empty: rows.length === 0,
  };
};

/** Имя файла: «Можно вернуть — октябрь 2026.xlsx». */
export const winbackFileName = (monthParam: unknown, now: Date = new Date()): string => {
  const month = readMetricsMonth(monthParam, now);

  return `${TITLE} — ${monthForms(month).nominative} ${month.slice(0, 4)}.xlsx`;
};

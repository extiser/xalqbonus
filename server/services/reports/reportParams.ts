import { findOffice } from '#server/repositories/offices';
import { DAY_MS } from '#server/utils/parkTime';
import { readUuid } from '#server/utils/query';

/**
 * Разбор параметров отчётов — один на все отчёты раздела (issue #308).
 *
 * Отказы — строками при своём правиле, а не кодами словаря двери: они про то, что прислали,
 * а не про то, кого пускать (docs/decisions.md → «Отказ двери веба говорит кодом, а текст
 * живёт словарём»). Ответом их делает `server/utils/reportFailure.ts`.
 */

/** Негодный параметр отчёта. Текст — готовый ответ человеку. */
export class ReportParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportParamsError';
  }
}

/** Офис, выбранный в фильтре. `null` у параметров — все офисы. */
export type ReportOfficeFilter = {
  officeId: string;
  name: string;
  archived: boolean;
};

/** Отчёт за период: продажи, движение товара, корректировки (issue #309). */
export type PeriodReportParams = {
  from: string;
  to: string;
  office: ReportOfficeFilter | null;
};

export type StockReportParams = {
  date: string;
  office: ReportOfficeFilter | null;
};

/** Самый длинный период отчёта, в сутках включительно: год, високосный тоже. */
const MAX_PERIOD_DAYS = 366;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Query = Record<string, unknown>;

/**
 * День `YYYY-MM-DD`, существующий в календаре: `2026-02-30` видом годится, а датой нет,
 * и `::date` Postgres уронил бы на нём запрос пятисоткой.
 */
const readDay = (value: unknown): string => {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
    throw new ReportParamsError('Дата — в виде ГГГГ-ММ-ДД.');
  }

  const moment = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(moment.getTime()) || moment.toISOString().slice(0, 10) !== value) {
    throw new ReportParamsError('Дата — в виде ГГГГ-ММ-ДД.');
  }

  return value;
};

/**
 * Офис фильтра. Пусто — все офисы. Демо-офиса для отчётов нет так же, как несуществующего:
 * демо не входит ни в одну общую цифру (docs/decisions.md).
 */
const readOffice = async (value: unknown): Promise<ReportOfficeFilter | null> => {
  if (value === undefined || value === '') {
    return null;
  }

  const officeId = readUuid(value);
  const office = officeId === null ? null : await findOffice(officeId);

  if (office === null || office.isDemo) {
    throw new ReportParamsError('Такого офиса нет.');
  }

  return { officeId: office.id, name: office.name, archived: office.archivedAt !== null };
};

export const readPeriodParams = async (query: Query): Promise<PeriodReportParams> => {
  const from = readDay(query.from);
  const to = readDay(query.to);

  if (from > to) {
    throw new ReportParamsError('Начало периода позже конца.');
  }

  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;

  if (days > MAX_PERIOD_DAYS) {
    throw new ReportParamsError('Период — не длиннее года.');
  }

  return { from, to, office: await readOffice(query.officeId) };
};

export const readStockParams = async (query: Query): Promise<StockReportParams> => ({
  date: readDay(query.date),
  office: await readOffice(query.officeId),
});

/**
 * Раздел «Отчёты» (issue #308): какие отчёты есть и с какого дня в системе есть история.
 *
 * Список один на обе стороны: сервер отдаёт по ключу отчёт, экран по тем же ключам строит
 * выбор. Новый отчёт — это ключ здесь, функция сервиса и ручка, а не новый экран и не новая
 * выгрузка: и экран, и Excel рисуют любой `ReportResult` одинаково.
 */

export type ReportKey =
  | 'sales'
  | 'stock'
  | 'turnover'
  | 'adjustments'
  | 'rewards'
  | 'order_outcomes'
  | 'staff'
  | 'points_economy';

export const REPORT_TITLES: Record<ReportKey, string> = {
  sales: 'Продажи за период',
  stock: 'Остатки на дату',
  turnover: 'Движение товара',
  adjustments: 'Корректировки остатков',
  rewards: 'Награды и подарки',
  order_outcomes: 'Судьба заказов',
  staff: 'Работа сотрудников',
  points_economy: 'Экономика балла',
};

/**
 * Путь ручки отчёта: `/api/reports/{путь}` и `…/export`. Ключ с подчёркиванием в адресе пишется
 * через дефис (issue #310) — `order_outcomes` → `order-outcomes`.
 */
export const reportPath = (key: ReportKey): string => key.replaceAll('_', '-');

/**
 * Отчёты по всему парку: офиса у них нет (issue #310). Баллы офису не принадлежат — поле
 * `Офис` на экране погашено, а ручка офис не принимает.
 */
export const PARK_WIDE_REPORTS: readonly ReportKey[] = ['points_economy'];

/**
 * День перехода на новую систему. Продаж старого бота в нашей базе нет: период, начатый
 * раньше, подписывается строкой об этом, а не выглядит «продаж не было».
 */
export const REPORTS_HISTORY_START = '2026-09-28';

/**
 * Зона и начало суток парка — те же, что `PARK_TIME_ZONE` и `PARK_DAY_START_HOUR` сервера
 * (`server/utils/parkTime.ts`), но своими константами: коду экрана до `server/` доступа нет
 * (так же устроен `shared/sendWindow.ts`). Нужны экрану ровно для одного — подставить
 * «сегодня» в фильтр по умолчанию; режет сутки отчёта сервер.
 */
const REPORT_TIME_ZONE = 'Asia/Tashkent';
const REPORT_DAY_START_HOUR = 5;

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Сутки парка момента — `2026-09-30`: до 05:00 по Ташкенту это ещё вчера. */
export const reportDayKey = (moment: Date): string =>
  DAY_KEY.format(new Date(moment.getTime() - REPORT_DAY_START_HOUR * 60 * 60 * 1_000));

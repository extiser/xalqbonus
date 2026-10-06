/**
 * Раздел «Отчёты» (issue #308): какие отчёты есть и с какого дня в системе есть история.
 *
 * Список один на обе стороны: сервер отдаёт по ключу отчёт, экран по тем же ключам строит
 * выбор. Новый отчёт — это ключ здесь, функция сервиса и ручка, а не новый экран и не новая
 * выгрузка: и экран, и Excel рисуют любой `ReportResult` одинаково.
 */

/** Отчёты раздела «Отчёты» — их выбирают на экране раздела. */
export type SectionReportKey =
  | 'sales'
  | 'stock'
  | 'turnover'
  | 'adjustments'
  | 'rewards'
  | 'order_outcomes'
  | 'staff'
  | 'points_economy';

/**
 * Любой отчёт, собранный в `ReportResult`: отчёты раздела и выгрузки дашборда — «Вне программы»
 * (issue #373), список лидеров (issue #402) и список новичков (issue #407). Выгрузка дашборда
 * рисуется в Excel той же книгой, но в выборе раздела её нет: её скачивают с плитки за месяц плитки.
 */
export type ReportKey = SectionReportKey | 'outside_program' | 'leaders' | 'newcomers';

export const REPORT_TITLES: Record<SectionReportKey, string> = {
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
export const PARK_WIDE_REPORTS: readonly SectionReportKey[] = ['points_economy'];

/**
 * День перехода на новую систему. Продаж старого бота в нашей базе нет: период, начатый
 * раньше, подписывается строкой об этом, а не выглядит «продаж не было».
 */
export const REPORTS_HISTORY_START = '2026-09-28';

/**
 * Зона парка — та же, что `PARK_TIME_ZONE` сервера (`server/utils/parkTime.ts`), но своей
 * константой: коду экрана до `server/` доступа нет (так же устроен `shared/sendWindow.ts`).
 * Нужна экрану ровно для одного — подставить «сегодня» в фильтр по умолчанию; режет сутки
 * отчёта сервер.
 */
const REPORT_TIME_ZONE = 'Asia/Tashkent';

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Сутки момента — `2026-09-30`: календарный день по Ташкенту (docs/decisions.md → «Сутки —
 * с 00:00 до 00:00 по Ташкенту; у акции — свои, с 05:00»).
 */
export const reportDayKey = (moment: Date): string => DAY_KEY.format(moment);

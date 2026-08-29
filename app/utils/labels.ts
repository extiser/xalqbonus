import type {
  DriverMembership,
  DriverOperation,
  DriverOperationCounterparty,
  DriverTelegramLink,
} from '#shared/types/driver';
import type { SyncRunRow, SyncSkipRow } from '#shared/types/sync';

/**
 * Подписи словарей на экране.
 *
 * Живут одним местом, а не строками в разметке: вид прогона называется в четырёх блоках
 * экрана, и четыре независимых перевода одного и того же слова разойдутся.
 */

const RUN_KIND_LABELS: Record<SyncRunRow['kind'], string> = {
  orders: 'Заказы',
  orders_catchup: 'Заказы, догоняющий',
  registry: 'Реестр',
  registry_full: 'Реестр, полный обход',
};

export const runKindLabel = (kind: SyncRunRow['kind']): string => RUN_KIND_LABELS[kind];

const RUN_STATUS_LABELS: Record<SyncRunRow['status'], string> = {
  running: 'идёт',
  succeeded: 'успех',
  failed: 'отказ',
};

export const runStatusLabel = (status: SyncRunRow['status']): string => RUN_STATUS_LABELS[status];

const SKIP_REASON_LABELS: Record<SyncSkipRow['reason'], string> = {
  unknown_profile: 'водителя нет в реестре',
  malformed: 'не хватило поля',
  unknown_value: 'незнакомое значение словаря',
  license_conflict: 'номер ВУ занят другим человеком',
};

export const skipReasonLabel = (reason: SyncSkipRow['reason']): string =>
  SKIP_REASON_LABELS[reason];

/**
 * Подписи словарей карточки водителя.
 *
 * Наши перечисления описаны полным `Record`: значение, добавленное миграцией, обязано
 * уронить проверку типов здесь, а не тихо показаться на экране латинским словом. Причина
 * `campaign` появится в `xb.point_reason` вместе с первой раздачей (issue #37) — и ровно
 * этот `Record` заставит подписать её тогда же.
 *
 * Словари Fleet API — `work_status`, `current_status`, статус заказа — описаны иначе:
 * поиском с возвратом исходного значения. Чужой словарь нам не принадлежит, новое
 * значение на той стороне не должно ни ронять типы, ни превращаться в пустое место
 * на экране (docs/decisions.md).
 */

const POINT_REASON_LABELS: Record<DriverOperation['reason'], string> = {
  opening: 'перенос баланса',
  trip: 'поездка',
  welcome: 'приветственный бонус',
  order_spend: 'заказ товара',
  order_refund: 'возврат за отменённый заказ',
  manual: 'ручная правка',
  recon: 'доначисление по перепроверке',
  expire: 'сгорание',
  merge: 'объединение двойников',
  raffle: 'выплата приза',
};

export const pointReasonLabel = (reason: DriverOperation['reason']): string =>
  POINT_REASON_LABELS[reason];

const ACCOUNT_TYPE_LABELS: Record<DriverOperationCounterparty['type'], string> = {
  driver: 'счёт водителя',
  emission: 'эмиссия',
  redemption: 'погашение',
  raffle_bank: 'банк розыгрышей',
};

export const accountTypeLabel = (type: DriverOperationCounterparty['type']): string =>
  ACCOUNT_TYPE_LABELS[type];

const LINK_CLOSE_REASON_LABELS: Record<
  NonNullable<DriverTelegramLink['closeReason']>,
  string
> = {
  rebind: 'перепривязка',
  merge: 'склейка двойников',
  operator: 'решение оператора',
  invalid_chat: 'непригодный chat_id',
};

export const linkCloseReasonLabel = (
  reason: NonNullable<DriverTelegramLink['closeReason']>,
): string => LINK_CLOSE_REASON_LABELS[reason];

const LINK_CONFIRMED_BY_LABELS: Record<DriverTelegramLink['confirmedBy'], string> = {
  phone_auto: 'по телефону, автоматически',
  operator: 'оператором в офисе',
  driver_reply: 'ответом водителя',
  legacy_import: 'перенесена из старой базы',
};

export const linkConfirmedByLabel = (confirmedBy: DriverTelegramLink['confirmedBy']): string =>
  LINK_CONFIRMED_BY_LABELS[confirmedBy];

const LANGUAGE_LABELS: Record<DriverMembership['language'], string> = {
  ru: 'русский',
  uz: 'узбекский',
};

export const languageLabel = (language: DriverMembership['language']): string =>
  LANGUAGE_LABELS[language];

/** Подпись словаря, который нам не принадлежит: незнакомое значение показывается как есть. */
const foreignLabel = (dictionary: Readonly<Record<string, string>>, value: string): string =>
  dictionary[value] ?? value;

const WORK_STATUS_LABELS: Readonly<Record<string, string>> = {
  working: 'работает',
  not_working: 'не работает',
  fired: 'уволен',
};

export const workStatusLabel = (status: string): string => foreignLabel(WORK_STATUS_LABELS, status);

const CURRENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  free: 'свободен',
  busy: 'занят',
  offline: 'не на линии',
  in_order_free: 'в заказе, свободен',
  in_order_busy: 'в заказе, занят',
};

export const currentStatusLabel = (status: string): string =>
  foreignLabel(CURRENT_STATUS_LABELS, status);

const EMPLOYMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  park_employee: 'сотрудник парка',
  selfemployed: 'самозанятый',
};

export const employmentTypeLabel = (type: string): string =>
  foreignLabel(EMPLOYMENT_TYPE_LABELS, type);

const TRIP_STATUS_LABELS: Readonly<Record<string, string>> = {
  complete: 'завершён',
  cancelled: 'отменён',
};

export const tripStatusLabel = (status: string): string => foreignLabel(TRIP_STATUS_LABELS, status);

/** Откуда взялась строка: и у номера ВУ, и у участия источники называются одинаково. */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  fleet_api: 'Fleet API',
  legacy_import: 'перенос из старой базы',
  operator: 'оператор',
  telegram: 'привязка Telegram',
};

export const sourceLabel = (source: string): string => foreignLabel(SOURCE_LABELS, source);

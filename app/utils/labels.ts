import type { OfficeRewardEvent, StockMovementEntry } from '#shared/types/catalog';
import type {
  ClientPlatform,
  DriverMembership,
  DriverOperation,
  DriverOperationCounterparty,
  DriverTelegramLink,
} from '#shared/types/driver';
import type {
  Campaign,
  CampaignParticipantOutcome,
  CampaignParticipantState,
} from '#shared/types/campaign';
import type { EmployeeAccount } from '#shared/types/employee';
import type { Mailing } from '#shared/types/mailing';
import type { OfficeOrder } from '#shared/types/orders';
import type { OfficeReward } from '#shared/types/rewards';
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
  registry_profile: 'Реестр, один телефон',
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
 * уронить проверку типов здесь, а не тихо показаться на экране латинским словом.
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
  campaign: 'акция',
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

/**
 * Подписи словарей каталога.
 *
 * Наши перечисления описаны полным `Record`: вид движения, добавленный миграцией, обязан
 * уронить проверку типов здесь, а не показаться на экране латинским словом.
 */

const STOCK_MOVEMENT_KIND_LABELS: Record<StockMovementEntry['kind'], string> = {
  incoming: 'приход',
  adjustment: 'правка руками',
  order_reserve: 'резерв под заказ',
  order_issue: 'выдача заказа',
  order_release: 'снятие резерва',
  reward_reserve: 'резерв под награду',
  reward_issue: 'выдача награды',
  reward_release: 'награда сгорела, товар на полке',
};

export const stockMovementKindLabel = (kind: StockMovementEntry['kind']): string =>
  STOCK_MOVEMENT_KIND_LABELS[kind];

/**
 * Подписи наград у стойки (issue #172). Полным `Record` — новый статус обязан уронить проверку
 * типов здесь.
 */
const REWARD_STATUS_LABELS: Record<OfficeReward['status'], string> = {
  credited: 'зачислена на баланс',
  // Подарок-баллы (issue #219): офиса у него нет, и на стойку он не приходит.
  claimable: 'ждёт в приложении',
  awaiting: 'ждёт выдачи',
  issued: 'выдана',
  expired: 'сгорела',
};

export const rewardStatusLabel = (status: OfficeReward['status']): string =>
  REWARD_STATUS_LABELS[status];

/**
 * Состояние награды в карточке водителя (issue #175). Словами, которыми сотрудник ответит
 * водителю по телефону, — отдельно от подписей стойки: там вопрос «выдавать ли», здесь
 * «что с моей наградой».
 */
const DRIVER_REWARD_STATUS_LABELS: Record<OfficeReward['status'], string> = {
  credited: 'на балансе',
  claimable: 'ждёт, водитель не забрал',
  awaiting: 'ждёт в офисе',
  issued: 'получена',
  expired: 'срок вышел',
};

export const driverRewardStatusLabel = (status: OfficeReward['status']): string =>
  DRIVER_REWARD_STATUS_LABELS[status];

/** Что случилось с произвольной наградой — строкой ленты офиса (issue #175). */
const OFFICE_REWARD_EVENT_LABELS: Record<OfficeRewardEvent, string> = {
  granted: 'награда вручена',
  issued: 'выдача награды',
  expired: 'награда сгорела',
};

export const officeRewardEventLabel = (event: OfficeRewardEvent): string =>
  OFFICE_REWARD_EVENT_LABELS[event];

/**
 * Подписи заказов офиса. Полным `Record` — по той же причине, что у видов движения:
 * новый статус или причина обязаны уронить проверку типов здесь.
 */

const ORDER_STATUS_LABELS: Record<OfficeOrder['status'], string> = {
  pending: 'ждёт выдачи',
  issued: 'выдан',
  cancelled: 'отменён',
};

export const orderStatusLabel = (status: OfficeOrder['status']): string =>
  ORDER_STATUS_LABELS[status];

/** Висящий — предупреждение: его ждут у стойки. Выданный — порядок, отменённый — прошлое. */
const ORDER_STATUS_TONES: Record<OfficeOrder['status'], 'ok' | 'warn' | 'muted'> = {
  pending: 'warn',
  issued: 'ok',
  cancelled: 'muted',
};

export const orderStatusTone = (status: OfficeOrder['status']): 'ok' | 'warn' | 'muted' =>
  ORDER_STATUS_TONES[status];

const ORDER_CANCEL_REASON_LABELS: Record<NonNullable<OfficeOrder['cancelReason']>, string> = {
  driver: 'отменил водитель',
  employee: 'отменил сотрудник',
  expired: 'не забрали за сутки',
};

export const orderCancelReasonLabel = (
  reason: NonNullable<OfficeOrder['cancelReason']>,
): string => ORDER_CANCEL_REASON_LABELS[reason];

/**
 * Подписи рассылок. Полным `Record` — новый статус обязан уронить проверку типов здесь.
 */

const MAILING_STATUS_LABELS: Record<Mailing['status'], string> = {
  draft: 'черновик',
  running: 'идёт',
  stopped: 'остановлена',
  finished: 'завершена',
};

export const mailingStatusLabel = (status: Mailing['status']): string =>
  MAILING_STATUS_LABELS[status];

/** Идущая — предупреждение: сообщения уходят прямо сейчас. Завершённая — порядок. */
const MAILING_STATUS_TONES: Record<Mailing['status'], 'ok' | 'warn' | 'muted'> = {
  draft: 'muted',
  running: 'warn',
  stopped: 'muted',
  finished: 'ok',
};

export const mailingStatusTone = (status: Mailing['status']): 'ok' | 'warn' | 'muted' =>
  MAILING_STATUS_TONES[status];

const EMPLOYEE_ROLE_LABELS: Record<EmployeeAccount['role'], string> = {
  owner: 'владелец',
  admin: 'админ',
  manager: 'менеджер',
};

export const employeeRoleLabel = (role: EmployeeAccount['role']): string =>
  EMPLOYEE_ROLE_LABELS[role];

/**
 * Подписи акций. Полным `Record` — новый статус или состояние обязаны уронить проверку типов
 * здесь, а не показаться на экране латинским словом.
 */

const CAMPAIGN_STATUS_LABELS: Record<Campaign['status'], string> = {
  draft: 'черновик',
  running: 'идёт',
  finished: 'окончена',
};

export const campaignStatusLabel = (status: Campaign['status']): string =>
  CAMPAIGN_STATUS_LABELS[status];

/** Идущая — предупреждение: водители видят её прямо сейчас. Оконченная — прошлое. */
const CAMPAIGN_STATUS_TONES: Record<Campaign['status'], 'ok' | 'warn' | 'muted'> = {
  draft: 'muted',
  running: 'warn',
  finished: 'ok',
};

export const campaignStatusTone = (status: Campaign['status']): 'ok' | 'warn' | 'muted' =>
  CAMPAIGN_STATUS_TONES[status];

/**
 * Слова те же, что водитель видит у себя в Mini App (`server/bot/texts.ts` → `campaign_state_*`):
 * «Вы приглашены», «Вы участвуете», «Вы отказались». Один факт, названный в админке и у водителя
 * разными словами, заставляет сверяющего каждый раз решать, то же это или нет.
 *
 * «Открыл экран акции», а не «открыл»: одно слово не говорит, что открыл, — Mini App, акцию
 * или, когда придут сундуки, сундук. Водитель этого состояния отдельно не видит: для него
 * открывший и не открывший одинаково «приглашены», разница нужна только замеру.
 */
const PARTICIPANT_STATE_LABELS: Record<CampaignParticipantState, string> = {
  invited: 'приглашён',
  opened: 'открыл экран акции',
  joined: 'участвует',
  declined: 'отказался',
};

export const participantStateLabel = (state: CampaignParticipantState): string =>
  PARTICIPANT_STATE_LABELS[state];

/**
 * Исходы окна — словами из схемы акции (`comeback.md` → «Схема акции по шагам»). Явный отказ
 * сливается с «посмотрел и не вступил» — различает их состояние, а не исход.
 */
const PARTICIPANT_OUTCOME_LABELS: Record<CampaignParticipantOutcome, string> = {
  returned: 'вернулся',
  short: 'не дотянул',
  joined_no_trips: 'нажал, но не выехал',
  seen_not_joined: 'посмотрел и не вступил',
  no_response: 'не откликнулся',
};

export const participantOutcomeLabel = (outcome: CampaignParticipantOutcome): string =>
  PARTICIPANT_OUTCOME_LABELS[outcome];

/** Половина Б при делении — контроль: подпись говорит это, чтобы её нули не читались провалом. */
export const campaignHalfLabel = (half: 'a' | 'b'): string =>
  half === 'a' ? 'Половина А' : 'Половина Б — контроль';

/** Откуда открыт Mini App — строка устройства в карточке водителя (issue #223). */
const CLIENT_PLATFORM_LABELS: Record<ClientPlatform, string> = {
  android: 'Android',
  ios: 'iOS',
  desktop: 'Компьютер',
  other: 'Другое',
};

export const clientPlatformLabel = (platform: ClientPlatform): string =>
  CLIENT_PLATFORM_LABELS[platform];

/**
 * Движок по платформе: встроенный браузер Android — Android System WebView, у iPhone — Safari.
 * У остальных движок не разбирается.
 */
const CLIENT_ENGINE_LABELS: Record<ClientPlatform, string | null> = {
  android: 'WebView',
  ios: 'Safari',
  desktop: null,
  other: null,
};

export const clientEngineLabel = (platform: ClientPlatform): string | null =>
  CLIENT_ENGINE_LABELS[platform];

import type {
  CandidateApplicationChannel,
  CandidateApplicationEventKind,
  CandidateApplicationStatus,
  CandidateDraftMessageAuthor,
  CandidateDraftStep,
  CandidateMatch,
  CandidateMessageAuthor,
  CandidateMessageDelivery,
  CandidateMessageFailure,
  CandidateMessageKind,
} from '../../server/generated/prisma/enums';
import type { ApplicationFilter } from '../candidateApplications';

/**
 * Ответы ручек раздела «Заявки» (issue #471) и его вкладки «Не закончили» (issue #475).
 * Определения цифр — `shared/metrics.ts`, ключи `applications*`; правила «ждёт ответа» и «ведёт» —
 * docs/decisions.md → «Заявки в админке» и «„Не закончили“ в заявках».
 *
 * Моменты — строки ISO, сутки — `YYYY-MM-DD` по Ташкенту: календарный день зона показа
 * сдвигать не должна.
 */

export type {
  CandidateApplicationEventKind,
  CandidateDraftMessageAuthor,
  CandidateDraftStep,
  CandidateMessageAuthor,
  CandidateMessageDelivery,
  CandidateMessageFailure,
  CandidateMessageKind,
};

/** От чего считается ожидание ответа: от подачи заявки или от последнего сообщения кандидата. */
export type ApplicationWaitingFrom = 'submitted' | 'candidate';

/** Плитки над таблицей — за всё время, без фильтра и поиска. */
export type ApplicationTiles = {
  /** Ждут ответа сотрудника: заявки и люди из «Не закончили», написавшие сами. */
  waiting: number;
  /** Из ждущих — сколько людей из «Не закончили». */
  waitingUnfinished: number;
  /** Из ждущих заявок — дольше `APPLICATION_OVERDUE_HOURS`. Людей из «Не закончили» здесь нет. */
  overdue: number;
  total: number;
  /** Поданы за последние 7 суток по Ташкенту, сегодня включительно. */
  totalWeek: number;
  /** Сейчас «Оформлен». */
  hired: number;
  /** Из оформленных — с последней отметкой «Оформлен» за последние 7 суток. */
  hiredWeek: number;
};

/**
 * Число у каждой пилюли — с учётом поиска, без фильтра: заявок у фильтров заявок, людей —
 * у «Не закончили».
 */
export type ApplicationCounts = Readonly<Record<ApplicationFilter | 'unfinished', number>>;

export type ApplicationRow = {
  id: string;
  name: string;
  /** Показной вид: «+998 90 123-45-67». */
  phone: string;
  /** Номер введён руками на старом Telegram, а не прислан кнопкой. */
  phoneManual: boolean;
  status: CandidateApplicationStatus;
  /** Название метки; `null` — метки с таким кодом нет. */
  promoName: string | null;
  promoCode: string;
  createdAt: string;
  match: CandidateMatch;
  /** Последние сутки с поездкой найденного человека — `YYYY-MM-DD`. */
  lastTripDay: string | null;
  /** Этот Telegram был привязан к участнику программы. */
  telegramWasMember: boolean;
  /** Бывший водитель этого Telegram — имя «Фамилия Имя» по профилю, как у вступивших по метке. */
  formerDriverName: string | null;
  formerDriverCallsign: string | null;
  /** Имя сотрудника, ведущего заявку; `null` — никто не ведёт. */
  handledBy: string | null;
  /** С какого момента заявка ждёт ответа; `null` — не ждёт. */
  waitingSince: string | null;
  waitingFrom: ApplicationWaitingFrom | null;
};

export type ApplicationList = {
  tiles: ApplicationTiles;
  counts: ApplicationCounts;
  rows: ApplicationRow[];
  /** Строк под фильтром и поиском. */
  total: number;
  offset: number;
  limit: number;
};

export type ApplicationWaitingCount = {
  count: number;
};

/** Строка таблицы «Участники программы, пришли по рекламе». */
export type AdParticipantRow = {
  personId: string;
  callsign: string | null;
  name: string | null;
  promoName: string | null;
  promoCode: string;
  /** Последнее касание рекламной метки этим человеком. */
  touchedAt: string;
  /** Последняя завершённая поездка; `null` — поездок нет. */
  lastTripAt: string | null;
};

export type AdParticipantList = {
  rows: AdParticipantRow[];
  total: number;
  offset: number;
  limit: number;
};

export type ApplicationCardMessage = {
  id: string;
  author: CandidateMessageAuthor;
  /** Имя сотрудника у `employee`, у остальных — `null`. */
  authorName: string | null;
  kind: CandidateMessageKind;
  text: string | null;
  delivery: CandidateMessageDelivery;
  failure: CandidateMessageFailure | null;
  createdAt: string;
};

export type ApplicationCardEvent = {
  kind: CandidateApplicationEventKind;
  employeeName: string;
  createdAt: string;
};

export type ApplicationCard = {
  application: {
    id: string;
    name: string;
    phone: string;
    phoneManual: boolean;
    /** Строкой: число Telegram в безопасное целое JS не обязано укладываться. */
    telegramUserId: string;
    telegramName: string;
    telegramUsername: string | null;
    writeAllowed: boolean;
    status: CandidateApplicationStatus;
    channel: CandidateApplicationChannel;
    createdAt: string;
    handledBy: string | null;
    waitingSince: string | null;
    waitingFrom: ApplicationWaitingFrom | null;
  };
  match: {
    match: CandidateMatch;
    lastTripDay: string | null;
    matchedPersonId: string | null;
    formerLinkPersonId: string | null;
  };
  /** Последнее касание метки заявки этим Telegram не позже подачи; `null` — касания нет. */
  source: {
    promoCode: string;
    promoName: string | null;
    touchedAt: string | null;
  };
  /** Тема заявки в группе кандидатов; `null` — темы нет. */
  topicUrl: string | null;
  messages: ApplicationCardMessage[];
  /** Сообщения черновиков заявки в чате до подачи, по времени; нет черновика — пусто. */
  draftMessages: ApplicationDraftMessage[];
  events: ApplicationCardEvent[];
  /** Первый ответ сотрудника — сообщение или отметка; `null` — ответа ещё не было. */
  firstReply: { at: string; employeeName: string } | null;
  /** Первая завершённая поездка человека, к которому Telegram привязан после заявки. */
  firstTrip: { at: string } | null;
  /** Смотрящему открыт ответ кандидату из админки. */
  canReply: boolean;
};

export type ApplicationStatusResponse = {
  status: CandidateApplicationStatus;
};

export type ApplicationReplyResponse = {
  delivery: CandidateMessageDelivery;
};

/** Строка вкладки «Не закончили» (issue #475): человек, нажавший `/start` по метке и не подавший заявку. */
export type UnfinishedRow = {
  id: string;
  telegramName: string;
  telegramUsername: string | null;
  /** Строкой: число Telegram в безопасное целое JS не обязано укладываться. */
  telegramUserId: string;
  step: CandidateDraftStep;
  /** Показной вид номера; `null` — номер не прислан. */
  phone: string | null;
  /** Название метки; `null` — метки с таким кодом нет. */
  promoName: string | null;
  promoCode: string;
  startedAt: string;
  /** Кто первым ответил человеку из админки; `null` — никто. */
  handledBy: string | null;
  /** С какого момента человек ждёт ответа; `null` — не ждёт. */
  waitingSince: string | null;
};

export type UnfinishedList = {
  rows: UnfinishedRow[];
  /** Людей под поиском. */
  total: number;
  offset: number;
  limit: number;
};

/** Сообщение черновика: человека или ответ сотрудника из админки. */
export type DraftMessage = {
  id: string;
  author: CandidateDraftMessageAuthor;
  /** Имя сотрудника у `employee`, у человека — `null`. */
  authorName: string | null;
  kind: CandidateMessageKind;
  text: string | null;
  delivery: CandidateMessageDelivery;
  failure: CandidateMessageFailure | null;
  createdAt: string;
  /** Контакт, по которому черновик взял номер. */
  isPhoneMessage: boolean;
};

export type UnfinishedCard = {
  draft: {
    id: string;
    telegramName: string;
    telegramUsername: string | null;
    telegramUserId: string;
    step: CandidateDraftStep;
    phone: string | null;
    promoCode: string;
    promoName: string | null;
    startedAt: string;
    /** Когда человек прислал номер; `null` — не прислал. */
    phoneAt: string | null;
    handledBy: string | null;
    waitingSince: string | null;
    /** Убран из списка «Не закончили». */
    dismissed: boolean;
  };
  messages: DraftMessage[];
  /** Смотрящему открыт ответ человеку из админки. */
  canReply: boolean;
};

/** Черновик закончен заявкой: карточка уходит в карточку заявки. */
export type UnfinishedCardClosed = {
  applicationId: string;
};

export type UnfinishedCardResponse = UnfinishedCard | UnfinishedCardClosed;

export type UnfinishedReplyResponse = {
  delivery: CandidateMessageDelivery;
};

export type UnfinishedDismissResponse = {
  dismissed: true;
};

/**
 * Сообщение черновика, которым кончилась заявка, — в переписке карточки заявки до подачи. Начало
 * черновика и его метка — для события «Нажал /start», номер — под контактом номера.
 */
export type ApplicationDraftMessage = DraftMessage & {
  startedAt: string;
  promoName: string | null;
  /** Показной вид номера черновика; `null` — номер не прислан. */
  phone: string | null;
};

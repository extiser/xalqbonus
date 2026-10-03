/**
 * Контракт ручек рассылок.
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Времена уезжают строками ISO-8601, незаполненное поле — `null`.
 */

import type { MailingStatus } from '../../server/generated/prisma/enums';

/**
 * Счётчики исходов по снимку адресатов. Сумма всех, кроме `total`, равна `total`: считаются
 * они одним запросом по `mailing_recipients`, а не накапливаются по дороге.
 */
export type MailingCounters = {
  total: number;
  pending: number;
  sent: number;
  skippedDisabled: number;
  invalidChat: number;
  failed: number;
};

/**
 * Отзыв отправленного. Отдельно от счётчиков исходов: отзыв исход не меняет, и отозванный
 * адресат остаётся среди `sent`. «Отозвано N из M» — это `recalled` из `counters.sent`.
 */
export type MailingRecall = {
  /** Заполнено — отзыв запущен, второй раз не запускается. */
  startedAt: string | null;
  /** Очередь прошла всех адресатов отзыва. Пусто при заполненном `startedAt` — отзыв идёт. */
  finishedAt: string | null;
  /** Сколько сообщений удалено у получателей. */
  recalled: number;
  /**
   * До какого момента Telegram даёт удалить: самое раннее отправленное плюс 48 часов.
   * Пусто — не отправлено ни одного сообщения.
   */
  deadlineAt: string | null;
};

/** Сегмент адресатов рассылки (issue #321). */
export type MailingSegmentRef = {
  segmentId: string;
  name: string;
  /** Заполнено — сегмент в архиве: запуск по нему не пройдёт. */
  archivedAt: string | null;
};

/** Прикреплённый опрос (issue #321). */
export type MailingSurveyRef = {
  surveyId: string;
  /** Пусто только у черновика опроса. */
  title: string | null;
  /** Последний день опроса, `YYYY-MM-DD`. Пусто только у черновика опроса. */
  endsOn: string | null;
  /** Закрыт — по сроку или досрочно: запуск рассылки с ним не пройдёт. */
  closed: boolean;
  /** Завершён досрочно (issue #348). Пусто — не завершался. */
  finishedAt: string | null;
  /** Заморожен — ушёл рассылкой раньше или ушёл этой. */
  frozenAt: string | null;
};

export type Mailing = {
  mailingId: string;
  /** Пусто только у черновика: он заводится первым набранным символом (issue #148). */
  title: string | null;
  /**
   * Пусто — уходит один узбекский текст, без флага и разделителя. У запущенной пустым бывает
   * не больше одного из двух текстов.
   */
  textRu: string | null;
  /** Пусто — уходит один русский текст, без флага и разделителя. */
  textUz: string | null;
  /** Относительный путь на томе приложения. */
  photoPath: string | null;
  status: MailingStatus;
  /**
   * Демо-рассылка (issue #212): уходит только демо-водителям. Ставится при заведении
   * и не меняется, копия наследует; править её может только владелец.
   */
  isDemo: boolean;
  /** Пусто — все участники программы с привязкой Telegram. */
  segment: MailingSegmentRef | null;
  /** Пусто — рассылка без опроса, с кнопкой «Открыть приложение». */
  survey: MailingSurveyRef | null;
  createdByName: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Двигается правкой и загрузкой фото — версия адреса картинки. */
  updatedAt: string;
  /** До запуска снимка нет, и все счётчики нули. */
  counters: MailingCounters;
  recall: MailingRecall;
};

export type MailingListResponse = {
  mailings: Mailing[];
};

export type MailingResponse = {
  mailing: Mailing;
};

/**
 * Тело заведения и правки черновика — то, что набрано в форме. Пустое поле приходит пустой
 * строкой: обязательных у черновика нет, и «пусто значит не задано» решает сервер.
 */
export type MailingRequestBody = {
  title: string;
  textRu: string;
  textUz: string;
  /** Пустая строка — все участники. */
  segmentId: string;
  /** Пустая строка — без опроса. */
  surveyId: string;
};

/**
 * Тело заведения: то же, что у правки, и признак демо (issue #212). Ставит его только владелец,
 * и только здесь — правка его не принимает: живое в демо не превращается и обратно.
 */
export type MailingCreateRequestBody = MailingRequestBody & { isDemo: boolean };

/** Сколько человек получит рассылку, если запустить её сейчас. */
export type MailingAudienceResponse = {
  /**
   * Участники программы с активной привязкой — из сегмента, если он выбран. Столько строк
   * ляжет в снимок.
   */
  total: number;
  /** Из них выключили уведомления: в снимок попадут, сообщения не получат. */
  notificationsDisabled: number;
};

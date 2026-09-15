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

export type Mailing = {
  mailingId: string;
  /** Пусто только у черновика: он заводится первым набранным символом (issue #148). */
  title: string | null;
  /**
   * Пусто — уходит один узбекский текст, без заголовков языков. У запущенной пустым бывает
   * не больше одного из двух текстов.
   */
  textRu: string | null;
  /** Пусто — уходит один русский текст, без заголовков языков. */
  textUz: string | null;
  /** Относительный путь на томе приложения. */
  photoPath: string | null;
  status: MailingStatus;
  createdByName: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Двигается правкой и загрузкой фото — версия адреса картинки. */
  updatedAt: string;
  /** До запуска снимка нет, и все счётчики нули. */
  counters: MailingCounters;
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
};

/** Сколько человек получит рассылку, если запустить её сейчас. */
export type MailingAudienceResponse = {
  /** Участники программы с активной привязкой. Столько строк ляжет в снимок. */
  total: number;
  /** Из них выключили уведомления: в снимок попадут, сообщения не получат. */
  notificationsDisabled: number;
};

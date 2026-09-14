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
  title: string;
  textRu: string;
  /** Пусто — узбекоязычные участники получают русский текст. */
  textUz: string | null;
  /** Относительный путь на томе приложения. */
  photoPath: string | null;
  /** Фильтр «ездил за последние N дней». Пусто — все участники. */
  activeWithinDays: number | null;
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
 * Тело заведения и правки черновика. Узбекский текст и фильтр приходят пустыми строками:
 * форма отдаёт то, что в ней набрано, а «пусто значит не задано» решает сервис.
 */
export type MailingRequestBody = {
  title: string;
  textRu: string;
  textUz?: string;
  activeWithinDays?: string | number | null;
};

/** Сколько человек получит рассылку с этим фильтром, если запустить её сейчас. */
export type MailingAudienceResponse = {
  activeWithinDays: number | null;
  /** Участники с активной привязкой, прошедшие фильтр. Столько строк ляжет в снимок. */
  total: number;
  /** Из них выключили уведомления: в снимок попадут, сообщения не получат. */
  notificationsDisabled: number;
};

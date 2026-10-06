/**
 * Контракт раздела «Демо» (issue #252): зрители по приглашению, демо-водители, генератор,
 * демо-менеджер и сводка демо-сущностей.
 *
 * Ссылка приглашения — в ответе выпуска и у живого приглашения в сводке: токен хранится,
 * пока приглашение живо.
 */

import type { DemoRole } from '../../server/generated/prisma/enums';
import type { FormattedPhone } from '../phone';

export type DemoInviteSummary = {
  inviteId: string;
  label: string;
  expiresAt: string;
  /**
   * Ссылка, пока приглашение живо
   * (docs/decisions.md → «Ссылка приглашения видна, пока жива; сотрудник принимает приглашение в вебе»).
   * Пусто у выпущенных до того, как токен стали хранить, и на машине, где бот не отвечает.
   */
  link: string | null;
};

export type DemoInviteRequestBody = {
  label: string;
};

export type DemoInviteResponse = {
  invite: DemoInviteSummary;
  /** Ссылка целиком. */
  link: string;
};

export type DemoInviteRevokeResponse = {
  inviteId: string;
  revoked: true;
};

export type DemoViewerSummary = {
  telegramUserId: string;
  label: string;
  role: DemoRole;
  /** С какого момента в списке. */
  since: string;
  disabled: boolean;
  personId: string;
};

export type DemoViewerStateResponse = {
  telegramUserId: string;
  disabled: boolean;
};

export type DemoDriverSummary = {
  personId: string;
  name: string;
  callsign: string;
  balance: number;
  programMember: boolean;
  lastTripAt: string | null;
  /** Завершённых поездок — все. */
  tripsCount: number;
  /** Подпись зрителя. Пусто — сгенерирован. */
  viewerLabel: string | null;
  /** Спрятан. Пусто — виден в разделе, в сегментах и в поиске. */
  hiddenAt: string | null;
};

export type DemoDriverTrip = {
  orderId: string;
  endedAt: string;
  /** Начислено по поездке — `trip` и `recon`. Пусто — не начислено. */
  points: number | null;
};

/** Последние 30 завершённых поездок, свежие первыми. */
export type DemoDriverTripsResponse = {
  personId: string;
  trips: DemoDriverTrip[];
};

export type DemoDriverHideResponse = {
  personId: string;
  hidden: true;
};

export type DemoDriverUnhideResponse = {
  personId: string;
  hidden: false;
};

export type DemoManagerSummary = {
  employeeId: string;
  fullName: string;
  phone: FormattedPhone;
  officeIds: string[];
};

export type DemoManagerRequestBody = {
  phone: string;
};

export type DemoManagerCreateResponse = {
  employeeId: string;
};

export type DemoManagerOfficesRequestBody = {
  officeIds: string[];
};

export type DemoManagerOfficesResponse = {
  officeIds: string[];
};

export type DemoProgramMember = 'yes' | 'no' | 'mixed';

export type DemoGenerateRequestBody = {
  /** 1–50. */
  count: number;
  /** 0 и больше. */
  balanceMin: number;
  /** Не меньше `balanceMin`. */
  balanceMax: number;
  /** 0–30. */
  tripsMin: number;
  /** Не меньше `tripsMin`, не больше 30. */
  tripsMax: number;
  /** 0 и больше; при `tripsMax = 0` не читается. */
  lastTripDaysMin: number;
  /** Не меньше `lastTripDaysMin`. */
  lastTripDaysMax: number;
  programMember: DemoProgramMember;
};

/** Поле запроса генератора, к которому относится отказ ручки. */
export type DemoGenerateField = keyof DemoGenerateRequestBody;

export type DemoGenerateResponse = {
  created: number;
  drivers: DemoDriverSummary[];
};

/**
 * Сводка демо-сущностей. Имена полей — по колонкам таблиц; название товара, рассылки и акции
 * пусто только у черновика.
 */
export type DemoEntities = {
  products: { productId: string; name: string | null }[];
  mailings: { mailingId: string; title: string | null }[];
  segments: { segmentId: string; name: string }[];
  campaigns: { campaignId: string; title: string | null }[];
};

export type DemoOverviewResponse = {
  /** Живые: не приняты, не отозваны, не истекли. */
  invites: DemoInviteSummary[];
  viewers: DemoViewerSummary[];
  drivers: DemoDriverSummary[];
  manager: DemoManagerSummary | null;
  demoOffices: { officeId: string; name: string }[];
  entities: DemoEntities;
};

/**
 * Контракт раздела «Демо» (issue #252): зрители по приглашению, демо-водители, генератор,
 * демо-менеджер и сводка демо-сущностей.
 *
 * Ссылка приглашения есть ровно в одном ответе — выпуска: в базе лежит только хеш токена.
 */

import type { DemoRole } from '../../server/generated/prisma/enums';
import type { FormattedPhone } from '../phone';

export type DemoInviteSummary = {
  inviteId: string;
  label: string;
  expiresAt: string;
};

export type DemoInviteRequestBody = {
  label: string;
};

export type DemoInviteResponse = {
  invite: DemoInviteSummary;
  /** Ссылка целиком. Показывается один раз. */
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
  /** Подпись зрителя. Пусто — сгенерирован. */
  viewerLabel: string | null;
};

export type DemoDriverHideResponse = {
  personId: string;
  hidden: true;
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

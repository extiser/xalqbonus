/**
 * Контракт ручек акций (issue #166).
 *
 * Типы лежат в `shared/`, потому что у них два потребителя — обработчик и разметка.
 * Моменты уезжают строками ISO-8601, даты окна — `YYYY-MM-DD`, незаполненное поле — `null`.
 */

import type {
  CampaignHalfCode,
  CampaignParticipantState,
  CampaignStatus,
} from '../../server/generated/prisma/enums';

export type { CampaignHalfCode, CampaignParticipantState, CampaignStatus };

/**
 * Окно половины. Даты — то, что вводил сотрудник: первый и последний день окна. Метки —
 * то, что хранится: начало первого дня и начало дня, следующего за последним, — сутки
 * механики идут с 05:00 до 05:00 по Ташкенту. Пусто всё — окно ещё не назначено.
 */
export type CampaignWindow = {
  startsOn: string | null;
  endsOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type CampaignSegmentRef = {
  segmentId: string;
  name: string;
  /** Заполнено — сегмент в архиве: запуск по нему не пройдёт. */
  archivedAt: string | null;
};

export type Campaign = {
  campaignId: string;
  /** Пусто только у черновика. */
  slug: string | null;
  /** Пусто только у черновика. */
  title: string | null;
  status: CampaignStatus;
  segment: CampaignSegmentRef | null;
  splitEnabled: boolean;
  /** Сколько человек попало в снимок на дату запуска. Пусто у черновика. */
  audienceSize: number | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
  halfA: CampaignWindow;
  /** Пусто без деления. При делении даты пусты, пока до половины не дошла очередь. */
  halfB: CampaignWindow | null;
};

/** Разбивка состава по состояниям на одной половине. */
export type CampaignHalfBreakdown = {
  half: CampaignHalfCode;
  total: number;
  states: Record<CampaignParticipantState, number>;
};

export type CampaignListResponse = {
  campaigns: Campaign[];
};

/**
 * Акция с разбивкой состава. Разбивка пуста у черновика: снимка ещё нет. Без деления в ней
 * одна строка — половина `a`.
 */
export type CampaignResponse = {
  campaign: Campaign;
  breakdown: CampaignHalfBreakdown[];
};

/**
 * Тело заведения и правки черновика — форма целиком. Пустое поле — пустая строка:
 * «пусто значит не задано» решает сервер. Черновик сохраняет себя по мере набора, поэтому
 * обязательных полей нет — чего не хватает, решает запуск.
 */
export type CampaignRequestBody = {
  title: string;
  slug: string;
  segmentId: string;
  startsOn: string;
  endsOn: string;
  splitEnabled: boolean;
};

/** Тело назначения окна половины Б. */
export type CampaignWindowRequestBody = {
  startsOn: string;
  endsOn: string;
};

/** Строка таблицы участников. */
export type CampaignParticipant = {
  personId: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  callsigns: string[];
  half: CampaignHalfCode;
  state: CampaignParticipantState;
  /** Когда состояние сменилось. У приглашённого — время снимка. */
  changedAt: string;
};

export type CampaignParticipantsResponse = {
  total: number;
  rows: CampaignParticipant[];
  limit: number;
  offset: number;
};

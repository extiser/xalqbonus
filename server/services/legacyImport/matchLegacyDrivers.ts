import { consola } from 'consola';

import type { LegacyTelegramStatus, MatchMethod } from '#server/generated/prisma/enums';
import {
  upsertLegacyDriverMap,
  type LegacyDriverMapInput,
} from '#server/repositories/legacyDriverMap';
import type { LegacyDriverRow } from '#server/repositories/legacyPublic';
import { readProfileOwners } from '#server/repositories/registry';

/**
 * Шаг 3 переноса: сопоставление записей старой базы с реестром парка.
 *
 * Ключ один — `Drivers.profile_id`, в один проход, без эвристик: 4 098 записей из 4 099
 * находят ровно один профиль. Номер ВУ, телефон и позывной ключом сопоставления
 * не используются — по каждому есть свой отказ в разборе старой схемы (§3.2–3.4).
 */

const log = consola.withTag('legacy-import:match');

/** Годный `chat_id` — 6–10 цифр и ничего больше. */
const USABLE_CHAT_ID = /^\d{6,10}$/;

/** Запись старой базы после сопоставления. Дальше её читают шаги участия и балансов. */
export type LegacyMatch = {
  row: LegacyDriverRow;
  profileId: string | null;
  personId: string | null;
  matchMethod: MatchMethod;
  /** Вторая половина двойной пары — у обеих половин. */
  mergedIntoLegacyDriverId: number | null;
  telegramStatus: LegacyTelegramStatus;
  /** Разобранный `chat_id`, если он годен. Семи записям бот написать не может. */
  chatId: bigint | null;
  /** Баланс: семь `NULL` в `points` переносятся как ноль. */
  points: number;
};

export type MatchSummary = {
  legacyRecords: number;
  matched: number;
  unmatched: number;
  mergedPairs: number;
  /** Пар, склеенных общим `profile_id`: человек сменил телефон. */
  mergedByProfile: number;
  /** Пар, склеенных только номером ВУ: человека переоформили в парке. */
  mergedByLicense: number;
  invalidChatIds: number;
  positiveBalances: number;
  pointsTotal: number;
};

export type MatchResult = { matches: LegacyMatch[]; summary: MatchSummary };

/**
 * Больше двух записей на одного человека. В разборе таких нет: двенадцать пар, 24 записи.
 * Появившаяся тройка меняет и склейку баланса, и выбор канала связи — молча пропускать её
 * нельзя.
 */
export class UnexpectedMergeGroupError extends Error {
  constructor(personId: string, legacyDriverIds: readonly number[]) {
    super(
      `на человека ${personId} приходится ${legacyDriverIds.length} записей старой базы (${legacyDriverIds.join(', ')}) — разбор знает только пары`,
    );
    this.name = 'UnexpectedMergeGroupError';
  }
}

const parseChatId = (chatId: string | null): bigint | null =>
  chatId !== null && USABLE_CHAT_ID.test(chatId) ? BigInt(chatId) : null;

/**
 * Тестовый аккаунт опознаётся отсутствием `profile_id` в реестре парка.
 *
 * Критерий «пустой статус работы» применять запрещено: таких записей четыре, и три
 * из них — живые водители с 12 237 баллами (docs/drivers.md, разбор §7.1).
 */
const NOT_IN_REGISTRY_NOTE =
  'profile_id отсутствует в реестре парка — не водитель, в xb не переносится';

export const matchLegacyDrivers = async (rows: readonly LegacyDriverRow[]): Promise<MatchResult> => {
  const owners = await readProfileOwners(rows.map((row) => row.profileId));

  const matches: LegacyMatch[] = rows.map((row) => {
    const personId = owners.get(row.profileId) ?? null;
    const points = row.points ?? 0;
    const chatId = parseChatId(row.chatId);

    if (personId === null) {
      return {
        row,
        profileId: null,
        personId: null,
        matchMethod: 'none',
        mergedIntoLegacyDriverId: null,
        telegramStatus: 'skipped',
        chatId: null,
        points,
      };
    }

    return {
      row,
      profileId: row.profileId,
      personId,
      matchMethod: 'profile_id',
      mergedIntoLegacyDriverId: null,
      telegramStatus: chatId === null ? 'invalid_chat' : 'linked',
      chatId,
      points,
    };
  });

  // Двойники: у одного человека несколько записей старой базы. Восемь пар ловятся общим
  // `profile_id` — смена телефона; четыре — только номером ВУ из реестра: человека
  // уволили и завели заново новым профилем (docs/drivers.md).
  const byPerson = new Map<string, LegacyMatch[]>();

  for (const match of matches) {
    if (match.personId === null) {
      continue;
    }

    const group = byPerson.get(match.personId) ?? [];
    group.push(match);
    byPerson.set(match.personId, group);
  }

  let mergedPairs = 0;
  let mergedByProfile = 0;
  let mergedByLicense = 0;

  for (const [personId, group] of byPerson) {
    if (group.length === 1) {
      continue;
    }

    if (group.length > 2) {
      throw new UnexpectedMergeGroupError(
        personId,
        group.map((match) => match.row.legacyDriverId),
      );
    }

    const [first, second] = group as [LegacyMatch, LegacyMatch];

    mergedPairs += 1;

    if (first.row.profileId === second.row.profileId) {
      mergedByProfile += 1;
    } else {
      mergedByLicense += 1;
    }

    // Каждая половина ссылается на вторую: по любой из двух строк находится партнёр,
    // и самоссылки нет ни у одной.
    first.mergedIntoLegacyDriverId = second.row.legacyDriverId;
    second.mergedIntoLegacyDriverId = first.row.legacyDriverId;

    // Активной не делается ни одна привязка. Выбор канала связи принадлежит ответу
    // самого водителя: правило в docs/drivers.md черновое и переопределяемое,
    // а цена ошибки — потерянный доступ к балансу и разговор в офисе.
    for (const half of group) {
      half.telegramStatus = half.chatId === null ? 'invalid_chat' : 'pending_confirmation';
    }
  }

  const records: LegacyDriverMapInput[] = matches.map((match) => ({
    legacyDriverId: match.row.legacyDriverId,
    profileId: match.profileId,
    personId: match.personId,
    matchMethod: match.matchMethod,
    mergedIntoLegacyDriverId: match.mergedIntoLegacyDriverId,
    telegramStatus: match.telegramStatus,
    legacyPoints: match.points,
    note: match.matchMethod === 'none' ? NOT_IN_REGISTRY_NOTE : null,
  }));

  await upsertLegacyDriverMap(records);

  const matched = matches.filter((match) => match.personId !== null);

  const summary: MatchSummary = {
    legacyRecords: matches.length,
    matched: matched.length,
    unmatched: matches.length - matched.length,
    mergedPairs,
    mergedByProfile,
    mergedByLicense,
    invalidChatIds: matched.filter((match) => match.chatId === null).length,
    positiveBalances: matched.filter((match) => match.points > 0).length,
    pointsTotal: matched.reduce((total, match) => total + match.points, 0),
  };

  log.info(
    `сопоставлено ${summary.matched} из ${summary.legacyRecords}, склеенных пар ${summary.mergedPairs}`,
  );

  return { matches, summary };
};

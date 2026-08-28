import { consola } from 'consola';

import type { Language } from '#server/generated/prisma/enums';
import {
  countTelegramLinks,
  insertTelegramLinks,
  upsertPersonSettings,
  type PersonSettingsInput,
  type TelegramLinkInput,
} from '#server/repositories/programMembership';
import type { LegacyMatch } from '#server/services/legacyImport/matchLegacyDrivers';

/**
 * Шаг 4 переноса: участие в программе и привязки Telegram.
 *
 * `person_settings` заводится **только** перенесённым из старой базы. Остальной реестр
 * остаётся без строки — это и есть граница «известен парку / в программе»
 * (docs/drivers.md).
 */

const log = consola.withTag('legacy-import:membership');

/** Откуда пришло участие. Свободный текст рядом с `telegram` и `operator`. */
const JOINED_SOURCE = 'legacy_import';

export type MembershipSummary = {
  settingsWritten: number;
  languages: Map<Language, number>;
  /**
   * Дата вступления у 2 920 записей равна дате импорта 18.12.2024, а не реальной дате:
   * настоящая утрачена в предыдущей системе. Переносим как есть, не выдумывая.
   */
  joinedBeforeImportCutoff: number;
  linksWritten: number;
  linksActive: number;
  linksClosed: number;
  linksSkippedInvalidChat: number;
};

/** Язык, которого нет в словаре. В старой базе только `ru` и `uz`, третьего значения нет. */
export class UnknownLanguageError extends Error {
  constructor(legacyDriverId: number, language: string) {
    super(`у записи ${legacyDriverId} язык «${language}», а словарь знает только ru и uz`);
    this.name = 'UnknownLanguageError';
  }
}

/** Граница когорты массового импорта предыдущей системы: 19.12.2024. */
const IMPORT_COHORT_CUTOFF = new Date('2024-12-19T00:00:00.000Z');

const readLanguage = (match: LegacyMatch): Language => {
  if (match.row.language === 'ru' || match.row.language === 'uz') {
    return match.row.language;
  }

  throw new UnknownLanguageError(match.row.legacyDriverId, match.row.language);
};

export const importProgramMembership = async (
  matches: readonly LegacyMatch[],
  closedAt: Date,
): Promise<MembershipSummary> => {
  const matched = matches.filter(
    (match): match is LegacyMatch & { personId: string } => match.personId !== null,
  );

  // У склеенной пары настройки берутся у записи, заведённой раньше: она и есть первое
  // вступление человека в программу, вторая — след регистрации по новому телефону.
  const settingsByPerson = new Map<string, PersonSettingsInput>();

  for (const match of matched) {
    const language = readLanguage(match);
    const existing = settingsByPerson.get(match.personId);

    if (!existing || match.row.createdAt < existing.joinedAt) {
      settingsByPerson.set(match.personId, {
        personId: match.personId,
        language,
        joinedAt: match.row.createdAt,
      });
    }
  }

  const settings = [...settingsByPerson.values()];

  await upsertPersonSettings(settings, JOINED_SOURCE);

  const links: TelegramLinkInput[] = matched
    .filter((match) => match.chatId !== null)
    .map((match) => ({
      personId: match.personId,
      telegramChatId: match.chatId as bigint,
      // Обе половины склеенной пары заводятся закрытыми: активной не делается ни одна.
      closedAt: match.telegramStatus === 'pending_confirmation' ? closedAt : null,
      closeReason: match.telegramStatus === 'pending_confirmation' ? ('merge' as const) : null,
    }));

  const linksWritten = await insertTelegramLinks(links, 'legacy_import');
  const linkCounts = await countTelegramLinks();

  const languages = new Map<Language, number>();

  for (const row of settings) {
    languages.set(row.language, (languages.get(row.language) ?? 0) + 1);
  }

  log.info(`участников ${settings.length}, привязок ${links.length}`);

  return {
    settingsWritten: settings.length,
    languages,
    joinedBeforeImportCutoff: settings.filter((row) => row.joinedAt < IMPORT_COHORT_CUTOFF).length,
    linksWritten,
    linksActive: linkCounts.active,
    linksClosed: linkCounts.closed,
    linksSkippedInvalidChat: matched.filter((match) => match.chatId === null).length,
  };
};

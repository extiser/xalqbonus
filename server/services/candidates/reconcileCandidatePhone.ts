import { consola } from 'consola';

import { FleetCredentialsMissingError } from '#server/adapters/fleet/client';
import type { CandidateMatch } from '#server/generated/prisma/enums';
import { findPersonLastTripDay } from '#server/repositories/candidateApplications';
import { findActiveProfilesByPhone } from '#server/repositories/registry';
import { ParkLookupFailedError, runProfileSyncByPhone } from '#server/services/sync/syncProfileByPhone';
import { calendarDayMoment, DAY_MS, formatDayKey } from '#server/utils/parkTime';
import { CANDIDATE_LOOKUP_BUDGET_MS, FORMER_DRIVER_DAYS } from '#shared/candidateApplications';

/**
 * Сверка номера заявки с реестром парка (issue #456): работает ли человек в парке, работал ли
 * раньше или парк его не знает.
 *
 * Путь поиска — тот же, что у регистрации (`registerDriverByContact`): профили по номеру, а нет
 * их — точечный прогон по Fleet API и снова профили. Сверка заявку не останавливает ни при каком
 * исходе: итог пишется в заявку, решает менеджер (docs/decisions.md → «Заявка кандидата»).
 */

const log = consola.withTag('candidates:reconcile');

export type CandidatePhoneReconciliation = {
  match: CandidateMatch;
  personId: string | null;
  profileId: string | null;
  /** Последние сутки с поездкой найденного человека, `YYYY-MM-DD`. */
  lastTripDay: string | null;
};

const NOTHING_FOUND = { personId: null, profileId: null, lastTripDay: null } as const;

const LOOKUP_TIMED_OUT = Symbol('lookup timed out');

/**
 * Итог работы или `LOOKUP_TIMED_OUT`, если она не уложилась в срок. Работа не обрывается: гонка
 * только перестаёт её ждать.
 */
const withinBudget = async <T>(work: Promise<T>, budgetMs: number): Promise<T | typeof LOOKUP_TIMED_OUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof LOOKUP_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(LOOKUP_TIMED_OUT), budgetMs);
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

/** Сколько суток от `fromDay` до `toDay` — оба `YYYY-MM-DD`. */
const daysBetween = (fromDay: string, toDay: string): number =>
  Math.round((calendarDayMoment(toDay).getTime() - calendarDayMoment(fromDay).getTime()) / DAY_MS);

export const reconcileCandidatePhone = async (
  phoneE164: string,
  now: Date,
): Promise<CandidatePhoneReconciliation> => {
  let profiles = await findActiveProfilesByPhone(phoneE164);

  if (profiles.length === 0) {
    let profilesSeen: number;

    try {
      // Сверка в реестр не пишет: в Fleet API ходит сервис синхронизации и записывает найденное
      // сам, своим обычным путём.
      const lookup = runProfileSyncByPhone(phoneE164);
      const summary = await withinBudget(lookup, CANDIDATE_LOOKUP_BUDGET_MS);

      if (summary === LOOKUP_TIMED_OUT) {
        // Заявка не ждёт дольше срока: поиск доделывается в фоне и запишет реестр сам, а его
        // отказ остаётся в логе — наружу ему идти некуда. Телефон в лог не идёт.
        lookup.catch((error: unknown) => {
          log.error('поиск по телефону, не уложившийся в срок сверки, упал', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        log.warn('сверка номера не уложилась в срок — заявка без сверки', { budgetMs: CANDIDATE_LOOKUP_BUDGET_MS });

        return { match: 'lookup_failed', ...NOTHING_FOUND };
      }

      profilesSeen = summary.profilesSeen;
    } catch (error) {
      // Отказ внешнего сервиса — не повод терять заявку: она заводится без сверки, а менеджер
      // проверит номер сам. Телефон в лог не идёт — он персональные данные.
      log.error(
        error instanceof ParkLookupFailedError
          ? 'Fleet API не ответил на поиск по телефону — заявка без сверки'
          : error instanceof FleetCredentialsMissingError
            ? 'реквизиты Fleet API не заполнены — запрос в парк не уходил, заявка без сверки'
            : 'точечный прогон упал на нашей стороне — заявка без сверки',
        { error: error instanceof Error ? error.message : String(error) },
      );

      return { match: 'lookup_failed', ...NOTHING_FOUND };
    }

    if (profilesSeen === 0) {
      return { match: 'not_in_park', ...NOTHING_FOUND };
    }

    profiles = await findActiveProfilesByPhone(phoneE164);
  }

  // Список уже отсортирован правилом показа — работающий важнее прочих, — и первый профиль
  // называет того, кого менеджер увидит в карточке.
  const first = profiles[0];

  if (!first) {
    // Fleet API номер знает, а завести профиль в реестре было нечем — например, без номера
    // удостоверения.
    return { match: 'not_in_registry', ...NOTHING_FOUND };
  }

  const found = { personId: first.personId, profileId: first.profileId };
  const lastTripDay = await findPersonLastTripDay(first.personId);

  if (lastTripDay === null) {
    return { match: 'no_trips', ...found, lastTripDay: null };
  }

  const idleDays = daysBetween(lastTripDay, formatDayKey(now));

  return { match: idleDays <= FORMER_DRIVER_DAYS ? 'working' : 'former', ...found, lastTripDay };
};

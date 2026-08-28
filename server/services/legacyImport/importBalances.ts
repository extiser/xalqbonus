import { consola } from 'consola';

import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildOpeningIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';
import type { LegacyMatch } from '#server/services/legacyImport/matchLegacyDrivers';

/**
 * Шаг 5 переноса: балансы.
 *
 * Баланс переносится **одной операцией** `opening` через сервис журнала, `emission` →
 * водительский счёт. Прямого `INSERT` в счета нет и быть не может: единственный способ
 * изменить баланс — запись в журнал (docs/points.md).
 *
 * Пересчёта, доначислений и исправлений нет ни одного. 4 877 повторно засчитанных
 * поездок и ~146 000 недоначисленных баллов сидят внутри перенесённого итога и остаются
 * там: перенос копирует итог, а перепроверка — отдельный этап, и она сообщает, а не чинит.
 */

const log = consola.withTag('legacy-import:balances');

/** Кто выполнил операцию. Уходит в `point_transfers.actor`. */
const ACTOR = 'legacy_import';

export type BalancesSummary = {
  accountsEnsured: number;
  /** Записано сейчас. При повторном прогоне — ноль. */
  transfersApplied: number;
  /** Уже было записано раньше: повтор по ключу, ни один баланс не тронут. */
  transfersAlreadyApplied: number;
  /** Людей с нулевым итогом: операция с нулевой суммой не пишется вовсе. */
  personsWithZeroBalance: number;
  pointsTransferred: number;
};

export const importBalances = async (
  matches: readonly LegacyMatch[],
  occurredAt: Date,
): Promise<BalancesSummary> => {
  // У склеенных пар баланс складывается и переносится одной операцией на общего человека.
  // Уменьшать за пересекающиеся поездки не будем: суммы малы, водитель не виноват
  // (docs/decisions.md → «Двенадцать двойных учётных записей объединяются сложением»).
  const pointsByPerson = new Map<string, number>();
  const legacyIdsByPerson = new Map<string, number[]>();

  for (const match of matches) {
    if (match.personId === null) {
      continue;
    }

    pointsByPerson.set(match.personId, (pointsByPerson.get(match.personId) ?? 0) + match.points);
    legacyIdsByPerson.set(match.personId, [
      ...(legacyIdsByPerson.get(match.personId) ?? []),
      match.row.legacyDriverId,
    ]);
  }

  const emission = await getSystemAccount('emission');

  const summary: BalancesSummary = {
    accountsEnsured: 0,
    transfersApplied: 0,
    transfersAlreadyApplied: 0,
    personsWithZeroBalance: 0,
    pointsTransferred: 0,
  };

  for (const [personId, points] of pointsByPerson) {
    // Счёт заводится каждому участнику программы, в том числе с нулевым итогом: человек
    // в программе, и первое же начисление за поездку должно лечь на существующий счёт.
    const account = await ensureDriverAccount(personId);

    summary.accountsEnsured += 1;

    if (points === 0) {
      summary.personsWithZeroBalance += 1;
      continue;
    }

    const legacyIds = legacyIdsByPerson.get(personId) ?? [];

    const { applied } = await transferPoints({
      reason: 'opening',
      idempotencyKey: buildOpeningIdempotencyKey(personId),
      amount: points,
      fromAccountId: emission.id,
      toAccountId: account.id,
      occurredAt,
      context: {
        actor: ACTOR,
        note: `перенос баланса из public."Drivers": ${legacyIds.join(', ')}`,
      },
    });

    summary.pointsTransferred += points;

    if (applied) {
      summary.transfersApplied += 1;
    } else {
      summary.transfersAlreadyApplied += 1;
    }
  }

  log.info(
    `счетов ${summary.accountsEnsured}, перенесено ${summary.pointsTransferred} баллов (записано сейчас ${summary.transfersApplied})`,
  );

  return summary;
};

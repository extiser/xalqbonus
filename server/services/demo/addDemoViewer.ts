import { consola } from 'consola';

import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import {
  findDemoSource,
  findDemoViewer,
  insertDemoLicense,
  insertDemoLink,
  insertDemoParkProfile,
  insertDemoPerson,
  insertDemoViewer,
  lockDemoViewer,
  updateDemoViewerEnabled,
} from '#server/repositories/demo';
import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findActiveLinkByTelegramOrPhone, upsertPersonSettings } from '#server/repositories/programMembership';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { getSystemAccount } from '#server/services/points/getSystemAccount';
import { buildOpeningIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Внесение демо-зрителя (issue #205).
 *
 * Новому зрителю заводится свой демо-водитель. У живого участника-источника берутся только
 * условия работы профиля; имя, позывной, удостоверение и машина выдуманы, телефона нет вовсе:
 * по демо-водителю живого не узнать.
 *
 * Баланс — фиксированный, `DEMO_DRIVER_OPENING_BALANCE`, и ложится не записью в счёт, а переводом
 * `opening` с `emission` — тем же путём, каким баланс получили перенесённые из старой базы
 * (docs/points.md). Ключ — от демо-водителя, поэтому второго перевода на один счёт не бывает.
 *
 * Демо-водитель привязан к Telegram зрителя обычной строкой `telegram_links`: дальше зритель
 * для приложения, бота, уведомлений и рассылок — обычный участник.
 *
 * Повторное внесение нового водителя не заводит: выключенному зрителю открывается новая
 * привязка к прежнему демо-водителю, действующему — обновляется подпись.
 *
 * Всё одной транзакцией: демо-водитель без привязки — выдуманный человек, до которого
 * не дойти, а привязка без строки списка — Telegram, который зрителем себя не знает.
 */
const log = consola.withTag('demo:viewer');

/** Имя и позывной демо-водителя — ими его встречают бот и шапка главной. */
export const DEMO_DRIVER_FIRST_NAME = 'ДЕМО ВОДИТЕЛЬ';
export const DEMO_DRIVER_CALLSIGN = 'ДЕМО';

/**
 * Баланс нового демо-водителя (решение Руслана 26-09-2026): одна сумма на всех, у живых
 * не копируется — чужой баланс, показанный клиенту, говорил бы о живом водителе.
 */
export const DEMO_DRIVER_OPENING_BALANCE = 5000;

/** Откуда пришло участие — рядом с `telegram`, `legacy_import`, `operator`. */
const DEMO_JOINED_SOURCE = 'demo';

/** Сколько знаков `person_id` идёт в номер удостоверения демо-водителя. */
const DEMO_LICENSE_ID_LENGTH = 8;

export type AddDemoViewerRequest = {
  telegramUserId: bigint;
  label: string;
  now?: Date;
};

export type AddDemoViewerResult =
  /** Новый зритель: заведён демо-водитель, баланс `DEMO_DRIVER_OPENING_BALANCE` зачислен. */
  | { outcome: 'created'; personId: string; balance: bigint }
  /** Выключенный зритель включён: новая привязка к прежнему демо-водителю. */
  | { outcome: 'enabled'; personId: string; balance: bigint }
  /** Действующий зритель: обновлена только подпись. */
  | { outcome: 'label_updated'; personId: string; balance: bigint }
  | { outcome: 'label_empty' }
  /** У этого Telegram активная привязка: зритель не бывает живым участником. */
  | { outcome: 'telegram_linked' }
  /** Этот Telegram — сотрудника: зритель не бывает сотрудником. */
  | { outcome: 'telegram_employee' }
  /** Копировать не с кого: нет участника с работающим профилем. */
  | { outcome: 'no_source' };

/** Исходы, после которых у зрителя есть действующий демо-водитель. */
type DemoViewerAdded = Extract<AddDemoViewerResult, { personId: string }>;

/** Копировать не с кого — отказ изнутри транзакции, чтобы она откатилась целиком. */
class NoDemoSourceError extends Error {
  constructor() {
    super('нет участника программы с работающим профилем — копировать демо-водителю не с кого');
  }
}

const balanceOf = async (personId: string, client: Prisma.TransactionClient): Promise<bigint> =>
  (await findDriverAccountByPerson(personId, client))?.balance ?? 0n;

/** Новый демо-водитель с условиями работы источника. Возвращает его и зачисленный баланс. */
const createDemoDriver = async (
  client: Prisma.TransactionClient,
  emissionAccountId: string,
  now: Date,
): Promise<{ personId: string; balance: bigint }> => {
  const source = await findDemoSource(client);

  if (!source) {
    throw new NoDemoSourceError();
  }

  const personId = await insertDemoPerson(client);

  await insertDemoLicense(personId, `DEMO-${personId.slice(0, DEMO_LICENSE_ID_LENGTH)}`, client);
  await insertDemoParkProfile(
    {
      personId,
      sourceProfileId: source.profileId,
      firstName: DEMO_DRIVER_FIRST_NAME,
      callsign: DEMO_DRIVER_CALLSIGN,
      now,
    },
    client,
  );
  await upsertPersonSettings([{ personId, language: 'ru', joinedAt: now }], DEMO_JOINED_SOURCE, client);

  const account = await ensureDriverAccount(personId, client);

  await transferPoints({
    reason: 'opening',
    idempotencyKey: buildOpeningIdempotencyKey(personId),
    amount: DEMO_DRIVER_OPENING_BALANCE,
    fromAccountId: emissionAccountId,
    toAccountId: account.id,
    occurredAt: now,
    context: { actor: 'demo' },
    client,
  });

  return { personId, balance: BigInt(DEMO_DRIVER_OPENING_BALANCE) };
};

export const addDemoViewer = async (request: AddDemoViewerRequest): Promise<AddDemoViewerResult> => {
  const label = request.label.trim();

  if (label === '') {
    return { outcome: 'label_empty' };
  }

  const now = request.now ?? new Date();
  const telegramUserId = request.telegramUserId;
  const current = await findDemoViewer(telegramUserId);

  // У действующего зрителя активная привязка есть, и она его собственная — к демо-водителю.
  // Проверки одной роли — для всех остальных: зритель не бывает живым участником или сотрудником.
  if (current === null || current.disabledAt !== null) {
    if (await findActiveLinkByTelegramOrPhone(telegramUserId, null)) {
      return { outcome: 'telegram_linked' };
    }

    if (await findEmployeeByTelegramUserId(telegramUserId)) {
      return { outcome: 'telegram_employee' };
    }
  }

  const emission = await getSystemAccount('emission');

  try {
    const result = await db.$transaction(async (transaction): Promise<DemoViewerAdded> => {
      const viewer = await lockDemoViewer(telegramUserId, transaction);

      if (viewer && viewer.disabledAt === null) {
        await updateDemoViewerEnabled(telegramUserId, label, transaction);

        return {
          outcome: 'label_updated',
          personId: viewer.personId,
          balance: await balanceOf(viewer.personId, transaction),
        };
      }

      if (viewer) {
        await insertDemoLink(viewer.personId, telegramUserId, transaction);
        await updateDemoViewerEnabled(telegramUserId, label, transaction);

        return {
          outcome: 'enabled',
          personId: viewer.personId,
          balance: await balanceOf(viewer.personId, transaction),
        };
      }

      const driver = await createDemoDriver(transaction, emission.id, now);

      await insertDemoLink(driver.personId, telegramUserId, transaction);
      await insertDemoViewer({ telegramUserId, label, personId: driver.personId }, transaction);

      return { outcome: 'created', ...driver };
    });

    log.info('демо-зритель внесён', {
      telegramUserId: telegramUserId.toString(),
      outcome: result.outcome,
      personId: result.personId,
    });

    return result;
  } catch (error) {
    if (error instanceof NoDemoSourceError) {
      return { outcome: 'no_source' };
    }

    throw error;
  }
};

import { consola } from 'consola';

import { db } from '#server/db';
import type { Prisma } from '#server/generated/prisma/client';
import {
  insertDemoLink,
  insertDemoViewer,
  lockDemoViewer,
  updateDemoViewerEnabled,
} from '#server/repositories/demo';
import { findEmployeeByTelegramUserId } from '#server/repositories/employees';
import { findDriverAccountByPerson } from '#server/repositories/points';
import { findActiveLinkByTelegramOrPhone } from '#server/repositories/programMembership';
import { createDemoDriver, NoDemoSourceError } from '#server/services/demo/createDemoDriver';
import { getSystemAccount } from '#server/services/points/getSystemAccount';

/**
 * Внесение демо-зрителя (issue #205).
 *
 * Новому зрителю заводится свой демо-водитель (`createDemoDriver`): имя, позывной и баланс
 * у всех зрителей одни — `DEMO_DRIVER_*`, — и он сразу участник программы.
 *
 * Демо-водитель привязан к Telegram зрителя обычной строкой `telegram_links`: дальше зритель
 * для приложения, бота, уведомлений и рассылок — обычный участник.
 *
 * Повторное внесение нового водителя не заводит: выключенному зрителю открывается новая
 * привязка к прежнему демо-водителю, действующему — обновляется подпись.
 *
 * Всё одной транзакцией: демо-водитель без привязки — выдуманный человек, до которого
 * не дойти, а привязка без строки списка — Telegram, который зрителем себя не знает.
 * Транзакцию может принести вызывающий (`addDemoViewerWithin`): приём приглашения в демо
 * решает по строке приглашения и пишет зрителя одной транзакцией (issue #252).
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
export type DemoViewerAdded = Extract<AddDemoViewerResult, { personId: string }>;

const balanceOf = async (personId: string, client: Prisma.TransactionClient): Promise<bigint> =>
  (await findDriverAccountByPerson(personId, client))?.balance ?? 0n;

export type AddDemoViewerWithinRequest = {
  telegramUserId: bigint;
  /** Подпись, уже обрезанная и непустая. */
  label: string;
  now: Date;
  emissionAccountId: string;
};

/** Отказы, после которых ничего не записано. */
export type DemoViewerRefused = Extract<AddDemoViewerResult, { outcome: 'telegram_linked' | 'telegram_employee' }>;

/**
 * Внесение зрителя в транзакции вызывающего. Копировать не с кого — `NoDemoSourceError`:
 * транзакция обязана откатиться целиком, и решает это тот, кто её открыл.
 */
export const addDemoViewerWithin = async (
  client: Prisma.TransactionClient,
  request: AddDemoViewerWithinRequest,
): Promise<DemoViewerAdded | DemoViewerRefused> => {
  const { telegramUserId, label, now } = request;
  const viewer = await lockDemoViewer(telegramUserId, client);

  // У действующего зрителя активная привязка есть, и она его собственная — к демо-водителю.
  // Проверки одной роли — для всех остальных: зритель не бывает живым участником или сотрудником.
  if (viewer && viewer.disabledAt === null) {
    await updateDemoViewerEnabled(telegramUserId, label, client);

    return { outcome: 'label_updated', personId: viewer.personId, balance: await balanceOf(viewer.personId, client) };
  }

  if (await findActiveLinkByTelegramOrPhone(telegramUserId, null, client)) {
    return { outcome: 'telegram_linked' };
  }

  if (await findEmployeeByTelegramUserId(telegramUserId, client)) {
    return { outcome: 'telegram_employee' };
  }

  if (viewer) {
    await insertDemoLink(viewer.personId, telegramUserId, client);
    await updateDemoViewerEnabled(telegramUserId, label, client);

    return { outcome: 'enabled', personId: viewer.personId, balance: await balanceOf(viewer.personId, client) };
  }

  const driver = await createDemoDriver(client, request.emissionAccountId, {
    firstName: DEMO_DRIVER_FIRST_NAME,
    callsign: DEMO_DRIVER_CALLSIGN,
    balance: DEMO_DRIVER_OPENING_BALANCE,
    programMember: true,
    now,
  });

  await insertDemoLink(driver.personId, telegramUserId, client);
  await insertDemoViewer({ telegramUserId, label, personId: driver.personId }, client);

  return { outcome: 'created', ...driver };
};

export const addDemoViewer = async (request: AddDemoViewerRequest): Promise<AddDemoViewerResult> => {
  const label = request.label.trim();

  if (label === '') {
    return { outcome: 'label_empty' };
  }

  const telegramUserId = request.telegramUserId;
  const emission = await getSystemAccount('emission');

  try {
    const result = await db.$transaction((transaction) =>
      addDemoViewerWithin(transaction, {
        telegramUserId,
        label,
        now: request.now ?? new Date(),
        emissionAccountId: emission.id,
      }),
    );

    if ('personId' in result) {
      log.info('демо-зритель внесён', {
        telegramUserId: telegramUserId.toString(),
        outcome: result.outcome,
        personId: result.personId,
      });
    }

    return result;
  } catch (error) {
    if (error instanceof NoDemoSourceError) {
      return { outcome: 'no_source' };
    }

    throw error;
  }
};

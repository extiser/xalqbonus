import type { Prisma } from '#server/generated/prisma/client';
import {
  findDemoSource,
  insertDemoLicense,
  insertDemoParkProfile,
  insertDemoPerson,
} from '#server/repositories/demo';
import { upsertPersonSettings } from '#server/repositories/programMembership';
import { ensureDriverAccount } from '#server/services/points/ensureDriverAccount';
import { buildDemoGrantIdempotencyKey } from '#server/services/points/idempotencyKey';
import { transferPoints } from '#server/services/points/transfer';

/**
 * Новый демо-водитель с условиями работы живого участника-источника (issue #205, вынесен
 * из `addDemoViewer` в issue #252). Один путь на обоих заказчиков: зрителю — водитель
 * с фиксированными именем, балансом и участием, генератору — с заданными.
 *
 * У источника берутся только условия работы профиля; имя, позывной, удостоверение и машина
 * выдуманы, телефона нет вовсе: по демо-водителю живого не узнать.
 *
 * Баланс ложится не записью в счёт, а переводом с `emission` своей причиной `demo_grant`
 * (issue #212), ключом от демо-водителя: второго перевода на один счёт не бывает. Ноль —
 * перевода нет: пустой перевод журнал не принимает, а счёт заводится всё равно — «на счету
 * ноль» и «счёта нет» для сегмента разные вещи.
 *
 * Привязки Telegram здесь нет: её заводит зритель, у сгенерированного её нет вовсе.
 * Транзакция — вызывающего: водитель без строки зрителя у зрителя — выдуманный человек,
 * до которого не дойти.
 */

/** Откуда пришло участие — рядом с `telegram`, `legacy_import`, `operator`. */
const DEMO_JOINED_SOURCE = 'demo';

/** Сколько знаков `person_id` идёт в номер удостоверения демо-водителя. */
const DEMO_LICENSE_ID_LENGTH = 8;

/** Копировать не с кого — отказ изнутри транзакции, чтобы она откатилась целиком. */
export class NoDemoSourceError extends Error {
  constructor() {
    super('нет участника программы с работающим профилем — копировать демо-водителю не с кого');
    this.name = 'NoDemoSourceError';
  }
}

export type CreateDemoDriverRequest = {
  firstName: string;
  callsign: string;
  /** Баланс баллами, целое неотрицательное. */
  balance: number;
  /** Участник программы: строка `person_settings`. */
  programMember: boolean;
  now: Date;
  /**
   * Когда вступил в программу. Пусто — сейчас. Генератору нужен раньше: его поездки лежат
   * в прошлом, а приветственный бонус считает только поездки после вступления.
   */
  joinedAt?: Date;
};

export const createDemoDriver = async (
  client: Prisma.TransactionClient,
  emissionAccountId: string,
  request: CreateDemoDriverRequest,
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
      firstName: request.firstName,
      callsign: request.callsign,
      now: request.now,
    },
    client,
  );

  if (request.programMember) {
    await upsertPersonSettings(
      [{ personId, language: 'ru', joinedAt: request.joinedAt ?? request.now }],
      DEMO_JOINED_SOURCE,
      client,
    );
  }

  const account = await ensureDriverAccount(personId, client);

  if (request.balance > 0) {
    await transferPoints({
      reason: 'demo_grant',
      idempotencyKey: buildDemoGrantIdempotencyKey(personId),
      amount: request.balance,
      fromAccountId: emissionAccountId,
      toAccountId: account.id,
      occurredAt: request.now,
      context: { actor: 'demo' },
      client,
    });
  }

  return { personId, balance: BigInt(request.balance) };
};

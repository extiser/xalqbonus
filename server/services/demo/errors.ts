/**
 * Доменные ошибки демо (issue #213).
 *
 * Устроены как ошибки наград (`services/rewards/errors.ts`): несут не строку для человека,
 * а то, что именно не так, — текст к отказу пишет ручка.
 */
export abstract class DemoError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Человек не демо-водитель или его нет вовсе. Поездки руками пишутся только демо: живому
 * водителю выдуманная поездка — это балл мимо Fleet API и зачётный день, которого не было.
 */
export class NotDemoDriverError extends DemoError {
  constructor(public readonly personId: string) {
    super(`человек ${personId} не демо-водитель — поездки руками ему не пишутся`);
  }
}

/** Что не так в запросе ручных поездок. Имя — то, что покажет ручка. */
export type DemoTripsProblem = 'count_invalid' | 'ended_at_invalid' | 'ended_at_future';

export class InvalidDemoTripsError extends DemoError {
  constructor(public readonly problem: DemoTripsProblem) {
    super(`ручные поездки не записаны: ${problem}`);
  }
}

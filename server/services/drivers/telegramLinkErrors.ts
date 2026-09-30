import type { DriverTelegramDenialCode, DriverTelegramOtherDriver } from '#shared/types/driver';

/**
 * Отказы привязки и отвязки Telegram из карточки водителя (issue #305).
 *
 * Одни на три ручки — проверку кандидата, привязку и отвязку: сотрудник видит один и тот же
 * отказ и до подтверждения, и после, если между ними что-то изменилось. Код отказа — поле
 * `code` у каждой ошибки, по нему ручки собирают ответ (`server/utils/telegramLinkFailure.ts`).
 */
export abstract class TelegramLinkError extends Error {
  abstract readonly code: TelegramLinkErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Код отказа — общий с экраном: по нему он решает, рисовать ли ссылку на другого водителя. */
export type TelegramLinkErrorCode = DriverTelegramDenialCode;

/** Человека с таким идентификатором нет. Ручки отвечают 404, как карточка водителя. */
export class UnknownDriverError extends Error {
  constructor(public readonly personId: string) {
    super(`человека ${personId} нет`);
    this.name = 'UnknownDriverError';
  }
}

/** Демо-водитель: его привязки меняются в разделе «Демо», а не в карточке. */
export class DriverDemoError extends TelegramLinkError {
  readonly code = 'driver_demo';

  constructor(public readonly personId: string) {
    super(`человек ${personId} — демо-водитель`);
  }
}

/**
 * Человек не в программе. Участие начинается с привязки, которую водитель делает сам,
 * и заводить его из карточки — не эта операция.
 */
export class DriverNotMemberError extends TelegramLinkError {
  readonly code = 'not_member';

  constructor(public readonly personId: string) {
    super(`человек ${personId} не в программе`);
  }
}

/** С этого Telegram водитель за последние 30 дней номером не делился. */
export class RelinkAttemptMissingError extends TelegramLinkError {
  readonly code = 'no_attempt';

  constructor(
    public readonly personId: string,
    public readonly telegramUserId: bigint,
  ) {
    super(`у человека ${personId} нет годной попытки с Telegram ${telegramUserId}`);
  }
}

/**
 * Telegram принадлежит сотруднику парка: водителем и сотрудником одновременно быть нельзя
 * (docs/decisions.md → «Учётка сотрудника и роли»).
 */
export class TelegramOfEmployeeError extends TelegramLinkError {
  readonly code = 'employee_account';

  constructor(public readonly telegramUserId: bigint) {
    super(`Telegram ${telegramUserId} принадлежит сотруднику`);
  }
}

/** Кто держит чат, — чтобы отказ назвал его и дал ссылку на его карточку. */
export type OtherDriver = DriverTelegramOtherDriver;

/** Чат попытки привязан к другому водителю: сначала его отвязывают там. */
export class TelegramLinkedToOtherError extends TelegramLinkError {
  readonly code = 'linked_to_other';

  constructor(public readonly other: OtherDriver) {
    super(`чат привязан к человеку ${other.personId}`);
  }
}

/** Чат попытки уже и есть действующая привязка этого водителя. */
export class TelegramAlreadyActiveError extends TelegramLinkError {
  readonly code = 'already_active';

  constructor(public readonly personId: string) {
    super(`у человека ${personId} этот Telegram уже привязан`);
  }
}

/**
 * Пока шла привязка, водителю привязали другой Telegram: вставку отбил индекс одной активной
 * привязки на человека. Так бывает, когда бот в ту же секунду сам привязал водителя
 * по телефону, — карточка у сотрудника устарела.
 */
export class PersonLinkChangedError extends TelegramLinkError {
  readonly code = 'person_link_changed';

  constructor(public readonly personId: string) {
    super(`у человека ${personId} во время привязки появилась другая действующая привязка`);
  }
}

/** Отвязка, а действующей привязки нет. */
export class NoActiveTelegramLinkError extends TelegramLinkError {
  readonly code = 'no_active_link';

  constructor(public readonly personId: string) {
    super(`у человека ${personId} нет действующей привязки`);
  }
}

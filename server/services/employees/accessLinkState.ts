import type { EmployeeAccessLinkKind } from '#server/generated/prisma/enums';
import type { EmployeeAccessLinkRow } from '#server/repositories/employeeAccessLinks';

/**
 * Жива ли ссылка к учётке, а если нет — почему (issue #267). Одно правило на страницу
 * «задать пароль», на её отправку и на привязку Telegram в боте.
 */

/** Чем кончилась ссылка, которой больше нельзя воспользоваться. */
export type DeadAccessLinkOutcome =
  /** Токена нет в базе, или он выпущен под другое действие. */
  | 'not_found'
  /** Срок вышел. */
  | 'expired'
  /** Ссылкой уже воспользовались: она одноразовая. */
  | 'used'
  /** Ссылку отозвала новая того же вида. */
  | 'revoked';

export type AccessLinkState<Row extends EmployeeAccessLinkRow> =
  | { outcome: 'live'; link: Row }
  | { outcome: DeadAccessLinkOutcome };

export const accessLinkState = <Row extends EmployeeAccessLinkRow>(
  link: Row | null,
  kind: EmployeeAccessLinkKind,
  now: Date,
): AccessLinkState<Row> => {
  // Токен ссылки привязки на странице пароля — не та ссылка: вид в адрес не вшит, и ответ
  // ему тот же, что выдуманному.
  if (!link || link.kind !== kind) {
    return { outcome: 'not_found' };
  }

  if (link.usedAt !== null) {
    return { outcome: 'used' };
  }

  if (link.revokedAt !== null) {
    return { outcome: 'revoked' };
  }

  if (link.expiresAt <= now) {
    return { outcome: 'expired' };
  }

  return { outcome: 'live', link };
};

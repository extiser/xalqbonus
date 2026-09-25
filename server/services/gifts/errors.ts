/**
 * Доменные ошибки подарков от Xalq Taxi (issue #219).
 *
 * Устроены как ошибки наград (`services/rewards/errors.ts`): несут не строку для человека,
 * а код того, что не так, — текст к отказу берёт ручка из словаря.
 */
export abstract class GiftsError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Что не так с вводом раздачи. Текст к каждой причине — у ручки. */
export type GiftGrantProblem =
  /** Сумма — не целое положительное число баллов. */
  | 'points_invalid'
  /** Повода на русском нет: водитель увидит его в приложении и в сообщении. */
  | 'reason_ru_missing'
  | 'reason_uz_missing'
  /**
   * Сообщение с поводом на этом языке длиннее, чем принимает Telegram: с обложкой — подпись
   * к фото, без — текст сообщения. Проверяется по каждому языку: водителю уходит один.
   */
  | 'reason_ru_too_long'
  | 'reason_uz_too_long'
  /** Обложка не JPEG, PNG или WebP. */
  | 'cover_type_invalid'
  /** Обложка тяжелее потолка фото. */
  | 'cover_too_large'
  /** «Забрать до» не читается как день календаря. */
  | 'until_date_invalid'
  /** «Забрать до» раньше завтрашнего дня парка: подарок зачислился бы, не успев подождать. */
  | 'until_date_too_early';

export class InvalidGiftGrantError extends GiftsError {
  constructor(public readonly problem: GiftGrantProblem) {
    super(`раздача подарка не годится: ${problem}`);
  }
}

/** Кому не вручить: водитель вне программы, сегмента нет, он в архиве или в нём нет участников. */
export type GiftRecipientProblem =
  /** Водитель не участник программы: баллы вне программы не копятся. */
  | 'person_not_member'
  | 'segment_unknown'
  | 'segment_archived'
  /** В сегменте нет ни одного участника программы — раздавать некому. */
  | 'segment_no_members';

export class GiftRecipientError extends GiftsError {
  constructor(public readonly problem: GiftRecipientProblem) {
    super(`подарок некому вручить: ${problem}`);
  }
}

/** Подарка с таким идентификатором у этого водителя нет — или его нет вовсе. */
export class GiftNotFoundError extends GiftsError {
  constructor(public readonly rewardId: string) {
    super(`подарка ${rewardId} нет`);
  }
}

/** Подарок уже не ждёт: забран или зачислен по сроку раньше этого запроса. */
export class GiftNotClaimableError extends GiftsError {
  constructor(public readonly rewardId: string) {
    super(`подарок ${rewardId} уже зачислен`);
  }
}

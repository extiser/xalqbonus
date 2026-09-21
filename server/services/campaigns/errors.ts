import type { CampaignStatus } from '#server/generated/prisma/enums';
import type { CampaignLaunchProblem } from '#shared/campaign';

/**
 * Доменные ошибки акций.
 *
 * Отказы двери — «не вошёл», «роль не та» — сюда не относятся: они живут в словаре
 * (`shared/denials.ts`). Здесь то, что про предмет разговора: такой акции нет, она уже
 * запущена, сегмент в архиве, окно половины Б уже назначено.
 */
export abstract class CampaignError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownCampaignError extends CampaignError {
  constructor(public readonly campaignId: string) {
    super(`акции ${campaignId} нет`);
  }
}

/**
 * Действие не подходит акции в её статусе: правят и запускают только черновик, окно
 * половины Б назначают только идущей.
 */
export class CampaignStatusMismatchError extends CampaignError {
  constructor(
    public readonly campaignId: string,
    public readonly status: CampaignStatus,
    public readonly expected: CampaignStatus,
  ) {
    super(`акция ${campaignId} в статусе ${status}, а действие ждёт ${expected}`);
  }
}

/** Черновику не хватает полей для запуска. Несёт все причины сразу — экран называет их списком. */
export class CampaignNotLaunchableError extends CampaignError {
  constructor(
    public readonly campaignId: string,
    public readonly problems: CampaignLaunchProblem[],
  ) {
    super(`акцию ${campaignId} нельзя запустить: ${problems.join(', ')}`);
  }
}

/** Сегмент в архиве: при выборе он не предлагается, и запуск по нему не проходит. */
export class CampaignSegmentArchivedError extends CampaignError {
  constructor(public readonly segmentId: string) {
    super(`сегмент ${segmentId} в архиве`);
  }
}

/** Выбранного сегмента нет. */
export class CampaignSegmentUnknownError extends CampaignError {
  constructor(public readonly segmentId: string) {
    super(`сегмента ${segmentId} нет`);
  }
}

/** По сегменту на момент запуска не нашлось ни одного человека. */
export class CampaignAudienceEmptyError extends CampaignError {
  constructor(public readonly campaignId: string) {
    super(`у акции ${campaignId} пустой состав`);
  }
}

/** Такой `slug` уже занят другой акцией: он уходит в ключ идемпотентности и обязан быть один. */
export class CampaignSlugTakenError extends CampaignError {
  constructor(public readonly slug: string) {
    super(`короткое имя ${slug} уже занято`);
  }
}

/**
 * Окно половины Б назначить нельзя: деления не было или окно уже назначено. Назначается
 * один раз — правки дат у половины, которая уже могла начаться, нет.
 */
export class CampaignSecondHalfUnavailableError extends CampaignError {
  constructor(
    public readonly campaignId: string,
    public readonly reason: 'no_split' | 'already_set',
  ) {
    super(`окно половины Б акции ${campaignId} не назначается: ${reason}`);
  }
}

/** Что именно не так с полями акции. Текст к каждой причине — у ручки. */
export type CampaignFieldProblem =
  /** Короткое имя — не строчная латиница с цифрами и дефисами. */
  | 'slug_invalid'
  /** Идентификатор сегмента — не uuid. */
  | 'segment_invalid'
  /** Дата — не день календаря. */
  | 'day_invalid'
  /** Последний день окна раньше первого. */
  | 'window_reversed'
  /** Для окна половины Б нужны обе даты. */
  | 'window_incomplete'
  /** Идентификатор офиса выдачи наград — не uuid. */
  | 'office_invalid'
  /** Срок жизни награды — не целое положительное число дней. */
  | 'reward_lifetime_invalid';

export class InvalidCampaignFieldsError extends CampaignError {
  constructor(public readonly problem: CampaignFieldProblem) {
    super(`поля акции не годятся: ${problem}`);
  }
}

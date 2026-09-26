import type { CampaignChestKind, CampaignStatus } from '#server/generated/prisma/enums';
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

/**
 * Сегмент не того мира (issue #212): демо-акция идёт только на демо-сегменте, живая — только
 * на живом. Иначе демо-акция позвала бы живых водителей, а живая — демо.
 */
export class CampaignSegmentDemoMismatchError extends CampaignError {
  constructor(
    public readonly segmentId: string,
    public readonly campaignIsDemo: boolean,
  ) {
    super(
      `сегмент ${segmentId} ${campaignIsDemo ? 'живой, а акция демо' : 'демо, а акция живая'}`,
    );
  }
}

/**
 * Офис выдачи не того мира (issue #212): у демо-акции — ДЕМО ОФИС, у живой — живой. Живой
 * водитель не видит ДЕМО ОФИС, и приз в нём он бы не забрал.
 */
export class CampaignOfficeDemoMismatchError extends CampaignError {
  constructor(
    public readonly officeId: string,
    public readonly campaignIsDemo: boolean,
  ) {
    super(`офис ${officeId} ${campaignIsDemo ? 'живой, а акция демо' : 'демо, а акция живая'}`);
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

/**
 * Призы правятся только у черновика (issue #180): у идущей акции часть водителей уже открыла
 * сундуки по прежним весам, и разбор волны после правки не читается.
 */
export class CampaignPrizesLockedError extends CampaignError {
  constructor(
    public readonly campaignId: string,
    public readonly status: CampaignStatus,
  ) {
    super(`призы акции ${campaignId} не правятся: она в статусе ${status}`);
  }
}

/** Что именно не так с набором призов. Текст к каждой причине — у ручки. */
export type CampaignPrizeProblem =
  /** Тело не набор строк, или у строки неизвестный сундук или вид. */
  | 'prizes_malformed'
  /** Вариантов больше предела `CAMPAIGN_PRIZES_LIMIT`. */
  | 'prizes_too_many'
  /** Вес — не целое число больше нуля. */
  | 'weight_invalid'
  /** Сумма баллов — не целое число больше нуля. */
  | 'points_invalid'
  /** Товар не выбран или выбран неверно. */
  | 'product_invalid'
  /** У своей награды нет названия. */
  | 'title_missing'
  /** Второй вариант у фиксированного сундука. */
  | 'fixed_chest_duplicate';

export class InvalidCampaignPrizesError extends CampaignError {
  constructor(
    public readonly problem: CampaignPrizeProblem,
    /** Сундук строки, в которой нашлась причина. Пусто — тело не разобралось вовсе. */
    public readonly chest: CampaignChestKind | null,
  ) {
    super(`призы акции не годятся: ${problem}${chest ? ` (${chest})` : ''}`);
  }
}

/**
 * Демо-товар в призах живой акции (issue #212): живому водителю он не выдаётся. У демо-акции
 * в призах может быть любой товар — живое до демо доходит.
 */
export class CampaignPrizeDemoProductError extends CampaignError {
  constructor(
    public readonly productId: string,
    public readonly chest: CampaignChestKind,
  ) {
    super(`товар ${productId} демо и не годится в приз живой акции`);
  }
}

/** Товар варианта не выдаётся: его нет, он черновик или в архиве — как в `grantReward`. */
export class CampaignPrizeProductUnavailableError extends CampaignError {
  constructor(
    public readonly productId: string,
    public readonly chest: CampaignChestKind,
  ) {
    super(`товар ${productId} не годится в приз: не опубликован или в архиве`);
  }
}

// ---------------------------------------------------------------------------
// Открытие сундука (issue #181)
// ---------------------------------------------------------------------------

/**
 * Акции водителю сейчас не видно: он не в составе или окно его половины кончилось, пока
 * экран был открыт. Не то же, что «сундук не заработан»: открывать тут нечего вовсе.
 */
export class MemberCampaignUnavailableError extends CampaignError {
  constructor(public readonly personId: string) {
    super(`водителю ${personId} акция сейчас не видна`);
  }
}

/** Почему сундук не открывается. Для лога и тестов: водителю все причины звучат одинаково. */
export type CampaignChestRefusal =
  /** Не вступил — сундуков у него нет. */
  | 'not_joined'
  /** Номер дня вне окна или не передан у сундука дня. */
  | 'day_invalid'
  /** Окно до этого дня ещё не дошло. */
  | 'ahead'
  /** День идёт, цель не взята. */
  | 'today'
  /** День прошёл без цели. */
  | 'missed'
  /** Ступень достижима, но ещё не заработана. */
  | 'reachable'
  /** Ступень уже не собрать. */
  | 'unreachable';

export class CampaignChestNotEarnedError extends CampaignError {
  constructor(
    public readonly personId: string,
    public readonly chest: CampaignChestKind,
    public readonly dayNumber: number | null,
    public readonly refusal: CampaignChestRefusal,
  ) {
    super(
      `сундук ${chest}${dayNumber === null ? '' : ` дня ${dayNumber}`} водителя ${personId} не открывается: ${refusal}`,
    );
  }
}

/**
 * Выпавший приз не выдать: товара нет на полке, товар снят или офис акции закрыт. Сундук
 * остаётся закрытым и заработанным, не записывается ничего — ни награды, ни строки сундука.
 */
export class CampaignChestPrizeUnavailableError extends CampaignError {
  constructor(
    public readonly campaignId: string,
    public readonly chest: CampaignChestKind,
    public readonly failure: 'stock_short' | 'product_unavailable' | 'office_unavailable',
  ) {
    super(`приз сундука ${chest} акции ${campaignId} не выдать: ${failure}`);
  }
}

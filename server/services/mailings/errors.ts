import type { MailingStatus } from '#server/generated/prisma/enums';
import type { MailingLaunchProblem } from '#shared/mailing';

/**
 * Доменные ошибки рассылок.
 *
 * Отказы двери — «не вошёл», «роль не та» — сюда не относятся: они живут в словаре
 * (`shared/denials.ts`). Здесь то, что про предмет разговора: такой рассылки нет, она уже
 * запущена, текст не влезает в подпись к фото.
 */
export abstract class MailingError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownMailingError extends MailingError {
  constructor(public readonly mailingId: string) {
    super(`рассылки ${mailingId} нет`);
  }
}

/**
 * Действие не подходит рассылке в её статусе: правят, запускают и удаляют только черновик,
 * останавливают только идущую, копируют только остановленную.
 */
export class MailingStatusMismatchError extends MailingError {
  constructor(
    public readonly mailingId: string,
    public readonly status: MailingStatus,
    public readonly expected: MailingStatus,
  ) {
    super(`рассылка ${mailingId} в статусе ${status}, а действие ждёт ${expected}`);
  }
}

/**
 * Черновик нельзя запустить: нет заголовка, нет русского текста, склейка длиннее, чем примет
 * Telegram. Несёт все причины сразу — экран называет их одним списком (issue #148).
 *
 * Отказ запуска и только его: сохранение черновика и загрузка фото по этим причинам
 * не отказывают.
 */
export class MailingNotLaunchableError extends MailingError {
  constructor(
    public readonly mailingId: string,
    public readonly problems: MailingLaunchProblem[],
  ) {
    super(
      `рассылку ${mailingId} нельзя запустить: ${problems.map((problem) => problem.kind).join(', ')}`,
    );
  }
}

/**
 * Один текст длиннее физического потолка `sendMessage`. Свойство поля, а не сообщения:
 * от фото не зависит и проверяется при сохранении.
 */
export class MailingFieldTooLongError extends MailingError {
  constructor(
    public readonly field: 'textRu' | 'textUz',
    public readonly limit: number,
  ) {
    super(`текст ${field} длиннее ${limit} знаков`);
  }
}

/** По фильтру рассылки на момент запуска не нашлось ни одного адресата. */
export class MailingAudienceEmptyError extends MailingError {
  constructor(public readonly mailingId: string) {
    super(`у рассылки ${mailingId} нет адресатов`);
  }
}

/** Присланный тип фото не входит в список принимаемых. */
export class MailingPhotoTypeNotAllowedError extends MailingError {
  constructor(public readonly contentType: string) {
    super(`тип ${contentType} не принимается: нужен JPEG, PNG или WebP`);
  }
}

/** Фото больше потолка. */
export class MailingPhotoTooLargeError extends MailingError {
  constructor(
    public readonly bytes: number,
    public readonly limitBytes: number,
  ) {
    super(`фото ${bytes} б больше потолка ${limitBytes} б`);
  }
}

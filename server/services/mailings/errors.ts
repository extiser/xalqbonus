import type { MailingStatus } from '#server/generated/prisma/enums';
import type { MailingLaunchProblem, MailingRecallProblem } from '#shared/mailing';
import type { SurveyFreezeProblem } from '#shared/survey';

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
 * останавливают только идущую, копируют всё, кроме идущей.
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
 * Черновик нельзя запустить: нет заголовка, нет текста ни на одном языке, склейка длиннее, чем примет
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

/**
 * Рассылку нельзя отозвать: она ещё не прошла, не дошла ни до кого или окно Telegram
 * в 48 часов истекло.
 */
export class MailingRecallUnavailableError extends MailingError {
  constructor(
    public readonly mailingId: string,
    public readonly problem: MailingRecallProblem,
  ) {
    super(`рассылку ${mailingId} нельзя отозвать: ${problem}`);
  }
}

/** По фильтру рассылки на момент запуска не нашлось ни одного адресата. */
export class MailingAudienceEmptyError extends MailingError {
  constructor(
    public readonly mailingId: string,
    /** Аудиторию резал сегмент — фраза отказа своя. */
    public readonly withSegment: boolean,
  ) {
    super(`у рассылки ${mailingId} нет адресатов`);
  }
}

/** Что не так с полями рассылки. Текст к каждой причине — у ручки. */
export type MailingFieldProblem =
  /** Идентификатор сегмента — не uuid. */
  | 'segment_invalid'
  /** Идентификатор опроса — не uuid. */
  | 'survey_invalid';

export class InvalidMailingFieldsError extends MailingError {
  constructor(public readonly problem: MailingFieldProblem) {
    super(`поля рассылки не годятся: ${problem}`);
  }
}

/** Выбранного сегмента нет. */
export class MailingSegmentUnknownError extends MailingError {
  constructor(public readonly segmentId: string) {
    super(`сегмента ${segmentId} нет`);
  }
}

/** Сегмент в архиве (issue #321): при выборе он не предлагается, и запуск по нему не проходит. */
export class MailingSegmentArchivedError extends MailingError {
  constructor(public readonly segmentId: string) {
    super(`сегмент ${segmentId} в архиве`);
  }
}

/**
 * Сегмент не того мира (issue #321): демо-рассылка — только с демо-сегментом, живая — только
 * с живым, как у акции.
 */
export class MailingSegmentDemoMismatchError extends MailingError {
  constructor(
    public readonly segmentId: string,
    public readonly mailingIsDemo: boolean,
  ) {
    super(
      `сегмент ${segmentId} ${mailingIsDemo ? 'живой, а рассылка демо' : 'демо, а рассылка живая'}`,
    );
  }
}

/** Выбранного опроса нет. */
export class MailingSurveyUnknownError extends MailingError {
  constructor(public readonly surveyId: string) {
    super(`опроса ${surveyId} нет`);
  }
}

/**
 * Опрос не того мира (issue #321): живой опрос в демо-рассылке начислил бы баллы
 * демо-водителям тем же ключом, что живым.
 */
export class MailingSurveyDemoMismatchError extends MailingError {
  constructor(
    public readonly surveyId: string,
    public readonly mailingIsDemo: boolean,
  ) {
    super(
      `опрос ${surveyId} ${mailingIsDemo ? 'живой, а рассылка демо' : 'демо, а рассылка живая'}`,
    );
  }
}

/**
 * Опрос закрыт (issue #321) — по сроку или досрочно (issue #348): водитель открыл бы опрос,
 * который уже не принимает ответов.
 */
export class MailingSurveyClosedError extends MailingError {
  constructor(
    public readonly surveyId: string,
    /** Завершён досрочно — продлить его нельзя, и отказ говорит об этом по-своему. */
    public readonly finished: boolean,
  ) {
    super(`опрос ${surveyId} закрыт ${finished ? 'досрочно' : 'по сроку'}`);
  }
}

/**
 * Опрос не дописан (issue #321) — отказ запуска и только его: черновик опроса правится и после
 * прикрепления. Несёт все причины сразу, теми же значениями, что экран опроса.
 */
export class MailingSurveyIncompleteError extends MailingError {
  constructor(
    public readonly surveyId: string,
    public readonly problems: SurveyFreezeProblem[],
  ) {
    super(
      `опрос ${surveyId} не дописан: ${problems.map((problem) => problem.kind).join(', ')}`,
    );
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

/**
 * Итогов опроса у рассылки нет (issue #325): к ней не прикреплён опрос или она не запущена —
 * снимка адресатов, по которому строится таблица, ещё нет.
 */
export class MailingSurveyResultsUnavailableError extends MailingError {
  constructor(
    public readonly mailingId: string,
    public readonly reason: 'no_survey' | 'not_launched',
  ) {
    super(`итогов опроса у рассылки ${mailingId} нет: ${reason}`);
  }
}

export type MailingSurveySliceProblem =
  /** Вид среза не из списка или у среза по сегменту нет сегмента. */
  | 'slice'
  /** Идентификатор сегмента — не uuid. */
  | 'segment_invalid'
  /** Сегмент не того мира, что рассылка: срез по нему пуст по построению. */
  | 'segment_demo_mismatch';

/** Срез итогов опроса не разобран (issue #325). Экран такого не шлёт — это испорченная ссылка. */
export class MailingSurveySliceInvalidError extends MailingError {
  constructor(public readonly problem: MailingSurveySliceProblem) {
    super(`срез итогов опроса не разобран: ${problem}`);
  }
}

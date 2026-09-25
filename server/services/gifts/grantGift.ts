import { randomUUID } from 'node:crypto';

import { consola } from 'consola';
import { deleteGiftCover, writeGiftCover } from '#server/adapters/uploads/giftCovers';
import { buildGiftMessage } from '#server/bot/notifications';
import { db } from '#server/db';
import { enqueueNotifications } from '#server/queues/notifications';
import { insertGiftGrant, insertGiftRewards } from '#server/repositories/gifts';
import { listProgramMemberIds } from '#server/repositories/programMembership';
import { findSegment, listSegmentPersonIds } from '#server/repositories/segments';
import {
  GiftRecipientError,
  InvalidGiftGrantError,
  type GiftGrantLanguage,
} from '#server/services/gifts/errors';
import { toSegmentConditions } from '#server/services/segments/fields';
import { parkDayKey, shiftDayKey } from '#server/utils/parkTime';
import { isCalendarDay } from '#shared/campaign';
import { GIFT_REASON_MAX_LENGTH } from '#shared/gift';
import { mailingMessageLimit } from '#shared/mailing';
import { MAX_PHOTO_BYTES, PHOTO_EXTENSION_BY_TYPE } from '#shared/photo';

/**
 * Раздача подарка от Xalq Taxi (issue #219): баллы одному водителю или сегменту, каждому —
 * награда `claimable`, которую он забирает в приложении или получает сам в назначенный день.
 *
 * **Журнал здесь не пишется.** Баллы ложатся на баланс в момент зачисления (`creditGift`),
 * а до него подарок только обещан: забрать его — повод зайти в приложение.
 *
 * Получают только участники программы — есть строка `person_settings`: вне программы баллы
 * не копятся. Из сегмента не-участники пропускаются и считаются в `skipped`; одному водителю
 * вне программы — отказ.
 *
 * Состав сегмента снимается на момент раздачи тем же построителем, что у запуска акции,
 * и дальше не пересчитывается. Раздача и все её награды — одна транзакция: половина раздачи
 * означала бы водителей, которым не досталось, без следа причины. Сообщения водителям
 * ставятся после фиксации — сообщение о подарке, который откатился, хуже, чем никакого.
 *
 * Повод — на двух языках, оба обязательны: сообщение и приложение говорят с водителем на его
 * языке. Свой текст сообщения и обложка — тоже на каждом языке (issue #236). Текст
 * необязателен на каждом языке сам по себе: пусто — водителю этого языка уходит системный.
 * Обложки — обе или ни одной; ложатся на том под идентификатор раздачи до транзакции — как
 * фото рассылки, сначала файл, потом колонка. Не записалась раздача — файлы снимаются.
 */

const log = consola.withTag('gifts:grant');

export type GiftRecipient =
  | { kind: 'person'; personId: string }
  | { kind: 'segment'; segmentId: string };

/** Обложка, как её прислали: тип и размер проверяются здесь. */
export type GiftCoverUpload = { contentType: string; bytes: Buffer };

export type GrantGiftInput = {
  recipient: GiftRecipient;
  /** Как пришло: проверяется здесь. */
  points: number | null;
  reasonRu: string;
  reasonUz: string;
  /** «Забрать до», `YYYY-MM-DD`. */
  untilDate: string;
  /** Свой текст сообщения, как набран. Пусто после обрезки краёв — системный текст. */
  messageRu: string;
  messageUz: string;
  coverRu: GiftCoverUpload | null;
  coverUz: GiftCoverUpload | null;
  employeeId: string;
};

export type GrantGiftResult = {
  giftGrantId: string;
  recipients: number;
  skipped: number;
};

/** Столбец `points` — `int`: сумма больше него не запишется. */
const MAX_POINTS = 2_147_483_647;

type ValidGift = {
  points: number;
  reasonRu: string;
  reasonUz: string;
  untilDate: string;
  messageRu: string | null;
  messageUz: string | null;
};

const validateCover = (cover: GiftCoverUpload | null, language: GiftGrantLanguage): void => {
  if (cover === null) {
    return;
  }

  if (!PHOTO_EXTENSION_BY_TYPE[cover.contentType]) {
    throw new InvalidGiftGrantError('cover_type_invalid', { cover: language });
  }

  if (cover.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new InvalidGiftGrantError('cover_too_large', { cover: language });
  }
};

/** Обложки — обе или ни одной. Одна и та же картинка в оба поля — законно. */
const validateCovers = (input: GrantGiftInput): void => {
  if (input.coverRu !== null && input.coverUz === null) {
    throw new InvalidGiftGrantError('cover_pair_incomplete', { cover: 'uz' });
  }

  if (input.coverRu === null && input.coverUz !== null) {
    throw new InvalidGiftGrantError('cover_pair_incomplete', { cover: 'ru' });
  }

  validateCover(input.coverRu, 'ru');
  validateCover(input.coverUz, 'uz');
};

const normalizeMessage = (message: string): string | null => {
  const trimmed = message.trim();

  return trimmed === '' ? null : trimmed;
};

/**
 * Свой текст влезает в сообщение. Меряется всё, что уйдёт водителю этого языка: свой текст,
 * пустая строка и системная строка с суммой и датой этой раздачи — той же сборкой, что при
 * отправке. С обложкой сообщение становится подписью к фото, и потолок вчетверо ниже.
 */
const validateMessage = (
  gift: Omit<ValidGift, 'messageRu' | 'messageUz'>,
  message: string | null,
  language: GiftGrantLanguage,
  withCover: boolean,
): void => {
  if (message === null) {
    return;
  }

  const { length } = buildGiftMessage(
    {
      points: gift.points,
      reason: language === 'uz' ? gift.reasonUz : gift.reasonRu,
      untilDate: gift.untilDate,
    },
    message,
    language,
  ).text;
  const limit = mailingMessageLimit(withCover);

  if (length > limit) {
    throw new InvalidGiftGrantError(language === 'uz' ? 'message_uz_too_long' : 'message_ru_too_long', {
      excess: length - limit,
    });
  }
};

const validate = (input: GrantGiftInput, now: Date): ValidGift => {
  const { points } = input;

  if (points === null || !Number.isInteger(points) || points <= 0 || points > MAX_POINTS) {
    throw new InvalidGiftGrantError('points_invalid');
  }

  const reasonRu = input.reasonRu.trim();
  const reasonUz = input.reasonUz.trim();

  if (reasonRu === '') {
    throw new InvalidGiftGrantError('reason_ru_missing');
  }

  if (reasonUz === '') {
    throw new InvalidGiftGrantError('reason_uz_missing');
  }

  // Повод — строка карточки подарка. С ним и сообщение о подарке заведомо влезает в подпись
  // к фото: шаблон и сумма с датой — около сотни знаков при потолке подписи 1024.
  if (reasonRu.length > GIFT_REASON_MAX_LENGTH) {
    throw new InvalidGiftGrantError('reason_ru_too_long');
  }

  if (reasonUz.length > GIFT_REASON_MAX_LENGTH) {
    throw new InvalidGiftGrantError('reason_uz_too_long');
  }

  const untilDate = input.untilDate.trim();

  if (!isCalendarDay(untilDate)) {
    throw new InvalidGiftGrantError('until_date_invalid');
  }

  // Строки `YYYY-MM-DD` сравниваются как даты. Сегодняшний день парка не годится: подарок
  // зачислился бы этой же ночью, не успев подождать водителя.
  if (untilDate < shiftDayKey(parkDayKey(now), 1)) {
    throw new InvalidGiftGrantError('until_date_too_early');
  }

  validateCovers(input);

  const withCover = input.coverRu !== null;
  const messageRu = normalizeMessage(input.messageRu);
  const messageUz = normalizeMessage(input.messageUz);

  validateMessage({ points, reasonRu, reasonUz, untilDate }, messageRu, 'ru', withCover);
  validateMessage({ points, reasonRu, reasonUz, untilDate }, messageUz, 'uz', withCover);

  return { points, reasonRu, reasonUz, untilDate, messageRu, messageUz };
};

/** Пути обложек на томе. Обе или ни одной — как их прислали. */
type CoverPaths = { coverRuPath: string | null; coverUzPath: string | null };

/** Раздача и её подарки одной транзакцией. Получатели — участники программы, снимком. */
const writeGrant = async (
  input: GrantGiftInput,
  gift: ValidGift,
  giftGrantId: string,
  covers: CoverPaths,
): Promise<{ personIds: string[]; skipped: number }> => {
  const { recipient } = input;

  return db.$transaction(async (transaction) => {
    let personIds: string[];
    let skipped = 0;

    if (recipient.kind === 'segment') {
      const segment = await findSegment(recipient.segmentId, transaction);

      if (!segment) {
        throw new GiftRecipientError('segment_unknown');
      }

      if (segment.archivedAt !== null) {
        throw new GiftRecipientError('segment_archived');
      }

      const audience = await listSegmentPersonIds(toSegmentConditions(segment), transaction);

      personIds = await listProgramMemberIds(audience, transaction);
      skipped = audience.length - personIds.length;

      if (personIds.length === 0) {
        throw new GiftRecipientError('segment_no_members');
      }
    } else {
      personIds = await listProgramMemberIds([recipient.personId], transaction);

      if (personIds.length === 0) {
        throw new GiftRecipientError('person_not_member');
      }
    }

    await insertGiftGrant(transaction, {
      ...gift,
      ...covers,
      id: giftGrantId,
      segmentId: recipient.kind === 'segment' ? recipient.segmentId : null,
      personId: recipient.kind === 'person' ? recipient.personId : null,
      recipients: personIds.length,
      skipped,
      grantedByEmployeeId: input.employeeId,
    });

    const inserted = await insertGiftRewards(transaction, {
      giftGrantId,
      personIds,
      points: gift.points,
      // Как у награды-баллов ручной выдачи: водителю сумму называет экран на его языке.
      title: `Баллы: ${gift.points}`,
      reasonRu: gift.reasonRu,
      untilDate: gift.untilDate,
      grantedByEmployeeId: input.employeeId,
    });

    if (inserted !== personIds.length) {
      throw new Error(`раздача ${giftGrantId}: подарков ${inserted} вместо ${personIds.length}`);
    }

    return { personIds, skipped };
  });
};

export const grantGift = async (input: GrantGiftInput): Promise<GrantGiftResult> => {
  const gift = validate(input, new Date());
  const { recipient } = input;
  // Идентификатор выдаётся до записи: под него ложатся файлы обложек.
  const giftGrantId = randomUUID();
  // Что уже легло на том — снимается, если раздача не запишется.
  const writtenCoverPaths: string[] = [];

  const writeCover = async (cover: GiftCoverUpload | null, language: GiftGrantLanguage): Promise<string | null> => {
    if (cover === null) {
      return null;
    }

    const coverPath = await writeGiftCover(giftGrantId, language, cover.contentType, cover.bytes);

    writtenCoverPaths.push(coverPath);

    return coverPath;
  };

  let covers: CoverPaths;
  let written: { personIds: string[]; skipped: number };

  try {
    covers = {
      coverRuPath: await writeCover(input.coverRu, 'ru'),
      coverUzPath: await writeCover(input.coverUz, 'uz'),
    };
    written = await writeGrant(input, gift, giftGrantId, covers);
  } catch (error) {
    // Раздача не записалась — обложкам ссылаться не на что. Отказ снятия не заслоняет
    // исходную причину: она важнее файла, оставшегося на томе.
    for (const coverPath of writtenCoverPaths) {
      await deleteGiftCover(coverPath).catch((cleanupError: unknown) => {
        log.warn('обложка несостоявшейся раздачи не снялась с тома', {
          coverPath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
    }

    throw error;
  }

  const granted = { giftGrantId, ...written };

  log.info('подарок роздан', {
    giftGrantId: granted.giftGrantId,
    recipient: recipient.kind,
    recipients: granted.personIds.length,
    skipped: granted.skipped,
    points: gift.points,
  });

  // Раздача уже зафиксирована: упавшая постановка сообщений её не отменяет — подарки ждут
  // в приложении и без сообщения, а причина остаётся в логе.
  try {
    await enqueueNotifications(
      granted.personIds.map((personId) => ({
        personId,
        template: 'gift_received',
        params: {
          points: gift.points,
          reasonRu: gift.reasonRu,
          reasonUz: gift.reasonUz,
          untilDate: gift.untilDate,
          messageRu: gift.messageRu,
          messageUz: gift.messageUz,
          ...covers,
        },
      })),
    );
  } catch (error) {
    log.error('сообщения о подарке не поставились в очередь', {
      giftGrantId: granted.giftGrantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    giftGrantId: granted.giftGrantId,
    recipients: granted.personIds.length,
    skipped: granted.skipped,
  };
};

import { randomUUID } from 'node:crypto';

import { consola } from 'consola';
import { buildRewardMessage, type RewardMessageValues } from '#server/bot/notifications';
import { enqueueNotification } from '#server/queues/notifications';
import { findOffice } from '#server/repositories/offices';
import { findProduct } from '#server/repositories/products';
import type { RewardRow } from '#server/repositories/rewards';
import type { GiftGrantLanguage } from '#server/services/gifts/errors';
import {
  checkMessageLength,
  normalizeMessage,
  validateCovers,
  withGiftCovers,
  type GiftCoverUpload,
} from '#server/services/gifts/giftMessage';
import {
  InvalidManualRewardError,
  RewardOfficeUnavailableError,
  RewardProductUnavailableError,
} from '#server/services/rewards/errors';
import { grantReward, type RewardGift } from '#server/services/rewards/grantReward';
import { formatDayKey, shiftDayKey } from '#server/utils/parkTime';
import { isCalendarDay } from '#shared/campaign';
import { GIFT_REASON_MAX_LENGTH } from '#shared/gift';

/**
 * Ручная выдача награды сотрудником из раздела «Награды» (issue #172): источник `manual`,
 * автор — сотрудник.
 *
 * Здесь решается только то, что правило ручной выдачи: чего не хватает виду награды, годны ли
 * срок, «Почему», текст и обложки. Рождает награду `grantReward` — одна дверь на все источники.
 *
 * Устроена как подарок (issue #266): срок — днём «Забрать до»,
 * а не днями; «Почему» — на двух языках, оба обязательны; свой текст сообщения и обложки —
 * на каждом языке, тем же правилом, что у подарка (`giftMessage.ts`). После записи водителю
 * уходит сообщение `reward_received` — в окне 09:00–21:00 или сразу, если сотрудник отметил
 * «Отправить сейчас».
 *
 * Баллы здесь не вручаются (issue #219): баллы из раздела «Награды» — всегда подарок
 * с «Забрать» (`services/gifts/grantGift.ts`), и одному водителю тоже, а зачислить сразу —
 * ручной правкой баллов.
 */

const log = consola.withTag('rewards:manual');

export type ManualRewardInput = {
  personId: string;
  employeeId: string;
  /** Как пришло: вид проверяется здесь. */
  kind: string;
  productId: string | null;
  title: string | null;
  officeId: string | null;
  /** «Забрать до», `YYYY-MM-DD`, как набрано. */
  untilDate: string;
  /** «Почему» на каждом языке, как набрано. Русское видит и стойка. */
  noteRu: string;
  noteUz: string;
  /** Свой текст сообщения, как набран. Пусто после обрезки краёв — системный текст. */
  messageRu: string;
  messageUz: string;
  coverRu: GiftCoverUpload | null;
  coverUz: GiftCoverUpload | null;
  /** Сообщение — без ожидания окна отправки, как у подарка (issue #251). В базе не хранится. */
  sendNow: boolean;
};

/** Награда ручной выдачи: товар или произвольная со сроком днём «Забрать до». */
type ManualGift = Extract<RewardGift, { kind: 'product' | 'custom' }> & { expiry: { untilDate: string } };

type ValidReward = {
  gift: ManualGift;
  untilDate: string;
  noteRu: string;
  noteUz: string;
  messageRu: string | null;
  messageUz: string | null;
};

const requireOffice = (input: ManualRewardInput): string => {
  if (input.officeId === null) {
    throw new InvalidManualRewardError('office_missing');
  }

  return input.officeId;
};

/**
 * «Забрать до» — тем же правилом, что у подарка: день календаря и не раньше завтрашнего
 * календарного дня. Сегодняшний не годится — награда сгорела бы этой же ночью, не успев подождать водителя.
 */
const requireUntilDate = (input: ManualRewardInput, now: Date): string => {
  const untilDate = input.untilDate.trim();

  if (!isCalendarDay(untilDate)) {
    throw new InvalidManualRewardError('until_date_invalid');
  }

  // Строки `YYYY-MM-DD` сравниваются как даты.
  if (untilDate < shiftDayKey(formatDayKey(now), 1)) {
    throw new InvalidManualRewardError('until_date_too_early');
  }

  return untilDate;
};

/**
 * Вид — первым: баллы и неизвестный вид отказываются раньше, чем дело дойдёт до их полей.
 * Баллы ручной выдачей не вручаются — они подарок.
 */
const requireKind = (kind: string): ManualGift['kind'] => {
  if (kind === 'product' || kind === 'custom') {
    return kind;
  }

  throw new InvalidManualRewardError(kind === 'points' ? 'points_via_gift' : 'kind_invalid');
};

const buildGift = (input: ManualRewardInput, kind: ManualGift['kind'], untilDate: string): ManualGift => {
  if (kind === 'product') {
    if (input.productId === null) {
      throw new InvalidManualRewardError('product_missing');
    }

    return {
      kind: 'product',
      productId: input.productId,
      officeId: requireOffice(input),
      expiry: { untilDate },
    };
  }

  const title = input.title?.trim() ?? '';

  if (title === '') {
    throw new InvalidManualRewardError('title_missing');
  }

  return {
    kind: 'custom',
    title,
    officeId: requireOffice(input),
    expiry: { untilDate },
  };
};

/** «Почему» — строка карточки награды, как повод подарка: обязательна и коротка на обоих языках. */
const requireNotes = (input: ManualRewardInput): { noteRu: string; noteUz: string } => {
  const noteRu = input.noteRu.trim();
  const noteUz = input.noteUz.trim();

  if (noteRu === '') {
    throw new InvalidManualRewardError('note_ru_missing');
  }

  if (noteUz === '') {
    throw new InvalidManualRewardError('note_uz_missing');
  }

  if (noteRu.length > GIFT_REASON_MAX_LENGTH) {
    throw new InvalidManualRewardError('note_ru_too_long');
  }

  if (noteUz.length > GIFT_REASON_MAX_LENGTH) {
    throw new InvalidManualRewardError('note_uz_too_long');
  }

  return { noteRu, noteUz };
};

const validate = (input: ManualRewardInput, now: Date): ValidReward => {
  const kind = requireKind(input.kind);
  const untilDate = requireUntilDate(input, now);
  const gift = buildGift(input, kind, untilDate);
  const notes = requireNotes(input);

  validateCovers(input);

  return {
    gift,
    untilDate,
    ...notes,
    messageRu: normalizeMessage(input.messageRu),
    messageUz: normalizeMessage(input.messageUz),
  };
};

/**
 * Что и где — для сообщения: название товара и офис читаются до записи, по ним меряется
 * длина своего текста. Нет товара или офиса — тот же отказ, что дала бы запись; остальные
 * правила товара и офиса — архив, демо, остаток — проверяет `grantReward` под транзакцией.
 */
const readMessageNames = async (gift: ManualGift): Promise<{ title: string; officeName: string }> => {
  const office = await findOffice(gift.officeId);

  if (!office) {
    throw new RewardOfficeUnavailableError(gift.officeId);
  }

  if (gift.kind === 'custom') {
    return { title: gift.title, officeName: office.name };
  }

  const product = await findProduct(gift.productId);

  if (!product?.name) {
    throw new RewardProductUnavailableError(gift.productId);
  }

  return { title: product.name, officeName: office.name };
};

/**
 * Свой текст влезает в сообщение — вместе с системной строкой этой награды, той же сборкой,
 * что при отправке. С обложкой потолок — подпись к фото.
 */
const validateMessage = (
  values: Omit<RewardMessageValues, 'reason'>,
  reward: ValidReward,
  language: GiftGrantLanguage,
  withCover: boolean,
): void => {
  const message = language === 'uz' ? reward.messageUz : reward.messageRu;

  if (message === null) {
    return;
  }

  const { length } = buildRewardMessage(
    { ...values, reason: language === 'uz' ? reward.noteUz : reward.noteRu },
    message,
    language,
  ).text;

  checkMessageLength(length, language, withCover);
};

export const grantManualReward = async (input: ManualRewardInput): Promise<RewardRow> => {
  const reward = validate(input, new Date());
  const names = await readMessageNames(reward.gift);
  const withCover = input.coverRu !== null;

  validateMessage({ ...names, untilDate: reward.untilDate }, reward, 'ru', withCover);
  validateMessage({ ...names, untilDate: reward.untilDate }, reward, 'uz', withCover);

  // Идентификатор выдаётся до записи: под него ложатся файлы обложек.
  const rewardId = randomUUID();
  const { paths: covers, result: granted } = await withGiftCovers(rewardId, input, (paths) =>
    grantReward({
      rewardId,
      personId: input.personId,
      gift: reward.gift,
      origin: {
        source: 'manual',
        employeeId: input.employeeId,
        note: reward.noteRu,
        noteUz: reward.noteUz,
        message: { messageRu: reward.messageRu, messageUz: reward.messageUz, ...paths },
      },
    }),
  );

  // Награда уже зафиксирована: упавшая постановка сообщения её не отменяет — награда ждёт
  // в приложении и без сообщения, а причина остаётся в логе.
  try {
    await enqueueNotification({
      personId: input.personId,
      sendNow: input.sendNow,
      template: 'reward_received',
      params: {
        // Название — копией из награды: ею же водитель увидит его в приложении.
        title: granted.title,
        reasonRu: reward.noteRu,
        reasonUz: reward.noteUz,
        officeName: names.officeName,
        untilDate: reward.untilDate,
        messageRu: reward.messageRu,
        messageUz: reward.messageUz,
        ...covers,
      },
    });
  } catch (error) {
    log.error('сообщение о награде не поставилось в очередь', {
      rewardId: granted.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return granted;
};

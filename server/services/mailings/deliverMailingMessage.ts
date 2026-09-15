import { consola } from 'consola';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  TelegramSendError,
  type OpenAppButton,
} from '#server/adapters/telegram/outgoing';
import { readMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import { readBotToken, readMiniAppUrl } from '#server/bot/config';
import type { MailingRecipientOutcome } from '#server/generated/prisma/enums';
import {
  findMailingDelivery,
  finishMailingIfDone,
  recordRecipientOutcome,
  type MailingDeliveryRow,
  type RecipientOutcomeRecord,
} from '#server/repositories/mailings';
// Относительным путём, а не через `#shared`: модуль собирается в воркер, а бандл воркера
// знает только псевдоним `#server` (package.json → build:worker).
import { buildMailingMessage } from '../../../shared/mailing';

/**
 * Отправка рассылки одному адресату — то, что делает одно задание очереди `mailing`.
 *
 * Перед отправкой читается всё сразу: статус рассылки, исход адресата в снимке, его канал
 * и выключатель уведомлений. Остановленная рассылка закрывает задание без отправки
 * и оставляет адресата `pending`; записанный исход не переписывается — повтор задания после
 * рестарта воркера на нём и кончается.
 *
 * Язык получателя не читается: сообщение уходит на обоих языках сразу, одной и той же
 * склейкой, что считает форма (`shared/mailing.ts`).
 *
 * Отправка «хотя бы раз», а не «ровно раз»: упади воркер между ответом Telegram и записью
 * исхода, повтор задания пошлёт сообщение второй раз. Закрыть это окно нечем — Telegram
 * не принимает ключа идемпотентности, — и оно шириной в один запрос к базе.
 *
 * Привязка по умершему каналу здесь не закрывается, только исход `invalid_chat`: закрывать ли
 * её из рассылки, решается отдельно (issue #136 → «Не делать»).
 */
const log = consola.withTag('mailings:deliver');

/**
 * Чем кончилось задание.
 *
 * - исходы снимка — `sent`, `skipped_disabled`, `invalid_chat`, `failed` — записаны в него
 * - `not_running` — рассылку остановили, адресат остался `pending`
 * - `already_recorded` — исход записан раньше, повтор задания ничего не делает
 * - `not_in_snapshot` — рассылки нет или человека нет в её снимке: ставить такое задание
 *   некому, и пришло оно из чужой базы или руками
 */
export type MailingDeliveryOutcome =
  | Exclude<MailingRecipientOutcome, 'pending'>
  | 'not_running'
  | 'already_recorded'
  | 'not_in_snapshot';

export type DeliverMailingInput = {
  mailingId: string;
  personId: string;
  /** Последняя ли это попытка задания: на ней сбой сети записывается `failed`, а не ждёт повтора. */
  lastAttempt: boolean;
};

/**
 * `file_id` уже выгруженных фото, по пути на томе.
 *
 * Держится в памяти процесса воркера, а не в базе: потерять его не страшно — после рестарта
 * картинка выгрузится ещё раз, и дальше снова пойдёт ссылкой. Путь фото у идущей рассылки
 * не меняется: фото правится только у черновика.
 */
const uploadedPhotoFileIds = new Map<string, string>();

/**
 * Подпись кнопки — на обоих языках, раз и сообщение на обоих. Через косую черту, как у
 * заглушки Mini App, где язык человека тоже не прочитан (docs/frontend.md → «Язык»);
 * русский первым — как в самом сообщении.
 */
const OPEN_APP_BUTTON_TEXT = '🎁 Открыть приложение / Ilovani ochish';

/**
 * Кнопка «Открыть приложение». Пусто на машине без `TG_MINIAPP_URL`: Telegram открывает
 * Mini App только по `https`, и сообщение уходит без кнопки — так же, как приветствие бота
 * (server/bot/greeting.ts).
 */
const openAppButton = (): OpenAppButton | undefined => {
  const url = readMiniAppUrl();

  return url === '' ? undefined : { text: OPEN_APP_BUTTON_TEXT, url };
};

/** Шлёт сообщение и возвращает его `message_id`. */
const send = async (token: string, telegramChatId: bigint, row: MailingDeliveryRow): Promise<number> => {
  const { html } = buildMailingMessage(row.textRu, row.textUz);
  const button = openAppButton();

  if (row.photoPath === null) {
    return sendTelegramMessage({ token, telegramChatId, text: html, openAppButton: button });
  }

  const cachedFileId = uploadedPhotoFileIds.get(row.photoPath);
  const sent = await sendTelegramPhoto({
    token,
    telegramChatId,
    photo:
      cachedFileId === undefined
        ? { kind: 'upload', ...(await readMailingPhoto(row.photoPath)) }
        : { kind: 'file_id', fileId: cachedFileId },
    caption: html,
    openAppButton: button,
  });

  uploadedPhotoFileIds.set(row.photoPath, sent.fileId);

  return sent.messageId;
};

/** Пишет исход и закрывает рассылку, если ждущих не осталось. */
const settle = async (
  input: DeliverMailingInput,
  record: RecipientOutcomeRecord,
): Promise<MailingDeliveryOutcome> => {
  const recorded = await recordRecipientOutcome(input.mailingId, input.personId, record);

  if (!recorded) {
    return 'already_recorded';
  }

  if (await finishMailingIfDone(input.mailingId)) {
    log.info('рассылка завершена: адресаты кончились', { mailingId: input.mailingId });
  }

  return record.outcome;
};

export const deliverMailingMessage = async (
  input: DeliverMailingInput,
): Promise<MailingDeliveryOutcome> => {
  const { mailingId, personId } = input;
  const row = await findMailingDelivery(mailingId, personId);

  if (!row || row.outcome === null) {
    log.warn('задание рассылки без строки снимка', { mailingId, personId });

    return 'not_in_snapshot';
  }

  if (row.status !== 'running') {
    return 'not_running';
  }

  if (row.outcome !== 'pending') {
    return 'already_recorded';
  }

  // Решения о человеке — до токена: они от окружения машины не зависят, и адресат без канала
  // остаётся без канала при любом токене.
  //
  // Человек потерял привязку или вышел из программы после снимка: писать некуда.
  if (row.telegramChatId === null || row.notificationsEnabled === null) {
    log.info('адресат рассылки без активной привязки', { mailingId, personId });

    return settle(input, { outcome: 'invalid_chat' });
  }

  // Выключил уведомления уже после снимка — рассылка уважает это и в момент отправки.
  if (!row.notificationsEnabled) {
    return settle(input, { outcome: 'skipped_disabled' });
  }

  const token = readBotToken();

  // Пустой токен на машине с идущей рассылкой — авария окружения, а не режим: запуск делал
  // человек, и ждёт он отправки. Ждать повтора бессмысленно — окружение без перезапуска
  // не поменяется, — поэтому исход `failed` сразу, и счётчик на экране это покажет.
  if (token === '') {
    log.error('рассылка не отправлена: TG_BOT_TOKEN пуст, отправлять нечем', { mailingId });

    return settle(input, { outcome: 'failed' });
  }

  const chatId = row.telegramChatId.toString();
  let messageId: number;

  try {
    messageId = await send(token, row.telegramChatId, row);
  } catch (error) {
    if (error instanceof TelegramSendError && error.kind === 'invalid_chat') {
      log.info('канал адресата рассылки умер', { mailingId, chatId, reason: error.message });

      return settle(input, { outcome: 'invalid_chat' });
    }

    if (error instanceof TelegramSendError && error.kind === 'rejected') {
      log.warn('Telegram отклонил сообщение рассылки', { mailingId, chatId, reason: error.message });

      return settle(input, { outcome: 'failed' });
    }

    log.warn('сообщение рассылки не ушло', {
      mailingId,
      chatId,
      kind: error instanceof TelegramSendError ? error.kind : 'unknown',
      lastAttempt: input.lastAttempt,
      error: error instanceof Error ? error.message : String(error),
    });

    // Лимит повторяется всегда — у него своя очередь ожидания, и попытки он не тратит.
    // Остальное на последней попытке закрывается исходом: иначе адресат навсегда остался бы
    // `pending`, а рассылка — «идёт».
    const rateLimited = error instanceof TelegramSendError && error.kind === 'rate_limit';

    if (input.lastAttempt && !rateLimited) {
      await settle(input, { outcome: 'failed' });
    }

    throw error;
  }

  log.info('сообщение рассылки отправлено', { mailingId, chatId, messageId });

  return settle(input, { outcome: 'sent', messageId });
};

import { existsSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  deleteMailingPhoto,
  resolveMailingPhotoFile,
} from '#server/adapters/uploads/mailingPhotos';
import { markRecipientRecalled, recordRecipientOutcome } from '#server/repositories/mailings';
import { completeMailingRecall } from '#server/services/mailings/completeMailingRecall';
import { copyMailing } from '#server/services/mailings/copyMailing';
import { createMailing } from '#server/services/mailings/createMailing';
import { deleteMailingDraft } from '#server/services/mailings/deleteMailingDraft';
import { deliverMailingMessage } from '#server/services/mailings/deliverMailingMessage';
import {
  MailingAudienceEmptyError,
  MailingFieldTooLongError,
  MailingNotLaunchableError,
  MailingRecallUnavailableError,
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { launchMailing } from '#server/services/mailings/launchMailing';
import { readMailing, readMailingList } from '#server/services/mailings/readMailing';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { recallMailingMessage } from '#server/services/mailings/recallMailingMessage';
import { removeMailingPhoto } from '#server/services/mailings/removeMailingPhoto';
import { saveMailingPhoto } from '#server/services/mailings/saveMailingPhoto';
import { startMailingRecall } from '#server/services/mailings/startMailingRecall';
import { stopMailing } from '#server/services/mailings/stopMailing';
import { updateMailing } from '#server/services/mailings/updateMailing';
import type { MailingCounters } from '#shared/types/mailing';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestTelegramUserId,
} from '../support/employees';
import {
  cleanupTestMailings,
  closeTestLinks,
  countTestRecipients,
  markTestRecalled,
  markTestSentWithoutMessageId,
  readTestMessageId,
  readTestRecalledAt,
  readTestRecipients,
  setTestNotificationsEnabled,
  shiftTestOutcomeAt,
  trackTestMailing,
} from '../support/mailings';
import { disconnectQueues } from '../support/queues';

/**
 * Рассылки: аудитория, снимок при запуске, предел длины при запуске, остановка, копия,
 * фото и запись исхода.
 *
 * Все запросы здесь сырые, и типы расхождения с базой не ловят (docs/infra.md → «Тесты»,
 * третье исключение). Тест гоняет их через сервисы — тем путём, которым их зовут ручки
 * и воркер. Настоящей отправки в Telegram здесь нет: проверяются ветки, которые решаются
 * до неё, — остановленная рассылка, закрытая привязка, выключенные уведомления.
 *
 * Фильтров у аудитории нет, и снимок берёт всех участников тестовой базы. Между тестами
 * она пуста — уборка идёт по заведённым людям, — поэтому точные числа снимка ниже
 * означают «ровно заведённые этим тестом».
 */

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Участник программы; `linked: false` — без привязки, `inProgram: false` — вне программы. */
const createMember = async (
  options: { linked?: boolean; inProgram?: boolean } = {},
): Promise<string> => {
  const { personId } = await createTestPerson({ inProgram: options.inProgram ?? true });

  if (options.linked ?? true) {
    await linkTestDriver(personId, nextTestTelegramUserId());
  }

  return personId;
};

const createDraft = async (createdById: string) => {
  const mailing = await createMailing(
    { title: 'Тестовая рассылка', textRu: 'Привет', textUz: 'Salom' },
    createdById,
  );

  trackTestMailing(mailing.mailingId);

  return mailing;
};

const sumOutcomes = (counters: MailingCounters): number =>
  counters.pending +
  counters.sent +
  counters.skippedDisabled +
  counters.invalidChat +
  counters.failed;

describe('рассылки', () => {
  afterEach(async () => {
    await cleanupTestMailings();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('аудитория — все участники программы с активной привязкой', async () => {
    const before = await readMailingAudience();

    await createMember();
    await createMember();
    await createMember({ linked: false });
    await createMember({ inProgram: false });

    const muted = await createMember();
    await setTestNotificationsEnabled(muted, false);

    const after = await readMailingAudience();

    // Три участника с привязкой: без привязки и вне программы не считаются.
    expect(after.total - before.total).toBe(3);
    expect(after.notificationsDisabled - before.notificationsDisabled).toBe(1);
  });

  it('запуск снимает снимок один раз: выключившие уведомления ложатся сразу исходом', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const enabled = await createMember();
    const disabled = await createMember();

    await setTestNotificationsEnabled(disabled, false);

    const draft = await createDraft(employeeId);
    const launched = await launchMailing(draft.mailingId);

    expect(launched.status).toBe('running');
    expect(launched.startedAt).not.toBeNull();

    const recipients = await readTestRecipients(draft.mailingId, [enabled, disabled]);

    expect(recipients).toEqual(
      expect.arrayContaining([
        { personId: enabled, outcome: 'pending', outcomeAt: null },
        expect.objectContaining({ personId: disabled, outcome: 'skipped_disabled' }),
      ]),
    );

    // Повтор запуска второго снимка не снимает и статус не трогает.
    const total = await countTestRecipients(draft.mailingId);
    const relaunched = await launchMailing(draft.mailingId);

    expect(relaunched.status).toBe('running');
    expect(await countTestRecipients(draft.mailingId)).toBe(total);
    expect(relaunched.counters.total).toBe(total);
    expect(sumOutcomes(relaunched.counters)).toBe(total);

    // Запущенная рассылка в списке — с теми же счётчиками.
    const listed = (await readMailingList()).find((row) => row.mailingId === draft.mailingId);

    expect(listed?.counters).toEqual(relaunched.counters);
  });

  it('пустой снимок откатывает запуск целиком', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });

    // Условие теста, а не проверка: участников в тестовой базе между тестами нет.
    expect((await readMailingAudience()).total).toBe(0);

    const draft = await createDraft(employeeId);

    await expect(launchMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingAudienceEmptyError);

    const after = await readMailing(draft.mailingId);

    expect(after.status).toBe('draft');
    expect(after.startedAt).toBeNull();
    expect(await countTestRecipients(draft.mailingId)).toBe(0);
  });

  it('исход пишется при отправке, и рассылка завершается, когда ждущих не осталось', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const unlinked = await createMember();
    const muted = await createMember();

    const draft = await createDraft(employeeId);

    await launchMailing(draft.mailingId);

    // После снимка один потерял привязку, другой выключил уведомления.
    await closeTestLinks(unlinked);
    await setTestNotificationsEnabled(muted, false);

    expect(
      await deliverMailingMessage({ mailingId: draft.mailingId, personId: unlinked, lastAttempt: false }),
    ).toBe('invalid_chat');
    expect(
      await deliverMailingMessage({ mailingId: draft.mailingId, personId: muted, lastAttempt: false }),
    ).toBe('skipped_disabled');

    const finished = await readMailing(draft.mailingId);

    expect(finished.status).toBe('finished');
    expect(finished.finishedAt).not.toBeNull();
    expect(finished.counters).toEqual({
      total: 2,
      pending: 0,
      sent: 0,
      skippedDisabled: 1,
      invalidChat: 1,
      failed: 0,
    });

    // Повтор задания после завершения ничего не пишет.
    expect(
      await deliverMailingMessage({ mailingId: draft.mailingId, personId: muted, lastAttempt: true }),
    ).toBe('not_running');
  });

  it('предел склейки — условие запуска: сохранение и фото с перебором проходят, запуск — нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    // Заголовки и пустая строка между блоками — 30 знаков: 2034 + 2033 + 30 на знак длиннее
    // потолка, а каждый текст порознь вдвое короче его. Черновик сохраняется.
    const draft = await createDraft(employeeId);
    const overflowing = await updateMailing(draft.mailingId, {
      title: 'На знак длиннее',
      textRu: 'р'.repeat(2034),
      textUz: 'o'.repeat(2033),
    });

    expect(overflowing.textRu).toHaveLength(2034);

    await expect(launchMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingNotLaunchableError);
    await expect(launchMailing(draft.mailingId)).rejects.toMatchObject({
      problems: [{ kind: 'too_long', length: 4097, limit: 4096, withPhoto: false }],
    });

    // 500 + 500 влезают в сообщение; фото к ним встаёт, хотя подписью это 1030 из 1024.
    await updateMailing(draft.mailingId, {
      title: 'Под фото',
      textRu: 'р'.repeat(500),
      textUz: 'o'.repeat(500),
    });

    const photographed = await saveMailingPhoto({
      mailingId: draft.mailingId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });

    expect(photographed.photoPath).not.toBeNull();

    await expect(launchMailing(draft.mailingId)).rejects.toMatchObject({
      problems: [{ kind: 'too_long', length: 1030, limit: 1024, withPhoto: true }],
    });

    const after = await readMailing(draft.mailingId);

    expect(after.status).toBe('draft');
    expect(await countTestRecipients(draft.mailingId)).toBe(0);

    await removeMailingPhoto(draft.mailingId);
  });

  it('жёсткий предел поля — 4096 на каждый текст при сохранении, от фото не зависит', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });

    await expect(
      createMailing({ title: 'Роман', textRu: 'р'.repeat(4097), textUz: null }, employeeId),
    ).rejects.toMatchObject({ field: 'textRu', limit: 4096 });

    const draft = await createDraft(employeeId);

    await expect(
      updateMailing(draft.mailingId, { title: 'Роман', textRu: 'Привет', textUz: 'o'.repeat(4097) }),
    ).rejects.toBeInstanceOf(MailingFieldTooLongError);

    // Ровно потолок поля сохраняется.
    const exact = await updateMailing(draft.mailingId, {
      title: 'Ровно',
      textRu: 'р'.repeat(4096),
      textUz: null,
    });

    expect(exact.textRu).toHaveLength(4096);
  });

  it('фото снимается с черновика вместе с файлом, а у запущенной — нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const draft = await createDraft(employeeId);

    const withPhoto = await saveMailingPhoto({
      mailingId: draft.mailingId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });
    const photoPath = withPhoto.photoPath ?? '';
    const file = resolveMailingPhotoFile(photoPath.split('/').pop() ?? '') ?? '';

    expect(photoPath).not.toBe('');
    expect(existsSync(file)).toBe(true);

    const removed = await removeMailingPhoto(draft.mailingId);

    expect(removed.photoPath).toBeNull();
    expect(existsSync(file)).toBe(false);
    // Повтор снятия — не отказ: снимать нечего.
    expect((await removeMailingPhoto(draft.mailingId)).photoPath).toBeNull();

    // У запущенной рассылки фото уходит адресатам и не снимается.
    await createMember();

    const photographed = await saveMailingPhoto({
      mailingId: draft.mailingId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });

    await launchMailing(draft.mailingId);

    await expect(removeMailingPhoto(draft.mailingId)).rejects.toBeInstanceOf(
      MailingStatusMismatchError,
    );
    expect((await readMailing(draft.mailingId)).photoPath).toBe(photographed.photoPath);

    // Файл убирается за тестом: рассылка уже не черновик, и сервис его не снимет.
    await deleteMailingPhoto(photographed.photoPath ?? '');
  });

  it('у исхода sent записан message_id, у прочих его нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const delivered = await createMember();
    const refused = await createMember();
    const bypassed = await createMember();

    const draft = await createDraft(employeeId);

    await launchMailing(draft.mailingId);

    // Отправка в Telegram в тестах не идёт — исход пишется тем же вызовом репозитория,
    // которым его пишет отправка после ответа Telegram.
    expect(
      await recordRecipientOutcome(draft.mailingId, delivered, { outcome: 'sent', messageId: 4242 }),
    ).toBe(true);
    expect(await recordRecipientOutcome(draft.mailingId, refused, { outcome: 'failed' })).toBe(true);

    expect(await readTestMessageId(draft.mailingId, delivered)).toBe(4242n);
    expect(await readTestMessageId(draft.mailingId, refused)).toBeNull();

    // `sent` без идентификатора база не принимает.
    await expect(markTestSentWithoutMessageId(draft.mailingId, bypassed)).rejects.toThrow();
  });

  it('остановка оставляет ждущих без отправки, а копия уходит в новый черновик', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const first = await createMember();
    const second = await createMember();

    const draft = await createDraft(employeeId);

    await launchMailing(draft.mailingId);

    const stopped = await stopMailing(draft.mailingId);

    expect(stopped.status).toBe('stopped');
    expect(stopped.finishedAt).not.toBeNull();

    // Задание остановленной рассылки закрывается без отправки, адресат остаётся ждущим.
    expect(
      await deliverMailingMessage({ mailingId: draft.mailingId, personId: first, lastAttempt: false }),
    ).toBe('not_running');

    const recipients = await readTestRecipients(draft.mailingId, [first, second]);

    expect(recipients.map((row) => row.outcome)).toEqual(['pending', 'pending']);
    expect(sumOutcomes(stopped.counters)).toBe(stopped.counters.total);
    expect(stopped.counters.total).toBe(await countTestRecipients(draft.mailingId));

    // Остановленная не останавливается второй раз и не запускается заново.
    await expect(stopMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingStatusMismatchError);
    await expect(launchMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingStatusMismatchError);

    const copy = await copyMailing(draft.mailingId, employeeId);

    trackTestMailing(copy.mailingId);

    expect(copy).toEqual(
      expect.objectContaining({
        status: 'draft',
        title: draft.title,
        textRu: draft.textRu,
        textUz: draft.textUz,
        photoPath: null,
        startedAt: null,
      }),
    );
    expect(copy.counters.total).toBe(0);

    // Копируется только остановленная.
    await expect(copyMailing(copy.mailingId, employeeId)).rejects.toBeInstanceOf(
      MailingStatusMismatchError,
    );
  });

  it('черновик заводится пустым, дописывается и не запускается, пока не хватает хоть чего-то', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });

    await createMember();

    // Первым действием выбрали фото: заголовка и текстов ещё нет, а черновик уже есть.
    const empty = await createMailing({ title: null, textRu: null, textUz: null }, employeeId);

    trackTestMailing(empty.mailingId);

    expect(empty).toEqual(
      expect.objectContaining({ status: 'draft', title: null, textRu: null, textUz: null }),
    );

    // Причины называются все сразу, а не по одной за нажатие.
    await expect(launchMailing(empty.mailingId)).rejects.toMatchObject({
      problems: [{ kind: 'missing_title' }, { kind: 'missing_text' }],
    });

    // Заголовок без текста — текста нет ни на одном языке.
    await updateMailing(empty.mailingId, { title: 'Заголовок', textRu: null, textUz: null });

    await expect(launchMailing(empty.mailingId)).rejects.toMatchObject({
      problems: [{ kind: 'missing_text' }],
    });

    // Одного языка достаточно, любого: только узбекский запускается — и проверка базы
    // `mailings_texts_check` пускает не черновик без русского текста.
    await updateMailing(empty.mailingId, { title: 'Заголовок', textRu: null, textUz: 'Salom' });

    const launched = await launchMailing(empty.mailingId);

    expect(launched.status).toBe('running');
    expect(launched.textRu).toBeNull();
    expect(launched.textUz).toBe('Salom');
  });

  it('черновик удаляется вместе с файлом фото, а запущенная рассылка — нет', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const draft = await createDraft(employeeId);

    const withPhoto = await saveMailingPhoto({
      mailingId: draft.mailingId,
      contentType: 'image/png',
      bytes: PNG_BYTES,
    });
    const file = resolveMailingPhotoFile((withPhoto.photoPath ?? '').split('/').pop() ?? '') ?? '';

    expect(existsSync(file)).toBe(true);

    await deleteMailingDraft(draft.mailingId);

    expect(existsSync(file)).toBe(false);
    await expect(readMailing(draft.mailingId)).rejects.toBeInstanceOf(UnknownMailingError);
    // Повтор — рассылки уже нет.
    await expect(deleteMailingDraft(draft.mailingId)).rejects.toBeInstanceOf(UnknownMailingError);

    // Запущенная не удаляется: у неё снимок и исходы.
    await createMember();

    const launched = await createDraft(employeeId);

    await launchMailing(launched.mailingId);

    await expect(deleteMailingDraft(launched.mailingId)).rejects.toBeInstanceOf(
      MailingStatusMismatchError,
    );
    expect((await readMailing(launched.mailingId)).status).toBe('running');
  });

  it('отзыв запускается один раз, снимает отправленное и исход не трогает', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const removed = await createMember();
    const kept = await createMember();
    const refused = await createMember();

    const draft = await createDraft(employeeId);

    await launchMailing(draft.mailingId);

    // Идущую сначала останавливают.
    await expect(startMailingRecall(draft.mailingId)).rejects.toMatchObject({
      problem: 'not_sent_yet',
    });

    await recordRecipientOutcome(draft.mailingId, removed, { outcome: 'sent', messageId: 101 });
    await recordRecipientOutcome(draft.mailingId, kept, { outcome: 'sent', messageId: 102 });
    await recordRecipientOutcome(draft.mailingId, refused, { outcome: 'failed' });

    // Час назад — внутри окна и раньше привязки, заведённой тестом: чата на момент отправки
    // не находится, и задание закрывается до обращения к Telegram.
    await shiftTestOutcomeAt(draft.mailingId, removed, 1);
    await shiftTestOutcomeAt(draft.mailingId, kept, 1);
    await stopMailing(draft.mailingId);

    const before = await readMailing(draft.mailingId);

    expect(before.recall).toEqual(
      expect.objectContaining({ startedAt: null, finishedAt: null, recalled: 0 }),
    );
    expect(before.recall.deadlineAt).not.toBeNull();

    const started = await startMailingRecall(draft.mailingId);

    expect(started.recall.startedAt).not.toBeNull();
    expect(started.recall.finishedAt).toBeNull();

    // Повтор нажатия — не отказ и не второй проход: отметка прежняя.
    const repeated = await startMailingRecall(draft.mailingId);

    expect(repeated.recall.startedAt).toBe(started.recall.startedAt);

    // Удачное удаление пишется тем же вызовом репозитория, которым его пишет задание после
    // ответа Telegram; повторное задание по снятому адресату запроса не шлёт.
    expect(await markRecipientRecalled(draft.mailingId, removed)).toBe(true);
    expect(
      await recallMailingMessage({ mailingId: draft.mailingId, personId: removed, lastAttempt: false }),
    ).toBe('already_recalled');
    expect(
      await recallMailingMessage({ mailingId: draft.mailingId, personId: kept, lastAttempt: false }),
    ).toBe('not_recalled');
    expect(
      await recallMailingMessage({ mailingId: draft.mailingId, personId: refused, lastAttempt: false }),
    ).toBe('not_recallable');

    expect(await completeMailingRecall(draft.mailingId)).toBe('recall_finished');
    expect(await completeMailingRecall(draft.mailingId)).toBe('recall_already_finished');

    const after = await readMailing(draft.mailingId);

    // «Отозвано 1 из 2»: не отозванный — отправленный без отметки при завершённом отзыве.
    expect(after.recall.recalled).toBe(1);
    expect(after.counters.sent).toBe(2);
    expect(after.recall.finishedAt).not.toBeNull();
    expect(await readTestRecalledAt(draft.mailingId, removed)).not.toBeNull();
    expect(await readTestRecalledAt(draft.mailingId, kept)).toBeNull();

    // Исход отправки после отзыва прежний.
    const recipients = await readTestRecipients(draft.mailingId, [removed, kept]);

    expect(recipients.map((row) => row.outcome)).toEqual(['sent', 'sent']);

    // Отметку отзыва у недошедшего база не принимает.
    await expect(markTestRecalled(draft.mailingId, refused)).rejects.toThrow();
  });

  it('отзыв не запускается у черновика, у недошедшей и после 48 часов', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const member = await createMember();

    const draft = await createDraft(employeeId);

    await expect(startMailingRecall(draft.mailingId)).rejects.toMatchObject({
      problem: 'not_sent_yet',
    });

    // Остановили раньше первой отправки — отзывать нечего.
    await launchMailing(draft.mailingId);
    await stopMailing(draft.mailingId);

    await expect(startMailingRecall(draft.mailingId)).rejects.toMatchObject({
      problem: 'nothing_sent',
    });
    expect((await readMailing(draft.mailingId)).recall.deadlineAt).toBeNull();

    // Самое раннее отправленное старше окна.
    const late = await createDraft(employeeId);

    await launchMailing(late.mailingId);
    await recordRecipientOutcome(late.mailingId, member, { outcome: 'sent', messageId: 7 });
    await shiftTestOutcomeAt(late.mailingId, member, 49);
    await stopMailing(late.mailingId);

    await expect(startMailingRecall(late.mailingId)).rejects.toBeInstanceOf(
      MailingRecallUnavailableError,
    );
    await expect(startMailingRecall(late.mailingId)).rejects.toMatchObject({
      problem: 'window_expired',
    });
    expect((await readMailing(late.mailingId)).recall.startedAt).toBeNull();
  });
});

import { existsSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  deleteMailingPhoto,
  resolveMailingPhotoFile,
} from '#server/adapters/uploads/mailingPhotos';
import { recordRecipientOutcome } from '#server/repositories/mailings';
import { copyMailing } from '#server/services/mailings/copyMailing';
import { createMailing } from '#server/services/mailings/createMailing';
import { deliverMailingMessage } from '#server/services/mailings/deliverMailingMessage';
import {
  MailingAudienceEmptyError,
  MailingFieldTooLongError,
  MailingStatusMismatchError,
  MailingTextTooLongError,
} from '#server/services/mailings/errors';
import { launchMailing } from '#server/services/mailings/launchMailing';
import { readMailing, readMailingList } from '#server/services/mailings/readMailing';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { removeMailingPhoto } from '#server/services/mailings/removeMailingPhoto';
import { saveMailingPhoto } from '#server/services/mailings/saveMailingPhoto';
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
  markTestSentWithoutMessageId,
  readTestMessageId,
  readTestRecipients,
  setTestNotificationsEnabled,
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

    await expect(launchMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingTextTooLongError);
    await expect(launchMailing(draft.mailingId)).rejects.toMatchObject({
      length: 4097,
      limit: 4096,
      withPhoto: false,
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
      length: 1030,
      limit: 1024,
      withPhoto: true,
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
});

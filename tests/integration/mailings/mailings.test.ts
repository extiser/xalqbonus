import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { copyMailing } from '#server/services/mailings/copyMailing';
import { createMailing } from '#server/services/mailings/createMailing';
import { deliverMailingMessage } from '#server/services/mailings/deliverMailingMessage';
import {
  MailingAudienceEmptyError,
  MailingStatusMismatchError,
} from '#server/services/mailings/errors';
import { launchMailing } from '#server/services/mailings/launchMailing';
import { readMailing, readMailingList } from '#server/services/mailings/readMailing';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { stopMailing } from '#server/services/mailings/stopMailing';
import type { MailingCounters } from '#shared/types/mailing';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
} from '../support/database';
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
  readTestRecipients,
  setTestNotificationsEnabled,
  trackTestMailing,
} from '../support/mailings';
import { disconnectQueues } from '../support/queues';

/**
 * Рассылки: отбор аудитории, снимок при запуске, остановка, копия и запись исхода.
 *
 * Все запросы здесь сырые, и типы расхождения с базой не ловят (docs/infra.md → «Тесты»,
 * третье исключение). Тест гоняет их через сервисы — тем путём, которым их зовут ручки
 * и воркер. Настоящей отправки в Telegram здесь нет: проверяются ветки, которые решаются
 * до неё, — остановленная рассылка, закрытая привязка, выключенные уведомления.
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

let tripSequence = 0;

/** Участник с активной привязкой; с `tripDaysAgo` — ещё и с поездкой столько дней назад. */
const createMember = async (
  options: { tripDaysAgo?: number; tripStatus?: string; linked?: boolean; inProgram?: boolean } = {},
): Promise<string> => {
  const { personId, profileId } = await createTestPerson({ inProgram: options.inProgram ?? true });

  if (options.linked ?? true) {
    await linkTestDriver(personId, nextTestTelegramUserId());
  }

  if (options.tripDaysAgo !== undefined) {
    tripSequence += 1;
    await createTestTrip({
      profileId,
      tripOrderId: `test-mailing-trip-${personId}-${tripSequence}`,
      status: options.tripStatus ?? 'complete',
      endedAt: new Date(Date.now() - options.tripDaysAgo * DAY_MS),
    });
  }

  return personId;
};

const createDraft = async (createdById: string, activeWithinDays: number | null) => {
  const mailing = await createMailing(
    { title: 'Тестовая рассылка', textRu: 'Привет', textUz: 'Salom', activeWithinDays },
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

  it('аудитория — участники с активной привязкой, фильтр по завершённой поездке', async () => {
    const allBefore = await readMailingAudience(null);
    const weekBefore = await readMailingAudience(7);

    await createMember({ tripDaysAgo: 2 });
    await createMember();
    await createMember({ linked: false, tripDaysAgo: 2 });
    await createMember({ inProgram: false, tripDaysAgo: 2 });

    const disabled = await createMember({ tripDaysAgo: 1, tripStatus: 'cancelled' });
    await setTestNotificationsEnabled(disabled, false);

    const allAfter = await readMailingAudience(null);
    const weekAfter = await readMailingAudience(7);

    // Без фильтра — три участника с привязкой: без привязки и вне программы не считаются.
    expect(allAfter.total - allBefore.total).toBe(3);
    expect(allAfter.notificationsDisabled - allBefore.notificationsDisabled).toBe(1);
    // За неделю — один: отменённый заказ поездкой не считается.
    expect(weekAfter.total - weekBefore.total).toBe(1);
    expect(weekAfter.notificationsDisabled - weekBefore.notificationsDisabled).toBe(0);
  });

  it('запуск снимает снимок один раз: выключившие уведомления ложатся сразу исходом', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const enabled = await createMember({ tripDaysAgo: 1 });
    const disabled = await createMember({ tripDaysAgo: 1 });

    await setTestNotificationsEnabled(disabled, false);

    const draft = await createDraft(employeeId, 3);
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

    await createMember({ tripDaysAgo: 30 });

    // Условие теста, а не проверка: адресатов за сутки в базе быть не должно.
    expect((await readMailingAudience(1)).total).toBe(0);

    const draft = await createDraft(employeeId, 1);

    await expect(launchMailing(draft.mailingId)).rejects.toBeInstanceOf(MailingAudienceEmptyError);

    const after = await readMailing(draft.mailingId);

    expect(after.status).toBe('draft');
    expect(after.startedAt).toBeNull();
    expect(await countTestRecipients(draft.mailingId)).toBe(0);
  });

  it('исход пишется при отправке, и рассылка завершается, когда ждущих не осталось', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const unlinked = await createMember({ tripDaysAgo: 1 });
    const muted = await createMember({ tripDaysAgo: 1 });

    const draft = await createDraft(employeeId, 2);

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

  it('остановка оставляет ждущих без отправки, а копия уходит в новый черновик', async () => {
    const { employeeId } = await createTestEmployee({ role: 'admin' });
    const first = await createMember({ tripDaysAgo: 1 });
    const second = await createMember({ tripDaysAgo: 1 });

    const draft = await createDraft(employeeId, 2);

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
        activeWithinDays: 2,
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

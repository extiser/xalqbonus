import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '#server/db';
import {
  findMiniAppTouchLandingVersion,
  markMiniAppTouchPressed,
  setMiniAppTouchLandingVersion,
} from '#server/repositories/promo';
import { advanceChatDraft } from '#server/services/candidates/advanceChatDraft';
import { readApplicationScreen } from '#server/services/candidates/applicationScreen';
import type { ChatDraftReply } from '#server/services/candidates/chatDraftReplies';
import { startChatDraft } from '#server/services/candidates/startChatDraft';
import { submitCandidateApplication } from '#server/services/candidates/submitCandidateApplication';
import { addLandingVersion } from '#server/services/promo/addLandingVersion';
import { createLanding } from '#server/services/promo/createLanding';
import { recordMiniAppPromoTouch } from '#server/services/promo/recordPromoTouch';
import { setLandingArchived } from '#server/services/promo/setLandingArchived';
import { updatePromoLink } from '#server/services/promo/updatePromoLink';
import { type ProfileLookupSummary, runProfileSyncByPhone } from '#server/services/sync/syncProfileByPhone';
import type { TelegramLaunch } from '#server/utils/telegramInitData';
import {
  cleanupTestCandidateApplications,
  readTestChatDrafts,
  readTestOpenApplications,
  trackTestCandidateTelegram,
} from '../support/candidates';
import { disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestPhone, nextTestTelegramUserId } from '../support/employees';
import { cleanupTestLandings, failingLandingArchive, passingLandingArchive, trackTestLanding } from '../support/landings';
import {
  cleanupTestPromoTouches,
  createTestPromoLink,
  nextTestPromoCode,
  readTestPromoTouchMarks,
  trackTestPromoTelegram,
} from '../support/promo';

/**
 * Лендинг в Mini App (issue #484): касание запуска помнит показанную версию и первое нажатие
 * кнопки, заявка — версию из касания своего запуска.
 *
 * Покрыто то, что docs/infra.md → «Тесты» относит к исключениям: сырой SQL касания по ключу
 * запуска — через репозиторий и сервисы, которыми его зовут ручки, — и правило, где решает база:
 * какая версия действующая, когда экран — лендинг, а когда по умолчанию.
 *
 * Картинки версий ложатся во временный каталог, как в `landings.test.ts`. Имя бота для ссылки
 * «Написать менеджеру» положено в кэш заранее, очередь темы и поиск в Fleet API подменены:
 * в Telegram и Fleet тест не ходит. Чтение версии касания — настоящая функция под обёрткой:
 * один тест роняет её, чтобы проверить, что заявка уходит без версии.
 */

vi.mock('#server/repositories/promo', async (importOriginal) => {
  const original = await importOriginal<typeof import('#server/repositories/promo')>();

  return { ...original, findMiniAppTouchLandingVersion: vi.fn(original.findMiniAppTouchLandingVersion) };
});

vi.mock('#server/queues/candidates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/queues/candidates')>()),
  enqueueCandidateTopic: vi.fn(async () => undefined),
}));

vi.mock('#server/services/sync/syncProfileByPhone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#server/services/sync/syncProfileByPhone')>()),
  runProfileSyncByPhone: vi.fn(),
}));

const TOKEN = '1234567890:AAFakeTokenForTestsOnly-xxxxxxxxxxxxxxx';
const BOT_USERNAME = 'test_candidates_bot';

/** 15-10-2026, полдень по Ташкенту. */
const NOW = new Date('2026-10-15T07:00:00.000Z');

/** Поиск в Fleet API, не нашедший номера. */
const NOTHING_IN_FLEET: ProfileLookupSummary = {
  runId: 'test-lookup',
  requests: 1,
  rateLimited: 0,
  profilesSeen: 0,
  profilesInserted: 0,
  profilesUpdated: 0,
  skippedWithoutLicense: 0,
  malformed: 0,
};

const uploadsDir = mkdtempSync(join(tmpdir(), 'xalqbonus-landing-miniapp-'));
const previousUploadsDir = process.env['UPLOADS_DIR'];

const globalForIdentity = globalThis as typeof globalThis & { botUsernameByToken?: Map<string, string> };

let employeeId = '';

beforeAll(async () => {
  process.env['UPLOADS_DIR'] = uploadsDir;
  employeeId = (await createTestEmployee({ role: 'admin' })).employeeId;
});

beforeEach(() => {
  vi.stubEnv('TG_BOT_TOKEN', TOKEN);
  globalForIdentity.botUsernameByToken ??= new Map<string, string>();
  globalForIdentity.botUsernameByToken.set(TOKEN, BOT_USERNAME);
  vi.mocked(runProfileSyncByPhone).mockResolvedValue(NOTHING_IN_FLEET);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  // Заявки и касания — до лендингов: их ключи на версии стоят на `RESTRICT`, метки — тоже.
  await cleanupTestCandidateApplications();
  await cleanupTestPromoTouches();
  await cleanupTestLandings();
});

afterAll(async () => {
  await cleanupTestEmployees();
  await disconnectDatabase();
  rmSync(uploadsDir, { recursive: true, force: true });

  if (previousUploadsDir === undefined) delete process.env['UPLOADS_DIR'];
  else process.env['UPLOADS_DIR'] = previousUploadsDir;
});

const newCandidate = (): bigint => {
  const telegramUserId = nextTestTelegramUserId();

  trackTestCandidateTelegram(telegramUserId);
  trackTestPromoTelegram(telegramUserId);

  return telegramUserId;
};

/** Запуск приложения ссылкой метки — как его отдаёт проверенная `initData`. */
const launchOf = (telegramUserId: bigint, code: string, authDate: Date): TelegramLaunch => ({
  user: {
    id: telegramUserId,
    firstName: 'Азиз',
    lastName: '',
    username: '',
    languageCode: 'ru',
    allowsWriteToPrivateMessages: false,
  },
  startParam: code,
  authDate,
});

/** Лендинг с версией 1, прошедшей проверку. */
const uploadLanding = async (): Promise<string> => {
  const created = await createLanding({ name: 'Тест лендинг', archive: passingLandingArchive(), employeeId });

  trackTestLanding(created.id);

  return created.id;
};

const versionId = async (landingId: string, number: number): Promise<string> => {
  const version = await db.landingVersion.findUnique({
    where: { landingId_number: { landingId, number } },
    select: { id: true },
  });

  if (version === null) throw new Error(`у лендинга ${landingId} нет версии ${number}`);

  return version.id;
};

/** Метка рекламы со входом «Приложение»; лендинг ставится до первого касания. */
const adLink = async (landingId: string | null): Promise<string> => {
  const code = nextTestPromoCode();

  await createTestPromoLink(code, NOW, 'telegram_ad', 'miniapp');

  if (landingId !== null) {
    await updatePromoLink(code, { name: `Тест ${code}`, placement: '', landingId });
  }

  return code;
};

/** Открытие приложения: касание запуска и экран заявки — как у `GET /api/miniapp/me`. */
const openScreen = async (launch: TelegramLaunch, contactWindow: boolean) => {
  await recordMiniAppPromoTouch(launch);

  const screen = await readApplicationScreen(launch, NOW, contactWindow);

  if (screen?.screen !== 'application') throw new Error(`ждали экран заявки, а пришёл ${screen?.screen ?? 'null'}`);

  return screen;
};

/** Заявка из Mini App с номером, введённым руками, — подпись строки контакта тест не собирает. */
const submit = (launch: TelegramLaunch) =>
  submitCandidateApplication({
    launch,
    name: 'Азиз',
    contactData: null,
    manualPhone: nextTestPhone().slice(4),
    writeAccessGranted: false,
    language: 'ru',
    botToken: TOKEN,
    appOrigin: 'http://localhost:3003',
    now: NOW,
  });

const FIRST_LAUNCH = new Date('2026-10-15T06:00:00.000Z');
const SECOND_LAUNCH = new Date('2026-10-15T06:30:00.000Z');

describe('касание запуска: версия лендинга', () => {
  it('ставится строке своего запуска, строку другого запуска не трогает; `null` перезаписывает', async () => {
    const landingId = await uploadLanding();
    const version = await versionId(landingId, 1);
    const code = await adLink(landingId);
    const telegramUserId = newCandidate();
    const first = launchOf(telegramUserId, code, FIRST_LAUNCH);

    await recordMiniAppPromoTouch(first);
    await recordMiniAppPromoTouch(launchOf(telegramUserId, code, SECOND_LAUNCH));

    await setMiniAppTouchLandingVersion(first, version);

    expect(await readTestPromoTouchMarks(telegramUserId)).toEqual([
      { launchedAt: FIRST_LAUNCH, landingVersionId: version, pressedAt: null },
      { launchedAt: SECOND_LAUNCH, landingVersionId: null, pressedAt: null },
    ]);

    await setMiniAppTouchLandingVersion(first, null);

    expect((await readTestPromoTouchMarks(telegramUserId)).map((touch) => touch.landingVersionId)).toEqual([null, null]);
  });

  it('строки запуска нет — без ошибки и без строки', async () => {
    const landingId = await uploadLanding();
    const telegramUserId = newCandidate();

    await setMiniAppTouchLandingVersion(launchOf(telegramUserId, await adLink(landingId), FIRST_LAUNCH), await versionId(landingId, 1));

    expect(await readTestPromoTouchMarks(telegramUserId)).toEqual([]);
  });
});

describe('касание запуска: нажатие кнопки', () => {
  it('первый вызов ставит `pressed_at`, второй его не меняет', async () => {
    const telegramUserId = newCandidate();
    const launch = launchOf(telegramUserId, await adLink(null), FIRST_LAUNCH);

    await recordMiniAppPromoTouch(launch);
    await markMiniAppTouchPressed(launch);

    const [first] = await readTestPromoTouchMarks(telegramUserId);

    expect(first?.pressedAt).toBeInstanceOf(Date);

    await markMiniAppTouchPressed(launch);

    expect(await readTestPromoTouchMarks(telegramUserId)).toEqual([first]);
  });

  it('строки запуска нет — без ошибки и без строки', async () => {
    const telegramUserId = newCandidate();

    await markMiniAppTouchPressed(launchOf(telegramUserId, await adLink(null), FIRST_LAUNCH));

    expect(await readTestPromoTouchMarks(telegramUserId)).toEqual([]);
  });
});

describe('выбор экрана заявки', () => {
  it('метка с лендингом и окно номера — версия в ответе и в касании', async () => {
    const landingId = await uploadLanding();
    const version = await versionId(landingId, 1);
    const telegramUserId = newCandidate();

    const screen = await openScreen(launchOf(telegramUserId, await adLink(landingId), FIRST_LAUNCH), true);

    expect(screen.landing).toEqual({
      html: expect.stringContaining('data-xb-submit') as string,
      imageBase: `/uploads/landings/${version}/`,
    });
    expect(await readTestPromoTouchMarks(telegramUserId)).toMatchObject([{ landingVersionId: version }]);
  });

  it('без окна номера — экран по умолчанию, в касании пусто, и тот же запуск версию теряет', async () => {
    const landingId = await uploadLanding();
    const telegramUserId = newCandidate();
    const launch = launchOf(telegramUserId, await adLink(landingId), FIRST_LAUNCH);

    await openScreen(launch, true);

    expect((await openScreen(launch, false)).landing).toBeNull();
    expect(await readTestPromoTouchMarks(telegramUserId)).toMatchObject([{ landingVersionId: null }]);
  });

  it('метка без лендинга — экран по умолчанию, в касании пусто', async () => {
    const telegramUserId = newCandidate();

    expect((await openScreen(launchOf(telegramUserId, await adLink(null), FIRST_LAUNCH), true)).landing).toBeNull();
    expect(await readTestPromoTouchMarks(telegramUserId)).toMatchObject([{ landingVersionId: null }]);
  });

  it('лендинг в архиве — показывается', async () => {
    const landingId = await uploadLanding();
    const code = await adLink(landingId);

    await setLandingArchived(landingId, true);

    const telegramUserId = newCandidate();
    const screen = await openScreen(launchOf(telegramUserId, code, FIRST_LAUNCH), true);

    expect(screen.landing?.imageBase).toBe(`/uploads/landings/${await versionId(landingId, 1)}/`);
  });

  it('замена, не прошедшая проверку, — показывается прежняя действующая', async () => {
    const landingId = await uploadLanding();
    const code = await adLink(landingId);

    await addLandingVersion({ landingId, archive: failingLandingArchive(), employeeId });

    const telegramUserId = newCandidate();
    const live = await versionId(landingId, 1);
    const screen = await openScreen(launchOf(telegramUserId, code, FIRST_LAUNCH), true);

    expect(screen.landing?.imageBase).toBe(`/uploads/landings/${live}/`);
    expect(await readTestPromoTouchMarks(telegramUserId)).toMatchObject([{ landingVersionId: live }]);
  });
});

describe('версия лендинга в заявке', () => {
  it('из касания своего запуска — та, что показали, даже если лендинг заменили', async () => {
    const landingId = await uploadLanding();
    const code = await adLink(landingId);
    const telegramUserId = newCandidate();
    const launch = launchOf(telegramUserId, code, FIRST_LAUNCH);

    await openScreen(launch, true);
    // Пока человек на экране, лендинг заменили новой версией — она прошла проверку.
    await addLandingVersion({ landingId, archive: passingLandingArchive(), employeeId });

    expect(await submit(launch)).toMatchObject({ outcome: 'accepted' });
    expect(await readTestOpenApplications(telegramUserId)).toMatchObject([
      { landingVersionId: await versionId(landingId, 1) },
    ]);
  });

  it('версия не прочиталась — заявка принята без версии', async () => {
    const landingId = await uploadLanding();
    const telegramUserId = newCandidate();
    const launch = launchOf(telegramUserId, await adLink(landingId), FIRST_LAUNCH);

    await openScreen(launch, true);
    vi.mocked(findMiniAppTouchLandingVersion).mockRejectedValueOnce(new Error('база не ответила'));

    expect(await submit(launch)).toMatchObject({ outcome: 'accepted' });
    expect(await readTestOpenApplications(telegramUserId)).toMatchObject([{ landingVersionId: null }]);
  });

  it('касание без версии — пусто', async () => {
    const telegramUserId = newCandidate();
    const launch = launchOf(telegramUserId, await adLink(null), FIRST_LAUNCH);

    await openScreen(launch, true);

    expect(await submit(launch)).toMatchObject({ outcome: 'accepted' });
    expect(await readTestOpenApplications(telegramUserId)).toMatchObject([{ landingVersionId: null }]);
  });

  it('из чата бота — пусто', async () => {
    const landingId = await uploadLanding();
    const code = await adLink(landingId);
    const telegramUserId = newCandidate();
    let lastMessageId = 7_000;
    const reply: ChatDraftReply = async () => {
      lastMessageId += 1;

      return lastMessageId;
    };
    const message = { telegramUserId, telegramChatId: telegramUserId, telegramName: 'Азиз Каримов', telegramUsername: null };

    // Тот же человек открывал приложение по метке с лендингом: касание с версией есть.
    await openScreen(launchOf(telegramUserId, code, FIRST_LAUNCH), true);
    await startChatDraft({ ...message, promoCode: code, language: 'ru', now: NOW, reply });

    const [draft] = await readTestChatDrafts(telegramUserId);

    if (draft === undefined) throw new Error('черновик не завёлся');

    lastMessageId += 1;
    await advanceChatDraft({
      draftId: draft.id,
      message: {
        ...message,
        messageId: lastMessageId,
        content: { kind: 'contact', text: null, fileId: null },
        contact: { userId: telegramUserId, phoneNumber: nextTestPhone() },
      },
      now: NOW,
      reply,
    });
    lastMessageId += 1;
    await advanceChatDraft({
      draftId: draft.id,
      message: { ...message, messageId: lastMessageId, content: { kind: 'text', text: 'Азиз', fileId: null }, contact: null },
      now: NOW,
      reply,
    });

    expect(await readTestOpenApplications(telegramUserId)).toMatchObject([{ channel: 'bot', landingVersionId: null }]);
  });
});

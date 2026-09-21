import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Language } from '#server/generated/prisma/enums';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import {
  CampaignSecondHalfUnavailableError,
  CampaignSegmentArchivedError,
  CampaignSlugTakenError,
  CampaignStatusMismatchError,
} from '#server/services/campaigns/errors';
import type { CampaignFields } from '#server/services/campaigns/fields';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { readCampaign, readCampaignList } from '#server/services/campaigns/readCampaign';
import { readCampaignParticipants } from '#server/services/campaigns/readCampaignParticipants';
import { readMemberCampaign } from '#server/services/campaigns/readMemberCampaign';
import { declineCampaign, joinCampaign } from '#server/services/campaigns/respondToCampaign';
import { setCampaignSecondHalf } from '#server/services/campaigns/setCampaignSecondHalf';
import { updateCampaign } from '#server/services/campaigns/updateCampaign';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { createSegment } from '#server/services/segments/createSegment';
import { setSegmentArchived } from '#server/services/segments/setSegmentArchived';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import { cleanupTestCampaigns, readParticipants, trackTestCampaign } from '../support/campaigns';
import { cleanupTestData, createTestPerson, disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Акции: снимок состава при запуске, окна половин и участие водителя.
 *
 * Все запросы здесь сырые и читают чужие таблицы — сегменты с их построителем, профили парка,
 * сотрудников, — а окно переводят из дат в метки и обратно выражением SQL. Миграция в любой
 * из этих таблиц ломает акции молча: типы расхождения со схемой не ловят (docs/infra.md →
 * «Тесты», третье исключение). Тест гоняет их через сервисы — тем путём, которым их зовут
 * ручки.
 *
 * База тестов общая для всех файлов, поэтому состав берётся сегментом по балансу из окна,
 * которого нет ни у кого, кроме людей этого файла.
 */

const BALANCE_FROM = 7_166_000;
const BALANCE_TO = 7_166_999;

/** Окно половины А: 1–7 октября. В метках — `01.10 05:00` … `08.10 05:00` по Ташкенту. */
const WINDOW_A = { startsOn: '2026-10-01', endsOn: '2026-10-07' };
const WINDOW_B = { startsOn: '2026-10-08', endsOn: '2026-10-14' };

/** Моменты в UTC. Ташкент — UTC+5 без перевода часов, 05:00 там — 00:00 UTC. */
const INSIDE_A = new Date('2026-10-03T07:00:00Z');
const INSIDE_B = new Date('2026-10-10T07:00:00Z');

let slugSequence = 0;

const nextSlug = (): string => {
  slugSequence += 1;

  return `test-wave-${Date.now()}-${slugSequence}`;
};

const createDrivers = async (count: number): Promise<string[]> => {
  const personIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const { personId } = await createTestPerson({ inProgram: true });

    await grantPoints(personId, BALANCE_FROM + index + 1);
    personIds.push(personId);
  }

  return personIds;
};

/** Водитель так, как его видит Mini App: проверенная привязка уже позади. */
const asDriver = (personId: string, language: Language = 'ru'): LinkedDriver => ({
  personId,
  name: 'Тест',
  points: 0n,
  language,
});

type Setup = {
  employeeId: string;
  segmentId: string;
  personIds: string[];
};

const setup = async (drivers: number): Promise<Setup> => {
  const personIds = await createDrivers(drivers);
  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const segment = await createSegment(
    {
      name: 'Волна возврата — тест',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
    },
    employeeId,
  );

  trackTestSegment(segment.segmentId);

  return { employeeId, segmentId: segment.segmentId, personIds };
};

const draftFields = (segmentId: string, overrides: Partial<CampaignFields> = {}): CampaignFields => ({
  title: 'Неделя возвращения — тест',
  slug: nextSlug(),
  segmentId,
  ...WINDOW_A,
  splitEnabled: true,
  ...overrides,
});

const createDraft = async (
  context: Setup,
  overrides: Partial<CampaignFields> = {},
): Promise<string> => {
  const created = await createCampaign(draftFields(context.segmentId, overrides), context.employeeId);

  trackTestCampaign(created.campaign.campaignId);

  return created.campaign.campaignId;
};

describe('акции', () => {
  afterEach(async () => {
    // Снимок ссылается на людей, акция — на сегмент и автора: акции первыми, люди последними.
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('черновик хранит окно метками начала суток механики и отдаёт его датами', async () => {
    const context = await setup(1);
    const campaignId = await createDraft(context);
    const { campaign, breakdown } = await readCampaign(campaignId);

    expect(campaign.status).toBe('draft');
    expect(campaign.halfA).toEqual({
      startsOn: '2026-10-01',
      endsOn: '2026-10-07',
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-08T00:00:00.000Z',
    });
    expect(campaign.halfB).toBeNull();
    expect(campaign.segment?.segmentId).toBe(context.segmentId);
    expect(breakdown).toEqual([]);

    const list = await readCampaignList();

    expect(list.campaigns.map((item) => item.campaignId)).toContain(campaignId);
  });

  it('запуск снимает состав один раз и делит его на равные половины', async () => {
    const context = await setup(5);
    const campaignId = await createDraft(context);

    const launched = await launchCampaign(campaignId);

    expect(launched.campaign.status).toBe('running');
    expect(launched.campaign.audienceSize).toBe(5);
    expect(launched.campaign.halfB).toEqual({
      startsOn: null,
      endsOn: null,
      startsAt: null,
      endsAt: null,
    });

    const participants = await readParticipants(campaignId);

    expect(participants.map((row) => row.personId).sort()).toEqual([...context.personIds].sort());
    expect(participants.every((row) => row.state === 'invited')).toBe(true);
    // Нечётное число — в А на одного больше.
    expect(participants.filter((row) => row.half === 'a')).toHaveLength(3);
    expect(participants.filter((row) => row.half === 'b')).toHaveLength(2);
    expect(launched.breakdown).toEqual([
      { half: 'a', total: 3, states: { invited: 3, opened: 0, joined: 0, declined: 0 } },
      { half: 'b', total: 2, states: { invited: 2, opened: 0, joined: 0, declined: 0 } },
    ]);

    // Повторный запуск не проходит вовсе, а не «проходит и ничего не делает».
    await expect(launchCampaign(campaignId)).rejects.toBeInstanceOf(CampaignStatusMismatchError);
    // Правка запущенной отклоняется: ни сегмент, ни окно, ни деление не меняются.
    await expect(
      updateCampaign(campaignId, draftFields(context.segmentId, { splitEnabled: false })),
    ).rejects.toBeInstanceOf(CampaignStatusMismatchError);

    expect(await readParticipants(campaignId)).toHaveLength(5);
    expect((await readCampaign(campaignId)).campaign.splitEnabled).toBe(true);
  });

  it('без деления все в половине А, и окна Б нет', async () => {
    const context = await setup(3);
    const campaignId = await createDraft(context, { splitEnabled: false });

    const launched = await launchCampaign(campaignId);

    expect(launched.campaign.halfB).toBeNull();
    expect((await readParticipants(campaignId)).every((row) => row.half === 'a')).toBe(true);
    expect(launched.breakdown.map((row) => row.half)).toEqual(['a']);

    await expect(setCampaignSecondHalf(campaignId, WINDOW_B)).rejects.toBeInstanceOf(
      CampaignSecondHalfUnavailableError,
    );
  });

  it('по архивному сегменту акция не запускается', async () => {
    const context = await setup(1);
    const campaignId = await createDraft(context);

    await setSegmentArchived(context.segmentId, true);

    await expect(launchCampaign(campaignId)).rejects.toBeInstanceOf(CampaignSegmentArchivedError);
    expect(await readParticipants(campaignId)).toHaveLength(0);
    expect((await readCampaign(campaignId)).campaign.status).toBe('draft');
  });

  it('занятое короткое имя отбивается отказом по полю', async () => {
    const context = await setup(1);
    const slug = nextSlug();

    await createDraft(context, { slug });

    await expect(
      createCampaign(draftFields(context.segmentId, { slug }), context.employeeId),
    ).rejects.toBeInstanceOf(CampaignSlugTakenError);
  });

  it('водитель открывает, вступает и отказывается — назад состояния не ходят', async () => {
    const context = await setup(4);
    const campaignId = await createDraft(context, { splitEnabled: false });

    await launchCampaign(campaignId);

    const [joiner, decliner] = context.personIds as [string, string];

    const opened = await readMemberCampaign(asDriver(joiner), INSIDE_A);

    expect(opened.campaign).toEqual(
      expect.objectContaining({
        title: 'Неделя возвращения — тест',
        window: 'Сроки акции: 01.10.2026 — 07.10.2026',
        state: 'opened',
        canRespond: true,
      }),
    );

    const joined = await joinCampaign(asDriver(joiner), INSIDE_A);

    expect(joined.campaign?.state).toBe('joined');
    expect(joined.campaign?.canRespond).toBe(false);

    const joinedAt = (await readParticipants(campaignId)).find((row) => row.personId === joiner)
      ?.joinedAt;

    // Повтор отвечает успехом и ничего не меняет — отметка та же.
    expect((await joinCampaign(asDriver(joiner), INSIDE_A)).campaign?.state).toBe('joined');
    expect((await declineCampaign(asDriver(joiner), INSIDE_A)).campaign?.state).toBe('joined');

    const declined = await declineCampaign(asDriver(decliner, 'uz'), INSIDE_A);

    expect(declined.campaign?.state).toBe('declined');
    expect(declined.campaign?.stateText).toBe("Siz aksiyada ishtirok etishdan voz kechdingiz.");
    expect((await joinCampaign(asDriver(decliner), INSIDE_A)).campaign?.state).toBe('declined');

    const rows = await readParticipants(campaignId);
    const joinerRow = rows.find((row) => row.personId === joiner);
    const declinerRow = rows.find((row) => row.personId === decliner);

    expect(joinerRow?.joinedAt).toEqual(joinedAt);
    expect(joinerRow?.openedAt).not.toBeNull();
    // Отказался, не открыв экран: переход прямо из «приглашён».
    expect(declinerRow).toEqual(
      expect.objectContaining({ state: 'declined', openedAt: null, joinedAt: null }),
    );

    const { breakdown } = await readCampaign(campaignId);

    expect(breakdown).toEqual([
      { half: 'a', total: 4, states: { invited: 2, opened: 0, joined: 1, declined: 1 } },
    ]);

    const page = await readCampaignParticipants(
      campaignId,
      { half: 'a', state: 'joined' },
      25,
      0,
    );

    expect(page.total).toBe(1);
    expect(page.rows).toEqual([
      expect.objectContaining({ personId: joiner, half: 'a', state: 'joined', lastName: 'Тестов' }),
    ]);
  });

  it('половина Б не видит акцию до своего окна, а после назначения — видит', async () => {
    const context = await setup(4);
    const campaignId = await createDraft(context);

    await launchCampaign(campaignId);

    const rows = await readParticipants(campaignId);
    const memberA = rows.find((row) => row.half === 'a')?.personId as string;
    const memberB = rows.find((row) => row.half === 'b')?.personId as string;

    expect((await readMemberCampaign(asDriver(memberA), INSIDE_A)).campaign).not.toBeNull();
    expect((await readMemberCampaign(asDriver(memberB), INSIDE_A)).campaign).toBeNull();
    // Ни открыть, ни вступить за контроль нельзя: ручки отвечают «акции нет».
    expect((await joinCampaign(asDriver(memberB), INSIDE_A)).campaign).toBeNull();
    expect((await readParticipants(campaignId)).find((row) => row.personId === memberB)?.state).toBe(
      'invited',
    );

    const updated = await setCampaignSecondHalf(campaignId, WINDOW_B);

    expect(updated.campaign.halfB).toEqual(
      expect.objectContaining({ startsOn: '2026-10-08', endsOn: '2026-10-14' }),
    );
    await expect(setCampaignSecondHalf(campaignId, WINDOW_B)).rejects.toBeInstanceOf(
      CampaignSecondHalfUnavailableError,
    );

    expect((await readMemberCampaign(asDriver(memberB), INSIDE_A)).campaign).toBeNull();
    expect((await readMemberCampaign(asDriver(memberB), INSIDE_B)).campaign).toEqual(
      expect.objectContaining({ window: 'Сроки акции: 08.10.2026 — 14.10.2026', state: 'opened' }),
    );
    // Окно А к этому моменту кончилось.
    expect((await readMemberCampaign(asDriver(memberA), INSIDE_B)).campaign).toBeNull();
  });

  it('окно открывается в 05:00 первого дня и кончается в 05:00 дня после последнего', async () => {
    const context = await setup(1);
    const campaignId = await createDraft(context, { splitEnabled: false });

    await launchCampaign(campaignId);

    const driver = asDriver(context.personIds[0] as string);
    const at = async (moment: string): Promise<boolean> =>
      (await readMemberCampaign(driver, new Date(moment))).campaign !== null;

    // 01.10 04:59 и 05:00 по Ташкенту.
    expect(await at('2026-09-30T23:59:00Z')).toBe(false);
    expect(await at('2026-10-01T00:00:00Z')).toBe(true);
    // 08.10 04:00 — последний день ещё идёт; 08.10 05:30 — окно кончилось.
    expect(await at('2026-10-07T23:00:00Z')).toBe(true);
    expect(await at('2026-10-08T00:30:00Z')).toBe(false);
  });

  it('водитель вне состава получает «акции нет» на всех трёх ручках', async () => {
    const context = await setup(1);
    const campaignId = await createDraft(context, { splitEnabled: false });

    await launchCampaign(campaignId);

    const { personId: outsider } = await createTestPerson({ inProgram: true });

    expect((await readMemberCampaign(asDriver(outsider), INSIDE_A)).campaign).toBeNull();
    expect((await joinCampaign(asDriver(outsider), INSIDE_A)).campaign).toBeNull();
    expect((await declineCampaign(asDriver(outsider), INSIDE_A)).campaign).toBeNull();
    expect(await readParticipants(campaignId)).toHaveLength(1);
  });
});

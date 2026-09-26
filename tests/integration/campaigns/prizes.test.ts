import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { CampaignPrizeInput } from '#server/repositories/campaignPrizes';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import {
  CampaignNotLaunchableError,
  CampaignPrizeProductUnavailableError,
  CampaignPrizesLockedError,
  InvalidCampaignPrizesError,
} from '#server/services/campaigns/errors';
import type { CampaignFields } from '#server/services/campaigns/fields';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { readCampaignPrizeFields } from '#server/services/campaigns/prizeFields';
import { readCampaign } from '#server/services/campaigns/readCampaign';
import { readCampaignPrizes } from '#server/services/campaigns/readCampaignPrizes';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';
import { createProduct } from '#server/services/products/createProduct';
import { setProductArchived } from '#server/services/products/setProductArchived';
import { createSegment } from '#server/services/segments/createSegment';
import {
  CHECK_VIOLATION,
  isConstraintViolation,
  UNIQUE_VIOLATION,
} from '#server/utils/postgresErrors';
import { CAMPAIGN_PRIZES_LIMIT } from '#shared/campaign';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import {
  cleanupTestCampaigns,
  FULL_TEST_PRIZES,
  insertPrizeBypassingServices,
  trackTestCampaign,
} from '../support/campaigns';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  trackTestProduct,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee } from '../support/employees';
import { grantPoints } from '../support/points';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Призы сундуков акции (issue #180): набор правится целиком у черновика, закрыт у запущенной,
 * и без всех трёх сундуков акция не запускается.
 *
 * Чтение набора — сырой запрос с соединением на товары (docs/infra.md → «Тесты», третье
 * исключение); правила вида, веса и единственности фиксированного сундука держит база,
 * и это проверяется записью мимо сервисов.
 *
 * Состав берётся сегментом по балансу из окна, которого нет ни у кого, кроме людей этого файла.
 */

const BALANCE_FROM = 7_180_000;
const BALANCE_TO = 7_180_999;

let slugSequence = 0;

type Setup = { employeeId: string; segmentId: string; officeId: string };

const setup = async (): Promise<Setup> => {
  const { personId } = await createTestPerson({ inProgram: true });

  await grantPoints(personId, BALANCE_FROM + 1);

  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const segment = await createSegment(
    {
      name: 'Призы — тест',
      description: null,
      conditions: { ...EMPTY_SEGMENT_CONDITIONS, balanceMin: BALANCE_FROM, balanceMax: BALANCE_TO },
    },
    employeeId,
    false,
  );

  trackTestSegment(segment.segmentId);

  return { employeeId, segmentId: segment.segmentId, officeId: await createTestOffice() };
};

const createDraft = async (
  context: Setup,
  overrides: Partial<CampaignFields> = {},
): Promise<string> => {
  slugSequence += 1;

  const created = await createCampaign(
    {
      title: 'Призы — тест',
      slug: `test-prizes-${Date.now()}-${slugSequence}`,
      segmentId: context.segmentId,
      startsOn: '2026-10-01',
      endsOn: '2026-10-07',
      splitEnabled: false,
      officeId: context.officeId,
      rewardLifetimeDays: 7,
      ...overrides,
    },
    context.employeeId,
    false,
  );

  trackTestCampaign(created.campaign.campaignId);

  return created.campaign.campaignId;
};

const fixedPrizes = (): CampaignPrizeInput[] =>
  FULL_TEST_PRIZES.filter((prize) => prize.chest !== 'day');

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => null,
    (error: unknown) => error,
  );

describe('призы акции', () => {
  afterEach(async () => {
    // Призы ссылаются на акцию и товар: акции с призами первыми, каталог и люди последними.
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('черновик сохраняет все три сундука одним набором и читает их по ступеням', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);
    // Призовой товар без цены в баллах — наравне с обычным.
    const promoProductId = await createTestProduct({ pricePoints: null, promo: true });
    const catalogProductId = await createTestProduct({ pricePoints: 40 });

    const saved = await replaceCampaignPrizes(campaignId, [
      { chest: 'day', kind: 'points', weight: 70, points: 30, productId: null, title: null },
      { chest: 'day', kind: 'product', weight: 20, points: null, productId: catalogProductId, title: null },
      { chest: 'day', kind: 'custom', weight: 8, points: null, productId: null, title: 'Мойка' },
      { chest: 'day', kind: 'product', weight: 2, points: null, productId: promoProductId, title: null },
      ...fixedPrizes(),
    ]);

    expect(saved.editable).toBe(true);
    expect(saved.chests.map((chest) => chest.chest)).toEqual(['day', 'three_days', 'week']);

    const [day, threeDays, week] = saved.chests;

    expect(day?.prizes.map((prize) => prize.weight)).toEqual([70, 20, 8, 2]);
    expect(day?.prizes[1]).toMatchObject({
      kind: 'product',
      productId: catalogProductId,
      productName: 'Тестовый товар',
      productUnavailable: false,
    });
    expect(threeDays?.prizes).toHaveLength(1);
    expect(week?.prizes[0]).toMatchObject({ kind: 'custom', title: 'Мойка', weight: 1 });

    // Замена — целиком: прежние варианты не остаются рядом с новыми.
    await replaceCampaignPrizes(campaignId, FULL_TEST_PRIZES);

    const replaced = await readCampaignPrizes(campaignId);

    expect(replaced.chests.map((chest) => chest.prizes.length)).toEqual([1, 1, 1]);
  });

  it('товар варианта — только опубликованный и не архивный', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);
    const archivedProductId = await createTestProduct({ pricePoints: 40, archived: true });
    const draftProduct = await createProduct(
      {
        name: 'Черновик приза',
        description: null,
        pricePoints: null,
        priceRetail: 10_000,
        priceCost: 8_000,
        promo: true,
        hiddenInCatalog: true,
      },
      false,
    );

    trackTestProduct(draftProduct.productId);

    for (const productId of [archivedProductId, draftProduct.productId]) {
      const failure = await failureOf(
        replaceCampaignPrizes(campaignId, [
          { chest: 'day', kind: 'product', weight: 1, points: null, productId, title: null },
        ]),
      );

      expect(failure).toBeInstanceOf(CampaignPrizeProductUnavailableError);
    }

    expect((await readCampaignPrizes(campaignId)).chests.every((chest) => chest.prizes.length === 0)).toBe(
      true,
    );
  });

  it('нулевой и отрицательный вес не сохраняются — ни разбором, ни базой', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);

    for (const weight of ['0', '-5', '1.5', '']) {
      expect(() =>
        readCampaignPrizeFields({
          prizes: [{ chest: 'day', kind: 'points', weight, points: '10', productId: '', title: '' }],
        }),
      ).toThrow(InvalidCampaignPrizesError);
    }

    const failure = await failureOf(
      insertPrizeBypassingServices(campaignId, {
        chest: 'day',
        kind: 'points',
        weight: 0,
        points: 10,
        productId: null,
        title: null,
      }),
    );

    expect(isConstraintViolation(failure, CHECK_VIOLATION, 'campaign_prizes_weight_check')).toBe(true);
  });

  it('поля варианта согласованы с видом: баллы без суммы база не пишет', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);

    const failure = await failureOf(
      insertPrizeBypassingServices(campaignId, {
        chest: 'day',
        kind: 'points',
        weight: 1,
        points: null,
        productId: null,
        title: 'Лишнее название',
      }),
    );

    expect(isConstraintViolation(failure, CHECK_VIOLATION, 'campaign_prizes_kind_fields_check')).toBe(
      true,
    );
  });

  it('у сундуков трёх дней и недели второй вариант не заводится', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);

    for (const chest of ['three_days', 'week'] as const) {
      const row = { chest, kind: 'points', weight: '', points: '10', productId: '', title: '' };

      expect(() => readCampaignPrizeFields({ prizes: [row, row] })).toThrow(InvalidCampaignPrizesError);
    }

    const prize: CampaignPrizeInput = {
      chest: 'week',
      kind: 'points',
      weight: 1,
      points: 10,
      productId: null,
      title: null,
    };

    await insertPrizeBypassingServices(campaignId, prize);

    const failure = await failureOf(insertPrizeBypassingServices(campaignId, prize));

    expect(isConstraintViolation(failure, UNIQUE_VIOLATION, 'campaign_prizes_fixed_chest_key')).toBe(
      true,
    );
  });

  it('с пустым сундуком акция не запускается, и причина стоит в общем списке', async () => {
    const context = await setup();
    const campaignId = await createDraft(context, { officeId: null });

    await replaceCampaignPrizes(campaignId, fixedPrizes());

    const failure = await failureOf(launchCampaign(campaignId));

    expect(failure).toBeInstanceOf(CampaignNotLaunchableError);
    expect((failure as CampaignNotLaunchableError).problems).toEqual([
      'office_missing',
      'prizes_missing',
    ]);
  });

  it('товар приза ушёл в архив после сохранения — акция не запускается и называет сундук', async () => {
    const context = await setup();
    const campaignId = await createDraft(context, { officeId: null });
    const productId = await createTestProduct({ pricePoints: 40 });

    await replaceCampaignPrizes(campaignId, [
      { chest: 'day', kind: 'points', weight: 9, points: 30, productId: null, title: null },
      { chest: 'day', kind: 'product', weight: 1, points: null, productId, title: null },
      ...fixedPrizes(),
    ]);
    await setProductArchived(productId, true);

    const failure = await failureOf(launchCampaign(campaignId));

    expect(failure).toBeInstanceOf(CampaignNotLaunchableError);
    // В общем списке, рядом с остальными причинами, а не отдельным отказом.
    expect((failure as CampaignNotLaunchableError).problems).toEqual([
      'office_missing',
      'prize_unavailable_day',
    ]);
    expect((await readCampaign(campaignId)).campaign.status).toBe('draft');

    const [day] = (await readCampaignPrizes(campaignId)).chests;

    expect(day?.prizes.find((prize) => prize.productId === productId)?.productUnavailable).toBe(true);
  });

  it('набор длиннее предела не разбирается', () => {
    const row = { chest: 'day', kind: 'points', weight: '1', points: '10', productId: '', title: '' };

    expect(() =>
      readCampaignPrizeFields({ prizes: Array.from({ length: CAMPAIGN_PRIZES_LIMIT + 1 }, () => row) }),
    ).toThrow(InvalidCampaignPrizesError);
    expect(
      readCampaignPrizeFields({ prizes: Array.from({ length: CAMPAIGN_PRIZES_LIMIT }, () => row) }),
    ).toHaveLength(CAMPAIGN_PRIZES_LIMIT);
  });

  it('у запущенной акции призы только читаются', async () => {
    const context = await setup();
    const campaignId = await createDraft(context);

    await replaceCampaignPrizes(campaignId, FULL_TEST_PRIZES);
    await launchCampaign(campaignId);

    const failure = await failureOf(replaceCampaignPrizes(campaignId, fixedPrizes()));

    expect(failure).toBeInstanceOf(CampaignPrizesLockedError);

    const prizes = await readCampaignPrizes(campaignId);

    expect(prizes.editable).toBe(false);
    expect(prizes.chests.map((chest) => chest.prizes.length)).toEqual([1, 1, 1]);
  });
});

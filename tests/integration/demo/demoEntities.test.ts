import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { createCampaign } from '#server/services/campaigns/createCampaign';
import {
  CampaignOfficeDemoMismatchError,
  CampaignPrizeDemoProductError,
  CampaignSegmentDemoMismatchError,
} from '#server/services/campaigns/errors';
import type { CampaignFields } from '#server/services/campaigns/fields';
import { launchCampaign } from '#server/services/campaigns/launchCampaign';
import { replaceCampaignPrizes } from '#server/services/campaigns/replaceCampaignPrizes';
import { joinCampaign } from '#server/services/campaigns/respondToCampaign';
import type { LinkedDriver } from '#server/services/drivers/readLinkedDriver';
import { copyMailing } from '#server/services/mailings/copyMailing';
import { createMailing } from '#server/services/mailings/createMailing';
import { launchMailing } from '#server/services/mailings/launchMailing';
import { readMailingAudience } from '#server/services/mailings/readMailingAudience';
import { readMemberOffices } from '#server/services/offices/readMemberOffices';
import { OfficeUnavailableError, ProductUnavailableError } from '#server/services/orders/errors';
import { placeOrder } from '#server/services/orders/placeOrder';
import { readCatalog } from '#server/services/products/readCatalog';
import { readLatestProducts } from '#server/services/products/readLatestProducts';
import { readOfficeShowcase } from '#server/services/products/readOfficeShowcase';
import {
  RewardOfficeUnavailableError,
  RewardProductUnavailableError,
} from '#server/services/rewards/errors';
import { grantManualReward } from '#server/services/rewards/grantManualReward';
import { readRewardGrantOptions } from '#server/services/rewards/readRewardGrantOptions';
import { createSegment } from '#server/services/segments/createSegment';
import { EmptySegmentConditionsError } from '#server/services/segments/errors';
import { previewSegmentConditions } from '#server/services/segments/previewSegment';
import { readSegmentPersonIds } from '#server/services/segments/readSegmentPersonIds';
import { receiveStock } from '#server/services/stock/receiveStock';
import { canEditDemo } from '#shared/access';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import {
  cleanupTestCampaigns,
  FULL_TEST_PRIZES,
  readParticipants,
  trackTestCampaign,
} from '../support/campaigns';
import {
  cleanupTestData,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  readStock,
} from '../support/database';
import {
  cleanupTestEmployees,
  createTestEmployee,
  linkTestDriver,
  nextTestTelegramUserId,
} from '../support/employees';
import { cleanupTestMailings, readTestRecipients, trackTestMailing } from '../support/mailings';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import { cleanupTestSegments, trackTestSegment } from '../support/segments';

/**
 * Демо-сущности (issue #212): живое доходит до демо, демо до живого — никогда.
 *
 * Правило держится фильтрами в сырых запросах — офисы, витрина, каталог, аудитория рассылки,
 * построитель сегментов — и проверками в сервисах заказа, наград и акций. Типы расхождения
 * со схемой здесь не ловят (docs/infra.md → «Тесты», третье исключение), поэтому тест гоняет
 * их через сервисы — тем путём, которым их зовут ручки и Mini App.
 *
 * База общая со всеми файлами, и в ней может лежать ДЕМО ОФИС из `make demo-create`: проверки
 * поэтому говорят «содержит заведённое здесь» и «не содержит», а не сравнивают списки целиком.
 * Состав сегментов берётся окном баланса, которого нет ни у кого, кроме людей этого файла.
 */

const BALANCE_FROM = 7_212_000;
const BALANCE_TO = 7_212_999;

const SEGMENT_CONDITIONS = {
  ...EMPTY_SEGMENT_CONDITIONS,
  balanceMin: BALANCE_FROM,
  balanceMax: BALANCE_TO,
};

let sequence = 0;

const nextSlug = (): string => {
  sequence += 1;

  return `test-demo-${Date.now()}-${sequence}`;
};

/** Признак демо ставится фикстурой: заводит демо-водителя и ДЕМО ОФИС в жизни цель Makefile. */
const markPersonDemo = async (personId: string): Promise<void> => {
  await db.$executeRaw`UPDATE xb.persons SET "is_demo" = true WHERE "id" = ${personId}::uuid`;
};

const markOfficeDemo = async (officeId: string): Promise<void> => {
  await db.$executeRaw`UPDATE xb.offices SET "is_demo" = true WHERE "id" = ${officeId}::uuid`;
};

const markProductDemo = async (productId: string): Promise<void> => {
  await db.$executeRaw`UPDATE xb.products SET "is_demo" = true WHERE "id" = ${productId}::uuid`;
};

/** Участник с балансом в окне сегментов этого файла. */
const createDriver = async ({ demo }: { demo: boolean }): Promise<string> => {
  const { personId } = await createTestPerson({ inProgram: true });

  if (demo) {
    await markPersonDemo(personId);
  }

  sequence += 1;
  await grantPoints(personId, BALANCE_FROM + sequence);

  return personId;
};

const asDriver = (personId: string, isDemo: boolean): LinkedDriver => ({
  personId,
  name: 'Тест',
  callsign: null,
  points: 0n,
  language: 'ru',
  isDemo,
});

/** Состав заведённого сегмента — и отдать его уборке. */
const readSegmentPersonIdsOf = async (segment: { segmentId: string }): Promise<string[]> => {
  trackTestSegment(segment.segmentId);

  return readSegmentPersonIds(segment.segmentId);
};

/** Офисы и товары: живые и демо, по штуке, с остатком друг у друга. */
const setupCatalog = async () => {
  const { employeeId } = await createTestEmployee({ role: 'owner' });
  const liveOfficeId = await createTestOffice();
  const demoOfficeId = await createTestOffice();
  const liveProductId = await createTestProduct({ pricePoints: 10 });
  const demoProductId = await createTestProduct({ pricePoints: 10 });

  await markOfficeDemo(demoOfficeId);
  await markProductDemo(demoProductId);

  for (const officeId of [liveOfficeId, demoOfficeId]) {
    for (const productId of [liveProductId, demoProductId]) {
      await receiveStock({ officeId, productId, quantity: 5, employeeId });
    }
  }

  return { employeeId, liveOfficeId, demoOfficeId, liveProductId, demoProductId };
};

afterAll(async () => {
  await disconnectDatabase();
  await disconnectQueues();
});

/**
 * Каталог, заказ, награды, сегменты и акции: снимки ссылаются на людей, акции и сегменты —
 * на авторов, движения остатка — на сотрудника прихода. Поэтому акции и сегменты первыми,
 * затем люди с заказами и движениями, сотрудники последними — как в тестах заказа.
 */
describe('демо-сущности', () => {
  afterEach(async () => {
    await cleanupTestCampaigns();
    await cleanupTestSegments();
    await cleanupTestData();
    await cleanupTestEmployees();
  });

  it('правит демо только владелец', () => {
    expect(canEditDemo('owner', true)).toBe(true);
    expect(canEditDemo('admin', true)).toBe(false);
    expect(canEditDemo('manager', true)).toBe(false);
    expect(canEditDemo('admin', false)).toBe(true);
  });

  it('офисы разведены по сторонам, демо-товары видит только демо-водитель', async () => {
    const catalog = await setupCatalog();

    const liveOffices = (await readMemberOffices({ isDemo: false })).offices.map(
      (office) => office.officeId,
    );
    const demoOffices = (await readMemberOffices({ isDemo: true })).offices.map(
      (office) => office.officeId,
    );

    expect(liveOffices).toContain(catalog.liveOfficeId);
    expect(liveOffices).not.toContain(catalog.demoOfficeId);
    expect(demoOffices).toContain(catalog.demoOfficeId);
    expect(demoOffices).not.toContain(catalog.liveOfficeId);

    // Офис чужой стороны — как архивный: витрины нет, в обе стороны.
    expect(
      await readOfficeShowcase({ officeId: catalog.demoOfficeId, balance: 0n, isDemo: false }),
    ).toBeNull();
    expect(
      await readOfficeShowcase({ officeId: catalog.liveOfficeId, balance: 0n, isDemo: true }),
    ).toBeNull();

    const liveShowcase = await readOfficeShowcase({
      officeId: catalog.liveOfficeId,
      balance: 0n,
      isDemo: false,
    });
    const liveShowcaseIds = [
      ...(liveShowcase?.products ?? []),
      ...(liveShowcase?.missingProducts ?? []),
    ].map((product) => product.productId);

    expect(liveShowcaseIds).toContain(catalog.liveProductId);
    expect(liveShowcaseIds).not.toContain(catalog.demoProductId);

    const demoShowcase = await readOfficeShowcase({
      officeId: catalog.demoOfficeId,
      balance: 0n,
      isDemo: true,
    });

    expect(demoShowcase?.products.map((product) => product.productId)).toEqual(
      expect.arrayContaining([catalog.liveProductId, catalog.demoProductId]),
    );

    // Каталог без офиса: у живого нет ни демо-товара, ни остатка ДЕМО ОФИСА у живого товара.
    const liveCatalog = await readCatalog({ balance: 0n, isDemo: false });
    const liveProduct = liveCatalog.products.find(
      (product) => product.productId === catalog.liveProductId,
    );

    expect(liveCatalog.products.map((product) => product.productId)).not.toContain(
      catalog.demoProductId,
    );
    expect(liveProduct?.offices.map((office) => office.officeId)).toEqual([catalog.liveOfficeId]);

    // У демо-водителя — живой и демо-товар, но только остатком ДЕМО ОФИСА.
    const demoCatalog = await readCatalog({ balance: 0n, isDemo: true });
    const demoCatalogProducts = demoCatalog.products.filter((product) =>
      [catalog.liveProductId, catalog.demoProductId].includes(product.productId),
    );

    expect(demoCatalogProducts).toHaveLength(2);
    expect(demoCatalogProducts.flatMap((product) => product.offices.map((office) => office.officeId)))
      .toEqual([catalog.demoOfficeId, catalog.demoOfficeId]);
    expect(demoCatalog.offices.map((office) => office.officeId)).not.toContain(catalog.liveOfficeId);

    const latest = await readLatestProducts({ isDemo: false });

    expect(latest.products.map((product) => product.productId)).not.toContain(
      catalog.demoProductId,
    );
  });

  it('заказ в офис чужой стороны и живого на демо-товар — отказ, живой остаток не тронут', async () => {
    const catalog = await setupCatalog();
    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    await expect(
      placeOrder({
        personId: livePersonId,
        officeId: catalog.demoOfficeId,
        items: [{ productId: catalog.liveProductId, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(OfficeUnavailableError);

    await expect(
      placeOrder({
        personId: livePersonId,
        officeId: catalog.liveOfficeId,
        items: [{ productId: catalog.demoProductId, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: false,
      }),
    ).rejects.toBeInstanceOf(ProductUnavailableError);

    await expect(
      placeOrder({
        personId: demoPersonId,
        officeId: catalog.liveOfficeId,
        items: [{ productId: catalog.liveProductId, quantity: 1 }],
        actor: 'mini_app',
        driverIsDemo: true,
      }),
    ).rejects.toBeInstanceOf(OfficeUnavailableError);

    const liveStockBefore = await readStock(catalog.liveOfficeId, catalog.liveProductId);

    const order = await placeOrder({
      personId: demoPersonId,
      officeId: catalog.demoOfficeId,
      items: [
        { productId: catalog.demoProductId, quantity: 1 },
        { productId: catalog.liveProductId, quantity: 1 },
      ],
      actor: 'mini_app',
      driverIsDemo: true,
    });

    expect(order.totalPoints).toBe(20);
    expect(await readStock(catalog.liveOfficeId, catalog.liveProductId)).toEqual(liveStockBefore);
  });

  it('награда — офис только своей стороны, живому только живой товар', async () => {
    const catalog = await setupCatalog();
    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    const manual = {
      employeeId: catalog.employeeId,
      title: null,
      lifetimeDays: 7,
      note: 'проверка демо',
    };

    await expect(
      grantManualReward({
        ...manual,
        personId: livePersonId,
        kind: 'product',
        productId: catalog.liveProductId,
        officeId: catalog.demoOfficeId,
      }),
    ).rejects.toBeInstanceOf(RewardOfficeUnavailableError);

    await expect(
      grantManualReward({
        ...manual,
        personId: livePersonId,
        kind: 'product',
        productId: catalog.demoProductId,
        officeId: catalog.liveOfficeId,
      }),
    ).rejects.toBeInstanceOf(RewardProductUnavailableError);

    await expect(
      grantManualReward({
        ...manual,
        personId: demoPersonId,
        kind: 'product',
        productId: catalog.liveProductId,
        officeId: catalog.liveOfficeId,
      }),
    ).rejects.toBeInstanceOf(RewardOfficeUnavailableError);

    const liveStockBefore = await readStock(catalog.liveOfficeId, catalog.liveProductId);

    // Живой товар демо-водителю — можно, если он лежит в ДЕМО ОФИСЕ.
    const reward = await grantManualReward({
      ...manual,
      personId: demoPersonId,
      kind: 'product',
      productId: catalog.liveProductId,
      officeId: catalog.demoOfficeId,
    });

    expect(reward.officeId).toBe(catalog.demoOfficeId);
    expect(await readStock(catalog.liveOfficeId, catalog.liveProductId)).toEqual(liveStockBefore);

    const live = await readRewardGrantOptions({ isDemo: false });
    const demo = await readRewardGrantOptions({ isDemo: true });

    expect(live.offices.map((office) => office.officeId)).not.toContain(catalog.demoOfficeId);
    expect(live.products.map((product) => product.productId)).not.toContain(catalog.demoProductId);
    expect(demo.offices.map((office) => office.officeId)).toContain(catalog.demoOfficeId);
    expect(demo.offices.map((office) => office.officeId)).not.toContain(catalog.liveOfficeId);
    expect(demo.products.map((product) => product.productId)).toEqual(
      expect.arrayContaining([catalog.liveProductId, catalog.demoProductId]),
    );
  });

  it('живой сегмент без демо-водителей, демо-сегмент — только они', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    const segmentFields = { name: 'Демо-проверка', description: null, conditions: SEGMENT_CONDITIONS };
    const liveSegment = await createSegment(segmentFields, employeeId, false);
    const demoSegment = await createSegment(segmentFields, employeeId, true);

    trackTestSegment(liveSegment.segmentId);
    trackTestSegment(demoSegment.segmentId);

    expect(await readSegmentPersonIds(liveSegment.segmentId)).toEqual([livePersonId]);
    expect(await readSegmentPersonIds(demoSegment.segmentId)).toEqual([demoPersonId]);

    // Несохранённый — по признаку из формы.
    const draft = await previewSegmentConditions(SEGMENT_CONDITIONS, true, 0);

    expect(draft.rows.map((row) => row.personId)).toEqual([demoPersonId]);
  });

  it('демо-сегмент без условий — все демо-водители, живой без условий — отказ', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    const empty = await previewSegmentConditions(EMPTY_SEGMENT_CONDITIONS, true, 0);
    const everyDemo = await readSegmentPersonIdsOf(
      await createSegment(
        { name: 'Все демо', description: null, conditions: EMPTY_SEGMENT_CONDITIONS },
        employeeId,
        true,
      ),
    );

    expect(empty.total).toBeGreaterThanOrEqual(1);
    expect(everyDemo).toContain(demoPersonId);
    expect(everyDemo).not.toContain(livePersonId);

    await expect(
      previewSegmentConditions(EMPTY_SEGMENT_CONDITIONS, false, 0),
    ).rejects.toBeInstanceOf(EmptySegmentConditionsError);
    await expect(
      createSegment(
        { name: 'Весь реестр', description: null, conditions: EMPTY_SEGMENT_CONDITIONS },
        employeeId,
        false,
      ),
    ).rejects.toBeInstanceOf(EmptySegmentConditionsError);

    // База держит то же: живой без условий мимо сервиса не записывается.
    await expect(
      db.$executeRaw`
        INSERT INTO xb.segments ("name", "created_by_id", "is_demo")
        VALUES ('Весь реестр', ${employeeId}::uuid, false)
      `,
    ).rejects.toThrow(/segments_has_condition_check/);
  });

  it('демо-акция — только на демо-сегменте и с ДЕМО ОФИСОМ, живая — наоборот', async () => {
    const catalog = await setupCatalog();
    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    const segmentFields = { name: 'Демо-акция', description: null, conditions: SEGMENT_CONDITIONS };
    const liveSegment = await createSegment(segmentFields, catalog.employeeId, false);
    const demoSegment = await createSegment(segmentFields, catalog.employeeId, true);

    trackTestSegment(liveSegment.segmentId);
    trackTestSegment(demoSegment.segmentId);

    const campaignFields = (overrides: Partial<CampaignFields>): CampaignFields => ({
      title: 'Демо-проверка',
      slug: nextSlug(),
      segmentId: null,
      startsOn: '2026-10-01',
      endsOn: '2026-10-07',
      splitEnabled: false,
      officeId: null,
      rewardLifetimeDays: 7,
      ...overrides,
    });

    await expect(
      createCampaign(campaignFields({ segmentId: liveSegment.segmentId }), catalog.employeeId, true),
    ).rejects.toBeInstanceOf(CampaignSegmentDemoMismatchError);
    await expect(
      createCampaign(campaignFields({ segmentId: demoSegment.segmentId }), catalog.employeeId, false),
    ).rejects.toBeInstanceOf(CampaignSegmentDemoMismatchError);
    await expect(
      createCampaign(campaignFields({ officeId: catalog.liveOfficeId }), catalog.employeeId, true),
    ).rejects.toBeInstanceOf(CampaignOfficeDemoMismatchError);
    await expect(
      createCampaign(campaignFields({ officeId: catalog.demoOfficeId }), catalog.employeeId, false),
    ).rejects.toBeInstanceOf(CampaignOfficeDemoMismatchError);

    // Демо-товар призом живой акции не бывает, у демо-акции — любой.
    const live = await createCampaign(
      campaignFields({ segmentId: liveSegment.segmentId, officeId: catalog.liveOfficeId }),
      catalog.employeeId,
      false,
    );

    trackTestCampaign(live.campaign.campaignId);

    const demoPrize = {
      chest: 'week' as const,
      kind: 'product' as const,
      weight: 1,
      points: null,
      productId: catalog.demoProductId,
      title: null,
    };

    await expect(
      replaceCampaignPrizes(live.campaign.campaignId, [...FULL_TEST_PRIZES.slice(0, 2), demoPrize]),
    ).rejects.toBeInstanceOf(CampaignPrizeDemoProductError);

    const demo = await createCampaign(
      campaignFields({ segmentId: demoSegment.segmentId, officeId: catalog.demoOfficeId }),
      catalog.employeeId,
      true,
    );

    trackTestCampaign(demo.campaign.campaignId);

    await replaceCampaignPrizes(demo.campaign.campaignId, [...FULL_TEST_PRIZES.slice(0, 2), demoPrize]);
    await replaceCampaignPrizes(live.campaign.campaignId, FULL_TEST_PRIZES);

    // Тот же запуск, что у живой: снимок из своего мира.
    await launchCampaign(demo.campaign.campaignId);
    await launchCampaign(live.campaign.campaignId);

    const demoParticipants = await readParticipants(demo.campaign.campaignId);
    const liveParticipants = await readParticipants(live.campaign.campaignId);

    expect(demoParticipants.map((row) => row.personId)).toEqual([demoPersonId]);
    expect(liveParticipants.map((row) => row.personId)).toEqual([livePersonId]);

    const joined = await joinCampaign(asDriver(demoPersonId, true), new Date('2026-10-02T07:00:00Z'));

    expect(joined.campaign?.state).toBe('joined');
  });
});

/**
 * Рассылки: снимок ссылается на людей, привязки Telegram — тоже, а их убирает уборка
 * сотрудников. Порядок — как в тестах рассылок: рассылки, сотрудники с привязками, люди.
 */
describe('демо-рассылки', () => {
  afterEach(async () => {
    await cleanupTestMailings();
    await cleanupTestEmployees();
    await cleanupTestData();
  });

  it('демо-рассылка уходит только демо-водителям, живая — всем, копия наследует признак', async () => {
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const demoBefore = await readMailingAudience(true);

    const livePersonId = await createDriver({ demo: false });
    const demoPersonId = await createDriver({ demo: true });

    await linkTestDriver(livePersonId, nextTestTelegramUserId());
    await linkTestDriver(demoPersonId, nextTestTelegramUserId());

    const demoAfter = await readMailingAudience(true);

    expect(demoAfter.total - demoBefore.total).toBe(1);

    const fields = { title: 'Демо-проверка', textRu: 'Привет', textUz: 'Salom' };
    const demoMailing = await createMailing(fields, employeeId, true);
    const liveMailing = await createMailing(fields, employeeId, false);

    trackTestMailing(demoMailing.mailingId);
    trackTestMailing(liveMailing.mailingId);

    const demoCopy = await copyMailing(demoMailing.mailingId, employeeId);
    const liveCopy = await copyMailing(liveMailing.mailingId, employeeId);

    trackTestMailing(demoCopy.mailingId);
    trackTestMailing(liveCopy.mailingId);

    expect(demoCopy.isDemo).toBe(true);
    expect(liveCopy.isDemo).toBe(false);

    await launchMailing(demoMailing.mailingId);
    await launchMailing(liveMailing.mailingId);

    const people = [livePersonId, demoPersonId];
    const demoRecipients = await readTestRecipients(demoMailing.mailingId, people);
    const liveRecipients = await readTestRecipients(liveMailing.mailingId, people);

    expect(demoRecipients.map((row) => row.personId)).toEqual([demoPersonId]);
    expect(liveRecipients.map((row) => row.personId).sort()).toEqual([...people].sort());
  });
});

import { readFileSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { InvalidGiftGrantError } from '#server/services/gifts/errors';
import { markGiftsShown } from '#server/services/gifts/markGiftsShown';
import { DeskCodeNotFoundError } from '#server/services/desk/errors';
import { findDeskItemByCode } from '#server/services/desk/findDeskItemByCode';
import { OfficeNotOpenError } from '#server/services/offices/errors';
import { readOfficeFeed } from '#server/services/offices/readOfficeFeed';
import { placeOrder } from '#server/services/orders/placeOrder';
import { DriverAccountMissingError } from '#server/services/points/errors';
import { readOfficeShowcase } from '#server/services/products/readOfficeShowcase';
import { publishProduct } from '#server/services/products/publishProduct';
import { createProduct } from '#server/services/products/createProduct';
import {
  InvalidManualRewardError,
  RewardNotAwaitingError,
  RewardNotCancellableError,
  RewardStockShortError,
  UnknownRewardError,
} from '#server/services/rewards/errors';
import { GiftNotClaimableError } from '#server/services/gifts/errors';
import { creditDueGifts } from '#server/services/gifts/creditDueGifts';
import { claimGift } from '#server/services/gifts/creditGift';
import { cancelReward } from '#server/services/rewards/cancelReward';
import { grantGift } from '#server/services/gifts/grantGift';
import { readGiftGrant } from '#server/services/gifts/readGiftGrants';
import { expireRewards } from '#server/services/rewards/expireRewards';
import { grantManualReward } from '#server/services/rewards/grantManualReward';
import { issueOfficeReward } from '#server/services/rewards/issueOfficeReward';
import { readDriverRewards } from '#server/services/rewards/readDriverRewards';
import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { readRewardGrantOptions } from '#server/services/rewards/readRewardGrantOptions';
import { receiveStock } from '#server/services/stock/receiveStock';
import { calendarDayMoment, formatDayKey, formatDayMonthWord, shiftDayKey } from '#server/utils/parkTime';
import {
  cleanupTestData,
  countTransfersByReason,
  createTestOffice,
  createTestPerson,
  createTestProduct,
  disconnectDatabase,
  readAccountBalance,
  readStock,
  runRawQuery,
  setTestProductCost,
  trackTestProduct,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee, setTestProfilePhone } from '../support/employees';
import {
  backdateTestGift,
  expireTestGift,
  findGiftRewardId,
  readGift,
  readGiftGrantCounters,
} from '../support/gifts';
import { grantPoints } from '../support/points';
import { disconnectQueues } from '../support/queues';
import {
  backdateTestReward,
  countRewardsByPerson,
  expireTestReward,
  listRewardMovements,
  readReward,
  setTestRewardExpiry,
} from '../support/rewards';

/**
 * Награды (issue #172): рождение, выдача на стойке и сгорание — через сервисы, тем путём,
 * которым их зовут ручки и воркер.
 *
 * Два исключения из правила тестов сходятся здесь сразу (docs/infra.md → «Тесты»): награда
 * баллами — это перевод в журнал, то есть ядро начисления, а все запросы наград сырые, и типы
 * расхождения с базой не ловят. Каждый сырой запрос проходит здесь через свой сервис.
 */

const INVARIANTS_PATH = new URL('../../../scripts/invariants.sql', import.meta.url);

/** Запросы остатков из `scripts/invariants.sql` — тот же файл, что гоняет `make invariants`. */
const readStockInvariantQueries = (): string[] =>
  [...readFileSync(INVARIANTS_PATH, 'utf8').matchAll(/-- stock:begin \d+\n([\s\S]*?)\n-- stock:end/g)].map(
    (block) => block[1]!.trim(),
  );

const expectStockInvariantsHold = async (): Promise<void> => {
  for (const query of readStockInvariantQueries()) {
    expect(await runRawQuery(query)).toEqual([]);
  }
};

/** Привязки менеджеров к офисам, заведённые тестом. Уходят первыми: на них ссылаются обе стороны. */
const linkedEmployeeIds = new Set<string>();

/** Менеджер, привязанный к офису: стойка открыта ему только там. */
const createManager = async (officeId: string): Promise<string> => {
  const { employeeId } = await createTestEmployee({ role: 'manager' });

  await db.$executeRaw`
    INSERT INTO xb.employee_offices ("employee_id", "office_id")
    VALUES (${employeeId}::uuid, ${officeId}::uuid)
  `;
  linkedEmployeeIds.add(employeeId);

  return employeeId;
};

type Scenario = {
  personId: string;
  profileId: string;
  officeId: string;
  productId: string;
  employeeId: string;
};

/** Участник программы, офис, приз на полке — три штуки — и менеджер этого офиса. */
const prizeScenario = async (): Promise<Scenario> => {
  const person = await createTestPerson({ inProgram: true });
  const officeId = await createTestOffice();
  const productId = await createTestProduct({ pricePoints: null, promo: true, hiddenInCatalog: true });
  const employeeId = await createManager(officeId);

  // Счёт есть у каждого участника: без него награду вручить некуда.
  await grantPoints(person.personId, 1);
  await receiveStock({ officeId, productId, quantity: 3, employeeId });

  return { ...person, officeId, productId, employeeId };
};

/** Далёкий день «Забрать до»: награда ждёт, пока тест не сдвинет срок сам. */
const FAR_UNTIL_DATE = '2099-01-01';

/** Поля ручной выдачи без своего текста и обложек — то, что форма шлёт по умолчанию. */
const PLAIN_MESSAGE = {
  messageRu: '',
  messageUz: '',
  coverRu: null,
  coverUz: null,
  sendNow: false,
} as const;

const grantPrize = (scenario: Scenario, untilDate = FAR_UNTIL_DATE) =>
  grantManualReward({
    personId: scenario.personId,
    employeeId: scenario.employeeId,
    kind: 'product',
    productId: scenario.productId,
    title: null,
    officeId: scenario.officeId,
    untilDate,
    noteRu: 'за помощь новичкам',
    noteUz: 'yangi haydovchilarga yordam uchun',
    ...PLAIN_MESSAGE,
  });

const grantCustom = (scenario: Scenario, title: string) =>
  grantManualReward({
    personId: scenario.personId,
    employeeId: scenario.employeeId,
    kind: 'custom',
    productId: null,
    title,
    officeId: scenario.officeId,
    untilDate: FAR_UNTIL_DATE,
    noteRu: 'за стаж',
    noteUz: 'staj uchun',
    ...PLAIN_MESSAGE,
  });

const worker = (scenario: Scenario) => ({ employeeId: scenario.employeeId, role: 'manager' as const, isDemo: false });

describe('награды', () => {
  afterEach(async () => {
    const employeeIds = [...linkedEmployeeIds];
    linkedEmployeeIds.clear();

    if (employeeIds.length > 0) {
      await db.$executeRaw`
        DELETE FROM xb.employee_offices WHERE "employee_id" = ANY(${employeeIds}::uuid[])
      `;
    }

    await cleanupTestData();
    await cleanupTestEmployees();
  });
  afterAll(async () => {
    await disconnectDatabase();
    await disconnectQueues();
  });

  it('приз публикуется без цены в баллах, приходуется и на витрину не выходит', async () => {
    const officeId = await createTestOffice();
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const draft = await createProduct(
      {
        name: 'Термокружка',
        description: null,
        pricePoints: null,
        priceRetail: 60_000,
        priceCost: 45_000,
        promo: true,
        hiddenInCatalog: true,
      },
      false,
    );

    trackTestProduct(draft.productId);

    const published = await publishProduct(draft.productId);

    expect(published.publishedAt).not.toBeNull();
    expect(published.pricePoints).toBeNull();

    await receiveStock({ officeId, productId: draft.productId, quantity: 2, employeeId });

    const showcase = await readOfficeShowcase({ officeId, balance: 0n, isDemo: false });

    expect(showcase?.products.map((product) => product.productId)).not.toContain(draft.productId);
  });

  it('товар без цены на витрину не выходит и со снятым признаком «не показывать»', async () => {
    const officeId = await createTestOffice();
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const priceless = await createTestProduct({ pricePoints: null, promo: true });
    const hidden = await createTestProduct({ pricePoints: 10, hiddenInCatalog: true });
    const visible = await createTestProduct({ pricePoints: 10 });

    for (const productId of [priceless, hidden, visible]) {
      await receiveStock({ officeId, productId, quantity: 1, employeeId });
    }

    const showcase = await readOfficeShowcase({ officeId, balance: 0n, isDemo: false });

    expect(showcase?.products.map((product) => product.productId)).toEqual([visible]);
  });

  it('товар наградой: резерв в офисе, код из диапазона наград, у водителя «ждёт в офисе»', async () => {
    const scenario = await prizeScenario();

    const reward = await grantPrize(scenario);

    expect(reward.status).toBe('awaiting');
    expect(reward.code).toMatch(/^[5-9]\d{4}$/);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 2, reserved: 1 });
    expect(await listRewardMovements(reward.id)).toEqual([
      { kind: 'reward_reserve', deltaOnHand: -1, deltaReserved: 1 },
    ]);

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({
      rewardId: reward.id,
      status: 'awaiting',
      title: 'Тестовый товар',
      code: reward.code,
      office: { name: 'Тестовый офис' },
      originText: 'Вручил парк · за помощь новичкам',
      stateWord: 'Ждёт в офисе',
      reasonText: null,
    });
    // Срок — словом месяца: «до 5 октября».
    expect(rewards[0]?.stateHint).toMatch(/^до \d{1,2} [а-я]+$/);
    expect(rewards[0]?.claimHint).toMatch(/^заберите до \d{1,2} [а-я]+$/);
    expect(rewards[0]?.stateText).toMatch(/^Ждёт в офисе до \d{1,2} [а-я]+$/);

    // Лента офиса называет награду, которой вызвано движение.
    const feed = await readOfficeFeed(scenario.officeId, 10, 0);

    expect(feed.entries[0]).toMatchObject({
      type: 'movement',
      movement: { kind: 'reward_reserve', rewardTitle: 'Тестовый товар' },
    });

    await expectStockInvariantsHold();
  });

  it('награда-товар помнит себестоимость на момент вручения; у баллов и произвольной её нет (issue #372)', async () => {
    const scenario = await prizeScenario();

    const prize = await grantPrize(scenario);
    const custom = await grantCustom(scenario, 'Мойка салона');
    const { giftGrantId } = await grantGift({
      recipient: { kind: 'person', personId: scenario.personId },
      points: 100,
      reasonRu: 'компенсация',
      reasonUz: 'компенсация',
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: FAR_UNTIL_DATE,
      employeeId: scenario.employeeId,
    });
    const gift = await findGiftRewardId(giftGrantId, scenario.personId);

    // Приз без цены в баллах: себестоимость фикстуры — 5 × 800 сумов.
    expect((await readReward(prize.id))?.cost).toBe(4_000);

    await setTestProductCost(scenario.productId, 7_000);

    expect((await readReward(prize.id))?.cost).toBe(4_000);
    expect((await readReward(custom.id))?.cost).toBeNull();
    expect((await readReward(gift))?.cost).toBeNull();
  });

  it('свободного остатка нет — награда не заводится, ничего не записано', async () => {
    const scenario = await prizeScenario();

    await grantPrize(scenario);
    await grantPrize(scenario);
    await grantPrize(scenario);

    await expect(grantPrize(scenario)).rejects.toBeInstanceOf(RewardStockShortError);
    expect(await countRewardsByPerson(scenario.personId)).toBe(3);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 0, reserved: 3 });
  });

  it('стойка находит награду по коду в своём офисе: имя, позывной, телефон и почему', async () => {
    const scenario = await prizeScenario();

    await setTestProfilePhone(scenario.profileId, '+998901234567');

    const reward = await grantPrize(scenario);
    const found = await findDeskItemByCode(worker(scenario), scenario.officeId, reward.code ?? '');

    expect(found.kind).toBe('reward');
    expect(found.kind === 'reward' ? found.reward : null).toMatchObject({
      rewardId: reward.id,
      title: 'Тестовый товар',
      driverName: 'Тестов Тест',
      phone: '+998901234567',
      reasonText: 'Награда — вручную, за помощь новичкам',
      code: reward.code,
    });
  });

  it('код награды в другом офисе не находится, в чужой офис менеджера не пускают', async () => {
    const scenario = await prizeScenario();
    const reward = await grantPrize(scenario);
    const otherOffice = await createTestOffice();
    const stranger = { employeeId: await createManager(otherOffice), role: 'manager' as const, isDemo: false };

    await expect(
      findDeskItemByCode(stranger, otherOffice, reward.code ?? ''),
    ).rejects.toBeInstanceOf(DeskCodeNotFoundError);
    await expect(
      findDeskItemByCode(stranger, scenario.officeId, reward.code ?? ''),
    ).rejects.toBeInstanceOf(OfficeNotOpenError);
    await expect(issueOfficeReward(stranger, reward.id)).rejects.toBeInstanceOf(OfficeNotOpenError);
    expect((await readReward(reward.id))?.status).toBe('awaiting');
  });

  it('выдача: «получена», резерв снят, свободный не тронут; второе нажатие ничего не делает', async () => {
    const scenario = await prizeScenario();
    const reward = await grantPrize(scenario);

    const results = await Promise.allSettled([
      issueOfficeReward(worker(scenario), reward.id),
      issueOfficeReward(worker(scenario), reward.id),
    ]);

    const rejected = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(RewardNotAwaitingError);
    expect((rejected[0] as RewardNotAwaitingError).status).toBe('issued');

    expect(await readReward(reward.id)).toMatchObject({
      status: 'issued',
      issuedByEmployeeId: scenario.employeeId,
    });
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 2, reserved: 0 });
    expect(await listRewardMovements(reward.id)).toEqual([
      { kind: 'reward_reserve', deltaOnHand: -1, deltaReserved: 1 },
      { kind: 'reward_issue', deltaOnHand: 0, deltaReserved: -1 },
    ]);

    // Код освободился: по нему больше не находится ничего.
    await expect(
      findDeskItemByCode(worker(scenario), scenario.officeId, reward.code ?? ''),
    ).rejects.toBeInstanceOf(DeskCodeNotFoundError);

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards[0]).toMatchObject({
      status: 'issued',
      code: null,
      office: { name: 'Тестовый офис' },
      stateWord: 'Получена',
      claimHint: null,
    });
    expect(rewards[0]?.stateHint).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
    expect(rewards[0]?.stateText).toMatch(/^Получена · \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);

    await expectStockInvariantsHold();
  });

  it('раздел водителя: ждущие первыми, дальше по последнему событию — выданная позже вручения выше вручённой между ними', async () => {
    const scenario = await prizeScenario();
    const waiting = await grantCustom(scenario, 'Мойка');
    const prize = await grantPrize(scenario);
    const { giftGrantId } = await grantGift({
      recipient: { kind: 'person', personId: scenario.personId },
      points: 100,
      reasonRu: 'компенсация',
      reasonUz: 'компенсация',
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: '2099-01-01',
      employeeId: scenario.employeeId,
    });
    const points = { id: await findGiftRewardId(giftGrantId, scenario.personId) };

    await claimGift(points.id, scenario.personId);

    // Вручены по порядку: ждущая три дня назад, приз два дня назад, подарок вчера и вчера же
    // забран. Приз выдан сейчас.
    await backdateTestReward(waiting.id, 72);
    await backdateTestReward(prize.id, 48);
    await backdateTestGift(points.id, 24);
    await issueOfficeReward(worker(scenario), prize.id);

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards.map((reward) => reward.rewardId)).toEqual([waiting.id, prize.id, points.id]);
    expect(rewards.map((reward) => reward.status)).toEqual(['awaiting', 'issued', 'credited']);

    // Карточка водителя в админке сортируется по-прежнему: ждущие, дальше по вручению.
    const { rewards: driverRewards } = await readDriverRewards(scenario.personId);

    expect(driverRewards.map((reward) => reward.rewardId)).toEqual([waiting.id, points.id, prize.id]);
  });

  it('баллы ручной выдачей не вручаются: только подарком (issue #219)', async () => {
    const scenario = await prizeScenario();
    const balanceBefore = await readAccountBalance(scenario.personId);
    const manualBefore = await countTransfersByReason(scenario.personId, 'manual');

    await expect(
      grantManualReward({
        personId: scenario.personId,
        employeeId: scenario.employeeId,
        kind: 'points',
        productId: null,
        title: null,
        officeId: null,
        untilDate: FAR_UNTIL_DATE,
        noteRu: 'компенсация',
        noteUz: 'kompensatsiya',
        ...PLAIN_MESSAGE,
      }),
    ).rejects.toMatchObject({ problem: 'points_via_gift' });

    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore);
    expect(await countTransfersByReason(scenario.personId, 'manual')).toBe(manualBefore);
    expect(await countRewardsByPerson(scenario.personId)).toBe(0);
  });

  it('человеку вне программы награда не вручается', async () => {
    const person = await createTestPerson({ inProgram: false });
    const officeId = await createTestOffice();
    const { employeeId } = await createTestEmployee({ role: 'owner' });

    await expect(
      grantManualReward({
        personId: person.personId,
        employeeId,
        kind: 'custom',
        productId: null,
        title: 'Сертификат на мойку',
        officeId,
        untilDate: FAR_UNTIL_DATE,
        noteRu: 'за стаж',
        noteUz: 'staj uchun',
        ...PLAIN_MESSAGE,
      }),
    ).rejects.toBeInstanceOf(DriverAccountMissingError);
    expect(await countRewardsByPerson(person.personId)).toBe(0);
  });

  it('отказы: «Забрать до» — не раньше завтра, «Почему» на обоих языках, текст влезает в сообщение', async () => {
    const scenario = await prizeScenario();
    const today = formatDayKey(new Date());
    const custom = (fields: Partial<Parameters<typeof grantManualReward>[0]>) =>
      grantManualReward({
        personId: scenario.personId,
        employeeId: scenario.employeeId,
        kind: 'custom',
        productId: null,
        title: 'Мойка',
        officeId: scenario.officeId,
        untilDate: FAR_UNTIL_DATE,
        noteRu: 'за стаж',
        noteUz: 'staj uchun',
        ...PLAIN_MESSAGE,
        ...fields,
      });

    await expect(grantPrize(scenario, today)).rejects.toMatchObject({ problem: 'until_date_too_early' });
    await expect(grantPrize(scenario, '')).rejects.toMatchObject({ problem: 'until_date_invalid' });
    await expect(custom({ noteRu: '   ' })).rejects.toMatchObject({ problem: 'note_ru_missing' });
    await expect(custom({ noteUz: '' })).rejects.toMatchObject({ problem: 'note_uz_missing' });
    await expect(custom({ noteRu: 'а'.repeat(61) })).rejects.toMatchObject({ problem: 'note_ru_too_long' });
    await expect(custom({ noteUz: 'a'.repeat(61) })).rejects.toMatchObject({ problem: 'note_uz_too_long' });
    await expect(custom({ messageUz: 'a'.repeat(5_000) })).rejects.toMatchObject({
      problem: 'message_uz_too_long',
    });
    await expect(
      custom({ coverRu: { contentType: 'image/jpeg', bytes: Buffer.from('jpeg') } }),
    ).rejects.toBeInstanceOf(InvalidGiftGrantError);
    await expect(custom({ kind: 'custom', title: '  ' })).rejects.toBeInstanceOf(InvalidManualRewardError);
    expect(await countRewardsByPerson(scenario.personId)).toBe(0);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 3, reserved: 0 });
  });

  it('«Забрать до» завтра — награда сгорает в 00:00 послезавтра по Ташкенту, водитель видит завтрашний день', async () => {
    const scenario = await prizeScenario();
    const tomorrow = shiftDayKey(formatDayKey(new Date()), 1);
    const reward = await grantPrize(scenario, tomorrow);

    expect(reward.expiresAt?.toISOString()).toBe(
      new Date(`${shiftDayKey(tomorrow, 1)}T00:00:00+05:00`).toISOString(),
    );

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const day = formatDayMonthWord(calendarDayMoment(tomorrow), 'ru');

    expect(rewards[0]).toMatchObject({
      rewardId: reward.id,
      stateHint: `до ${day}`,
      claimHint: `заберите до ${day}`,
      stateText: `Ждёт в офисе до ${day}`,
    });
  });

  it('выданная до календарных суток — срок 05:00 остаётся, водитель видит тот же день', async () => {
    const scenario = await prizeScenario();
    const tomorrow = shiftDayKey(formatDayKey(new Date()), 1);
    const reward = await grantPrize(scenario, tomorrow);

    await setTestRewardExpiry(reward.id, new Date(`${shiftDayKey(tomorrow, 1)}T05:00:00+05:00`));

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards[0]?.stateHint).toBe(`до ${formatDayMonthWord(calendarDayMoment(tomorrow), 'ru')}`);
  });

  it('«Почему» — водителю на его языке, стойке — русское', async () => {
    const scenario = await prizeScenario();
    const reward = await grantPrize(scenario);

    const russian = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const uzbek = await readMemberRewards({ personId: scenario.personId, language: 'uz' });

    expect(russian.rewards[0]?.originText).toBe('Вручил парк · за помощь новичкам');
    expect(uzbek.rewards[0]?.originText).toBe('Park tomonidan berildi · yangi haydovchilarga yordam uchun');
    expect(uzbek.sheetRewards[0]?.reasonText).toBe('Xalq Taxi · yangi haydovchilarga yordam uchun');

    const found = await findDeskItemByCode(worker(scenario), scenario.officeId, reward.code ?? '');

    expect(found.kind === 'reward' ? found.reward.reasonText : null).toBe('Награда — вручную, за помощь новичкам');
  });

  it('шторка: ручная награда до отметки «видел», потом только в разделе; чужая отметка не ставится', async () => {
    const scenario = await prizeScenario();
    const stranger = await prizeScenario();
    const tomorrow = shiftDayKey(formatDayKey(new Date()), 1);
    const reward = await grantPrize(scenario, tomorrow);
    const foreign = await grantPrize(stranger);

    const before = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(before.sheetRewards).toEqual([
      {
        rewardId: reward.id,
        title: 'Тестовый товар',
        reasonText: 'Xalq Taxi · за помощь новичкам',
        deadlineText: `Заберите в офисе Тестовый офис до ${formatDayMonthWord(calendarDayMoment(tomorrow), 'ru')}`,
        coverUrl: null,
      },
    ]);
    expect(before.giftsUnseen).toBe(false);

    await markGiftsShown(scenario.personId, [reward.id, foreign.id]);

    const after = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(after.sheetRewards).toEqual([]);
    expect(after.rewards.map((entry) => entry.rewardId)).toEqual([reward.id]);
    expect((await readMemberRewards({ personId: stranger.personId, language: 'ru' })).sheetRewards).toHaveLength(1);

    // Выданная у стойки в шторку не попадает, даже если водитель её не видел.
    const issued = await grantPrize(stranger);

    await issueOfficeReward(worker(stranger), issued.id);

    expect(
      (await readMemberRewards({ personId: stranger.personId, language: 'ru' })).sheetRewards.map(
        (entry) => entry.rewardId,
      ),
    ).toEqual([foreign.id]);
  });

  it('просроченная сгорает, товар возвращается на полку; выданную сгорание не трогает', async () => {
    const scenario = await prizeScenario();
    const forgotten = await grantPrize(scenario);
    const taken = await grantPrize(scenario);
    const fresh = await grantPrize(scenario);

    await issueOfficeReward(worker(scenario), taken.id);
    await expireTestReward(forgotten.id);
    await expireTestReward(taken.id);

    const summary = await expireRewards();

    expect(summary).toMatchObject({ expired: 1, failed: 0 });
    expect((await readReward(forgotten.id))?.status).toBe('expired');
    expect((await readReward(taken.id))?.status).toBe('issued');
    expect((await readReward(fresh.id))?.status).toBe('awaiting');
    expect(await listRewardMovements(forgotten.id)).toEqual([
      { kind: 'reward_reserve', deltaOnHand: -1, deltaReserved: 1 },
      { kind: 'reward_release', deltaOnHand: 1, deltaReserved: -1 },
    ]);
    // Три пришло: одна выдана, одна ждёт, одна вернулась на полку.
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 1, reserved: 1 });

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const expired = rewards.find((reward) => reward.rewardId === forgotten.id);

    expect(expired).toMatchObject({
      stateWord: 'Срок вышел',
      reasonText: 'Не забрали в офисе до срока',
      reasonTextFull: 'Не забрали в офисе до срока — награда сгорела',
    });
    expect(expired?.stateText).toMatch(/^Срок вышел · \d{2}\.\d{2}\.\d{4}$/);
    expect(expired?.code).toBeNull();

    await expectStockInvariantsHold();
  });

  it('код заказа и код награды разведены первой цифрой, и стойка отвечает каждым своим', async () => {
    const scenario = await prizeScenario();
    const productId = await createTestProduct({ pricePoints: 10 });

    await grantPoints(scenario.personId, 100);
    await receiveStock({ officeId: scenario.officeId, productId, quantity: 1, employeeId: scenario.employeeId });

    const order = await placeOrder({
      personId: scenario.personId,
      officeId: scenario.officeId,
      items: [{ productId, quantity: 1 }],
      actor: 'mini_app',
      driverIsDemo: false,
    });
    const reward = await grantPrize(scenario);

    expect(order.code).toMatch(/^[0-4]\d{4}$/);
    expect(reward.code).toMatch(/^[5-9]\d{4}$/);
    expect((await findDeskItemByCode(worker(scenario), scenario.officeId, order.code)).kind).toBe('order');
    expect((await findDeskItemByCode(worker(scenario), scenario.officeId, reward.code ?? '')).kind).toBe(
      'reward',
    );
  });

  it('в форме выдачи — рабочие офисы и опубликованные товары, призы первыми', async () => {
    const officeId = await createTestOffice();
    const archivedOffice = await createTestOffice({ archived: true });
    const plain = await createTestProduct({ pricePoints: 10 });
    const prize = await createTestProduct({ pricePoints: null, promo: true });
    const archived = await createTestProduct({ pricePoints: 10, archived: true });

    const options = await readRewardGrantOptions({ isDemo: false });
    const officeIds = options.offices.map((office) => office.officeId);
    const productIds = options.products.map((product) => product.productId);

    expect(officeIds).toContain(officeId);
    expect(officeIds).not.toContain(archivedOffice);
    expect(productIds).toContain(prize);
    expect(productIds).not.toContain(archived);
    expect(productIds.indexOf(prize)).toBeLessThan(productIds.indexOf(plain));
  });

  it('карточка водителя: ждущие сверху, код только у ждущей, автор и выдавший по именам', async () => {
    const scenario = await prizeScenario();
    const waiting = await grantPrize(scenario);
    const taken = await grantPrize(scenario);
    const burnt = await grantCustom(scenario, 'Сертификат на мойку');

    await issueOfficeReward(worker(scenario), taken.id);
    await expireTestReward(burnt.id);
    await expireRewards();

    const { rewards } = await readDriverRewards(scenario.personId);

    // Ждущая вручена первой, но стоит сверху: за ней водитель придёт.
    expect(rewards.map((reward) => reward.rewardId)).toEqual([waiting.id, burnt.id, taken.id]);
    expect(rewards[0]).toMatchObject({
      status: 'awaiting',
      code: waiting.code,
      officeName: 'Тестовый офис',
      source: 'manual',
      sourceNote: 'за помощь новичкам',
    });
    expect(rewards[0]?.expiresAt).not.toBeNull();
    expect(rewards[0]?.grantedByName).not.toBeNull();
    expect(rewards[1]).toMatchObject({ status: 'expired', code: null });
    expect(rewards[1]?.expiredAt).not.toBeNull();
    expect(rewards[2]).toMatchObject({ status: 'issued', code: null });
    expect(rewards[2]?.issuedAt).not.toBeNull();
    expect(rewards[2]?.issuedByName).toBe(rewards[0]?.grantedByName);
  });

  it('лента офиса: события своей награды рядом с движениями, у товара — только движения', async () => {
    const scenario = await prizeScenario();
    const prize = await grantPrize(scenario);
    const handed = await grantCustom(scenario, 'Сертификат на мойку');
    const burnt = await grantCustom(scenario, 'Кепка парка');

    await issueOfficeReward(worker(scenario), prize.id);
    await issueOfficeReward(worker(scenario), handed.id);
    await expireTestReward(burnt.id);
    await expireRewards();

    const feed = await readOfficeFeed(scenario.officeId, 100, 0);
    const rewardEvents = feed.entries.flatMap((entry) =>
      entry.type === 'reward' ? [`${entry.reward.rewardTitle}:${entry.reward.event}`] : [],
    );
    const movementKinds = feed.entries.flatMap((entry) =>
      entry.type === 'movement' ? [entry.movement.kind] : [],
    );

    expect(rewardEvents.sort()).toEqual([
      'Кепка парка:expired',
      'Кепка парка:granted',
      'Сертификат на мойку:granted',
      'Сертификат на мойку:issued',
    ]);
    // Награда-товар — одна строка на событие: движения, и ни одной строки события.
    expect(movementKinds.sort()).toEqual(['incoming', 'reward_issue', 'reward_reserve']);
    expect(feed.total).toBe(feed.entries.length);

    // По времени, новыми вперёд: выдача своей награды стоит выше её вручения.
    const moments = feed.entries.map((entry) =>
      Date.parse(entry.type === 'movement' ? entry.movement.createdAt : entry.reward.createdAt),
    );

    expect(moments).toEqual([...moments].sort((left, right) => right - left));

    const issued = feed.entries.find(
      (entry) =>
        entry.type === 'reward' && entry.reward.rewardId === handed.id && entry.reward.event === 'issued',
    );

    expect(issued).toMatchObject({ reward: { employeeName: expect.any(String), note: null } });

    // Листание общее: вторая страница продолжает первую без повторов и пропусков.
    const firstPage = await readOfficeFeed(scenario.officeId, 4, 0);
    const secondPage = await readOfficeFeed(scenario.officeId, 4, 4);

    expect([...firstPage.entries, ...secondPage.entries]).toEqual(feed.entries);
  });

  it('отмена товара: штука возвращается в остаток, у водителя «Отменена» без причины, повторная не проходит (issue #270)', async () => {
    const scenario = await prizeScenario();
    const prize = await grantPrize(scenario);
    const { employeeId: ownerId } = await createTestEmployee({ role: 'owner' });
    const actor = { employeeId: ownerId, role: 'owner' as const };

    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 2, reserved: 1 });

    const cancelled = await cancelReward({ actor, personId: scenario.personId, rewardId: prize.id });

    expect(cancelled).toMatchObject({
      rewardId: prize.id,
      status: 'cancelled',
      code: null,
      cancelledAt: expect.any(String),
      cancelledByName: expect.any(String),
    });
    expect(await listRewardMovements(prize.id)).toEqual([
      { kind: 'reward_reserve', deltaOnHand: -1, deltaReserved: 1 },
      { kind: 'reward_release', deltaOnHand: 1, deltaReserved: -1 },
    ]);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 3, reserved: 0 });

    // Водитель видит её как сгоревшую, другим словом и без строки-причины; кода нет.
    const { rewards, sheetRewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });
    const shown = rewards.find((reward) => reward.rewardId === prize.id);

    expect(shown).toMatchObject({ status: 'cancelled', stateWord: 'Отменена', reasonText: null, reasonTextFull: null, code: null });
    expect(shown?.stateText).toMatch(/^Отменена · \d{2}\.\d{2}\.\d{4}$/);
    expect(sheetRewards.map((reward) => reward.rewardId)).not.toContain(prize.id);

    const { rewards: uzRewards } = await readMemberRewards({ personId: scenario.personId, language: 'uz' });

    expect(uzRewards.find((reward) => reward.rewardId === prize.id)?.stateWord).toBe('Bekor qilindi');

    // Повтор — штатный отказ, остаток второй раз не растёт.
    await expect(
      cancelReward({ actor, personId: scenario.personId, rewardId: prize.id }),
    ).rejects.toBeInstanceOf(RewardNotCancellableError);
    expect(await readStock(scenario.officeId, scenario.productId)).toEqual({ onHand: 3, reserved: 0 });

    // Стойка: код не находится, выдача по открытой награде не проходит.
    await expect(
      findDeskItemByCode(worker(scenario), scenario.officeId, prize.code ?? ''),
    ).rejects.toBeInstanceOf(DeskCodeNotFoundError);
    await expect(issueOfficeReward(worker(scenario), prize.id)).rejects.toBeInstanceOf(RewardNotAwaitingError);

    // Лента офиса: возврат штуки подписан отменой, а не сгоранием, и несёт отменившего.
    const feed = await readOfficeFeed(scenario.officeId, 100, 0);
    const release = feed.entries.find(
      (entry) => entry.type === 'movement' && entry.movement.kind === 'reward_release',
    );

    expect(release).toMatchObject({ movement: { rewardCancelled: true, employeeName: expect.any(String) } });

    await expectStockInvariantsHold();
  });

  it('отмена подарка: журнал не пишется, баланс не меняется, по сроку не зачисляется (issue #270)', async () => {
    const scenario = await prizeScenario();
    const { giftGrantId } = await grantGift({
      recipient: { kind: 'person', personId: scenario.personId },
      points: 100,
      reasonRu: 'компенсация',
      reasonUz: 'компенсация',
      messageRu: '',
      messageUz: '',
      coverRu: null,
      coverUz: null,
      sendNow: false,
      untilDate: FAR_UNTIL_DATE,
      employeeId: scenario.employeeId,
    });
    const gift = await findGiftRewardId(giftGrantId, scenario.personId);
    const balanceBefore = await readAccountBalance(scenario.personId);
    const campaignTransfersBefore = await countTransfersByReason(scenario.personId, 'campaign');
    const grantBefore = await readGiftGrant(giftGrantId);

    const cancelled = await cancelReward({
      actor: { employeeId: scenario.employeeId, role: 'senior_manager' },
      personId: scenario.personId,
      rewardId: gift,
    });

    expect(cancelled.status).toBe('cancelled');
    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore);

    // Таблица раздач: из «ждут» в «отменено», и исходы снова складываются в число наград раздачи.
    const grantAfter = await readGiftGrant(giftGrantId);

    expect(grantAfter?.waiting).toBe((grantBefore?.waiting ?? 0) - 1);
    expect(grantAfter?.cancelled).toBe((grantBefore?.cancelled ?? 0) + 1);
    expect(
      (grantAfter?.claimedByDriver ?? 0) +
        (grantAfter?.creditedAuto ?? 0) +
        (grantAfter?.waiting ?? 0) +
        (grantAfter?.cancelled ?? 0),
    ).toBe((await readGiftGrantCounters(giftGrantId))?.rewards);
    expect(await countTransfersByReason(scenario.personId, 'campaign')).toBe(campaignTransfersBefore);

    const { gifts, rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(gifts.map((item) => item.rewardId)).not.toContain(gift);
    expect(rewards.find((reward) => reward.rewardId === gift)?.stateWord).toBe('Отменена');

    // Наступил день раздачи — зачислять нечего.
    await expireTestGift(gift);
    await creditDueGifts();

    expect((await readGift(gift))?.status).toBe('cancelled');
    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore);
    expect(await countTransfersByReason(scenario.personId, 'campaign')).toBe(campaignTransfersBefore);
    await expect(claimGift(gift, scenario.personId)).rejects.toBeInstanceOf(GiftNotClaimableError);
  });

  it('отмена: чужая награда — «нет», выданная — «не отменить»; своя награда в ленте офиса — событием (issue #270)', async () => {
    const scenario = await prizeScenario();
    const stranger = await createTestPerson({ inProgram: true });
    const handed = await grantPrize(scenario);
    const custom = await grantCustom(scenario, 'Сертификат на мойку');
    const actor = { employeeId: scenario.employeeId, role: 'admin' as const };

    await issueOfficeReward(worker(scenario), handed.id);

    await expect(
      cancelReward({ actor, personId: stranger.personId, rewardId: custom.id }),
    ).rejects.toBeInstanceOf(UnknownRewardError);
    expect((await readReward(custom.id))?.status).toBe('awaiting');

    await expect(
      cancelReward({ actor, personId: scenario.personId, rewardId: handed.id }),
    ).rejects.toBeInstanceOf(RewardNotCancellableError);
    expect((await readReward(handed.id))?.status).toBe('issued');

    await cancelReward({ actor, personId: scenario.personId, rewardId: custom.id });

    const { rewards } = await readDriverRewards(scenario.personId);

    expect(rewards.find((reward) => reward.rewardId === custom.id)).toMatchObject({
      status: 'cancelled',
      code: null,
      cancelledByName: expect.any(String),
    });

    const feed = await readOfficeFeed(scenario.officeId, 100, 0);
    const events = feed.entries.flatMap((entry) =>
      entry.type === 'reward' && entry.reward.rewardId === custom.id ? [entry.reward.event] : [],
    );

    expect(events.sort()).toEqual(['cancelled', 'granted']);
    expect(feed.total).toBe(feed.entries.length);

    await expectStockInvariantsHold();
  });
});

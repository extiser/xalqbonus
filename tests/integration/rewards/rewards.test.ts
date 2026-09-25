import { readFileSync } from 'node:fs';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { db } from '#server/db';
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
  RewardStockShortError,
} from '#server/services/rewards/errors';
import { expireRewards } from '#server/services/rewards/expireRewards';
import { grantManualReward } from '#server/services/rewards/grantManualReward';
import { issueOfficeReward } from '#server/services/rewards/issueOfficeReward';
import { readDriverRewards } from '#server/services/rewards/readDriverRewards';
import { readMemberRewards } from '#server/services/rewards/readMemberRewards';
import { readRewardGrantOptions } from '#server/services/rewards/readRewardGrantOptions';
import { receiveStock } from '#server/services/stock/receiveStock';
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
  trackTestProduct,
} from '../support/database';
import { cleanupTestEmployees, createTestEmployee, setTestProfilePhone } from '../support/employees';
import { grantPoints } from '../support/points';
import {
  backdateTestReward,
  countRewardsByPerson,
  expireTestReward,
  listRewardMovements,
  readReward,
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

const grantPrize = (scenario: Scenario, lifetimeDays = 7) =>
  grantManualReward({
    personId: scenario.personId,
    employeeId: scenario.employeeId,
    kind: 'product',
    points: null,
    productId: scenario.productId,
    title: null,
    officeId: scenario.officeId,
    lifetimeDays,
    note: 'за помощь новичкам',
  });

const grantCustom = (scenario: Scenario, title: string) =>
  grantManualReward({
    personId: scenario.personId,
    employeeId: scenario.employeeId,
    kind: 'custom',
    points: null,
    productId: null,
    title,
    officeId: scenario.officeId,
    lifetimeDays: 7,
    note: 'за стаж',
  });

const worker = (scenario: Scenario) => ({ employeeId: scenario.employeeId, role: 'manager' as const });

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
  afterAll(disconnectDatabase);

  it('приз публикуется без цены в баллах, приходуется и на витрину не выходит', async () => {
    const officeId = await createTestOffice();
    const { employeeId } = await createTestEmployee({ role: 'owner' });
    const draft = await createProduct({
      name: 'Термокружка',
      description: null,
      pricePoints: null,
      priceRetail: 60_000,
      priceCost: 45_000,
      promo: true,
      hiddenInCatalog: true,
    });

    trackTestProduct(draft.productId);

    const published = await publishProduct(draft.productId);

    expect(published.publishedAt).not.toBeNull();
    expect(published.pricePoints).toBeNull();

    await receiveStock({ officeId, productId: draft.productId, quantity: 2, employeeId });

    const showcase = await readOfficeShowcase({ officeId, balance: 0n });

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

    const showcase = await readOfficeShowcase({ officeId, balance: 0n });

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
    const stranger = { employeeId: await createManager(otherOffice), role: 'manager' as const };

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
    const points = await grantManualReward({
      personId: scenario.personId,
      employeeId: scenario.employeeId,
      kind: 'points',
      points: 100,
      productId: null,
      title: null,
      officeId: null,
      lifetimeDays: null,
      note: 'компенсация',
    });

    // Вручены по порядку: ждущая три дня назад, приз два дня назад, баллы вчера. Приз выдан сейчас.
    await backdateTestReward(waiting.id, 72);
    await backdateTestReward(prize.id, 48);
    await backdateTestReward(points.id, 24);
    await issueOfficeReward(worker(scenario), prize.id);

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards.map((reward) => reward.rewardId)).toEqual([waiting.id, prize.id, points.id]);
    expect(rewards.map((reward) => reward.status)).toEqual(['awaiting', 'issued', 'credited']);

    // Карточка водителя в админке сортируется по-прежнему: ждущие, дальше по вручению.
    const { rewards: driverRewards } = await readDriverRewards(scenario.personId);

    expect(driverRewards.map((reward) => reward.rewardId)).toEqual([waiting.id, points.id, prize.id]);
  });

  it('баллы наградой: на балансе, строка ручной правки в журнале, без кода и офиса', async () => {
    const scenario = await prizeScenario();
    const balanceBefore = await readAccountBalance(scenario.personId);
    const manualBefore = await countTransfersByReason(scenario.personId, 'manual');

    const reward = await grantManualReward({
      personId: scenario.personId,
      employeeId: scenario.employeeId,
      kind: 'points',
      points: 300,
      productId: null,
      title: null,
      officeId: null,
      lifetimeDays: null,
      note: 'компенсация',
    });

    expect(reward).toMatchObject({ status: 'credited', code: null, officeId: null });
    expect(await readAccountBalance(scenario.personId)).toBe(balanceBefore + 300n);
    expect(await countTransfersByReason(scenario.personId, 'manual')).toBe(manualBefore + 1);

    const { rewards } = await readMemberRewards({ personId: scenario.personId, language: 'ru' });

    expect(rewards[0]).toMatchObject({
      title: '300 баллов',
      status: 'credited',
      stateWord: 'На балансе',
      code: null,
      office: null,
      photoPath: null,
      pricePoints: null,
    });
    expect(rewards[0]?.stateText).toMatch(/^На балансе · \d{2}\.\d{2}\.\d{4}$/);
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
        points: null,
        productId: null,
        title: 'Сертификат на мойку',
        officeId,
        lifetimeDays: 7,
        note: 'за стаж',
      }),
    ).rejects.toBeInstanceOf(DriverAccountMissingError);
    expect(await countRewardsByPerson(person.personId)).toBe(0);
  });

  it('у товара и своей награды срок обязателен, пояснение — у всех', async () => {
    const scenario = await prizeScenario();

    await expect(grantPrize(scenario, 0)).rejects.toMatchObject({ problem: 'lifetime_invalid' });
    await expect(
      grantManualReward({
        personId: scenario.personId,
        employeeId: scenario.employeeId,
        kind: 'points',
        points: 10,
        productId: null,
        title: null,
        officeId: null,
        lifetimeDays: null,
        note: '   ',
      }),
    ).rejects.toBeInstanceOf(InvalidManualRewardError);
    expect(await countRewardsByPerson(scenario.personId)).toBe(0);
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

    const options = await readRewardGrantOptions();
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
});

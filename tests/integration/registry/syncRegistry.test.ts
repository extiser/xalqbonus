import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { runRegistrySync } from '#server/services/sync/syncRegistry';
import { disconnectDatabase, readSyncRuns, readSyncWatermark } from '../support/database';
import { createFailingFleet, createFakeFleet } from '../support/fleetProfiles';
import {
  buildRawProfile,
  countPersons,
  createPersonWithLicense,
  insertUnknownProfileSkip,
  readLicenses,
  readParkProfile,
  readPhones,
  readSkips,
  readStatusEvents,
  readSyncRunRegistry,
  resetRegistryData,
  TEST_PROFILE_PREFIX,
} from '../support/registry';

/**
 * Прогон синхронизации профилей против настоящей базы и поддельного транспорта.
 *
 * Сеть подменена, база настоящая — именно в базе живут частичные уникальные индексы
 * на активное удостоверение и активный телефон, внешние ключи журналов и всё остальное,
 * на чём держится реестр.
 */

// Настройки окна фиксируются тестом: иначе ожидаемые границы зависели бы от `.env`
// той машины, где прогоняются тесты.
process.env['SYNC_REGISTRY_OVERLAP_MIN'] = '60';
process.env['SYNC_REGISTRY_LAG_SEC'] = '60';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const LAG_MS = 60_000;
const OVERLAP_MS = 60 * 60_000;

const profileId = (suffix: string): string => `${TEST_PROFILE_PREFIX}${suffix}`;

afterEach(async () => {
  await resetRegistryData();
});

afterAll(async () => {
  await disconnectDatabase();
});

describe('инкрементальная синхронизация профилей', () => {
  it('заводит новый профиль вместе с человеком и двигает отметку по верхней границе окна', async () => {
    const id = profileId('new');

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([buildRawProfile({ profileId: id, licenseNumber: 'AA1112223' })]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.profilesInserted).toBe(1);
    expect(summary.profilesUpdated).toBe(0);
    expect(summary.personsCreated).toBe(1);

    const profile = await readParkProfile(id);
    expect(profile?.workStatus).toBe('working');

    // Первая запись журнала трудоустройства: откуда профиль пришёл, парк не рассказывает.
    expect(await readStatusEvents(id)).toEqual([
      { statusFrom: null, statusTo: 'working', syncRunId: summary.runId },
    ]);

    expect(await readPhones(id)).toEqual([
      { phoneRaw: '+998901234567', phoneE164: '+998901234567', closedAt: null },
    ]);

    // Отметка по верхней границе окна, а не по времени последнего увиденного профиля.
    expect((await readSyncWatermark('registry'))?.toISOString()).toBe(
      new Date(NOW.getTime() - LAG_MS).toISOString(),
    );
  });

  it('журнал прогона показывает окно, которое спрашивали у API, а не время прогона', async () => {
    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: profileId('window'), licenseNumber: 'AA1717171' }),
      ]),
    });

    const runs = await readSyncRuns('registry');

    // Верхняя граница окна отстаёт от «сейчас» на величину лага, и отметка встаёт на неё же.
    // Если в журнал писать время прогона, `window_to` разойдётся с отметкой на этот лаг,
    // и по журналу будет непонятно, за какой отрезок мы на самом деле видели парк.
    expect(runs[0]?.windowTo?.toISOString()).toBe(new Date(NOW.getTime() - LAG_MS).toISOString());
    expect(runs[0]?.windowTo?.toISOString()).toBe(summary.watermark?.toISOString());
    expect(runs[0]?.windowFrom?.toISOString()).toBe(summary.window?.updatedFrom.toISOString());
  });

  it('телефон открывается любому профилю с номером, а не только работающему', async () => {
    // Fleet API телефонов уволенных не отдаёт вовсе — в выгрузке 27.08.2026 номер есть
    // у всех 22 884 работающих и ни у одного из 2 392 уволенных и 114 неработающих.
    // Это свойство их данных, и нашего фильтра по статусу здесь нет и быть не должно:
    // появись у уволенного номер, он обязан открыться строкой.
    const fired = profileId('fired-with-phone');

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({
          profileId: fired,
          licenseNumber: 'AA1818181',
          workStatus: 'fired',
          phones: ['+998903333333'],
        }),
      ]),
    });

    expect(summary.phonesOpened).toBe(1);
    expect(await readPhones(fired)).toEqual([
      { phoneRaw: '+998903333333', phoneE164: '+998903333333', closedAt: null },
    ]);
  });

  it('новый профиль с номером существующего человека не создаёт второго человека', async () => {
    // Человек уже известен по номеру ВУ — так его завёл перенос реестра. В парке его
    // переоформили: тот же человек, новый `profile_id`. Ровно эти четыре пары двойников
    // из двенадцати не ловятся ни телефоном, ни профилем (docs/drivers.md).
    const personId = await createPersonWithLicense('AA9998887');
    const personsBefore = await countPersons();

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: profileId('reissued'), licenseNumber: 'UZAA9998887' }),
      ]),
    });

    expect(summary.personsCreated).toBe(0);
    expect(await countPersons()).toBe(personsBefore);

    // Номер пришёл в другом написании — с префиксом страны. Канонический вид тот же,
    // и человек обязан найтись: в реестре один номер лежит в двух написаниях.
    const profile = await readParkProfile(profileId('reissued'));
    expect(profile?.personId).toBe(personId);

    // Журнал удостоверений не тронут: номер тот же, менять нечего.
    const licenses = await readLicenses(personId);
    expect(licenses).toHaveLength(1);
    expect(licenses[0]?.closedAt).toBeNull();
  });

  it('смена статуса работы пишет строку журнала, повтор того же окна второй не создаёт', async () => {
    const id = profileId('fired');

    await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: id, licenseNumber: 'AA2223334', workStatus: 'working' }),
      ]),
    });

    const fired = buildRawProfile({
      profileId: id,
      licenseNumber: 'AA2223334',
      workStatus: 'fired',
      updatedAt: '2026-08-28T11:30:00+00:00',
    });

    const second = await runRegistrySync('registry', {
      now: new Date(NOW.getTime() + 60_000),
      client: createFakeFleet([fired]),
    });

    expect(second.profilesInserted).toBe(0);
    expect(second.profilesUpdated).toBe(1);
    expect(second.statusEvents).toBe(1);
    expect((await readParkProfile(id))?.workStatus).toBe('fired');
    expect(await readStatusEvents(id)).toEqual([
      { statusFrom: null, statusTo: 'working', syncRunId: expect.any(String) },
      { statusFrom: 'working', statusTo: 'fired', syncRunId: second.runId },
    ]);

    // Окна перекрываются по построению, и тот же профиль приезжает снова. Второй строки
    // о переходе быть не должно: статус уже записан, и переходу взяться неоткуда.
    const third = await runRegistrySync('registry', {
      now: new Date(NOW.getTime() + 120_000),
      client: createFakeFleet([fired]),
    });

    expect(third.statusEvents).toBe(0);
    expect(await readStatusEvents(id)).toHaveLength(2);
  });

  it('сменившийся телефон закрывает прежнюю строку и открывает новую', async () => {
    const id = profileId('phone');

    await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({
          profileId: id,
          licenseNumber: 'AA3334445',
          phones: ['+998901111111'],
        }),
      ]),
    });

    const summary = await runRegistrySync('registry', {
      now: new Date(NOW.getTime() + 60_000),
      client: createFakeFleet([
        buildRawProfile({
          profileId: id,
          licenseNumber: 'AA3334445',
          phones: ['+998902222222'],
          updatedAt: '2026-08-28T11:40:00+00:00',
        }),
      ]),
    });

    expect(summary.phonesOpened).toBe(1);
    expect(summary.phonesClosed).toBe(1);

    const phones = await readPhones(id);

    // Прежняя строка закрыта, а не удалена: вопрос «по какому номеру мы писали в марте»
    // должен иметь ответ через год.
    expect(phones).toHaveLength(2);
    expect(phones[0]?.phoneRaw).toBe('+998901111111');
    expect(phones[0]?.closedAt).not.toBeNull();
    expect(phones[1]?.phoneRaw).toBe('+998902222222');
    expect(phones[1]?.closedAt).toBeNull();
  });

  it('сменившийся номер удостоверения закрывает активную строку и открывает новую', async () => {
    const id = profileId('license');

    await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([buildRawProfile({ profileId: id, licenseNumber: 'AA4445556' })]),
    });

    const summary = await runRegistrySync('registry', {
      now: new Date(NOW.getTime() + 60_000),
      client: createFakeFleet([
        buildRawProfile({
          profileId: id,
          licenseNumber: 'AA7778889',
          updatedAt: '2026-08-28T11:45:00+00:00',
        }),
      ]),
    });

    expect(summary.licensesUpdated).toBe(1);

    const profile = await readParkProfile(id);
    const licenses = await readLicenses(profile?.personId as string);

    expect(licenses).toHaveLength(2);
    expect(licenses[0]?.numberCanonical).toBe('AA4445556');
    expect(licenses[0]?.closedAt).not.toBeNull();
    expect(licenses[1]?.numberCanonical).toBe('AA7778889');
    expect(licenses[1]?.closedAt).toBeNull();
  });

  it('номер, уже активный у другого человека, журнал не трогает и ложится в пропущенное', async () => {
    const id = profileId('conflict');

    await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([buildRawProfile({ profileId: id, licenseNumber: 'AA5556667' })]),
    });

    // Тот же номер уже активен у другого человека. Свести двоих в одного — это перенос
    // баллов, и синхронизация его не делает.
    const otherPersonId = await createPersonWithLicense('AA6667778');

    const summary = await runRegistrySync('registry', {
      now: new Date(NOW.getTime() + 60_000),
      client: createFakeFleet([
        buildRawProfile({
          profileId: id,
          licenseNumber: 'AA6667778',
          updatedAt: '2026-08-28T11:46:00+00:00',
        }),
      ]),
    });

    expect(summary.licenseConflicts).toBe(1);
    expect(summary.licensesUpdated).toBe(0);
    expect(summary.status).toBe('succeeded');

    const profile = await readParkProfile(id);
    const licenses = await readLicenses(profile?.personId as string);

    expect(licenses).toHaveLength(1);
    expect(licenses[0]?.numberCanonical).toBe('AA5556667');
    expect(await readLicenses(otherPersonId)).toHaveLength(1);

    const skips = await readSkips();
    expect(skips).toContainEqual(
      expect.objectContaining({ reason: 'license_conflict', reference: id, detail: 'AA6667778' }),
    );
  });
});

describe('профиль, который не записывается', () => {
  it('профиль без объекта удостоверения прогон не роняет и ложится в пропущенное', async () => {
    const broken = profileId('no-license');
    const good = profileId('with-license');

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: broken, licenseNumber: null }),
        buildRawProfile({ profileId: good, licenseNumber: 'AA1010101' }),
      ]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.malformed).toBe(1);
    expect(summary.malformedIds).toEqual([
      { profileId: broken, field: 'driver_license.number' },
    ]);
    expect(await readParkProfile(broken)).toBeNull();
    // Соседний профиль на той же странице записан: один негодный не роняет страницу.
    expect(await readParkProfile(good)).not.toBeNull();

    expect(await readSkips()).toContainEqual(
      expect.objectContaining({
        reason: 'malformed',
        reference: broken,
        detail: 'driver_license.number',
      }),
    );
  });

  it('номер, от которого после нормализации ничего не осталось, человека не заводит', async () => {
    const broken = profileId('empty-license');

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([buildRawProfile({ profileId: broken, licenseNumber: '---' })]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.skippedWithoutLicense).toBe(1);
    expect(summary.personsCreated).toBe(0);
    expect(await readParkProfile(broken)).toBeNull();

    expect(await readSkips()).toContainEqual(
      expect.objectContaining({
        reason: 'malformed',
        reference: broken,
        detail: 'driver_license.number',
      }),
    );
  });

  it('незнакомое значение чужого словаря разбор не роняет', async () => {
    const id = profileId('unknown-status');

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({
          profileId: id,
          licenseNumber: 'AA1212121',
          currentStatus: 'teleported',
        }),
      ]),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.unknownValues).toEqual(['current_status=teleported']);
    // Значение записано текстом как есть: чужой словарь нам не принадлежит.
    expect(await readParkProfile(id)).not.toBeNull();
    expect(await readSkips()).toContainEqual(
      expect.objectContaining({
        reason: 'unknown_value',
        reference: 'current_status=teleported',
        detail: 'current_status',
      }),
    );
  });
});

describe('журнал прогона профилей', () => {
  it('упавший прогон не двигает отметку и остаётся в базе отказом', async () => {
    await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: profileId('before-fail'), licenseNumber: 'AA1313131' }),
      ]),
    });

    const watermarkBefore = await readSyncWatermark('registry');

    await expect(
      runRegistrySync('registry', {
        now: new Date(NOW.getTime() + 60_000),
        client: createFailingFleet(),
      }),
    ).rejects.toThrow('связь оборвалась');

    // Именно сдвиг отметки при неуспехе породил в старом боте счётчик дней простоя
    // и скрыл отказы по лимиту (docs/decisions.md).
    expect((await readSyncWatermark('registry'))?.toISOString()).toBe(
      watermarkBefore?.toISOString(),
    );

    const runs = await readSyncRuns('registry');
    expect(runs).toHaveLength(2);
    expect(runs[1]?.status).toBe('failed');
    expect(runs[1]?.error).toContain('связь оборвалась');
    expect(runs[1]?.rateLimited).toBe(3);
  });

  it('детали прогона в базе — те же числа, что и в сводке', async () => {
    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([
        buildRawProfile({ profileId: profileId('details-1'), licenseNumber: 'AA1414141' }),
        buildRawProfile({ profileId: profileId('details-2'), licenseNumber: 'AA1515151' }),
      ]),
    });

    const details = await readSyncRunRegistry(summary.runId as string);

    expect(details).toEqual({
      pages: summary.pages,
      profilesSeen: summary.profilesSeen,
      profilesInserted: summary.profilesInserted,
      profilesUpdated: summary.profilesUpdated,
      responseRows: summary.responseRows,
      personsCreated: summary.personsCreated,
      statusEvents: summary.statusEvents,
      phonesOpened: summary.phonesOpened,
      phonesClosed: summary.phonesClosed,
      licensesUpdated: summary.licensesUpdated,
      licenseConflicts: summary.licenseConflicts,
      skippedWithoutLicense: summary.skippedWithoutLicense,
      malformed: summary.malformed,
      resolvedSkips: summary.resolvedSkips,
      chunksTotal: summary.chunksTotal,
      chunksWindowed: summary.chunksWindowed,
      maxOffsetDepth: summary.maxOffsetDepth,
    });

    // Сводка не пустая: сверять нули с нулями смысла нет.
    expect(details?.profilesInserted).toBe(2);
    expect(details?.personsCreated).toBe(2);
  });

  it('заказы, лежавшие в пропущенном без водителя, разрешаются его появлением', async () => {
    const id = profileId('awaited');

    await insertUnknownProfileSkip('order-awaited', id);

    const before = await readSkips();
    expect(before).toContainEqual(
      expect.objectContaining({ reason: 'unknown_profile', reference: 'order-awaited', resolvedAt: null }),
    );

    const summary = await runRegistrySync('registry', {
      now: NOW,
      client: createFakeFleet([buildRawProfile({ profileId: id, licenseNumber: 'AA1616161' })]),
    });

    expect(summary.resolvedSkips).toBe(1);

    const after = await readSkips();
    const resolved = after.find((skip) => skip.reference === 'order-awaited');

    // Ровно ради этого `resolved_at` и заведён: список нерешённого обязан таять после
    // того, как реестр догнали.
    expect(resolved?.resolvedAt).not.toBeNull();
  });
});

describe('полный обход реестра нарезкой', () => {
  const workRules = [
    { id: 'rule-a', name: 'ОСНОВНОЙ' },
    { id: 'rule-b', name: 'ФЛАЕРА' },
  ];

  const wholePark = [
    buildRawProfile({ profileId: profileId('full-1'), licenseNumber: 'AB1000001', workRuleId: 'rule-a' }),
    buildRawProfile({ profileId: profileId('full-2'), licenseNumber: 'AB1000002', workRuleId: 'rule-b' }),
    buildRawProfile({
      profileId: profileId('full-3'),
      licenseNumber: 'AB1000003',
      workRuleId: 'rule-a',
      workStatus: 'fired',
    }),
    buildRawProfile({
      profileId: profileId('full-4'),
      licenseNumber: 'AB1000004',
      workRuleId: 'rule-b',
      workStatus: 'not_working',
    }),
  ];

  it('берёт весь парк кусками и ставит отметку по времени начала обхода', async () => {
    const summary = await runRegistrySync('registry_full', {
      now: NOW,
      client: createFakeFleet(wholePark, { workRules }),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.profilesSeen).toBe(4);
    expect(summary.profilesInserted).toBe(4);
    // Куски: `fired`, `not_working` и по одному на каждое условие работы.
    expect(summary.chunksTotal).toBe(4);
    expect(summary.chunksWindowed).toBe(0);
    expect(summary.maxOffsetDepth).toBe(0);

    // Отметка — по времени начала обхода с запасом назад: обход идёт около получаса,
    // и профиль, изменившийся во время него, иначе провалился бы в щель.
    expect((await readSyncWatermark('registry'))?.toISOString()).toBe(
      new Date(NOW.getTime() - OVERLAP_MS).toISOString(),
    );

    const runs = await readSyncRuns('registry_full');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('succeeded');
    expect(runs[0]?.itemsWritten).toBe(4);
  });

  it('различные профили и строки ответа считаются раздельно', async () => {
    // Кусок крупнее 3 000 берётся с двух концов, половины перекрываются намеренно,
    // и профиль из прохода `asc` приходит снова в `desc`. Если считать строками ответа,
    // «увидено» и «обновлено» окажутся больше, чем профилей в парке, — ровно то, что
    // случилось на живом обходе: 29 345 при 25 391 профиле.
    const many = Array.from({ length: 3_001 }, (_, index) =>
      buildRawProfile({
        profileId: profileId(`bulk-${String(index).padStart(4, '0')}`),
        licenseNumber: `AC${String(1_000_000 + index)}`,
        workRuleId: 'rule-a',
        phones: [],
        // Даты заведения различны: при равных значениях сортировки offset-пагинация
        // теряет строки на стыке страниц, и это отдельный сценарий, не этот.
        createdDate: new Date(Date.UTC(2020, 0, 1) + index * 60_000).toISOString(),
      }),
    );

    const summary = await runRegistrySync('registry_full', {
      now: NOW,
      client: createFakeFleet(many, { workRules }),
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.profilesSeen).toBe(3_001);
    expect(summary.profilesInserted).toBe(3_001);
    // Тот же профиль, встреченный встречным проходом, не «ещё один обновлённый»:
    // новым он остаётся новым, и дважды его не считают.
    expect(summary.profilesUpdated).toBe(0);
    // А вот строк ответа больше — это цена нарезки, и её видно отдельным числом.
    expect(summary.responseRows).toBe(4_000);
    expect(summary.maxOffsetDepth).toBe(1_000);

    const details = await readSyncRunRegistry(summary.runId as string);
    expect(details?.profilesSeen).toBe(3_001);
    expect(details?.responseRows).toBe(4_000);

    const runs = await readSyncRuns('registry_full');
    // В общей таблице прогонов — тоже профили, а не строки: она складывается по видам.
    expect(runs[0]?.itemsSeen).toBe(3_001);
    expect(runs[0]?.itemsWritten).toBe(3_001);
  });

  it('кусок, не сошедшийся по числу профилей, роняет прогон и не двигает отметку', async () => {
    // Транспорт теряет по записи на странице, не уменьшая `total`, — так выглядит потеря
    // на стыке страниц при равных `created_date`. Заметить её можно единственным
    // способом: сверкой числа различных `id` с `total` (docs/decisions.md).
    await expect(
      runRegistrySync('registry_full', {
        now: NOW,
        client: createFakeFleet(
          [
            ...wholePark,
            buildRawProfile({
              profileId: profileId('full-5'),
              licenseNumber: 'AB1000005',
              workRuleId: 'rule-a',
            }),
          ],
          { workRules, loseFirstOfEachPage: true },
        ),
      }),
    ).rejects.toThrow(/собрано/);

    // Молча неполный обход хуже отсутствующего: на его основании закроют вопрос
    // «всех ли мы видим».
    expect(await readSyncWatermark('registry')).toBeNull();

    const runs = await readSyncRuns('registry_full');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('failed');
  });
});

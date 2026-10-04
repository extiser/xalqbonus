import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listOutsideProgramDrivers } from '#server/services/metrics/listOutsideProgramDrivers';
import { readOutsideProgram } from '#server/services/metrics/readOutsideProgram';
import { recomputePersonDays } from '#server/services/metrics/recomputePersonDays';
import type { ReportCell, ReportResult } from '#shared/types/reports';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
  reassignProfileToPerson,
  type TestPerson,
} from '../support/database';
import { addTestProfilePhone, cleanupTestMetrics, setTestProfileCard } from '../support/metrics';

/**
 * Выгрузка «Вне программы» против настоящей базы (issue #373): строка — человек, позывной и имя —
 * из профиля с последней поездкой периода, телефоны — все незакрытые всех его профилей, порядок —
 * по поездкам.
 *
 * Запрос сырой — третье исключение правила тестов (docs/infra.md → «Тесты»). Таблица метрик
 * общая на базу, поэтому строки теста находятся по позывным, а не по позиции в файле.
 */

const NOW = new Date('2026-10-05T12:00:00Z');

const MONTH = '2025-12';

const rowsOf = (report: ReportResult): Record<string, ReportCell>[] =>
  report.sections.flatMap((section) => section.rows.map((row) => row.cells));

describe('выгрузка «Вне программы»', () => {
  let twoProfiles: TestPerson;
  let single: TestPerson;
  let report: ReportResult;

  beforeAll(async () => {
    twoProfiles = await createTestPerson({ inProgram: false });
    single = await createTestPerson({ inProgram: false });

    // Второй профиль того же человека: на нём последняя поездка декабря.
    const donor = await createTestPerson({ inProgram: false });
    await reassignProfileToPerson(donor.profileId, twoProfiles.personId);

    await setTestProfileCard(twoProfiles.profileId, { callsign: 'T373-OLD', firstName: 'Старый', lastName: 'Профиль' });
    await setTestProfileCard(donor.profileId, { callsign: 'T373-NEW', firstName: 'Новый', lastName: 'Профиль' });
    await setTestProfileCard(single.profileId, { callsign: 'T373-ONE', firstName: 'Один', lastName: 'Профиль' });

    // Открытый номер первого профиля, закрытый — не в выгрузку, у второго — сырой без E.164.
    await addTestProfilePhone(twoProfiles.profileId, { phoneRaw: '+998901110001', phoneE164: '+998901110001' });
    await addTestProfilePhone(twoProfiles.profileId, {
      phoneRaw: '+998901110009',
      phoneE164: '+998901110009',
      closedAt: new Date('2025-11-01T00:00:00Z'),
    });
    await addTestProfilePhone(donor.profileId, { phoneRaw: '90 111 00 02', phoneE164: null });

    const trips: [string, Date][] = [
      [twoProfiles.profileId, new Date('2025-12-05T06:00:00Z')],
      [twoProfiles.profileId, new Date('2025-12-06T06:00:00Z')],
      // 18:15 по Ташкенту.
      [donor.profileId, new Date('2025-12-20T13:15:00Z')],
      [single.profileId, new Date('2025-12-10T06:00:00Z')],
    ];

    for (const [profileId, endedAt] of trips) {
      await createTestTrip({ profileId, tripOrderId: `test-depth-export-${randomUUID()}`, status: 'complete', endedAt });
    }

    await recomputePersonDays(NOW);
    report = await listOutsideProgramDrivers(MONTH, NOW);
  });

  afterAll(async () => {
    await cleanupTestMetrics([], []);
    await cleanupTestData();
    await disconnectDatabase();
  });

  it('строка человека — профиль с последней поездкой и телефоны всех незакрытых', () => {
    const row = rowsOf(report).find((cells) => cells.callsign === 'T373-NEW');

    expect(row).toEqual({
      callsign: 'T373-NEW',
      name: 'Профиль Новый',
      phones: '+998901110001, 90 111 00 02',
      trips: 3,
      lastTripAt: '20.12.2025 18:15',
    });
    expect(rowsOf(report).some((cells) => cells.callsign === 'T373-OLD')).toBe(false);
  });

  it('порядок — по поездкам, по убыванию', () => {
    const callsigns = rowsOf(report)
      .map((cells) => cells.callsign)
      .filter((callsign) => callsign === 'T373-NEW' || callsign === 'T373-ONE');

    expect(callsigns).toEqual(['T373-NEW', 'T373-ONE']);

    const trips = rowsOf(report).map((cells) => Number(cells.trips));

    expect(trips).toEqual([...trips].sort((first, second) => second - first));
  });

  it('строк в файле столько же, сколько водителей на плитке', async () => {
    const outside = await readOutsideProgram({ from: '2025-12-01', to: '2025-12-31' });

    expect(rowsOf(report)).toHaveLength(outside.drivers);
    expect(report.subtitle).toBe('01.12.2025–31.12.2025 · ездят, но ни разу не привязали Telegram');
  });
});

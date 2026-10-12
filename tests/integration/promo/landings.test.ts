import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { db } from '#server/db';
import { addLandingVersion } from '#server/services/promo/addLandingVersion';
import { createLanding } from '#server/services/promo/createLanding';
import { createPromoLink } from '#server/services/promo/createPromoLink';
import { deleteLanding } from '#server/services/promo/deleteLanding';
import { listLandingOptions } from '#server/services/promo/listLandingOptions';
import { listLandings } from '#server/services/promo/listLandings';
import { readLandingCard } from '#server/services/promo/readLandingCard';
import { setLandingArchived } from '#server/services/promo/setLandingArchived';
import { updatePromoLink } from '#server/services/promo/updatePromoLink';
import type { LandingCard, LandingRow } from '#shared/types/landings';
import { disconnectDatabase } from '../support/database';
import { cleanupTestEmployees, createTestEmployee, nextTestTelegramUserId } from '../support/employees';
import {
  cleanupTestLandings,
  failingLandingArchive,
  passingLandingArchive,
  trackTestLanding,
} from '../support/landings';
import {
  cleanupTestPromoTouches,
  createTestPromoLink,
  insertTestPromoTouch,
  nextTestPromoCode,
} from '../support/promo';

/**
 * Лендинги «Промо» (issue #478) — правила, которые решает база: какая версия действующая,
 * можно ли выбрать лендинг, сменить его у метки и удалить. Через сервисы, которыми читают
 * и пишут ручки.
 *
 * Картинки версий ложатся во временный каталог, а не на том приложения: `UPLOADS_DIR`
 * читается при каждой записи.
 */

const uploadsDir = mkdtempSync(join(tmpdir(), 'xalqbonus-landings-'));
const previousUploadsDir = process.env['UPLOADS_DIR'];

let employeeId = '';

const upload = async (name: string, archive: Uint8Array): Promise<string> => {
  const created = await createLanding({ name, archive, employeeId });

  trackTestLanding(created.id);

  return created.id;
};

const readCard = async (landingId: string): Promise<LandingCard> => {
  const card = await readLandingCard(landingId);

  if (card === null) throw new Error(`лендинга ${landingId} нет`);

  return card;
};

const readRow = async (landingId: string): Promise<LandingRow> => {
  const row = (await listLandings()).landings.find((landing) => landing.id === landingId);

  if (!row) throw new Error(`лендинга ${landingId} нет в списке`);

  return row;
};

/** Метка рекламы со входом «Приложение» — у неё стоит лендинг. */
const adLink = async (): Promise<string> => {
  const code = nextTestPromoCode();

  await createTestPromoLink(code, new Date(), 'telegram_ad', 'miniapp');

  return code;
};

const setLanding = (code: string, landingId: string | null): Promise<boolean> =>
  updatePromoLink(code, { name: `Тест ${code}`, placement: '', landingId });

const failure = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  throw new Error('отказа не было');
};

describe('лендинги «Промо»', () => {
  beforeAll(() => {
    process.env['UPLOADS_DIR'] = uploadsDir;
  });

  afterEach(async () => {
    await cleanupTestPromoTouches();
    await cleanupTestLandings();
    await cleanupTestEmployees();
  });

  afterAll(async () => {
    if (previousUploadsDir === undefined) delete process.env['UPLOADS_DIR'];
    else process.env['UPLOADS_DIR'] = previousUploadsDir;

    rmSync(uploadsDir, { recursive: true, force: true });
    await disconnectDatabase();
  });

  const withEmployee = async (): Promise<void> => {
    employeeId = (await createTestEmployee({ role: 'owner' })).employeeId;
  };

  describe('версии', () => {
    it('действующая — последняя прошедшая; не прошедшая замена её не сменяет', async () => {
      await withEmployee();

      const landingId = await upload('Машина парка', passingLandingArchive());

      expect(await addLandingVersion({ landingId, archive: passingLandingArchive(), employeeId })).toEqual({
        number: 2,
        passed: true,
      });
      expect(await addLandingVersion({ landingId, archive: failingLandingArchive(), employeeId })).toEqual({
        number: 3,
        passed: false,
      });

      const card = await readCard(landingId);

      expect(card.lastVersion.number).toBe(3);
      expect(card.lastVersion.passed).toBe(false);
      expect(card.liveVersion?.number).toBe(2);
      expect(card.selectable).toBe(true);
      expect(card.lastPassed).toBe(false);
      expect(card.updatedAt).not.toBeNull();
      expect(card.liveVersion?.imageBase).toMatch(/^\/uploads\/landings\/[0-9a-f-]{36}\/$/);
    });

    it('лендинг без прошедшей версии не selectable и не в выборе; замена исправленным — в выборе', async () => {
      await withEmployee();

      const landingId = await upload('Своя машина', failingLandingArchive());
      const card = await readCard(landingId);

      expect(card.liveVersion).toBeNull();
      expect(card.selectable).toBe(false);
      expect(card.updatedAt).toBeNull();
      expect((await listLandingOptions()).map((option) => option.id)).not.toContain(landingId);

      await addLandingVersion({ landingId, archive: passingLandingArchive(), employeeId });

      expect((await readRow(landingId)).selectable).toBe(true);
      expect((await listLandingOptions()).map((option) => option.id)).toContain(landingId);
    });

    it('лендинг в архиве не в выборе, но у метки остаётся', async () => {
      await withEmployee();

      const landingId = await upload('Первый тест', passingLandingArchive());
      const code = await adLink();

      await setLanding(code, landingId);
      await setLandingArchived(landingId, true);

      expect((await readRow(landingId)).selectable).toBe(false);
      expect((await listLandingOptions()).map((option) => option.id)).not.toContain(landingId);
      expect((await db.promoLink.findUnique({ where: { code }, select: { landingId: true } }))?.landingId).toBe(landingId);
      expect((await readCard(landingId)).labels.map((label) => label.code)).toEqual([code]);
    });
  });

  describe('метка', () => {
    it('смена лендинга после касания — landing_locked; тот же лендинг — не смена', async () => {
      await withEmployee();

      const first = await upload('Первый', passingLandingArchive());
      const second = await upload('Второй', passingLandingArchive());
      const code = await adLink();

      await setLanding(code, first);
      await insertTestPromoTouch({ code, telegramUserId: nextTestTelegramUserId(), touchedAt: new Date() });

      expect(await failure(() => setLanding(code, second))).toMatchObject({ problems: ['landing_locked'] });
      expect(await failure(() => setLanding(code, null))).toMatchObject({ problems: ['landing_locked'] });
      expect(await setLanding(code, first)).toBe(true);
    });

    it('лендинг в архиве и не прошедший проверку — landing_unavailable и при заведении, и при правке', async () => {
      await withEmployee();

      const archived = await upload('В архиве', passingLandingArchive());
      const failed = await upload('Не прошёл', failingLandingArchive());
      const code = await adLink();

      await setLandingArchived(archived, true);

      for (const landingId of [archived, failed]) {
        expect(await failure(() => setLanding(code, landingId))).toMatchObject({ problems: ['landing_unavailable'] });
        expect(
          await failure(() =>
            createPromoLink({
              code: nextTestPromoCode(),
              name: 'Новая метка',
              medium: 'telegram_ad',
              entry: 'miniapp',
              placement: '',
              landingId,
              employeeId,
            }),
          ),
        ).toMatchObject({ problems: ['landing_unavailable'] });
      }
    });

    it('лендинг у метки чата бота — landing_unavailable', async () => {
      await withEmployee();

      const landingId = await upload('Годный', passingLandingArchive());

      expect(
        await failure(() =>
          createPromoLink({
            code: nextTestPromoCode(),
            name: 'Чат бота',
            medium: 'telegram_ad',
            entry: 'bot',
            placement: '',
            landingId,
            employeeId,
          }),
        ),
      ).toMatchObject({ problems: ['landing_unavailable'] });
    });

    it('удаление лендинга у метки — landing_in_use; без меток — удаляется вместе с версиями', async () => {
      await withEmployee();

      const used = await upload('Стоит у метки', passingLandingArchive());
      const free = await upload('Без меток', passingLandingArchive());
      const code = await adLink();

      await setLanding(code, used);

      expect(await failure(() => deleteLanding(used))).toMatchObject({ code: 'landing_in_use' });
      expect(await db.landing.count({ where: { id: used } })).toBe(1);

      await deleteLanding(free);

      expect(await db.landing.count({ where: { id: free } })).toBe(0);
      expect(await db.landingVersion.count({ where: { landingId: free } })).toBe(0);
    });
  });
});

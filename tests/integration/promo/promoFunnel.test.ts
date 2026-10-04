import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { isPromoCodeTaken } from '#server/repositories/promo';
import { generatePromoCode } from '#server/services/promo/generatePromoCode';
import { listPromoLinks } from '#server/services/promo/listPromoLinks';
import { readPromoCard } from '#server/services/promo/readPromoCard';
import { readPromoCode } from '#shared/promoLinks';
import type { PromoCard, PromoLinkRow } from '#shared/types/promo';
import {
  cleanupTestData,
  createTestPerson,
  createTestTrip,
  disconnectDatabase,
} from '../support/database';
import { nextTestTelegramUserId } from '../support/employees';
import {
  cleanupTestPromoTouches,
  createTestPromoLink,
  insertTestPromoTouch,
  linkTestTelegram,
  markTestPersonDemo,
  nextTestPromoCode,
} from '../support/promo';

/**
 * Воронка раздела «Промо» (issue #380): перешли, вступили, первая поездка, уже были, переходы
 * по дням и итоги.
 *
 * Покрыт сырой SQL воронки — третье исключение docs/infra.md → «Тесты»: касания, привязки,
 * профили и поездки сводятся одним запросом, и расхождение со схемой typecheck не поймает.
 * Проверяются определения из issue и форма строки, через сервисы, которыми читают ручки.
 */

/** Ссылка карточки — без Telegram: имя бота спрашивается у него, а тесту это не нужно. */
const readLink = async (code: string): Promise<string> => `https://t.me/test_bot?start=${code}`;

/** Сутки — по Ташкенту, UTC+5: 10:00Z — это 15:00 того же дня. */
const at = (day: string, hour = 10): Date => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`);

const LINK_CREATED = at('2026-09-10', 8);
const NOW = at('2026-09-14');

const readRow = async (code: string): Promise<PromoLinkRow> => {
  const row = (await listPromoLinks()).links.find((link) => link.code === code);

  if (row === undefined) {
    throw new Error(`метки ${code} нет в списке`);
  }

  return row;
};

const readCard = async (code: string): Promise<PromoCard> => {
  const card = await readPromoCard(code, { now: NOW, readLink });

  if (card === null) {
    throw new Error(`карточки ${code} нет`);
  }

  return card;
};

/** Человек, вступивший в программу привязкой Telegram в момент `joinedAt`. */
const joinPerson = async (telegramUserId: bigint, joinedAt: Date): Promise<{ personId: string; profileId: string }> => {
  const person = await createTestPerson({ inProgram: true, joinedAt });

  await linkTestTelegram({ personId: person.personId, linkedAt: joinedAt, telegramChatId: telegramUserId, telegramUserId });

  return person;
};

let nextTrip = 0;

const tripAt = async (profileId: string, endedAt: Date, status = 'complete'): Promise<void> => {
  nextTrip += 1;

  await createTestTrip({ profileId, tripOrderId: `test-promo-trip-${Date.now()}-${nextTrip}`, status, endedAt });
};

afterAll(async () => {
  await disconnectDatabase();
});

describe('воронка промо-меток', () => {
  afterEach(async () => {
    await cleanupTestPromoTouches();
    await cleanupTestData();
  });

  it('перешли — разные люди: три касания одного Telegram — один перешедший, три касания', async () => {
    const code = nextTestPromoCode();
    const telegramUserId = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);

    for (const hour of [9, 11, 13]) {
      await insertTestPromoTouch({ code, telegramUserId, touchedAt: at('2026-09-11', hour) });
    }

    const card = await readCard(code);

    expect(card.funnel).toEqual({ went: 1, joined: 0, firstTrip: 0, already: 0, touches: 3 });
    expect(await readRow(code)).toMatchObject({ code, medium: 'poster', placement: null, went: 1 });
  });

  it('уже был: первое касание участником — в «уже были», во «вступили» не попадает', async () => {
    const code = nextTestPromoCode();
    const member = nextTestTelegramUserId();
    const newcomer = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);

    // Участник с сентября: касается уже после вступления.
    await joinPerson(member, at('2026-09-01'));
    await insertTestPromoTouch({ code, telegramUserId: member, touchedAt: at('2026-09-11'), wasParticipant: true });

    // Новичок: первое касание — не участником, второе — уже участником. Решает первое.
    await insertTestPromoTouch({ code, telegramUserId: newcomer, touchedAt: at('2026-09-11'), wasParticipant: false });
    await joinPerson(newcomer, at('2026-09-12'));
    await insertTestPromoTouch({ code, telegramUserId: newcomer, touchedAt: at('2026-09-13'), wasParticipant: true });

    expect((await readCard(code)).funnel).toMatchObject({ went: 2, already: 1, joined: 1 });
  });

  it('атрибуция: касание А, касание Б, вступление — засчитано Б; касание после вступления — нет', async () => {
    const first = nextTestPromoCode();
    const second = nextTestPromoCode();
    const telegramUserId = nextTestTelegramUserId();

    await createTestPromoLink(first, LINK_CREATED);
    await createTestPromoLink(second, LINK_CREATED);

    await insertTestPromoTouch({ code: first, telegramUserId, touchedAt: at('2026-09-11', 9) });
    await insertTestPromoTouch({ code: second, telegramUserId, touchedAt: at('2026-09-11', 10) });
    const person = await joinPerson(telegramUserId, at('2026-09-11', 11));
    await insertTestPromoTouch({ code: first, telegramUserId, touchedAt: at('2026-09-11', 12) });

    expect((await readCard(first)).funnel).toMatchObject({ went: 1, joined: 0 });

    const card = await readCard(second);

    expect(card.funnel).toMatchObject({ went: 1, joined: 1 });
    expect(card.joined).toEqual([
      {
        personId: person.personId,
        callsign: null,
        name: 'Тестов Тест',
        touchedAt: at('2026-09-11', 10).toISOString(),
        joinedAt: at('2026-09-11', 11).toISOString(),
        firstTripAt: null,
      },
    ]);
  });

  it('привязка без telegram_user_id находится по чату', async () => {
    const code = nextTestPromoCode();
    const telegramUserId = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);
    await insertTestPromoTouch({ code, telegramUserId, touchedAt: at('2026-09-11') });

    // Перенесённая из старой базы привязка: от Telegram только чат, и он равен отправителю касания.
    const person = await createTestPerson({ inProgram: true });
    await linkTestTelegram({
      personId: person.personId,
      linkedAt: at('2026-09-12'),
      telegramChatId: telegramUserId,
      telegramUserId: null,
    });

    expect((await readCard(code)).funnel).toMatchObject({ went: 1, joined: 1 });
  });

  it('первая поездка — только завершённая после вступления; демо не входит никуда', async () => {
    const code = nextTestPromoCode();
    const rider = nextTestTelegramUserId();
    const demo = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);

    await insertTestPromoTouch({ code, telegramUserId: rider, touchedAt: at('2026-09-11', 9) });
    const person = await joinPerson(rider, at('2026-09-11', 12));
    await tripAt(person.profileId, at('2026-09-11', 10));
    await tripAt(person.profileId, at('2026-09-12', 10), 'cancelled');

    expect((await readCard(code)).funnel).toMatchObject({ joined: 1, firstTrip: 0 });

    await tripAt(person.profileId, at('2026-09-13', 10));
    await tripAt(person.profileId, at('2026-09-13', 15));

    // Демо-водитель проходит весь путь — касание, вступление, поездка — и не виден нигде.
    await insertTestPromoTouch({ code, telegramUserId: demo, touchedAt: at('2026-09-11', 9) });
    const demoPerson = await joinPerson(demo, at('2026-09-11', 12));
    await markTestPersonDemo(demoPerson.personId);
    await tripAt(demoPerson.profileId, at('2026-09-13', 10));

    const card = await readCard(code);

    expect(card.funnel).toEqual({ went: 1, joined: 1, firstTrip: 1, already: 0, touches: 1 });
    expect(card.joined.map((joined) => [joined.personId, joined.firstTripAt])).toEqual([
      [person.personId, at('2026-09-13', 10).toISOString()],
    ]);
    expect(card.days.reduce((sum, day) => sum + day.people, 0)).toBe(1);
  });

  it('дни: человек в два разных дня — в обоих; сутки без касаний — ноль', async () => {
    const code = nextTestPromoCode();
    const telegramUserId = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);
    await insertTestPromoTouch({ code, telegramUserId, touchedAt: at('2026-09-10') });
    await insertTestPromoTouch({ code, telegramUserId, touchedAt: at('2026-09-10', 12) });
    // 20:30Z — уже 01:30 по Ташкенту, следующие сутки.
    await insertTestPromoTouch({ code, telegramUserId, touchedAt: new Date('2026-09-11T20:30:00Z') });

    expect((await readCard(code)).days).toEqual([
      { day: '2026-09-10', people: 1 },
      { day: '2026-09-11', people: 0 },
      { day: '2026-09-12', people: 1 },
      { day: '2026-09-13', people: 0 },
      { day: '2026-09-14', people: 0 },
    ]);
  });

  it('касание раньше создания метки — и в графике, и в воронке; сумма дней равна «перешли»', async () => {
    const code = nextTestPromoCode();
    const early = nextTestTelegramUserId();
    const later = nextTestTelegramUserId();

    await createTestPromoLink(code, LINK_CREATED);
    await insertTestPromoTouch({ code, telegramUserId: early, touchedAt: at('2026-09-08') });
    await insertTestPromoTouch({ code, telegramUserId: later, touchedAt: at('2026-09-12') });

    const card = await readCard(code);

    expect(card.days[0]).toEqual({ day: '2026-09-08', people: 1 });
    expect(card.days.at(-1)).toEqual({ day: '2026-09-14', people: 0 });
    expect(card.days).toHaveLength(7);
    expect(card.funnel.went).toBe(2);
    expect(card.days.reduce((sum, day) => sum + day.people, 0)).toBe(card.funnel.went);
  });

  it('итоги: человек по двум меткам — один в «перешли»; вступили — сумма по меткам', async () => {
    const before = (await listPromoLinks()).totals;
    const first = nextTestPromoCode();
    const second = nextTestPromoCode();
    const both = nextTestTelegramUserId();
    const single = nextTestTelegramUserId();

    await createTestPromoLink(first, LINK_CREATED);
    await createTestPromoLink(second, LINK_CREATED);

    await insertTestPromoTouch({ code: first, telegramUserId: both, touchedAt: at('2026-09-11', 9) });
    await insertTestPromoTouch({ code: second, telegramUserId: both, touchedAt: at('2026-09-11', 10) });
    await joinPerson(both, at('2026-09-11', 11));
    await insertTestPromoTouch({ code: first, telegramUserId: single, touchedAt: at('2026-09-11', 9) });
    await joinPerson(single, at('2026-09-11', 11));

    const { links, totals } = await listPromoLinks();
    const rows = links.filter((link) => link.code === first || link.code === second);

    expect(rows.map((row) => [row.code, row.went, row.joined])).toEqual(
      expect.arrayContaining([
        [first, 2, 1],
        [second, 1, 1],
      ]),
    );
    expect(totals).toEqual({
      went: before.went + 2,
      joined: before.joined + 2,
      firstTrip: before.firstTrip,
      already: before.already,
    });
  });
});

describe('код промо-метки', () => {
  afterEach(async () => {
    await cleanupTestPromoTouches();
  });

  it('формат `shared/promoLinks.ts`: `p_` и 6 символов base64url', async () => {
    const code = await generatePromoCode();

    expect(code).toMatch(/^p_[A-Za-z0-9_-]{6}$/);
    expect(readPromoCode(code)).toBe(code);
  });

  it('код занят меткой или касанием — не выдаётся', async () => {
    const linked = nextTestPromoCode();
    const touched = nextTestPromoCode();

    await createTestPromoLink(linked, LINK_CREATED);
    await insertTestPromoTouch({ code: touched, telegramUserId: nextTestTelegramUserId(), touchedAt: at('2026-09-11') });

    expect(await isPromoCodeTaken(linked)).toBe(true);
    expect(await isPromoCodeTaken(touched)).toBe(true);
    expect(await isPromoCodeTaken(nextTestPromoCode())).toBe(false);

    // Первый выпавший код занят — генератор берёт следующий, а не отдаёт занятый.
    const offered: string[] = [];
    const code = await generatePromoCode(async (candidate) => {
      offered.push(candidate);

      return offered.length === 1 || isPromoCodeTaken(candidate);
    });

    expect(offered).toHaveLength(2);
    expect(code).toBe(offered[1]);
    expect(code).not.toBe(offered[0]);
  });
});

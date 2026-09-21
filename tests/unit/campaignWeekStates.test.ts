import { describe, expect, it } from 'vitest';

import { countedPlainText } from '#server/bot/texts';
import { describeWeekBottom, describeWeekTop } from '#server/services/campaigns/memberProgress';
import {
  clampedDone,
  figuresFromCounts,
  weekFigures,
} from '#server/services/campaigns/weekProgress';
import type { MemberWeekLineTone } from '#shared/types/miniapp';
import { MEMBER_WEEK_STATES_TABLE } from './fixtures/memberWeekStates';

/**
 * Блок недели акции против эталона — полного перебора из `03-member-week-states.md`
 * (docs/infra.md → «Тесты», четвёртое исключение).
 *
 * Каждая из 63 строк: тройка «день окна, зачтённых дней, взята ли цель сегодня» подаётся
 * в функцию выбора строк числами, и сверяются все столбцы — запас, дни с сундуками, обе строки
 * на русском и их вид, счётчик слева. Различия между состояниями тонкие, и выборкой они
 * не ловятся: именно перебором найдена нужда зажимать счётчик на пятёрке.
 */

const WINDOW_DAYS = 7;

const TONES: Record<string, MemberWeekLineTone> = {
  золото: 'gold',
  серый: 'grey',
  белый: 'white',
};

type ReferenceRow = {
  line: string;
  day: number;
  done: number;
  goalTakenToday: boolean;
  chest: number;
  slack: number;
  top: string;
  topTone: string;
  bottomLeft: string;
  bottomRight: string;
  bottomTone: string;
};

const parseTable = (table: string): ReferenceRow[] =>
  table
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\| \d/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());

      const [day, done, taken, chest, slack, top, topTone, bottomLeft, bottomRight, bottomTone] =
        cells;

      if (bottomTone === undefined || day === undefined || done === undefined || taken === undefined) {
        throw new Error(`строка эталона не разобралась: ${line}`);
      }

      return {
        line,
        day: Number(day),
        done: Number(done),
        goalTakenToday: taken === 'да',
        chest: Number(chest),
        slack: Number(slack),
        top: top ?? '',
        topTone: topTone ?? '',
        bottomLeft: bottomLeft ?? '',
        bottomRight: bottomRight ?? '',
        bottomTone,
      };
    });

/** Полный текст строки → запись эталона: «осталось 7 дней» → «осталось 7 дн.». */
const abbreviate = (text: string): string =>
  text
    .replace(/(\d+) (дней|дня|день)/, '$1 дн.')
    .replace(/(\d+) (пропусков|пропуска|пропуск)/, '$1 проп.');

const rows = parseTable(MEMBER_WEEK_STATES_TABLE);

describe('блок недели: эталонный перебор', () => {
  it('эталон перенесён целиком: 63 тройки, 54 различные выдачи', () => {
    expect(rows).toHaveLength(63);

    // Выдача — всё справа от тройки входов, вместе с запасом и днями с сундуками: так её
    // считал документ.
    const outputs = new Set(
      rows.map((row) =>
        [
          row.chest,
          row.slack,
          row.top,
          row.topTone,
          row.bottomLeft,
          row.bottomRight,
          row.bottomTone,
        ].join('|'),
      ),
    );

    expect(outputs.size).toBe(54);
  });

  it.each(rows.map((row) => [row.line, row] as const))('%s', (_line, row) => {
    const figures = figuresFromCounts(WINDOW_DAYS, row.day, row.done, row.goalTakenToday);

    expect(figures.chestDays).toBe(row.chest);
    expect(figures.slack).toBe(row.slack);

    const top = describeWeekTop(figures, 'ru');

    if (row.top === '—') {
      expect(top).toBeNull();
    } else {
      expect(top && abbreviate(top.text)).toBe(row.top);
      expect(top?.tone).toBe(TONES[row.topTone]);
    }

    expect(`${clampedDone(figures.done)} из 5`).toBe(row.bottomLeft);

    const bottom = describeWeekBottom(figures, 'ru');

    expect(abbreviate(bottom.text)).toBe(row.bottomRight);
    expect(bottom.tone).toBe(TONES[row.bottomTone]);
  });
});

describe('блок недели: числа от поездок по дням', () => {
  it('сегодняшний день со взятой целью зачтён и закрыт для сундука — случай 9', () => {
    const figures = weekFigures(7, 3, [5, 5, 5, 0, 0, 0, 0]);

    expect(figures).toMatchObject({ done: 3, goalTakenToday: true, chestDays: 4, slack: 2 });
    expect(describeWeekBottom(figures, 'ru').text).toBe('ещё 2 пропуска в запасе');
  });

  it('шестая поездка того же дня не делает второго зачётного дня', () => {
    expect(weekFigures(7, 1, [6, 0, 0, 0, 0, 0, 0]).done).toBe(1);
  });

  it('вступивший на пятый день видит «уже не собрать» и строку про сундуки дня', () => {
    const figures = weekFigures(7, 5, [0, 0, 0, 0, 0, 0, 0]);

    expect(figures.slack).toBeLessThan(0);
    expect(describeWeekTop(figures, 'ru')).toEqual({
      text: 'ещё 3 дня с сундуками',
      tone: 'grey',
    });
    expect(describeWeekBottom(figures, 'ru').text).toBe('каждые 5 поездок — сундук');
  });

  it('поездки будущих дней в счёт не идут', () => {
    expect(weekFigures(7, 2, [5, 0, 5, 5, 5, 5, 5]).done).toBe(1);
  });

  it('окно короче пяти дней встаёт в «уже не собрать» с первого дня', () => {
    const figures = weekFigures(4, 1, [0, 0, 0, 0]);

    expect(figures.slack).toBeLessThan(0);
    expect(describeWeekTop(figures, 'ru')?.text).toBe('ещё 4 дня с сундуками');
  });

  it('счётчик зажат на пятёрке', () => {
    expect(clampedDone(7)).toBe(5);
    expect(clampedDone(3)).toBe(3);
  });
});

// Эталон пишет числа в строках сокращённо, и форма слова через него не проверяется. Формы —
// раздел «Склонения» того же документа.
describe('склонения', () => {
  it('день, дня, дней', () => {
    expect([1, 2, 4, 5, 7].map((count) => countedPlainText('campaign_week_days_left', 'ru', count)))
      .toEqual([
        'остался 1 день',
        'осталось 2 дня',
        'осталось 4 дня',
        'осталось 5 дней',
        'осталось 7 дней',
      ]);
    expect(countedPlainText('campaign_week_chest_days', 'ru', 1)).toBe('ещё 1 день с сундуками');
    expect(countedPlainText('campaign_week_last_days', 'ru', 5)).toBe('последние 5 дней');
  });

  it('пропуск, пропуска, пропусков', () => {
    expect([1, 2, 5].map((count) => countedPlainText('campaign_week_skips_left', 'ru', count)))
      .toEqual(['ещё 1 пропуск в запасе', 'ещё 2 пропуска в запасе', 'ещё 5 пропусков в запасе']);
  });

  it('поездка, поездки, поездок', () => {
    expect([0, 1, 3, 5].map((count) => countedPlainText('campaign_today_trips', 'ru', count)))
      .toEqual([
        'Сегодня 0 поездок',
        'Сегодня 1 поездка',
        'Сегодня 3 поездки',
        'Сегодня 5 поездок',
      ]);
  });

  it('узбекский числительное не склоняет', () => {
    expect(countedPlainText('campaign_today_trips', 'uz', 3)).toBe('Bugun 3 ta safar');
  });
});

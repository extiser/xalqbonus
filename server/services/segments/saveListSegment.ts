import { db } from '#server/db';
import { findSegment, insertSegment, insertSegmentMembers, updateSegmentFields } from '#server/repositories/segments';
import { toSegment } from '#server/services/segments/fields';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import { EMPTY_SEGMENT_CONDITIONS } from '#shared/segment';
import type { Segment } from '#shared/types/segment';

/**
 * Запись сегмента-списка — снимка людей (issues #356, #415): из итогов опроса и из списков
 * дашборда. Источник собирает людей и слова, здесь — одна на всех транзакция.
 *
 * Сегмент и его люди — одной транзакцией: пустой состав откатывает и заведённую строку
 * сегмента, и сегмента без людей не остаётся. Описание называет число людей, а оно известно
 * только после вставки, поэтому описание пишется той же транзакцией после людей: снаружи
 * сегмента без описания не видно никогда.
 *
 * Со списком сегмент ничем не связан — ни ссылкой, ни условием: откуда он, говорят имя
 * и описание.
 */

type MembersSql = Parameters<typeof insertSegmentMembers>[1];

export type ListSegmentInput = {
  name: string;
  /** Описание по числу людей, легших в сегмент. */
  describe: (members: number) => string;
  people: MembersSql;
  isDemo: boolean;
  createdById: string;
  /** Отказ на пустой состав — у каждого источника свой. */
  emptyError: () => Error;
};

/** Хвост описания: когда собран и что состав — снимок. */
export const listSnapshotNote = (moment: Date): string =>
  `Собран ${formatCalendarDate(moment)} в ${formatClockTime(moment)} по Ташкенту. Состав зафиксирован и не пересчитывается.`;

export const saveListSegment = async (input: ListSegmentInput): Promise<{ segment: Segment; members: number }> => {
  const { segmentId, members } = await db.$transaction(async (transaction) => {
    const insertedId = await insertSegment(
      {
        name: input.name,
        description: null,
        conditions: EMPTY_SEGMENT_CONDITIONS,
        createdById: input.createdById,
        isDemo: input.isDemo,
        kind: 'list',
      },
      transaction,
    );

    const inserted = await insertSegmentMembers(insertedId, input.people, transaction);

    if (inserted === 0) {
      throw input.emptyError();
    }

    await updateSegmentFields(
      insertedId,
      { name: input.name, description: input.describe(inserted), conditions: EMPTY_SEGMENT_CONDITIONS },
      transaction,
    );

    return { segmentId: insertedId, members: inserted };
  });

  const row = await findSegment(segmentId);

  if (!row) {
    throw new Error(`заведённый сегмент ${segmentId} не прочитался`);
  }

  return { segment: toSegment(row), members };
};

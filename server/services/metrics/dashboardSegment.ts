import { consola } from 'consola';
import { personIdsSql } from '#server/repositories/segments';
import { listSnapshotNote, saveListSegment } from '#server/services/segments/saveListSegment';
import { pluralize } from '#shared/numberFormat';
import type { Segment } from '#shared/types/segment';

/**
 * Сегмент из списка дашборда (issue #415) — общее у «Рычагов» и «Глубины»: кто ложится
 * в сегмент, запись и строка о составе в описании. Что за список и как он назван — у сервиса
 * своего списка.
 *
 * Сегмент — снимок: в него ложатся участники программы из строк, которые сотрудник видел
 * на экране, и дальше состав не пересчитывается. Живых условий «лидер ездит меньше обычного»
 * в форме сегмента нет.
 *
 * Демо дашборд не считает — сегмент живой.
 */
const log = consola.withTag('metrics:segment');

export type DashboardSegmentList = 'leaders' | 'newcomers';

/** В списке нет ни одного участника программы — сегмент не заведён. Текст — готовый ответ. */
export class DashboardSegmentEmptyError extends Error {
  constructor(public readonly list: DashboardSegmentList) {
    super('В списке нет участников программы — сегмент не заведён.');
    this.name = 'DashboardSegmentEmptyError';
  }
}

type ListRow = { personId: string; inProgram: boolean };

export type DashboardSegmentInput = {
  list: DashboardSegmentList;
  /** Выбранный на экране месяц `YYYY-MM`. */
  month: string;
  rows: readonly ListRow[];
  name: string;
  /** Описание до строки о составе: что за список, пороги, на какой день. */
  about: string;
  employeeId: string;
  now: Date;
};

/**
 * «Вошло 31 из 40 строк списка, остальные 9 не участники программы: бот им написать не может.»
 * Фраза про остальных выпадает, когда не участников в списке нет.
 */
const membersSentence = (members: number, total: number): string => {
  const head = `Вошло ${members} из ${total} ${pluralize(total, 'строки', 'строк', 'строк')} списка`;
  const outside = total - members;

  return outside > 0 ? `${head}, остальные ${outside} не участники программы: бот им написать не может.` : `${head}.`;
};

export const saveDashboardSegment = async (input: DashboardSegmentInput): Promise<Segment> => {
  // Человек в списке строкой один, но состав — множество: повтор не должен считаться дважды.
  const personIds = [...new Set(input.rows.filter((row) => row.inProgram).map((row) => row.personId))];

  if (personIds.length === 0) {
    throw new DashboardSegmentEmptyError(input.list);
  }

  const { segment, members } = await saveListSegment({
    name: input.name,
    describe: (count) => `${input.about} ${membersSentence(count, input.rows.length)} ${listSnapshotNote(input.now)}`,
    people: personIdsSql(personIds),
    isDemo: false,
    createdById: input.employeeId,
    emptyError: () => new DashboardSegmentEmptyError(input.list),
  });

  log.info('сегмент-список из списка дашборда заведён', {
    month: input.month,
    list: input.list,
    segmentId: segment.segmentId,
    members,
  });

  return segment;
};

import { consola } from 'consola';
import { listDueGifts } from '#server/repositories/gifts';
import { creditGiftByDeadline } from '#server/services/gifts/creditGift';

/**
 * Автозачисление: ждущие подарки, чей день наступил, ложатся на баланс сами (issue #219).
 * Незабранный подарок не сгорает — это решение по подаркам, а не недосмотр: сгоревший
 * праздничный подарок — повод для жалоб парку.
 *
 * **Каждый подарок — своей транзакцией**, как сгорание наград: один упавший не держит
 * остальных. Сообщения водителю об автозачислении нет.
 *
 * Прогон идёт пачками до конца очереди, а не одной пачкой за раз: раздача сегменту —
 * это тысячи подарков с одним сроком, и пачка в час растянула бы их зачисление на сутки.
 * Следующая пачка берётся после последнего идентификатора прежней — подарок, упавший
 * в этом прогоне, не выбирается в нём снова и ждёт следующего.
 */

const log = consola.withTag('gifts:credit-due');

const BATCH_SIZE = 500;

export type CreditDueGiftsSummary = {
  found: number;
  credited: number;
  /** Забрал сам между выборкой и зачислением. */
  alreadyClaimed: number;
  /** Не зачислились: разбирать по логу. Следующий прогон попробует снова. */
  failed: number;
};

export const creditDueGifts = async (): Promise<CreditDueGiftsSummary> => {
  const summary: CreditDueGiftsSummary = { found: 0, credited: 0, alreadyClaimed: 0, failed: 0 };
  let afterId: string | null = null;

  for (;;) {
    const batch = await listDueGifts(BATCH_SIZE, afterId);

    for (const { id } of batch) {
      try {
        if (await creditGiftByDeadline(id)) {
          summary.credited += 1;
        } else {
          summary.alreadyClaimed += 1;
        }
      } catch (error) {
        summary.failed += 1;
        log.error('подарок не зачислился по сроку', {
          rewardId: id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    summary.found += batch.length;
    afterId = batch.at(-1)?.id ?? null;

    if (batch.length < BATCH_SIZE) {
      break;
    }
  }

  // Итог прогона одной строкой: прогон, о котором в логе ничего нет, неотличим
  // от незаведённого расписания.
  log.info('прогон автозачисления подарков завершён', summary);

  return summary;
};

import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { settleCampaignOutcomes } from '#server/services/campaigns/settleCampaignOutcomes';

/**
 * Очередь акций. Сейчас в ней одна повторяемая задача — итог окна (issue #168).
 *
 * **Своя, а не очередь заказов.** Итог окна — это волна в тысячи участников раз в неделю,
 * просрочка — десяток заказов раз в пять минут; вставшая за итогом просрочка держала бы
 * резерв товара и списанные баллы лишнее время. Автоматика цепочек акции — напоминания,
 * вторые касания — приедет сюда же своей задачей.
 *
 * Расписание — планировщиком BullMQ с постоянным идентификатором, как у синхронизации
 * и просрочки: интервал обновляется на месте, а не заводит второе расписание.
 */

const log = consola.withTag('queue:campaigns');

export const CAMPAIGNS_QUEUE_NAME = 'campaigns';

/** Постоянный идентификатор расписания: по нему оно обновляется и снимается. */
const OUTCOME_SCHEDULER_ID = 'campaigns-outcome';

/**
 * Раз в пятнадцать минут. Работы почти всегда нет — окно кончается раз в неделю, — и прогон
 * без работы стоит один запрос. Реже нельзя: итог, объявленный в 09:40 вместо 09:00, водитель
 * ждёт, открыв экран. Чаще незачем: буфер после конца окна и так четыре часа.
 */
const OUTCOME_INTERVAL_MS = 15 * 60 * 1_000;

export type CampaignsJobData = { kind: 'outcome' };

export const createCampaignsQueue = (): Queue<CampaignsJobData> =>
  new Queue<CampaignsJobData>(CAMPAIGNS_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: следующий через пятнадцать минут возьмёт
      // тех же участников — исход пишется только туда, где его ещё нет.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

/** Заводит расписание итога окна. Интервал постоянный, поэтому аргументов у цели нет. */
export const applyCampaignsSchedule = async (queue: Queue<CampaignsJobData>): Promise<void> => {
  await queue.upsertJobScheduler(
    OUTCOME_SCHEDULER_ID,
    { every: OUTCOME_INTERVAL_MS },
    { name: 'outcome', data: { kind: 'outcome' } },
  );

  log.info('Расписание итога окна заведено', { everySec: OUTCOME_INTERVAL_MS / 1_000 });
};

export const createCampaignsWorker = (): Worker<CampaignsJobData> =>
  new Worker<CampaignsJobData>(
    CAMPAIGNS_QUEUE_NAME,
    async () => {
      await settleCampaignOutcomes(new Date());
    },
    {
      connection: getQueueConnection(),
      // По одному: два прогона разом посчитали бы одних и тех же участников дважды впустую —
      // записал бы всё равно только первый.
      concurrency: 1,
    },
  );

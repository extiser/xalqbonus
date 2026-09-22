import { Queue, Worker } from 'bullmq';
import { consola } from 'consola';
import { getQueueConnection } from '#server/queues/connection';
import { revealCampaignChests } from '#server/services/campaigns/revealCampaignChests';
import { settleCampaignOutcomes } from '#server/services/campaigns/settleCampaignOutcomes';

/**
 * Очередь акций. В ней две повторяемые задачи: итог окна в 09:00 (issue #168) и вскрытие
 * неоткрытых сундуков в 21:00 (issue #182) — каждая своим планировщиком.
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

/** Постоянные идентификаторы расписаний: по ним они обновляются и снимаются. */
const OUTCOME_SCHEDULER_ID = 'campaigns-outcome';
const REVEAL_SCHEDULER_ID = 'campaigns-reveal';

/**
 * Раз в пятнадцать минут. Работы почти всегда нет — окно кончается раз в неделю, — и прогон
 * без работы стоит один запрос. Реже нельзя: итог, объявленный в 09:40 вместо 09:00, водитель
 * ждёт, открыв экран. Чаще незачем: буфер после конца окна и так четыре часа.
 */
const OUTCOME_INTERVAL_MS = 15 * 60 * 1_000;

/**
 * Вскрытие — тем же интервалом и по тем же доводам: работы почти никогда нет, а вскрытие
 * в 21:14 вместо 21:00 водитель не заметит. Прогон без работы стоит один запрос.
 */
const REVEAL_INTERVAL_MS = 15 * 60 * 1_000;

export type CampaignsJobData = { kind: 'outcome' } | { kind: 'reveal' };

export const createCampaignsQueue = (): Queue<CampaignsJobData> =>
  new Queue<CampaignsJobData>(CAMPAIGNS_QUEUE_NAME, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      // Повтор упавшего прогона очередью не нужен: следующий через пятнадцать минут возьмёт
      // тех же участников — исход пишется только туда, где его ещё нет, а вскрывается только
      // то, у чего нет строки сундука.
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });

/** Заводит расписания итога окна и вскрытия. Интервалы постоянные, поэтому аргументов у цели нет. */
export const applyCampaignsSchedule = async (queue: Queue<CampaignsJobData>): Promise<void> => {
  await queue.upsertJobScheduler(
    OUTCOME_SCHEDULER_ID,
    { every: OUTCOME_INTERVAL_MS },
    { name: 'outcome', data: { kind: 'outcome' } },
  );

  log.info('Расписание итога окна заведено', { everySec: OUTCOME_INTERVAL_MS / 1_000 });

  await queue.upsertJobScheduler(
    REVEAL_SCHEDULER_ID,
    { every: REVEAL_INTERVAL_MS },
    { name: 'reveal', data: { kind: 'reveal' } },
  );

  log.info('Расписание вскрытия сундуков заведено', { everySec: REVEAL_INTERVAL_MS / 1_000 });
};

const runCampaignsJob = async (data: CampaignsJobData): Promise<void> => {
  switch (data.kind) {
    case 'outcome':
      await settleCampaignOutcomes(new Date());
      return;
    case 'reveal':
      await revealCampaignChests(new Date());
      return;
  }
};

export const createCampaignsWorker = (): Worker<CampaignsJobData> =>
  new Worker<CampaignsJobData>(
    CAMPAIGNS_QUEUE_NAME,
    async (job) => {
      await runCampaignsJob(job.data);
    },
    {
      connection: getQueueConnection(),
      // По одному: два прогона разом посчитали бы одних и тех же участников дважды впустую —
      // записал бы всё равно только первый. Итог и вскрытие так тоже не идут внахлёст.
      concurrency: 1,
    },
  );

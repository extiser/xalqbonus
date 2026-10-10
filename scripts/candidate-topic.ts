/**
 * Ставит тему, карточку и приветствие кандидата для уже поданной заявки (issue #463) — в очередь
 * воркера `candidates`, тем же заданием, что ставит подача заявки.
 *
 * Нужна для заявок, поданных до того, как задана группа сотрудников, и для локальной проверки:
 * Mini App локально не открывается, и заявка заводится строкой в базе. Сделанные шаги задание
 * пропускает само, поэтому повторный запуск безопасен.
 *
 * Адрес приложения — для ссылки на заявку в карточке. В задании подачи он берётся из запроса,
 * здесь запроса нет, и адрес передаётся вторым аргументом.
 *
 * Запуск: make candidate-topic APPLICATION=<uuid> [ORIGIN=http://localhost:3003]
 */
import { consola } from 'consola';

import { closeCandidatesQueue, requeueCandidateTopic } from '#server/queues/candidates';
import { closeQueueConnection } from '#server/queues/connection';

const log = consola.withTag('candidate-topic');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const main = async (): Promise<void> => {
  const applicationId = process.argv[2] ?? '';
  const appOrigin = process.argv[3] ?? '';

  if (!UUID_PATTERN.test(applicationId)) {
    throw new Error(`идентификатор заявки — uuid, получено «${applicationId}»`);
  }

  if (!/^https?:\/\/[^/]+$/.test(appOrigin)) {
    throw new Error(`адрес приложения — схема и хост без пути, получено «${appOrigin}»`);
  }

  const outcome = await requeueCandidateTopic({ applicationId, appOrigin });

  if (outcome === 'already_queued') {
    log.warn('задание этой заявки ещё в очереди — новое не ставится', { applicationId });

    return;
  }

  log.info('задание поставлено в очередь воркера', { applicationId, appOrigin });
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCandidatesQueue();
    await closeQueueConnection();
  });

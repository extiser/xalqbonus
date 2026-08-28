import { consola } from 'consola';
import { checkDependencies } from '#server/services/health/checkDependencies';
import type { ReadinessResult } from '#server/types/health';

const log = consola.withTag('api:ready');

// Готовность принимать нагрузку: база и очередь доступны. Этого ответа ждёт выкат.
export default defineEventHandler(async (event): Promise<ReadinessResult> => {
  const checks = await checkDependencies();
  const isReady = checks.postgres === 'up' && checks.redis === 'up';

  if (!isReady) {
    log.warn('проба готовности не прошла', { checks });
    setResponseStatus(event, 503);
    return { status: 'not_ready', checks };
  }

  return { status: 'ready', checks };
});

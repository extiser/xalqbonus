import { consola } from 'consola';

import { findApplicationMatch, recordApplicationMatch } from '#server/repositories/candidateApplicationAdmin';
import { reconcileCandidatePhone } from '#server/services/candidates/reconcileCandidatePhone';

/**
 * Пересверка номера заявки, которую не удалось сверить при подаче (issue #471): Fleet API
 * не ответил или не уложился в срок. Ставит её карточка заявки при открытии, идёт она в фоне,
 * и итог карточка покажет при следующем открытии.
 *
 * Заявка уже сверена — ничего: пересверка пришла второй. Сверка снова не удалась — тоже ничего,
 * следующее открытие карточки поставит её ещё раз.
 */

const log = consola.withTag('candidates:recheck');

export type RecheckCandidateMatchOutcome = 'missing' | 'already_matched' | 'still_failed' | 'matched';

export const recheckCandidateMatch = async (
  applicationId: string,
  now: Date = new Date(),
): Promise<RecheckCandidateMatchOutcome> => {
  const application = await findApplicationMatch(applicationId);

  if (!application) {
    return 'missing';
  }

  if (application.match !== 'lookup_failed') {
    return 'already_matched';
  }

  const result = await reconcileCandidatePhone(application.phoneE164, now);

  if (result.match === 'lookup_failed') {
    log.info('пересверка номера заявки снова не удалась', { applicationId });

    return 'still_failed';
  }

  const recorded = await recordApplicationMatch(applicationId, result);

  log.info('пересверка номера заявки', { applicationId, match: result.match, recorded });

  return recorded ? 'matched' : 'already_matched';
};

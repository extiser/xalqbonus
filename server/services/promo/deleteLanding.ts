import { deleteLandingVersionDir } from '#server/adapters/uploads/landingFiles';
import { deleteLandingWithVersions } from '#server/repositories/landings';
import { LandingFailure } from '#server/services/promo/landingFailure';

/**
 * Удаление лендинга (issue #478): строки версий, сам лендинг и каталоги версий на томе. Лендинг,
 * стоящий хоть у одной метки, не удаляется — `landing_in_use`, его можно только убрать в архив.
 *
 * Каталоги снимаются после строк, и их отказ удаление не роняет: строк уже нет, и лендинг
 * удалён — оставшийся каталог лишь мусор на томе, а отказ человеку после удаления был бы неправдой.
 */
export const deleteLanding = async (landingId: string): Promise<void> => {
  const result = await deleteLandingWithVersions(landingId);

  if (result.outcome !== 'deleted') {
    throw new LandingFailure(result.outcome === 'in_use' ? 'landing_in_use' : 'landing_not_found');
  }

  await Promise.all(result.versionIds.map((versionId) => deleteLandingVersionDir(versionId).catch(() => undefined)));
};

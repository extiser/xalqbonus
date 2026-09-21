import { CampaignSlugTakenError } from '#server/services/campaigns/errors';
import { isConstraintViolation, UNIQUE_VIOLATION } from '#server/utils/postgresErrors';

/**
 * Занятый `slug` — отказ по полю, а не пятисотка.
 *
 * Уникальность держит база (`campaigns_slug_key`), а не проверка перед записью: две формы,
 * сохраняющие одно имя разом, обе прошли бы проверку. Здесь отбитая запись только получает
 * человеческое имя. Всё остальное пробрасывается как есть.
 */
export const rethrowSlugConflict = (error: unknown, slug: string | null): never => {
  if (slug !== null && isConstraintViolation(error, UNIQUE_VIOLATION, 'campaigns_slug_key')) {
    throw new CampaignSlugTakenError(slug);
  }

  throw error;
};

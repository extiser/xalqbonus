/**
 * Построение окна инкрементального прогона профилей.
 *
 * Окно строится по `updated_at` профиля: от отметки минус перекрытие до текущего момента
 * минус отставание. Соображения те же, что у заказов, — перекрытие безопасно, потому что
 * повтор отсекается записью по `profile_id`, и дешевле перечитать лишний профиль, чем
 * однажды не перечитать нужный.
 *
 * Времена — в UTC: API отдаёт и фильтрует в UTC, подстановка местного времени сдвинула бы
 * выборку на пять часов (docs/yandex-fleet.md).
 *
 * Потолка ширины здесь нет намеренно. У заказов он нужен, потому что ширина окна прямо
 * задаёт число страниц; здесь ширину ограничивает не время, а глубина offset, и меряется
 * она промером `total` уже в прогоне: окно ужимается по факту, а не по догадке.
 */
import type { ProfilesWindow } from '#server/adapters/fleet/profiles';
import type { SyncConfig } from '#server/services/sync/config';

export type RegistryWindowInput = {
  /** Отметка синхронизации реестра. Пусто — прогонов ещё не было. */
  watermark: Date | null;
  now: Date;
  config: SyncConfig;
};

const MINUTE_MS = 60_000;
const SECOND_MS = 1_000;

/**
 * Возвращает окно прогона или `null`, если запрашивать нечего.
 *
 * Пустое окно — не ошибка: так выглядит прогон, запущенный сразу после предыдущего
 * успешного. Прогон при этом не заводится вовсе, и отметка остаётся на месте.
 */
export const buildRegistryWindow = (input: RegistryWindowInput): ProfilesWindow | null => {
  const { config } = input;
  const updatedTo = new Date(input.now.getTime() - config.registryLagSeconds * SECOND_MS);
  const updatedFrom = new Date(
    (input.watermark ?? updatedTo).getTime() - config.registryOverlapMinutes * MINUTE_MS,
  );

  return updatedTo > updatedFrom ? { updatedFrom, updatedTo } : null;
};

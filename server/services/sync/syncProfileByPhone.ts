import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import { PROFILES_SEARCH_LIMIT, readProfilesPage } from '#server/adapters/fleet/profiles';
import { saveSyncRunRegistry } from '#server/repositories/syncRunRegistry';
import { finishSyncRun, startSyncRun } from '#server/repositories/syncRuns';
import {
  applyProfilesPage,
  createRegistryWriteState,
  toRunDetails,
  warnAboutFindings,
} from '#server/services/sync/registryWrite';

/**
 * Точечный прогон реестра: найти в Fleet API профили по одному телефону и записать их.
 *
 * Зовёт его бот, когда номер водителя не нашёлся в реестре при регистрации. **Писать
 * в реестр бот при этом не умеет и не должен**: запись идёт тем же путём, каким её ведёт
 * плановый обход (`registryWrite.ts`), и второго места, умеющего заводить профиль,
 * в проекте не появляется.
 *
 * Отличий от планового прогона ровно два, и оба принципиальны:
 *
 *   - **отметка синхронизации не двигается вовсе.** Прогон видел один профиль, а не окно;
 *     сдвиг отметки после него потерял бы всех остальных, кто изменился за то же время.
 *     Ради этого у него свой вид прогона `registry_profile`: `registry_full` двигает
 *     отметку `registry` и для этого не годится;
 *   - **выборка задаётся не фильтром, а свободным поиском** — тем же полем `query.text`,
 *     каким ищет форма парка.
 *
 * Всё остальное общее: строка в `sync_runs` со счётчиками, детали в `sync_run_registry`,
 * пропущенное в `sync_skips`. Попытки регистрации — это трафик к Fleet API, и считаться
 * он обязан там же, где остальной.
 */

const log = consola.withTag('sync:profile');

const RUN_KIND = 'registry_profile';

export type ProfileLookupSummary = {
  runId: string;
  requests: number;
  rateLimited: number;
  /**
   * Профилей показал Fleet API — включая те, что записать не вышло.
   *
   * Именно это число отличает «парк такого номера не знает» от «профиль есть, но завести
   * его в реестре нечем»: у второго исхода водитель идёт в офис по другой причине, и путать
   * их в журнале попыток нельзя.
   */
  profilesSeen: number;
  profilesInserted: number;
  profilesUpdated: number;
  /** Профили без номера удостоверения: не заведены, лежат в `sync_skips` причиной `malformed`. */
  skippedWithoutLicense: number;
  malformed: number;
};

export type RunProfileSyncOptions = {
  /** Подставляется тестами и разовым запуском. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

/**
 * Ищет профили по телефону и записывает найденное в реестр.
 *
 * Ошибку не глотает: отказ Fleet API и отказ базы закрывают строку прогона и уходят
 * наверх исключением. Что показать водителю, решает тот, кто прогон позвал, — здесь
 * об этом неизвестно ничего (docs/principles.md → «Ошибки»).
 */
export const runProfileSyncByPhone = async (
  phoneE164: string,
  options: RunProfileSyncOptions = {},
): Promise<ProfileLookupSummary> => {
  const now = options.now ?? new Date();

  // Клиент собирается до строки прогона: незаполненные реквизиты в окружении — это отказ
  // на старте, а не прогон, навсегда оставшийся в состоянии `running`.
  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind: RUN_KIND, description, attempt, waitMs });
      },
    });

  // Окна у точечного прогона нет: он спрашивает про один номер, а не про отрезок времени.
  // Обе границы пусты — выдуманный фильтр в журнале хуже пустого.
  const runId = await startSyncRun(RUN_KIND, null, null);
  const writeState = createRegistryWriteState();

  try {
    // Телефон в описание запроса не попадает: описание уезжает в лог и в текст ошибки.
    const page = await readProfilesPage(
      client,
      {
        filter: null,
        window: null,
        searchText: phoneE164,
        sortField: 'created_date',
        direction: 'asc',
        offset: 0,
        limit: PROFILES_SEARCH_LIMIT,
      },
      'поиск профиля по телефону',
    );

    await applyProfilesPage(writeState, page, runId, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stats = client.stats();

    await finishSyncRun(
      runId,
      'failed',
      {
        requests: stats.requests,
        rateLimited: stats.rateLimited,
        itemsSeen: writeState.profiles.seen.size,
        itemsWritten: writeState.profiles.written.size,
      },
      message,
    );

    // Детали пишутся и у упавшего прогона, но под своим `try`: прогон падает чаще всего
    // потому, что недоступна база, и без перехвата эта запись заменила бы собой настоящую
    // ошибку.
    try {
      await saveSyncRunRegistry(runId, toRunDetails(writeState));
    } catch (detailsError) {
      log.error('Детали упавшего прогона записать не удалось — осталась только строка прогона', {
        kind: RUN_KIND,
        runId,
        error: detailsError instanceof Error ? detailsError.message : String(detailsError),
      });
    }

    log.error('Точечный прогон по телефону упал', { kind: RUN_KIND, runId, error: message });

    throw error;
  }

  const stats = client.stats();

  // До закрытия строки: успешным прогон объявляется тогда, когда его детали уже в базе.
  await saveSyncRunRegistry(runId, toRunDetails(writeState));

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: writeState.profiles.seen.size,
      itemsWritten: writeState.profiles.written.size,
    },
    null,
  );

  // Отметка синхронизации здесь не трогается — см. заголовок файла. Это не забытый шаг,
  // а весь смысл отдельного вида прогона.

  const summary: ProfileLookupSummary = {
    runId,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    profilesSeen: writeState.profiles.seen.size,
    profilesInserted: writeState.profiles.inserted.size,
    profilesUpdated: writeState.profiles.written.size - writeState.profiles.inserted.size,
    skippedWithoutLicense: writeState.counters.skippedWithoutLicense,
    malformed: writeState.counters.malformed,
  };

  // Телефона в логе нет: он персональные данные, а идентификатор профиля — нет.
  log.info('Точечный прогон по телефону завершён', { kind: RUN_KIND, ...summary });

  warnAboutFindings(RUN_KIND, writeState);

  return summary;
};

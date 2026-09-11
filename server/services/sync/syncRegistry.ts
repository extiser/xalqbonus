import { consola } from 'consola';

import { createFleetClient, type FleetTransport } from '#server/adapters/fleet/client';
import {
  probeProfilesTotal,
  PROFILES_PAGE_SIZE,
  readProfilesPage,
  readUpdatedAtEdge,
  readWorkRules,
  type ProfileFilter,
  type ProfileSortField,
  type ProfilesPage,
  type ProfilesWindow,
} from '#server/adapters/fleet/profiles';
import type { MalformedProfile } from '#server/adapters/fleet/registryProfile';
import { saveSyncRunRegistry } from '#server/repositories/syncRunRegistry';
import { finishSyncRun, narrowSyncRunWindow, startSyncRun } from '#server/repositories/syncRuns';
import { readSyncState, setSyncWatermark } from '#server/repositories/syncState';
import { buildRegistryWindow } from '#server/services/sync/buildRegistryWindow';
import {
  readSyncConfig,
  staleWatermarkThresholdMs,
  type RegistrySyncKind,
  type SyncConfig,
} from '#server/services/sync/config';
import {
  fitsByDepth,
  MIN_WINDOW_SECONDS,
  passesFor,
  STAGE_REASON,
  windowAccepts,
  type ChunkPass,
  type ChunkStage,
} from '#server/services/sync/registryChunks';
import {
  applyProfilesPage,
  createRegistryWriteState,
  toRunDetails,
  warnAboutFindings,
  type Counters,
} from '#server/services/sync/registryWrite';

/**
 * Прогон синхронизации профилей парка.
 *
 * Два режима, один код записи:
 *
 *   - **`registry`** — инкрементальный, по расписанию. Берёт изменившихся окном
 *     по `updated_at`. Это рабочий режим и единицы запросов в сутки;
 *   - **`registry_full`** — полный обход нарезкой, по требованию: первое наполнение,
 *     подозрение на расхождение, аудит. По расписанию не ходит никогда.
 *
 * Что здесь принципиально:
 *
 *   - **отметка двигается только после успешного прогона**, и у инкрементального —
 *     по верхней границе окна, которое реально взято, а не которое хотелось взять;
 *   - **полный обход двигает отметку по времени начала обхода**: обход идёт около
 *     получаса, и профиль, изменившийся во время него, иначе провалился бы в щель;
 *   - **кусок считается взятым, только когда число различных `id` сошлось с его `total`**.
 *     Не сошёлся — дробится окнами, не помогло — прогон падает явной ошибкой. Молча
 *     неполный обход хуже отсутствующего: на его основании закроют вопрос «всех ли
 *     мы видим» (docs/decisions.md → «Реестр парка выгружается нарезкой»);
 *   - **ничего не удаляется.** Профиль, пропавший из ответов API, остаётся как есть:
 *     признака удаления этот API не отдаёт, и догадываться о нём по отсутствию
 *     в выборке нельзя;
 *   - **участие в программе здесь не заводится и не трогается**: реестр — это все, кого
 *     знает парк, а участие начинается привязкой Telegram (docs/drivers.md).
 */

const log = consola.withTag('sync:registry');

/** Статусы, каждый из которых берётся своим куском. `working` режется по условиям работы. */
const STATUS_CHUNKS = ['fired', 'not_working'] as const;

const WORKING_STATUS = 'working';

export type RegistrySyncStatus = 'succeeded' | 'failed' | 'skipped';

export type RegistrySyncSummary = {
  kind: RegistrySyncKind;
  status: RegistrySyncStatus;
  /** Пусто, если прогон не заводился: окно оказалось пустым. */
  runId: string | null;
  /** Окно, которое реально взято. У полного обхода окна нет вовсе. */
  window: ProfilesWindow | null;
  /** Отметка, на которую встал прогон. Пусто у неуспешного и незаводившегося. */
  watermark: Date | null;
  requests: number;
  rateLimited: number;
  pages: number;
  /** Различных профилей, которые показал API. Не строк ответа — см. `responseRows`. */
  profilesSeen: number;
  /** Из них появились в реестре впервые. */
  profilesInserted: number;
  /** Из них уже были: прогон их подтвердил. */
  profilesUpdated: number;
  /**
   * Строк в ответах API.
   *
   * У полного обхода заметно больше числа профилей: половины куска, взятого с двух концов,
   * перекрываются намеренно. Это мера стоимости нарезки — она растёт вместе с парком
   * и первой скажет, что раскладку кусков пора менять.
   */
  responseRows: number;
  personsCreated: number;
  statusEvents: number;
  phonesOpened: number;
  phonesClosed: number;
  licensesUpdated: number;
  licenseConflicts: number;
  skippedWithoutLicense: number;
  malformed: number;
  malformedIds: MalformedProfile[];
  resolvedSkips: number;
  unknownValues: string[];
  chunksTotal: number;
  chunksWindowed: number;
  maxOffsetDepth: number;
};

/**
 * Кусок не сошёлся с собственным `total` даже после дробления окнами.
 *
 * Отдельным типом, а не общей ошибкой: это не поломка кода и не отказ сети, а ровно тот
 * случай, ради которого сверка счётчика и делается, — обход неполон, и знать об этом надо
 * до того, как на него сошлются.
 */
export class RegistryChunkShortError extends Error {
  constructor(
    public readonly chunk: string,
    public readonly collected: number,
    public readonly expected: number,
  ) {
    super(`кусок «${chunk}»: собрано ${collected} из ${expected}, окна положение не исправили`);
    this.name = 'RegistryChunkShortError';
  }
}

/** Кусок обхода: непересекающаяся часть реестра со своим фильтром и своим размером. */
type RegistryChunk = {
  key: string;
  title: string;
  filter: ProfileFilter;
  total: number;
};

export type RunRegistrySyncOptions = {
  /** Подставляется тестами и разовым запуском. По умолчанию — настоящий клиент Fleet API. */
  client?: FleetTransport;
  now?: Date;
};

export const runRegistrySync = async (
  kind: RegistrySyncKind,
  options: RunRegistrySyncOptions = {},
): Promise<RegistrySyncSummary> => {
  const config = readSyncConfig();
  const now = options.now ?? new Date();
  const state = await readSyncState('registry');
  const requestedWindow =
    kind === 'registry'
      ? buildRegistryWindow({ watermark: state?.watermark ?? null, now, config })
      : null;

  if (kind === 'registry' && !requestedWindow) {
    log.info('Окно пусто, прогон не заводится', { kind, watermark: state?.watermark ?? null });

    return emptySummary(kind);
  }

  if (kind === 'registry' && !state?.watermark) {
    log.warn(
      'Отметка синхронизации реестра пуста — прогон берёт только окно перекрытия. Весь реестр закроет полный обход',
      { kind },
    );
  }

  warnIfWatermarkStale(state?.watermark ?? null, now, config);

  // Клиент собирается до строки прогона: незаполненные реквизиты в окружении — это отказ
  // на старте, а не прогон, навсегда оставшийся в состоянии `running`.
  const client =
    options.client ??
    createFleetClient({
      onRateLimited: (description, attempt, waitMs) => {
        log.warn('Отказ по лимиту Fleet API', { kind, description, attempt, waitMs });
      },
    });

  // В журнал уходит окно, которое **спрашивают у API**, а не время прогона: у заказов
  // отметка совпадает с `window_to` до микросекунды, и у профилей обязана совпадать тоже.
  // У полного обхода окна нет вовсе — обе границы пусты, и «когда он шёл» отвечает
  // `started_at`, а не выдуманный фильтр.
  const runId = await startSyncRun(
    kind,
    requestedWindow?.updatedFrom ?? null,
    requestedWindow?.updatedTo ?? null,
  );

  // Всё, что прогон копит о себе, — одной структурой: счётчики, множества профилей,
  // незнакомые значения словарей, образец неразобранного. Она же уезжает в детали прогона.
  const writeState = createRegistryWriteState();
  const { counters, profiles, malformedIds } = writeState;
  // Окно есть только у инкрементального прогона: пустое окно у него отсеяно выше,
  // а у полного обхода его не бывает вовсе.
  let takenWindow: ProfilesWindow | null = requestedWindow;

  /**
   * Что делать с каждой пришедшей страницей. Одинаково в обоих режимах — и то же самое,
   * что делает точечный прогон по телефону: запись реестра одна на всех (registryWrite.ts).
   */
  const handlePage = (page: ProfilesPage, seen?: Set<string>): Promise<void> =>
    applyProfilesPage(writeState, page, runId, now, seen);

  try {
    if (requestedWindow) {
      takenWindow = await crawlIncremental(client, requestedWindow, counters, handlePage);
    } else {
      await crawlFull(client, counters, handlePage);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stats = client.stats();

    await finishSyncRun(
      runId,
      'failed',
      {
        requests: stats.requests,
        rateLimited: stats.rateLimited,
        // В общую таблицу прогонов уходят различные профили, а не строки ответа:
        // `sync_runs` складывается по видам прогона, и мерить их разными единицами нельзя.
        itemsSeen: profiles.seen.size,
        itemsWritten: profiles.written.size,
      },
      message,
    );

    // Детали пишутся и у упавшего прогона — у него они и важнее всего. Но после закрытия
    // строки и под своим `try`: прогон падает чаще всего именно потому, что база
    // недоступна, и без перехвата эта запись заменила бы собой настоящую ошибку.
    try {
      await saveSyncRunRegistry(runId, toRunDetails(writeState));
    } catch (detailsError) {
      log.error('Детали упавшего прогона записать не удалось — осталась только строка прогона', {
        kind,
        runId,
        error: detailsError instanceof Error ? detailsError.message : String(detailsError),
      });
    }

    // Отметка не трогается намеренно: окно будет перечитано целиком следующим прогоном.
    log.error('Прогон синхронизации профилей упал, отметка осталась на месте', {
      kind,
      runId,
      pages: counters.pages,
      profilesSeen: profiles.seen.size,
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      error: message,
    });

    throw error;
  }

  const stats = client.stats();

  // Окно ужалось по глубине — журнал обязан показать взятую границу, а не запрошенную:
  // на неё же встанет отметка, и расходиться этим двум числам нельзя.
  if (
    requestedWindow &&
    takenWindow &&
    takenWindow.updatedTo.getTime() !== requestedWindow.updatedTo.getTime()
  ) {
    await narrowSyncRunWindow(runId, takenWindow.updatedTo);
  }

  // До закрытия строки: успешным прогон объявляется тогда, когда его детали уже в базе.
  await saveSyncRunRegistry(runId, toRunDetails(writeState));

  await finishSyncRun(
    runId,
    'succeeded',
    {
      requests: stats.requests,
      rateLimited: stats.rateLimited,
      itemsSeen: profiles.seen.size,
      itemsWritten: profiles.written.size,
    },
    null,
  );

  // Инкрементальный прогон встаёт на верхнюю границу окна, которое **взято**: если окно
  // пришлось ужать по глубине, остаток догонит следующий прогон. Полный обход встаёт
  // на время своего начала с запасом назад — он идёт около получаса, и изменившееся
  // во время него иначе провалилось бы в щель.
  const watermark = takenWindow
    ? takenWindow.updatedTo
    : new Date(now.getTime() - config.registryOverlapMinutes * 60_000);

  await setSyncWatermark('registry', watermark, runId);

  const summary: RegistrySyncSummary = {
    kind,
    status: 'succeeded',
    runId,
    window: takenWindow,
    watermark,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    pages: counters.pages,
    profilesSeen: profiles.seen.size,
    profilesInserted: profiles.inserted.size,
    profilesUpdated: profiles.written.size - profiles.inserted.size,
    responseRows: counters.responseRows,
    personsCreated: counters.personsCreated,
    statusEvents: counters.statusEvents,
    phonesOpened: counters.phonesOpened,
    phonesClosed: counters.phonesClosed,
    licensesUpdated: counters.licensesUpdated,
    licenseConflicts: counters.licenseConflicts,
    skippedWithoutLicense: counters.skippedWithoutLicense,
    malformed: counters.malformed,
    malformedIds,
    resolvedSkips: counters.resolvedSkips,
    unknownValues: [...writeState.unknownValues],
    chunksTotal: counters.chunksTotal,
    chunksWindowed: counters.chunksWindowed,
    maxOffsetDepth: counters.maxOffsetDepth,
  };

  // Сводка одной строкой. Имён, телефонов и номеров удостоверений в логе нет:
  // идентификатор профиля персональными данными не является, остальное — является.
  log.info('Прогон синхронизации профилей завершён', {
    kind,
    runId,
    updatedFrom: takenWindow?.updatedFrom.toISOString() ?? null,
    updatedTo: takenWindow?.updatedTo.toISOString() ?? null,
    watermark: watermark.toISOString(),
    pages: counters.pages,
    requests: stats.requests,
    rateLimited: stats.rateLimited,
    profilesSeen: summary.profilesSeen,
    profilesInserted: summary.profilesInserted,
    profilesUpdated: summary.profilesUpdated,
    responseRows: counters.responseRows,
    personsCreated: counters.personsCreated,
    statusEvents: counters.statusEvents,
    phonesOpened: counters.phonesOpened,
    phonesClosed: counters.phonesClosed,
    licensesUpdated: counters.licensesUpdated,
    licenseConflicts: counters.licenseConflicts,
    skippedWithoutLicense: counters.skippedWithoutLicense,
    malformed: counters.malformed,
    malformedIds,
    malformedIdsHidden: counters.malformed - malformedIds.length,
    resolvedSkips: counters.resolvedSkips,
    chunksTotal: counters.chunksTotal,
    chunksWindowed: counters.chunksWindowed,
    maxOffsetDepth: counters.maxOffsetDepth,
    unknownValues: summary.unknownValues,
  });

  warnAboutFindings(kind, writeState);

  return summary;
};

const emptySummary = (kind: RegistrySyncKind): RegistrySyncSummary => ({
  kind,
  status: 'skipped',
  runId: null,
  window: null,
  watermark: null,
  requests: 0,
  rateLimited: 0,
  pages: 0,
  profilesSeen: 0,
  profilesInserted: 0,
  profilesUpdated: 0,
  responseRows: 0,
  personsCreated: 0,
  statusEvents: 0,
  phonesOpened: 0,
  phonesClosed: 0,
  licensesUpdated: 0,
  licenseConflicts: 0,
  skippedWithoutLicense: 0,
  malformed: 0,
  malformedIds: [],
  resolvedSkips: 0,
  unknownValues: [],
  chunksTotal: 0,
  chunksWindowed: 0,
  maxOffsetDepth: 0,
});

/**
 * Жалуется в лог, если отметка застряла.
 *
 * Та же беда, что у заказов, и заметить её можно тем же способом: по расстоянию между
 * отметкой и текущим моментом. Если падать начнёт каждый прогон, строки в `sync_runs`
 * будут появляться, воркер будет жив, а реестр — стоять.
 */
const warnIfWatermarkStale = (watermark: Date | null, now: Date, config: SyncConfig): void => {
  if (!watermark) {
    return;
  }

  const lagMs = now.getTime() - watermark.getTime();
  const thresholdMs = staleWatermarkThresholdMs('registry', config);

  if (lagMs <= thresholdMs) {
    return;
  }

  log.warn('Отметка синхронизации реестра отстала — окно не движется, а прогоны идут', {
    watermark: watermark.toISOString(),
    lagMinutes: Math.round(lagMs / 60_000),
    thresholdMinutes: Math.round(thresholdMs / 60_000),
  });
};

type PageHandler = (page: ProfilesPage, seen?: Set<string>) => Promise<void>;

/**
 * Один проход по выборке в одну сторону сортировки.
 *
 * Страницы берутся целиком: хвост, вылезающий за половину, перекрывается со встречным
 * проходом и снимается по `id` — перекрытие дешевле, чем дыра на стыке половин.
 */
const walkPass = async (
  client: FleetTransport,
  request: {
    filter: ProfileFilter | null;
    window: ProfilesWindow | null;
    sortField: ProfileSortField;
  },
  pass: ChunkPass,
  title: string,
  counters: Counters,
  onPage: PageHandler,
  seen?: Set<string>,
): Promise<void> => {
  let offset = 0;

  while (offset < pass.target) {
    const page = await readProfilesPage(
      client,
      {
        filter: request.filter,
        window: request.window,
        sortField: request.sortField,
        direction: pass.direction,
        offset,
        limit: PROFILES_PAGE_SIZE,
      },
      `${title}, ${pass.direction} offset ${offset}`,
    );

    if (page.received === 0) {
      return;
    }

    counters.maxOffsetDepth = Math.max(counters.maxOffsetDepth, offset);
    offset += page.received;

    await onPage(page, seen);

    if (page.received < PROFILES_PAGE_SIZE) {
      return;
    }
  }
};

/**
 * Инкрементальный обход: одно окно по `updated_at` на весь парк, без нарезки.
 *
 * Окно ужимается, если изменившихся в нём оказалось больше, чем берётся разрешённой
 * глубиной offset. Ужимается по промеру, а не по догадке, и отметка потом встаёт
 * на взятую границу — остаток догонит следующий прогон, тем же способом, каким
 * у заказов работает потолок ширины окна.
 */
const crawlIncremental = async (
  client: FleetTransport,
  window: ProfilesWindow,
  counters: Counters,
  onPage: PageHandler,
): Promise<ProfilesWindow> => {
  let taken = window;
  let total = await probeProfilesTotal(client, null, taken, 'реестр, изменившиеся: размер окна');

  while (total > 0 && !fitsByDepth(total)) {
    const spanSeconds = (taken.updatedTo.getTime() - taken.updatedFrom.getTime()) / 1_000;

    if (spanSeconds <= MIN_WINDOW_SECONDS) {
      // Минута, за которую изменилось столько профилей, — это не окно, а массовая правка
      // в парке. Дробить дальше нечего: берём как есть и рассказываем об этом.
      log.warn('Окно ужато до предела, а профилей всё равно много — обход пойдёт вглубь', {
        total,
        spanSeconds,
      });
      break;
    }

    taken = {
      updatedFrom: taken.updatedFrom,
      updatedTo: new Date(taken.updatedFrom.getTime() + (spanSeconds / 2) * 1_000),
    };

    total = await probeProfilesTotal(client, null, taken, 'реестр, изменившиеся: размер окна');

    log.info('Окно ужато по глубине offset — остаток догонит следующий прогон', {
      updatedTo: taken.updatedTo.toISOString(),
      total,
    });
  }

  if (total === 0) {
    return taken;
  }

  for (const pass of passesFor(total)) {
    await walkPass(
      client,
      { filter: null, window: taken, sortField: 'updated_at' },
      pass,
      'реестр, изменившиеся',
      counters,
      onPage,
    );
  }

  return taken;
};

/**
 * План нарезки: `fired` и `not_working` — каждый своим куском, `working` — по куску
 * на условие работы. Профиль попадает ровно в один кусок по паре
 * `(work_status, work_rule_id)`.
 */
const buildChunkPlan = async (
  client: FleetTransport,
): Promise<{ registryTotal: number; chunks: RegistryChunk[] }> => {
  const registryTotal = await probeProfilesTotal(client, null, null, 'весь реестр, размер');
  const chunks: RegistryChunk[] = [];

  for (const status of STATUS_CHUNKS) {
    chunks.push({
      key: status,
      title: status,
      filter: { workStatus: [status] },
      total: await probeProfilesTotal(client, { workStatus: [status] }, null, `кусок ${status}, размер`),
    });
  }

  const workingFilter: ProfileFilter = { workStatus: [WORKING_STATUS] };
  const workingTotal = await probeProfilesTotal(client, workingFilter, null, 'кусок working, размер');
  const rules = await readWorkRules(client);
  const ruleChunks: RegistryChunk[] = [];

  for (const rule of rules) {
    const filter: ProfileFilter = { workStatus: [WORKING_STATUS], workRuleId: [rule.id] };

    ruleChunks.push({
      key: `working:${rule.id}`,
      title: `working / ${rule.name}`,
      filter,
      total: await probeProfilesTotal(
        client,
        filter,
        null,
        `кусок working/${rule.id.slice(0, 8)}…, размер`,
      ),
    });
  }

  const byRules = ruleChunks.reduce((sum, chunk) => sum + chunk.total, 0);

  if (byRules === workingTotal) {
    chunks.push(...ruleChunks);
  } else {
    // Условия работы не покрывают статус целиком: у части профилей `work_rule_id`
    // не из справочника или пуст. Такой остаток фильтром не выразить, поэтому `working`
    // берётся одним куском — он не влезет по глубине и уйдёт в дробление окнами.
    log.warn('Сумма по условиям работы не сходится с working — беру статус одним куском', {
      byRules,
      workingTotal,
      difference: byRules - workingTotal,
    });

    chunks.push({
      key: WORKING_STATUS,
      title: 'working (целиком)',
      filter: workingFilter,
      total: workingTotal,
    });
  }

  const planned = chunks.reduce((sum, chunk) => sum + chunk.total, 0);

  log.info('План обхода реестра построен', {
    registryTotal,
    chunks: chunks.length,
    nonEmpty: chunks.filter((chunk) => chunk.total > 0).length,
    planned,
    workRules: rules.length,
  });

  if (planned !== registryTotal) {
    log.warn('Сумма кусков не сходится с размером реестра', {
      planned,
      registryTotal,
      difference: planned - registryTotal,
    });
  }

  return { registryTotal, chunks };
};

/**
 * Дробление куска окнами по `updated_at`, пока каждое окно не станет приниматься правилом
 * ступени. Соседние окна перекрываются на секунду: полуинтервал в документации
 * не оговорён, а лишний повтор снимается по `id` — потерянная запись не восстанавливается
 * ничем.
 */
const splitWindow = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  since: Date,
  until: Date,
  accept: (total: number) => boolean,
  windows: { window: ProfilesWindow; total: number }[],
): Promise<void> => {
  const window: ProfilesWindow = { updatedFrom: since, updatedTo: until };
  const total = await probeProfilesTotal(
    client,
    chunk.filter,
    window,
    `${chunk.title}: окно ${since.toISOString()}…${until.toISOString()}, размер`,
  );

  if (total === 0) {
    return;
  }

  if (accept(total)) {
    windows.push({ window, total });
    return;
  }

  const spanSeconds = (until.getTime() - since.getTime()) / 1_000;

  if (spanSeconds <= MIN_WINDOW_SECONDS) {
    throw new RegistryChunkShortError(chunk.title, 0, total);
  }

  const middle = new Date(since.getTime() + (spanSeconds / 2) * 1_000);

  await splitWindow(client, chunk, since, middle, accept, windows);
  await splitWindow(client, chunk, new Date(middle.getTime() - 1_000), until, accept, windows);
};

const buildWindows = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  stage: ChunkStage,
): Promise<{ window: ProfilesWindow; total: number }[]> => {
  const since = await readUpdatedAtEdge(
    client,
    chunk.filter,
    null,
    'asc',
    `${chunk.title}: край updated_at asc`,
  );
  const until = await readUpdatedAtEdge(
    client,
    chunk.filter,
    null,
    'desc',
    `${chunk.title}: край updated_at desc`,
  );

  if (!since || !until) {
    throw new RegistryChunkShortError(chunk.title, 0, chunk.total);
  }

  const windows: { window: ProfilesWindow; total: number }[] = [];

  await splitWindow(
    client,
    chunk,
    since,
    new Date(until.getTime() + 1_000),
    windowAccepts(stage),
    windows,
  );

  log.info('Кусок разбит окнами по updated_at', { chunk: chunk.title, windows: windows.length });

  return windows;
};

/**
 * Берёт один кусок целиком.
 *
 * Кусок считается взятым, только когда число различных `id` сошлось с его `total`.
 * Не сошлось — виноват равный `created_date` у массово заведённых профилей: при равных
 * значениях сортировки offset-пагинация теряет строки на стыке страниц, и заметить это
 * можно единственным способом — сверкой счётчика. Такой кусок дробится окнами
 * по `updated_at` и берётся заново.
 */
const takeChunk = async (
  client: FleetTransport,
  chunk: RegistryChunk,
  counters: Counters,
  onPage: PageHandler,
  seenGlobally: Set<string>,
): Promise<void> => {
  const seen = new Set<string>();
  let stage: ChunkStage = fitsByDepth(chunk.total) ? 'direct' : 'windows';
  // Кусок, прошедший обе ступени дробления, всё равно один: счётчик отвечает на вопрос
  // «скольким кускам не хватило прямого прохода», а не «сколько раз мы дробили».
  let windowed = false;

  for (;;) {
    let segments: { window: ProfilesWindow | null; total: number }[];

    if (stage === 'direct') {
      segments = [{ window: null, total: chunk.total }];
    } else {
      log.info('Кусок берётся окнами', {
        chunk: chunk.title,
        total: chunk.total,
        collected: seen.size,
        reason: STAGE_REASON[stage],
      });

      if (!windowed) {
        windowed = true;
        counters.chunksWindowed += 1;
      }

      segments = await buildWindows(client, chunk, stage);
    }

    for (const segment of segments) {
      for (const pass of passesFor(segment.total)) {
        await walkPass(
          client,
          { filter: chunk.filter, window: segment.window, sortField: 'created_date' },
          pass,
          chunk.title,
          counters,
          onPage,
          seen,
        );
      }
    }

    if (seen.size === chunk.total || stage === 'windows_strict') {
      break;
    }

    // Не сошёлся по счёту — дальше только окна в одну страницу. Ступень «по глубине»
    // тут ничего не даст: она нарежет окна того же размера, что и неудавшийся проход,
    // и повторит ровно ту же потерю.
    stage = 'windows_strict';
  }

  if (seen.size !== chunk.total) {
    throw new RegistryChunkShortError(chunk.title, seen.size, chunk.total);
  }

  for (const profileId of seen) {
    seenGlobally.add(profileId);
  }

  log.info('Кусок закрыт', { chunk: chunk.title, collected: seen.size });
};

/** Полный обход реестра нарезкой. Запускается командой, по расписанию не ходит. */
const crawlFull = async (
  client: FleetTransport,
  counters: Counters,
  onPage: PageHandler,
): Promise<void> => {
  const { registryTotal, chunks } = await buildChunkPlan(client);

  counters.chunksTotal = chunks.length;

  const seenGlobally = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.total === 0) {
      continue;
    }

    await takeChunk(client, chunk, counters, onPage, seenGlobally);
  }

  // Куски сошлись каждый со своим размером, а общий счёт — нет. Так выглядит профиль,
  // не попавший ни в один кусок: например, с `work_status`, которого мы не знаем.
  if (seenGlobally.size !== registryTotal) {
    throw new RegistryChunkShortError('весь реестр', seenGlobally.size, registryTotal);
  }
};

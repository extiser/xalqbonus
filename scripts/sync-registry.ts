/**
 * Разовый прогон синхронизации профилей парка, мимо очереди.
 *
 * Тонкая обвязка над сервисом: разбор аргумента, вызов, сводка. Тем же кодом ходит
 * повторяющаяся задача воркера — второй реализации прогона не существует
 * (docs/principles.md → «Слои и зависимости»).
 *
 * Полный обход запускается **только отсюда**: по расписанию он не ходит никогда.
 * Поводы — первое наполнение реестра, подозрение на расхождение, аудит. Он берёт весь
 * парк нарезкой и идёт около получаса; рабочий режим — инкрементальный.
 *
 * Запуск: make sync-registry                      — инкрементальный прогон
 *         make sync-registry kind=registry_full    — полный обход нарезкой
 */
import { consola } from 'consola';

import { db } from '#server/db';
import type { RegistrySyncKind } from '#server/services/sync/config';
import { runRegistrySync } from '#server/services/sync/syncRegistry';

const log = consola.withTag('sync-registry');

const readKind = (): RegistrySyncKind => {
  const requested = process.argv[2] ?? 'registry';

  if (requested !== 'registry' && requested !== 'registry_full') {
    throw new Error(
      `вид прогона может быть registry или registry_full, получено «${requested}»`,
    );
  }

  return requested;
};

const main = async (): Promise<void> => {
  const summary = await runRegistrySync(readKind());

  if (summary.status === 'skipped') {
    log.info('Прогон не заводился: окно пусто');
    return;
  }

  log.info('Сводка прогона', {
    kind: summary.kind,
    runId: summary.runId,
    updatedFrom: summary.window?.updatedFrom.toISOString() ?? null,
    updatedTo: summary.window?.updatedTo.toISOString() ?? null,
    watermark: summary.watermark?.toISOString() ?? null,
    pages: summary.pages,
    requests: summary.requests,
    rateLimited: summary.rateLimited,
    profilesSeen: summary.profilesSeen,
    profilesInserted: summary.profilesInserted,
    profilesUpdated: summary.profilesUpdated,
    personsCreated: summary.personsCreated,
    statusEvents: summary.statusEvents,
    phonesOpened: summary.phonesOpened,
    phonesClosed: summary.phonesClosed,
    licensesUpdated: summary.licensesUpdated,
    licenseConflicts: summary.licenseConflicts,
    skippedWithoutLicense: summary.skippedWithoutLicense,
    malformed: summary.malformed,
    malformedIds: summary.malformedIds,
    resolvedSkips: summary.resolvedSkips,
    unknownValues: summary.unknownValues,
    chunksTotal: summary.chunksTotal,
    chunksWindowed: summary.chunksWindowed,
    maxOffsetDepth: summary.maxOffsetDepth,
  });
};

main()
  .catch((error: unknown) => {
    consola.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

import { readRegistryDumpMeta } from '#server/adapters/fleet/registryDump';
import { readSyncState, setSyncWatermark } from '#server/repositories/syncState';

/**
 * Шаг 6 переноса: отметка синхронизации реестра.
 *
 * Отметка равна **времени начала выгрузки**, из которой залит реестр, а не времени
 * прогона переноса, и берётся из сопроводительного файла выгрузки, а не из головы.
 * Плюс запас назад в сутки: профили, изменившиеся во время самого обхода, иначе
 * провалятся в щель между выгрузкой и первым прогоном синхронизации. Повтор безопасен —
 * обновление профиля идёт по `profile_id` (docs/decisions.md → «Начальная отметка
 * синхронизации равна времени выгрузки»).
 *
 * Отметка «сейчас» означала бы, что всё изменившееся между выгрузкой и первым прогоном
 * не увидит никто и никогда — тот же класс ошибки, что убил старого бота, зашедший
 * с другой стороны.
 *
 * Виды `orders` и `orders_catchup` здесь не трогаются: поездки не переносятся, окно
 * опроса заказов назначается этапом 3.
 */

/** Запас назад. Сутки — с запасом перекрывают 31 минуту, которую занял обход реестра. */
const SAFETY_MARGIN_MS = 24 * 60 * 60 * 1_000;

export type RegistryWatermarkSummary = {
  dumpStartedAt: Date;
  dumpFinishedAt: Date;
  dumpElapsedSeconds: number;
  watermark: Date;
  /** Что реально лежит в `sync_state` после прогона: читаем, а не верим записи. */
  storedWatermark: Date | null;
};

export const markRegistryWatermark = async (
  dumpPath: string,
): Promise<RegistryWatermarkSummary> => {
  const meta = await readRegistryDumpMeta(dumpPath);
  const watermark = new Date(meta.startedAt.getTime() - SAFETY_MARGIN_MS);

  await setSyncWatermark('registry', watermark);

  const stored = await readSyncState('registry');

  return {
    dumpStartedAt: meta.startedAt,
    dumpFinishedAt: meta.finishedAt,
    dumpElapsedSeconds: meta.elapsedSeconds,
    watermark,
    storedWatermark: stored?.watermark ?? null,
  };
};

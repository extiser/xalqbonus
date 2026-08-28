/**
 * Чтение выгрузки реестра парка из файла.
 *
 * Адаптер внешней системы: знает формат ответа Fleet API и **не знает про базу**
 * (docs/principles.md → «Слои и зависимости»). Разбирает `_reference/fleet-api/dumps/
 * driver-profiles-*.jsonl` — файл, снятый скриптом разведки `scripts/export-registry.py`.
 *
 * Сам разбор профиля живёт в `registryProfile.ts` и общий с живым списком: в базу профиль
 * приходит одинаково разложенным, из файла он или из сети. Здесь остаётся только чтение
 * файла и его сопроводительной сводки.
 *
 * Разница у файла одна, и она намеренная: **неразобравшаяся запись роняет чтение**.
 * Выгрузка — снимок, снятый один раз и проверенный отчётом; запись, которой не хватает
 * поля, означает, что файл повреждён или подсунут не тот. У живого прогона наоборот:
 * там такой профиль пропускается со строкой в журнале, потому что прогон обязан
 * продолжаться.
 */
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

import {
  parseRegistryProfile,
  type RawRegistryRecord,
  type RegistryProfile,
} from '#server/adapters/fleet/registryProfile';

export type { RegistryLicense, RegistryProfile } from '#server/adapters/fleet/registryProfile';

/**
 * Сопроводительный файл выгрузки. Из него берётся время обхода — начальная отметка
 * синхронизации равна времени выгрузки, а не времени прогона переноса
 * (docs/decisions.md → «Начальная отметка синхронизации»).
 */
export type RegistryDumpMeta = {
  dump: string;
  records: number;
  /** Когда обход закончился. Единственная временная отметка, которую пишет выгрузка. */
  finishedAt: Date;
  /** Сколько он занял. Начало обхода получается вычитанием — из файла, а не из головы. */
  elapsedSeconds: number;
  startedAt: Date;
};

type RawRegistryMeta = {
  dump?: string;
  records?: number;
  finished_at?: string;
  elapsed_seconds?: number;
};

/** Файл выгрузки повреждён или подсунут не тот. Молча пропускать такую строку нельзя. */
export class RegistryDumpError extends Error {
  constructor(message: string) {
    super(`выгрузка реестра: ${message}`);
    this.name = 'RegistryDumpError';
  }
}

/** Читает выгрузку построчно: 25 390 записей и 34 МБ файла целиком в память не поднимаются. */
export async function* readRegistryDump(dumpPath: string): AsyncGenerator<RegistryProfile> {
  const lines = createInterface({
    input: createReadStream(dumpPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  // Незнакомые значения словарей у файла никуда не отчитываются: выгрузка разобрана
  // отчётом `scripts/registry-report.py` один раз и целиком. Считает и показывает их
  // живой прогон, у которого расширение чужого словаря — событие.
  const unknownValues = new Set<string>();

  for await (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    yield parseRegistryProfile(JSON.parse(line) as RawRegistryRecord, unknownValues);
  }
}

/** Путь к сопроводительному файлу: тот же, что у выгрузки, с расширением `.meta.json`. */
export const buildDumpMetaPath = (dumpPath: string): string =>
  dumpPath.replace(/\.jsonl$/, '.meta.json');

const readMetaDate = (value: string | undefined): Date | null => {
  if (value === undefined || value === '') {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new RegistryDumpError(`дата не разбирается: ${value}`);
  }

  return parsed;
};

export const readRegistryDumpMeta = async (dumpPath: string): Promise<RegistryDumpMeta> => {
  const metaPath = buildDumpMetaPath(dumpPath);
  const meta = JSON.parse(await readFile(metaPath, 'utf8')) as RawRegistryMeta;

  const finishedAt = readMetaDate(meta.finished_at);

  if (!finishedAt) {
    throw new RegistryDumpError(`в ${metaPath} нет finished_at`);
  }

  if (typeof meta.elapsed_seconds !== 'number') {
    throw new RegistryDumpError(`в ${metaPath} нет elapsed_seconds`);
  }

  return {
    dump: meta.dump ?? dumpPath,
    records: meta.records ?? 0,
    finishedAt,
    elapsedSeconds: meta.elapsed_seconds,
    startedAt: new Date(finishedAt.getTime() - meta.elapsed_seconds * 1000),
  };
};

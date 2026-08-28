/**
 * Счётчик коллизий номеров ВУ до и после нормализации.
 *
 * Проверка стоимости нормализации: она должна сводить вместе разные написания одного
 * номера и НЕ сводить вместе разных людей. Резкий рост числа номеров, встречающихся
 * более чем на одном профиле, означает второе — и это повод остановиться, а не радоваться
 * выросшей сопоставимости.
 *
 * Считает по выгрузке реестра из `_reference/fleet-api/dumps/` — сами выгрузки
 * в репозиторий не коммитятся (персональные данные парка). Печатает только агрегаты.
 *
 * Запуск: make license-collisions
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { hasUnmappedCyrillic, normalizeLicenseNumber } from '#server/utils/licenseNumber';

const DEFAULT_DUMP = '_reference/fleet-api/dumps/driver-profiles-2026-08-27.jsonl';

interface RegistryRecord {
  driver_profile?: {
    id?: string;
    driver_license?: { number?: string };
  };
}

interface Collisions {
  /** Номеров, встречающихся более чем на одном профиле. */
  numbers: number;
  /** Профилей, затронутых такими номерами. */
  profiles: number;
  /** Различных ключей всего. */
  distinct: number;
}

function countCollisions(numbersByProfile: ReadonlyMap<string, string>): Collisions {
  const profilesByNumber = new Map<string, Set<string>>();

  for (const [profileId, number] of numbersByProfile) {
    const profiles = profilesByNumber.get(number) ?? new Set<string>();
    profiles.add(profileId);
    profilesByNumber.set(number, profiles);
  }

  let numbers = 0;
  let profiles = 0;

  for (const owners of profilesByNumber.values()) {
    if (owners.size > 1) {
      numbers += 1;
      profiles += owners.size;
    }
  }

  return { numbers, profiles, distinct: profilesByNumber.size };
}

async function main(): Promise<void> {
  const dumpPath = process.argv[2] ?? DEFAULT_DUMP;

  const rawByProfile = new Map<string, string>();
  const canonicalByProfile = new Map<string, string>();
  let unmappedCyrillic = 0;
  let withoutNumber = 0;

  const lines = createInterface({
    input: createReadStream(dumpPath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    const record = JSON.parse(line) as RegistryRecord;
    const profileId = record.driver_profile?.id;
    const number = record.driver_profile?.driver_license?.number;

    if (profileId === undefined) {
      continue;
    }

    if (number === undefined || number === '') {
      withoutNumber += 1;
      continue;
    }

    rawByProfile.set(profileId, number);
    canonicalByProfile.set(profileId, normalizeLicenseNumber(number));

    if (hasUnmappedCyrillic(number)) {
      unmappedCyrillic += 1;
    }
  }

  const before = countCollisions(rawByProfile);
  const after = countCollisions(canonicalByProfile);

  console.log(`выгрузка: ${dumpPath}`);
  console.log(`профилей: ${rawByProfile.size}, без номера ВУ: ${withoutNumber}`);
  console.log('');
  console.log('| показатель | до нормализации | после |');
  console.log('|---|---:|---:|');
  console.log(`| номеров более чем на одном профиле | ${before.numbers} | ${after.numbers} |`);
  console.log(`| профилей, затронутых повторами | ${before.profiles} | ${after.profiles} |`);
  console.log(`| различных номеров | ${before.distinct} | ${after.distinct} |`);
  console.log('');
  console.log(`номеров с кириллицей вне таблицы (остались как есть): ${unmappedCyrillic}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

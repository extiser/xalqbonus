import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Каждая миграция обязана начинаться с установки search_path на нашу схему.
 *
 * Prisma генерирует DDL без квалификации схемой и полагается на search_path соединения
 * (docs/decisions.md → «Каждая миграция начинается с `SET search_path TO "xb"`»).
 * Забытая строка отправит таблицы в `public` — молча, с успешным прогоном миграции
 * и без единого сообщения об ошибке. Держать это на внимательности нельзя, поэтому
 * проверка живёт тестом, а не в чьей-то голове.
 */
const MIGRATIONS_DIRECTORY = new URL('../../prisma/migrations/', import.meta.url).pathname;

const REQUIRED_STATEMENT = 'SET search_path TO "xb"';

const listMigrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIRECTORY, entry.name, 'migration.sql'));

describe('миграции', () => {
  const migrationFiles = listMigrationFiles();

  it('в каталоге есть хотя бы одна миграция', () => {
    // Пустой список сделал бы проверку ниже вечнозелёной.
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it.each(migrationFiles)('%s задаёт search_path на схему xb', (migrationFile) => {
    expect(readFileSync(migrationFile, 'utf8')).toContain(REQUIRED_STATEMENT);
  });
});

/**
 * Единственная дверь тестов в базу.
 *
 * Тесты ядра баллов пишут настоящие переводы с общего эмиссионного счёта и правят его
 * кэш при уборке. После переноса из `public` в рабочей базе живут настоящие люди,
 * настоящие балансы и настоящий журнал, и прогон, упавший между порчей кэша и его
 * восстановлением, оставит эмиссионный счёт неверным. В системе, вся посылка которой —
 * «журнал есть истина», тестовых записей в журнале истины быть не должно
 * (docs/infra.md → «Тесты»).
 *
 * Поэтому прогон против рабочей базы здесь не «нежелателен», а невозможен: файл
 * подключается `setupFiles` до импорта любого тестового модуля и до первого обращения
 * к `#server/db`, подменяет `DATABASE_URL` строкой из `TEST_DATABASE_URL` и роняет
 * прогон, если та не указана или указывает не на тестовую базу.
 */

/** Имя базы обязано кончаться этим суффиксом. Проверка идёт по имени, а не по хосту:
 *  тестовая база живёт в том же контейнере, что рабочая, и хостом они не различаются. */
const REQUIRED_DATABASE_SUFFIX = '_test';

const readDatabaseName = (connectionString: string): string => {
  let url: URL;

  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('TEST_DATABASE_URL не разбирается как строка подключения');
  }

  return decodeURIComponent(url.pathname.replace(/^\//, ''));
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL не задана. Тесты ходят только в отдельную базу — заведите её целью `make test-db` и допишите строку в .env по образцу .env.example',
  );
}

const databaseName = readDatabaseName(testDatabaseUrl);

if (!databaseName.endsWith(REQUIRED_DATABASE_SUFFIX)) {
  throw new Error(
    `TEST_DATABASE_URL указывает на базу ${databaseName}, а имя тестовой базы обязано кончаться на ${REQUIRED_DATABASE_SUFFIX}`,
  );
}

// Подмена, а не «возьмите ту переменную, если она есть»: `server/db.ts` знает
// одну-единственную строку подключения, и второй развилки в рабочем коде ради тестов
// быть не должно.
process.env.DATABASE_URL = testDatabaseUrl;

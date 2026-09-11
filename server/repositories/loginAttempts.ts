import { getQueueConnection } from '#server/queues/connection';

/**
 * Счётчик неудачных входов в веб — в Redis, без единой колонки в базе.
 *
 * Подбор пароля ограничивается паузой на связку «телефон + адрес» (docs/decisions.md →
 * «Учётка сотрудника и роли»). Хранить это в Postgres незачем: значение живёт минуты,
 * пишется на каждой неудаче и не является фактом, который кто-то станет разбирать через
 * полгода; протухшее убирает сам Redis временем жизни ключа, и цели уборки не появляется.
 *
 * Соединение — то же, что у очередей: второй клиент к тому же Redis ради счётчика не нужен,
 * а держать два подключения из одного процесса значит удваивать их и в проде, и в тестах.
 *
 * Порога здесь нет намеренно: слой доступа считает попытки, а решает по ним сервис входа.
 * Пара «телефон + адрес», а не один телефон: пауза по номеру дала бы постороннему способ
 * запереть сотрудника из офиса пятью неверными попытками.
 */

const KEY_PREFIX = 'xb:employee-login';

const keyFor = (phoneE164: string, clientAddress: string): string =>
  `${KEY_PREFIX}:${phoneE164}:${clientAddress}`;

export type LoginFailuresRow = {
  failures: number;
  /** Сколько секунд осталось жить счётчику. Ноль, если счётчика нет. */
  ttlSeconds: number;
};

export const readLoginFailures = async (
  phoneE164: string,
  clientAddress: string,
): Promise<LoginFailuresRow> => {
  const redis = getQueueConnection();
  const key = keyFor(phoneE164, clientAddress);
  const stored = await redis.get(key);

  if (stored === null) {
    return { failures: 0, ttlSeconds: 0 };
  }

  const ttlSeconds = await redis.ttl(key);

  return { failures: Number(stored), ttlSeconds: ttlSeconds > 0 ? ttlSeconds : 0 };
};

/**
 * Записывает неудачу и отдаёт номер попытки.
 *
 * Срок жизни ключа продлевается на каждой неудаче: иначе перебор, начатый за минуту
 * до конца окна, продолжался бы с чистого счётчика.
 */
export const registerLoginFailure = async (
  phoneE164: string,
  clientAddress: string,
  windowSeconds: number,
): Promise<number> => {
  const redis = getQueueConnection();
  const key = keyFor(phoneE164, clientAddress);
  const failures = await redis.incr(key);

  await redis.expire(key, windowSeconds);

  return failures;
};

/** Удачный вход обнуляет счётчик: пауза считается по неудачам **подряд**. */
export const clearLoginFailures = async (
  phoneE164: string,
  clientAddress: string,
): Promise<void> => {
  await getQueueConnection().del(keyFor(phoneE164, clientAddress));
};

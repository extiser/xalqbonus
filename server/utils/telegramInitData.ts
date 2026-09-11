/**
 * Проверка подписи `initData` — строки, которую Telegram передаёт в Mini App.
 *
 * Это единственное основание доверять тому, кто открыл приложение. Всё остальное, что
 * приходит от клиента — тело запроса, заголовки, идентификатор в адресе, — контролирует
 * сам клиент, и личностью не является (docs/miniapp.md → «Личность приходит
 * от мессенджера»).
 *
 * Алгоритм не наш, он описан Telegram и воспроизводится буквально:
 *
 *   1. строка разбирается как query string, значения берутся **раскодированными**;
 *   2. поле `hash` вынимается и в проверяемую строку не попадает;
 *   3. остальные поля сортируются по имени и склеиваются в `key=value` через `\n`;
 *   4. ключ — `HMAC_SHA256("WebAppData" как ключ, токен бота как данные)`;
 *   5. сверяется `HMAC_SHA256(ключ, склеенная строка)` с присланным `hash`.
 *
 * Из проверяемой строки снимается **только `hash`**. Поле `signature`, появившееся
 * в Bot API 8.0, в ней остаётся: оно часть «всех полученных полей», и исключается лишь
 * в альтернативной проверке по публичному ключу Ed25519 — той, что нужна третьей стороне
 * без токена бота. Мы токен держим, поэтому ходим по пути HMAC, и вторую проверку
 * не заводим.
 *
 * Функция чистая: ни базы, ни сети, ни `process.env`. Токен приходит аргументом — его
 * читает `server/bot/config.ts`, и второго места, знающего, откуда берётся токен,
 * не появляется.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Предел возраста `initData`.
 *
 * Строка выписывается один раз — в момент открытия приложения — и сама не обновляется:
 * механизма продления у Telegram нет. Поэтому предел решает не «сколько живёт сессия»,
 * а сколько времени украденная строка остаётся годной для входа под чужим именем.
 *
 * Сутки: короче — и приложение, оставленное открытым на ночь, встречает водителя отказом
 * на первом же запросе; дольше — и окно повторного входа по утёкшей строке растёт без
 * всякой пользы.
 */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Ключ, которым Telegram выводит секрет из токена бота. Постоянная чужого алгоритма. */
const SECRET_KEY_SALT = 'WebAppData';

/** Поле с подписью. Единственное, что снимается из проверяемой строки. */
const HASH_FIELD = 'hash';

/**
 * Кто открыл приложение — то, что лежит в поле `user` после удачной проверки подписи.
 *
 * Здесь только поля, на которые мы опираемся. Состав `initData` у Telegram шире,
 * и дописывать сюда всё подряд незачем: непрочитанное поле — это поле, про которое никто
 * не знает, доверенное оно или нет.
 */
export type InitDataUser = {
  /**
   * Идентификатор пользователя Telegram — то же значение, что `from.id` у апдейта бота.
   *
   * `bigint`, как и `telegram_links.telegram_user_id`: Bot API обещает не больше 52
   * значащих бит, поэтому разбор JSON число не портит, но хранить и сравнивать его
   * с базой надо в том же типе, в каком он там лежит.
   */
  id: bigint;
  firstName: string;
  lastName: string;
  username: string;
  languageCode: string;
  /**
   * Разрешена ли боту переписка с этим человеком — поле `allows_write_to_pm`.
   *
   * Косвенно отвечает на вопрос, начинал ли пользователь диалог с ботом: без начатого
   * диалога и без выданного разрешения бот не может написать первым.
   */
  allowsWriteToPrivateMessages: boolean;
};

/** Причины отказа. Все, кроме `valid`, означают «личность не установлена». */
export type InitDataOutcome =
  | 'valid'
  /** Строки нет вовсе — приложение открыто не из Telegram. */
  | 'missing'
  /** Нет `hash`, нет `auth_date` или он не число, `user` не разбирается как JSON. */
  | 'malformed'
  /** Подпись не сошлась: строку собрал не Telegram или её правили по дороге. */
  | 'hash_mismatch'
  /** Подпись верна, но строка старше предела. */
  | 'expired'
  /** Подпись верна, а поля `user` в строке нет: так открывают не из личного чата. */
  | 'no_user';

export type InitDataCheck =
  | {
      outcome: 'valid';
      user: InitDataUser;
      /** Когда открыли приложение — поле `auth_date`. */
      authDate: Date;
      /** Возраст строки на момент проверки, в секундах. */
      ageSeconds: number;
      /** `query_id` — есть, только если приложение открыто кнопкой с правом отвечать в чат. */
      queryId: string | null;
      /** `start_param` — то, что пришло в ссылке запуска. */
      startParam: string | null;
    }
  | {
      outcome: 'expired';
      authDate: Date;
      ageSeconds: number;
    }
  | { outcome: 'missing' | 'malformed' | 'hash_mismatch' | 'no_user' };

/** Сырое содержимое поля `user`: чужой JSON до того, как мы в нём что-то признали. */
type RawUser = {
  id?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  username?: unknown;
  language_code?: unknown;
  allows_write_to_pm?: unknown;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Сверка подписи за постоянное время.
 *
 * Обычным `!==` сравнивать нельзя: посимвольное сравнение выдаёт длину совпавшего префикса
 * временем ответа, и подпись становится подбираемой по одному знаку. Длины сверяются
 * заранее — `timingSafeEqual` на буферах разной длины бросает исключение.
 */
const hashesMatch = (expected: string, received: string): boolean => {
  const expectedBytes = Buffer.from(expected, 'hex');
  const receivedBytes = Buffer.from(received, 'hex');

  if (expectedBytes.length === 0 || expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
};

/**
 * Проверяемая строка: все поля, кроме `hash`, по алфавиту, `key=value` через перевод строки.
 *
 * Сортировка обязана идти по сырым именам полей, а не по чему-то нашему: порядок полей
 * в строке от Telegram произвольный, и сошлась подпись или нет, решает именно этот порядок.
 */
const buildDataCheckString = (fields: URLSearchParams): string =>
  [...fields.entries()]
    .filter(([key]) => key !== HASH_FIELD)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

const parseUser = (rawJson: string): InitDataUser | null => {
  let parsed: RawUser;

  try {
    parsed = JSON.parse(rawJson) as RawUser;
  } catch {
    return null;
  }

  if (typeof parsed.id !== 'number' || !Number.isInteger(parsed.id)) {
    return null;
  }

  return {
    id: BigInt(parsed.id),
    firstName: readString(parsed.first_name),
    lastName: readString(parsed.last_name),
    username: readString(parsed.username),
    languageCode: readString(parsed.language_code),
    allowsWriteToPrivateMessages: parsed.allows_write_to_pm === true,
  };
};

export type InitDataCheckRequest = {
  /** Строка целиком, как её отдал клиент: `window.Telegram.WebApp.initData`. */
  initData: string;
  token: string;
  /** Предел возраста строки. Задаётся явно, чтобы проверка не зависела от глобального состояния. */
  maxAgeSeconds?: number;
  /** Момент проверки. Аргументом — чтобы «просроченная строка» проверялась тестом, а не ожиданием суток. */
  now?: Date;
};

/**
 * Проверяет подпись `initData` и читает из неё личность.
 *
 * Исход возвращается, а не бросается исключением: отказ подписи — не поломка программы,
 * а рабочий ответ, на который вызывающая сторона обязана отреагировать отказом в доступе
 * (docs/principles.md → «Ошибки»). Причина отказа разведена по значениям, потому что
 * в логе они значат разное: `hash_mismatch` — это попытка войти подделанной строкой,
 * а `expired` — водитель, у которого приложение висело открытым слишком долго.
 *
 * Порядок проверок неслучаен: подпись сверяется **до** чтения любого поля. Прочитать
 * идентификатор из строки, подпись которой не сошлась, значит поверить клиенту на слово —
 * ровно то, из-за чего в старом проекте роль назначалась одним сообщением боту.
 */
export const checkInitData = (request: InitDataCheckRequest): InitDataCheck => {
  const { initData, token } = request;
  const maxAgeSeconds = request.maxAgeSeconds ?? INIT_DATA_MAX_AGE_SECONDS;
  const now = request.now ?? new Date();

  // Пустой токен — не отказ подписи, а машина без бота: проверять на ней подпись нечем.
  // Отказом в доступе это притворяться не должно, иначе Mini App на такой машине молча
  // не работает у всех, и в логе лежат `hash_mismatch` вместо незаполненной переменной.
  if (token === '') {
    throw new Error('проверка initData вызвана с пустым токеном бота: подпись сверять нечем');
  }

  if (initData.trim() === '') {
    return { outcome: 'missing' };
  }

  const fields = new URLSearchParams(initData);
  const receivedHash = fields.get(HASH_FIELD);
  const rawAuthDate = fields.get('auth_date');

  if (receivedHash === null || rawAuthDate === null) {
    return { outcome: 'malformed' };
  }

  const authDateSeconds = Number(rawAuthDate);

  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    return { outcome: 'malformed' };
  }

  const secretKey = createHmac('sha256', SECRET_KEY_SALT).update(token).digest();
  const expectedHash = createHmac('sha256', secretKey).update(buildDataCheckString(fields)).digest('hex');

  if (!hashesMatch(expectedHash, receivedHash)) {
    return { outcome: 'hash_mismatch' };
  }

  const authDate = new Date(authDateSeconds * 1000);
  const ageSeconds = Math.floor((now.getTime() - authDate.getTime()) / 1000);

  if (ageSeconds > maxAgeSeconds) {
    return { outcome: 'expired', authDate, ageSeconds };
  }

  const rawUser = fields.get('user');

  if (rawUser === null) {
    return { outcome: 'no_user' };
  }

  const user = parseUser(rawUser);

  if (user === null) {
    return { outcome: 'malformed' };
  }

  return {
    outcome: 'valid',
    user,
    authDate,
    ageSeconds,
    queryId: fields.get('query_id'),
    startParam: fields.get('start_param'),
  };
};

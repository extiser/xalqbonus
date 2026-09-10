import type { Language } from '#server/generated/prisma/enums';

/**
 * Состояние диалога регистрации: выбранный язык между экраном выбора и присланным
 * контактом.
 *
 * **В базу оно не пишется.** Человек, выбравший язык, ещё не участник программы: строка
 * `person_settings` и есть граница «известен парку / в программе», и писать в неё
 * недопривязанных значит стирать эту границу (docs/drivers.md). Язык доезжает до базы
 * ровно вместе с привязкой — или не доезжает вовсе.
 *
 * Память процесса, а не Redis: терять это состояние не страшно. Перезапуск приложения
 * стоит водителю одного лишнего `/start`, а взамен нет ни второго хранилища, ни вопроса,
 * что делать, когда оно недоступно.
 *
 * Время жизни — потому что чат, начавший регистрацию и бросивший её, иначе остаётся
 * в памяти навсегда; на четырёх тысячах водителей это не беда, но течь без верхней границы
 * не должна существовать по причине «пока мало».
 */

/** Сколько живёт выбор языка. Регистрация укладывается в минуту, час берёт это с запасом. */
const TTL_MS = 60 * 60 * 1_000;

/** Как часто выбрасывается протухшее. Реже, чем TTL: уборка здесь не срочная. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1_000;

type DialogState = {
  language: Language;
  expiresAt: number;
};

// На `globalThis` по той же причине, что бот и соединение с базой: горячая перезагрузка
// в dev перевычисляет модуль, и водитель, начавший регистрацию, терял бы язык на ровном
// месте посреди правки соседнего файла.
const globalForState = globalThis as typeof globalThis & {
  botDialogState?: Map<string, DialogState>;
};

const states = (): Map<string, DialogState> => {
  globalForState.botDialogState ??= new Map<string, DialogState>();

  return globalForState.botDialogState;
};

// Ключом строка: `Map` сравнивает bigint по значению, но ключи чата приходят из разных
// мест, и строка не даёт им разойтись типом.
const keyOf = (telegramChatId: bigint): string => telegramChatId.toString();

let lastSweepAt = 0;

/** Выбрасывает протухшее — не чаще раза в интервал, чтобы не ходить по карте на каждый апдейт. */
const sweep = (now: number): void => {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweepAt = now;

  for (const [key, state] of states()) {
    if (state.expiresAt <= now) {
      states().delete(key);
    }
  }
};

/** Запоминает выбранный язык. Повторный `/start` перезаписывает выбор, а не добавляет второй. */
export const rememberLanguage = (telegramChatId: bigint, language: Language): void => {
  const now = Date.now();
  sweep(now);
  states().set(keyOf(telegramChatId), { language, expiresAt: now + TTL_MS });
};

/** Выбранный язык или `null`, если выбора не было или он протух. */
export const recallLanguage = (telegramChatId: bigint): Language | null => {
  const state = states().get(keyOf(telegramChatId));

  if (!state) {
    return null;
  }

  if (state.expiresAt <= Date.now()) {
    states().delete(keyOf(telegramChatId));

    return null;
  }

  return state.language;
};

/**
 * Забывает диалог. Зовётся только после удавшейся привязки.
 *
 * Неудачная попытка язык **не** стирает намеренно: водитель, приславший чужой контакт
 * или напоровшийся на молчащий Fleet API, повторяет попытку той же кнопкой, и заставлять
 * его перед этим заново выбирать язык незачем. Остальное подберёт время жизни.
 */
export const forgetLanguage = (telegramChatId: bigint): void => {
  states().delete(keyOf(telegramChatId));
};

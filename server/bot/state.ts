import type { Language } from '#server/generated/prisma/enums';

/**
 * Состояние диалога регистрации: выбранный язык между экраном выбора и присланным
 * контактом, идентификатор последнего отправленного ботом экрана и очередь отправок
 * в этот чат.
 *
 * **В базу оно не пишется.** Человек, выбравший язык, ещё не участник программы: строка
 * `person_settings` и есть граница «известен парку / в программе», и писать в неё
 * недопривязанных значит стирать эту границу (docs/drivers.md). Язык доезжает до базы
 * ровно вместе с привязкой — или не доезжает вовсе. Идентификатор экрана не факт о человеке
 * вовсе, а состояние переписки: в базе ему места нет ни сейчас, ни потом.
 *
 * Память процесса, а не Redis: терять это состояние не страшно. Перезапуск приложения
 * стоит водителю одного лишнего `/start`, а забытый идентификатор — одного лишнего
 * сообщения, которое останется в чате. Взамен нет ни второго хранилища, ни вопроса,
 * что делать, когда оно недоступно.
 *
 * Время жизни — потому что чат, начавший регистрацию и бросивший её, иначе остаётся
 * в памяти навсегда; на четырёх тысячах водителей это не беда, но течь без верхней границы
 * не должна существовать по причине «пока мало».
 */

/**
 * Сколько живёт запись чата после последней записи в неё. Регистрация укладывается
 * в минуту, час берёт это с запасом.
 */
const TTL_MS = 60 * 60 * 1_000;

/** Как часто выбрасывается протухшее. Реже, чем TTL: уборка здесь не срочная. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1_000;

type DialogState = {
  /** `null` — язык ещё не выбран или уже уехал в `person_settings` вместе с привязкой. */
  language: Language | null;
  /**
   * Токен приглашения сотрудника, открывшего ссылку и ещё не приславшего контакт.
   *
   * `null` — приглашения в этом чате не ждут. Хранится ровно столько же, сколько язык,
   * и по той же причине: перезапуск процесса стоит человеку одного повторного открытия
   * ссылки, а учётки до присланного контакта всё равно не существует.
   */
  inviteToken: string | null;
  /** `null` — бот в этом чате ещё ничего не отправлял с последней уборки. */
  lastScreenMessageId: number | null;
  /** Хвост цепочки отправок в этот чат. Отказы в него не попадают — см. `enqueueScreen`. */
  screenQueue: Promise<void>;
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

/** Живая запись чата или `null`, если её не было или она протухла. */
const recall = (telegramChatId: bigint): DialogState | null => {
  const state = states().get(keyOf(telegramChatId));

  if (!state) {
    return null;
  }

  if (state.expiresAt <= Date.now()) {
    states().delete(keyOf(telegramChatId));

    return null;
  }

  return state;
};

/**
 * Запись чата под правку: живая — та же самая, протухшая или отсутствующая — новая пустая.
 *
 * Время жизни продлевается каждой записью, а не считается от выбора языка: пока водитель
 * отвечает боту, удалять его прежний экран мы обязаны, а по истечении часа молчания
 * и язык, и идентификатор одинаково не нужны.
 */
const touch = (telegramChatId: bigint): DialogState => {
  const now = Date.now();
  sweep(now);

  const state =
    recall(telegramChatId) ??
    ({
      language: null,
      inviteToken: null,
      lastScreenMessageId: null,
      screenQueue: Promise.resolve(),
      expiresAt: 0,
    } satisfies DialogState);
  state.expiresAt = now + TTL_MS;
  states().set(keyOf(telegramChatId), state);

  return state;
};

/** Запоминает выбранный язык. Повторный `/start` перезаписывает выбор, а не добавляет второй. */
export const rememberLanguage = (telegramChatId: bigint, language: Language): void => {
  touch(telegramChatId).language = language;
};

/** Выбранный язык или `null`, если выбора не было или он протух. */
export const recallLanguage = (telegramChatId: bigint): Language | null =>
  recall(telegramChatId)?.language ?? null;

/**
 * Забывает язык. Зовётся только после удавшейся привязки.
 *
 * Идентификатор последнего экрана при этом остаётся: сразу за этим вызовом отправляется
 * экран успеха, и удалять ему нужно то самое сообщение «Проверяем ваш номер…», которое
 * висит в чате. Забыть его здесь значило бы оставить его в переписке навсегда.
 *
 * Неудачная попытка язык **не** стирает намеренно: водитель, приславший чужой контакт
 * или напоровшийся на молчащий Fleet API, повторяет попытку той же кнопкой, и заставлять
 * его перед этим заново выбирать язык незачем. Остальное подберёт время жизни.
 */
export const forgetLanguage = (telegramChatId: bigint): void => {
  const state = recall(telegramChatId);

  if (state) {
    state.language = null;
  }
};

/**
 * Запоминает, что этот чат открыл ссылку-приглашение и у него ждут контакт.
 *
 * Повторное открытие другой ссылки перезаписывает токен: принимается та, по которой
 * человек пришёл последней, а не первая из открытых.
 */
export const rememberInviteToken = (telegramChatId: bigint, token: string): void => {
  touch(telegramChatId).inviteToken = token;
};

/** Токен приглашения, которого ждут в этом чате, или `null`. */
export const recallInviteToken = (telegramChatId: bigint): string | null =>
  recall(telegramChatId)?.inviteToken ?? null;

/**
 * Забывает приглашение.
 *
 * Зовётся на любом окончательном исходе — и на принятии, и на отказе, который повтором
 * того же действия не чинится: ссылка одноразовая, и второй контакт по ней приведёт
 * к тому же ответу. Остаётся токен ровно там, где повтор осмыслен: человек прислал чужой
 * контакт и может прислать свой.
 */
export const forgetInviteToken = (telegramChatId: bigint): void => {
  const state = recall(telegramChatId);

  if (state) {
    state.inviteToken = null;
  }
};

/**
 * Запоминает отправленный экран. Прежний идентификатор перезаписывается — в чате живёт
 * один экран.
 */
export const rememberLastScreen = (telegramChatId: bigint, messageId: number): void => {
  touch(telegramChatId).lastScreenMessageId = messageId;
};

/** Идентификатор прошлого экрана или `null`, если его нет или он протух. */
export const recallLastScreen = (telegramChatId: bigint): number | null =>
  recall(telegramChatId)?.lastScreenMessageId ?? null;

/**
 * Ставит отправку экрана в хвост цепочки этого чата: она начнётся, когда завершится
 * предыдущая.
 *
 * **Без очереди два апдейта одного чата затирают друг друга.** Отправка читает прежний
 * идентификатор, шлёт сообщение и только потом запоминает новый; два обработчика, идущие
 * одновременно, прочитают один и тот же прежний id, оба попробуют удалить одно и то же
 * сообщение — второе удаление отвалится в лог, — а из двух новых экранов в состоянии
 * останется лишь последний, и первый повиснет в чате навсегда. Ровно то, что задача
 * обязана исключить.
 *
 * На локальном стенде это не воспроизводится: встроенный long polling grammY обрабатывает
 * апдейты строго по одному. Гонка живёт в режиме webhook, где каждый апдейт приходит
 * отдельным HTTP-запросом — то есть на стенде и на проде.
 *
 * `sequentialize` из `@grammyjs/runner` не берётся: ради полутора десятков строк заводить
 * зависимость незачем, и он сериализует обработку апдейта целиком, а сериализовать надо
 * только отправку.
 *
 * Чтение хвоста и подстановка нового происходят в одном синхронном участке — между ними
 * нет ни одного `await`, и вклиниться второму вызову некуда. Хвост намеренно не несёт
 * отказа: упавшая отправка иначе отклонила бы все следующие, а её исключение нужно тому,
 * кто её заказал, и уходит ему.
 *
 * Побочный выигрыш: порядок экранов перестаёт зависеть от того, в каком порядке ответил
 * Telegram.
 */
export const enqueueScreen = <Result>(
  telegramChatId: bigint,
  send: () => Promise<Result>,
): Promise<Result> => {
  const state = touch(telegramChatId);
  const sent = state.screenQueue.then(send);

  state.screenQueue = sent.then(
    () => undefined,
    () => undefined,
  );

  return sent;
};

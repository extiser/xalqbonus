/**
 * Арифметика обхода реестра: нарезка на куски, проходы с двух концов, глубина offset.
 *
 * Логика перенесена из отлаженного разведочного скрипта `scripts/export-registry.py` —
 * перенесена, а не скопирована файлом: скрипт остаётся жить своей жизнью на питоне,
 * а продуктовый обход живёт здесь (docs/decisions.md → «Полный обход реестра — режим
 * синхронизации, а не разовый скрипт»).
 *
 * Здесь только чистые функции: ни сети, ни базы. Всё, ради чего этот файл существует,
 * проверяется таблицей чисел, а не живым API.
 *
 * Почему вообще нарезка. Лимитер Fleet API оценивает **стоимость** запроса, а не частоту:
 * страница на глубине 10 000 отбивается мгновенно, а тысяча записей с нуля проходит
 * за полторы секунды. Паузы и ретраи на глубине не помогают вообще — ждать нечего.
 * Лечится это только тем, чтобы offset оставался мелким (docs/yandex-fleet.md).
 */
import { PROFILES_PAGE_SIZE } from '#server/adapters/fleet/profiles';

/** Кусок крупнее этого берётся с двух концов — так максимальная глубина падает вдвое. */
export const TWO_END_THRESHOLD = 3_000;

/** Глубже этого offset за прогон не уходит ни на одной странице. Предел замерен разведкой. */
export const MAX_OFFSET_DEPTH = 3_500;

/** Окно мельче минуты не дробим: дальше дробить нечего. */
export const MIN_WINDOW_SECONDS = 60;

export type PassDirection = 'asc' | 'desc';

/** Один проход по выборке: в какую сторону сортировки и сколько записей взять. */
export type ChunkPass = {
  direction: PassDirection;
  target: number;
};

export const pagesFor = (target: number): number =>
  Math.max(1, Math.ceil(target / PROFILES_PAGE_SIZE));

/**
 * Проходы по выборке.
 *
 * Кусок крупнее порога берётся с двух концов — половина по возрастанию `created_date`,
 * половина по убыванию. Страницы при этом берутся целиком: хвост, вылезающий за половину,
 * перекрывается со встречным проходом и снимается по `id` — перекрытие дешевле, чем дыра
 * на стыке половин.
 */
export const passesFor = (total: number): ChunkPass[] => {
  if (total <= TWO_END_THRESHOLD) {
    return [{ direction: 'asc', target: total }];
  }

  const head = Math.ceil(total / 2);

  return [
    { direction: 'asc', target: head },
    { direction: 'desc', target: total - head },
  ];
};

/** Самый глубокий offset, который потребует такая схема прохода. */
export const deepestOffset = (passes: readonly ChunkPass[]): number =>
  Math.max(...passes.map((pass) => (pagesFor(pass.target) - 1) * PROFILES_PAGE_SIZE));

/** Берётся ли выборка такого размера разрешённой глубиной offset. */
export const fitsByDepth = (total: number): boolean =>
  total > 0 && deepestOffset(passesFor(total)) <= MAX_OFFSET_DEPTH;

/**
 * Ступени обхода куска. Каждая следующая берётся, только если предыдущая не свела число
 * различных `id` с размером куска.
 *
 *   - `direct` — кусок целиком, без окон;
 *   - `windows` — окна по `updated_at`, каждое достаточно мелкое по глубине;
 *   - `windows_strict` — окна в одну страницу.
 */
export const CHUNK_STAGES = ['direct', 'windows', 'windows_strict'] as const;

export type ChunkStage = (typeof CHUNK_STAGES)[number];

/**
 * Когда окно считается достаточно мелким.
 *
 * На ступени `windows` довольно того, чтобы окно бралось разрешённой глубиной.
 * На ступени `windows_strict` окно режется до одной страницы: туда кусок попадает,
 * не сойдясь по числу профилей, а теряются строки ровно на стыке страниц — у окна
 * в одну страницу стыка нет.
 */
export const windowAccepts = (stage: ChunkStage): ((total: number) => boolean) =>
  stage === 'windows_strict' ? (total: number) => total <= PROFILES_PAGE_SIZE : fitsByDepth;

/** Почему кусок пошёл дробиться окнами. Уходит в лог прогона как есть. */
export const STAGE_REASON: Record<Exclude<ChunkStage, 'direct'>, string> = {
  windows: 'не берётся такой глубиной offset',
  windows_strict: 'не сошёлся по числу профилей',
};

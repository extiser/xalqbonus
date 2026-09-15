/**
 * Обязательные переменные окружения приложения и воркера.
 *
 * Список перечислен здесь явно, а не собирается из `.env.example`: в примере лежат
 * и необязательные переменные, и выведенный из него список молча разошёлся бы с правдой
 * при первой же правке примера.
 *
 * Проверка стоит на старте процесса, а не только в месте использования. Пустая переменная,
 * найденная первым обращением, доживает до попытки водителя и читается в журнале как чужая
 * поломка: пустой `YANDEX_CLIENT_ID` записывался отказом парка, в который не ушло ни одного
 * запроса (issue #95). Проверки в местах использования при этом остаются — они защищают
 * от того же в другом слое.
 *
 * Модуль без импортов намеренно: его подключают и Nitro, и бандл воркера, где
 * `useRuntimeConfig` не существует (docs/decisions.md → «Окружение читается напрямую»).
 */

const readEnv = (name: string): string => (process.env[name] ?? '').trim();

export type RequiredEnvVariable = {
  name: string;
  /** Условие обязательности. Нет условия — переменная обязательна всегда. */
  requiredWhen?: () => boolean;
};

/**
 * Бот включён — токен заполнен.
 *
 * Сам `TG_BOT_TOKEN` в списках нет: пустой токен — сознательно выключенный бот
 * (server/bot/config.ts), и это состояние не роняет ни приложение, ни воркер. Оно обязано
 * быть видно строкой при старте — `BOT_DISABLED_MESSAGE` ниже.
 */
const isBotEnabled = (): boolean => readEnv('TG_BOT_TOKEN') !== '';

/**
 * Бот включён и принимает апдейты webhook'ом.
 *
 * Токен входит в условие: у выключенного бота принимать нечего, и требовать от него адрес
 * с секретом значило бы ронять законное состояние из-за переменных, которые никто не читает.
 */
const isWebhookMode = (): boolean => isBotEnabled() && readEnv('TG_BOT_MODE') === 'webhook';

/** Реквизиты парка: ими ходят и регистрация водителя в приложении, и синхронизация в воркере. */
const FLEET_CREDENTIALS: readonly RequiredEnvVariable[] = [
  { name: 'YANDEX_BASE_URL' },
  { name: 'YANDEX_CLIENT_ID' },
  { name: 'YANDEX_API_KEY' },
  { name: 'YANDEX_PARK_ID' },
];

/**
 * Набор приложения.
 *
 * `TG_MINIAPP_URL` в списке нет: на локальном стеке он пуст намеренно — Telegram открывает
 * Mini App только по `https`, а локальный стенд живёт на `http://localhost`.
 */
export const APP_REQUIRED_ENV: readonly RequiredEnvVariable[] = [
  { name: 'DATABASE_URL' },
  { name: 'REDIS_URL' },
  // Без секрета веб не выдаёт и не проверяет сессию, то есть не работает вовсе, а выглядит рабочим.
  { name: 'EMPLOYEE_SESSION_SECRET' },
  ...FLEET_CREDENTIALS,
  // Режим без умолчания: `polling`, случайно доставшийся серверу, снял бы webhook у своего
  // токена молча. Нужен только включённому боту.
  { name: 'TG_BOT_MODE', requiredWhen: isBotEnabled },
  { name: 'TG_WEBHOOK_URL', requiredWhen: isWebhookMode },
  { name: 'TG_WEBHOOK_SECRET', requiredWhen: isWebhookMode },
];

/**
 * Набор воркера: база, очередь и реквизиты парка.
 *
 * Сессий сотрудников воркер не выдаёт, апдейтов Telegram не принимает — ни секрета сессии,
 * ни режима бота ему не нужно. Токен для исходящих — не в списке по тому же правилу,
 * что у приложения: выключенный бот не роняет воркер, чья главная работа — синхронизация.
 */
export const WORKER_REQUIRED_ENV: readonly RequiredEnvVariable[] = [
  { name: 'DATABASE_URL' },
  { name: 'REDIS_URL' },
  ...FLEET_CREDENTIALS,
];

/** Имена всех недостающих переменных набора — все сразу, а не первая попавшаяся. */
export const findMissingEnv = (variables: readonly RequiredEnvVariable[]): string[] =>
  variables
    .filter((variable) => (variable.requiredWhen?.() ?? true) && readEnv(variable.name) === '')
    .map((variable) => variable.name);

/**
 * Обязательные переменные не заполнены — процесс не поднимается.
 *
 * Имена — полем, а не только текстом: чинит этот отказ тот, кто дописывает `.env`, и ему
 * нужен весь список за один перезапуск. Значения в ошибку не попадают ни при каких условиях.
 */
export class MissingEnvError extends Error {
  constructor(public readonly variableNames: readonly string[]) {
    super(`не заполнены обязательные переменные окружения: ${variableNames.join(', ')}`);
    this.name = 'MissingEnvError';
  }
}

/**
 * Строка о выключенном боте. Называет последствие, а не факт: «бот выключен» читается
 * как настройка, а потерянные уведомления и рассылки — как состояние, о котором надо знать.
 */
export const BOT_DISABLED_MESSAGE = 'бот выключен: уведомления и рассылки не уходят';

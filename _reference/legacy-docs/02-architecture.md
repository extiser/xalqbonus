# 02. Архитектура

## Слои

Формально слоёв четыре, но границы размыты — ниже описано как есть, а не как задумано.

```
Telegram Update
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ bot.js — роутер Telegraf                                │
│ bot.start / bot.command / bot.action(regex) / bot.on     │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ actions/ + commands/  — UI-слой                          │
│ • читают/пишут ctx.session                               │
│ • собирают текст+клавиатуру через utils/constructor       │
│ • ctx.reply / ctx.editMessageText                        │
│ • actions/textInput/ — пошаговые формы                   │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ services/  — многошаговые бизнес-операции                │
│ tripService, bonusService, officeProductService,          │
│ driverService                                            │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ controllers/  — доступ к данным (по факту = репозитории) │
│ + yandexApi.js — внешний HTTP-клиент                     │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ models/models.js  → db.js (Sequelize) → PostgreSQL       │
└─────────────────────────────────────────────────────────┘
```

**Важные оговорки о слоях:**

- `controllers/` — это **не** HTTP-контроллеры. Ни один из них не принимает
  `(req, res)`. Это слой доступа к данным; исторически названы контроллерами.
- Слои перепрыгиваются: `actions/*` спокойно вызывают `controllers/*` напрямую,
  минуя `services/`. `services/` есть только там, где логика реально многошаговая.
- Единый контракт возврата: почти всё возвращает `{ code: 'success' | 'error', ... }`
  вместо исключений. Ошибка логируется внутри и наверх не всплывает.
  Исключения: `officeController.listOffices()` и `getProductsInOffice()` возвращают
  голый массив при успехе и объект `{code:'error'}` при ошибке — вызывающий код
  делает `offices.length`, что на ошибке даст `undefined`.

## Поток обработки апдейта

```
1. Telegram → webhook POST /xalqbonusbot/bot (или long-polling)
2. LocalSession middleware — подтягивает ctx.session из data/sessions.json по chat_id
3. Матчинг: bot.action(/regex/) → ctx.match[] содержит captured groups
4. Handler в actions/:
   a. manageContext('имя_контекста', ctx)   ← удаляет сообщения прошлого контекста
   b. читает роль/язык из ctx.session
   c. дёргает controller/service
   d. constructor({ textKey, keys, language }) → { text, keyboard, options }
   e. replacement(text, data) → подстановка {placeholder} + экранирование Markdown
   f. ctx.reply(...) → saveMessageId(ctx, reply.message_id, context)
5. LocalSession сохраняет ctx.session обратно в JSON-файл
```

## Сессии

Хранилище — **файл** `data/sessions.json` (`telegraf-session-local`), ключ `chatId:userId`.

Что лежит в сессии:

| Ключ | Назначение |
|---|---|
| `language`, `role`, `user_id`, `driver_id` | идентичность и локаль |
| `currentContext`, `messageIds{}` | какие сообщения удалять при переходе меню |
| `order[]`, `order_id`, `office_id_to_exchange`, `driver_points`, `start_exchange` | корзина обмена баллов |
| `awaiting*` (≈25 флагов) | состояние пошаговых форм |
| `officeData`, `promotion`, `employee`, ... | черновики создаваемых сущностей |

Следствия файлового хранилища:
- горизонтально не масштабируется (один процесс);
- на 15.08.2026 файл ~127 КБ, бэкап от 20.03.2026 — 966 КБ, растёт неограниченно;
- при рестарте сессии сохраняются, но конкурентная запись не защищена.

### Управление сообщениями

[utils/context.js](../utils/context.js): у каждого экрана есть строковый `context`.
`manageContext(newContext, ctx)` удаляет все сообщения предыдущего контекста
и переключается на новый. `saveMessageId()` копит id отправленных сообщений.

⚠️ `deleteMessagesByContext` вызывается **без `await`** внутри `manageContext` —
удаление уходит в фон, ошибки глотаются в `console.warn`.

## Локализация (i18n)

Переводы лежат **в БД**, таблица `Translations (key, ru, uz)` — 237 ключей.
Сидер: [seeders/20240820162428-fill-translations.js](../seeders/20240820162428-fill-translations.js).

[utils/constructor.js](../utils/constructor.js) — центральная функция сборки экрана:

```js
const { text, keyboard, options } = await constructor({
  textKey,            // ключ основного текста
  keys: [],           // ключи кнопок; формат 'ключ|payload' → callback_data = весь ключ
  dynamicData: [],    // готовые кнопки (офисы, товары, звёзды рейтинга)
  language,           // 'ru' | 'uz'
  additionalButtons,
  disableKeys,        // какие кнопки скрыть
  buttonOrder,        // порядок кнопок
  customLabels,       // трансформация подписи, напр. добавить 🔴
});
// options = { parse_mode: 'MarkdownV2' }
```

Фолбэк: нет перевода на нужном языке → берётся `ru` → нет и его → в текст падает
`Translation missing for key: X`.

⚠️ Каждая кнопка — **отдельный `SELECT`** в `Translations`. Экран из 8 кнопок = 9 запросов.
Кеша нет. Список из 20 записей с кнопками — под сотню запросов на один экран.

### Экранирование Markdown

`utils.replacement()` подставляет `{placeholder}` и прогоняет значение через
`escapeMarkdown()`. Экранируются `_ * ( ) \` > # + - = | { } . !`, но **не** `[` и `]`
(закомментированы). Тексты в БД хранятся уже экранированными (`Добро пожаловать\\!`).

## Планировщик

```
cron '0 * * * *'  ─┬─→ processAllDrivers()      services/tripService.js
                   ├─→ proccessAllOrders()      controllers/orderController.js
                   └─→ checkBonusForDrivers()   services/bonusService.js
```

Все три идут через `Promise.all` внутри `runAllOnce()`; мьютекс `isRunning`
не даёт запустить второй прогон, пока идёт первый.
Отключается `DISABLE_CRON=true`. Ручной триггер — `POST /xalqbonusbot/start-cron`.

## Логирование

Четыре независимых Winston-логгера, все пишут в `logs/`, ротация 20 МБ × 5 файлов:

| Логгер | Файлы | Кто пишет |
|---|---|---|
| `utils/logger.js` | `error.log`, `combined.log` | почти весь код |
| `utils/tripLogger.js` | `trips-error.log`, `trips-combined.log` | синхронизация поездок |
| `utils/orderLogger.js` | `order-*.log` | автоотмена заказов |
| `utils/mailingLogger.js` | `mailing-*.log` | рассылки |

При `NODE_ENV !== 'production'` дублируют в консоль. В копии `NODE_ENV=dev`,
то есть на проде логи шли ещё и в stdout (pm2-лог) — отсюда 1.4 ГБ в `logs/`,
из них `trips-error1.log` — 1.35 ГБ (ротация по `maxsize` не сработала на этом файле).

# 01. Обзор

## Стек

| Слой | Технология |
|---|---|
| Runtime | Node.js (локально установлен v24.16.0) |
| HTTP | Express 4 |
| Telegram | Telegraf 4.16 |
| Сессии бота | `telegraf-session-local` → файл `data/sessions.json` |
| ORM | Sequelize 6 + `pg` |
| БД | PostgreSQL 16 |
| Планировщик | `node-cron` |
| Логи | Winston (4 отдельных логгера) |
| Внешний API | Yandex Fleet API (`axios`) |
| Сборка | Babel (`@babel/preset-env`), запуск через `babel-node` / `pm2` |

Репозиторий **не** является git-репозиторием (папки `.git` нет) — код просто скопирован
с сервера. Историю изменений восстановить нельзя.

## Точки входа

### [index.js](../index.js) — HTTP-сервер и планировщик

1. Поднимает Express на `process.env.PORT` (по умолчанию 3000, в `.env` — 4000).
2. Режим бота выбирается через `BOT_MODE`:
   - `BOT_MODE=polling` → `bot.launch()` (long-polling, удобно локально без туннеля);
   - иначе → webhook-эндпоинт `app.use(bot.webhookCallback('/xalqbonusbot/bot'))`.
   Webhook переустанавливается автоматически только при `NODE_ENV=dev`.
3. Планирует крон `0 * * * *` (каждый час) — если не задано `DISABLE_CRON=true`.
4. Эндпоинты:
   - `POST /xalqbonusbot/start-cron` — ручной запуск пачки задач в фоне.
     Защищён заголовком `X-Cron-Secret`, если задан `CRON_SECRET`.
   - `GET /xalqbonusbot/status` — `{ isRunning, mode }`.

Крон-раннер `runAllOnce()` с мьютексом `isRunning` параллельно запускает три задачи:
`processAllDrivers()` (поездки), `proccessAllOrders()` (автоотмена заказов),
`checkBonusForDrivers()` (бонус 300 баллов).

### [bot.js](../bot.js) — маршрутизация Telegram

Единый файл-роутер: подключает `LocalSession`, регистрирует команды
(`/start`, `/crud`, `/reset`), ~60 `bot.action(...)`-обработчиков по regex
и один общий `bot.on('message')` → либо `handlePhoneNumber` (если пришёл контакт),
либо `textInput` (state-machine текстового ввода).

### [updateDrivers.js](../updateDrivers.js) — разовый импорт (legacy)

Скрипт миграции водителей из старой MySQL-базы (`data/users.json`, экспорт phpMyAdmin).
Поднимает свой Express на порту 4001 с `/pause` и `/resume`, гоняет импорт по `setInterval`
каждые 5 сек. **В обычной работе не запускается**, запуск — `npm run import`.
Содержит баг: использует `__dirname` в ESM-модуле.

## npm-скрипты

```jsonc
"start":         "nodemon --exec babel-node index.js ..."   // dev
"import":        "babel-node updateDrivers.js"              // разовый импорт
"build":         "babel ./ -d dist --ignore node_modules,dist"
"start:prod":    "pm2 start dist/index.js --name xalqbonusbot"
"start:pm2:dev": "pm2 start npm --name xalqbonusbot -- run start"
```

## Структура каталогов

```
xalqbonusbot/
├── index.js              HTTP-сервер, крон, вебхук
├── bot.js                регистрация всех команд/actions Telegraf
├── db.js                 инстанс Sequelize (используется моделями)
├── config/config.js      конфиг для sequelize-cli (dev/test/prod)
├── babel.config.json
├── .env                  секреты и настройки (в .gitignore)
│
├── models/               Sequelize-модели (17 штук)
│   ├── models.js         ⚠️ РЕАЛЬНАЯ точка сборки: импорт всех моделей + все ассоциации
│   └── index.js          ⚠️ шаблон sequelize-cli, НЕ используется, требует config.json
│
├── migrations/           55 миграций sequelize-cli (все применены на проде)
├── seeders/              один сидер: 237 ключей переводов
│
├── controllers/          доступ к данным + внешние API (см. 02-architecture)
├── services/             бизнес-операции поверх контроллеров
├── actions/              обработчики Telegram callback_query (UI-слой)
│   └── textInput/        пошаговые формы (state-machine на флагах в сессии)
├── commands/             /start, /crud, /reset
├── utils/                конструктор клавиатур, контекст сообщений, логгеры, очередь
│
├── routes/               ⚠️ МЁРТВЫЙ КОД: нигде не подключён, импортирует
│                            несуществующие authDriver/changeDriverLanguage
├── data/                 sessions.json (сессии бота), users.json (старый импорт)
├── uploads/              105 картинок товаров/акций/купонов (8.4 МБ)
├── logs/                 1.4 ГБ логов (trips-error1.log — 1.35 ГБ)
└── backup-db-*.sql       дамп прод-БД от 15.08.2026 (190 МБ)
```

## Переменные окружения

Файл `.env` есть в копии (в `.gitignore`, но приехал вместе с кодом).

| Переменная | Значение в копии | Комментарий |
|---|---|---|
| `NODE_ENV` | `dev` | при `dev` бот сам переустанавливает webhook |
| `PORT` | `4000` | |
| `DB_USER` / `DB_PASSWORD` | `xalqbonus` / *** | |
| `DB_NAME` | `xalqbonus` | используется при `NODE_ENV=dev` |
| `DB_NAME_TEST` | `xalqbonus_test` | |
| `DB_NAME_PROD` | `xalqbonus_prod` | |
| `DB_HOST` | `localhost` | |
| `DB_PORT` | `5432` | ⚠️ **не читается** в [db.js](../db.js) — Sequelize берёт дефолт 5432 |
| `YANDEX_BASE_URL` | `https://fleet-api.taxi.yandex.net/` | |
| `YANDEX_CLIENT_ID` / `YANDEX_API_KEY` / `YANDEX_PARK_ID` | *** | боевые ключи парка |
| `YANDEX_API_LIMIT_PER_HOUR` | `5000` | в `.env` записано с пробелом перед `=` — dotenv 16 ключ триммит, работает |
| `YANDEX_REQUEST_INTERVAL_MS` | `500` | то же самое |
| `TG_BOT_TOKEN` | *** | боевой токен |
| `TG_BOT_WEBHOOK` | *** | |
| `BOT_MODE` | не задана | задать `polling` для локали |
| `DISABLE_CRON` | не задана | задать `true` для локали |
| `CRON_SECRET` | не задана | защита `/start-cron` |

> Для локального запуска обязательно задать `BOT_MODE=polling` и `DISABLE_CRON=true`,
> иначе бот перехватит вебхук у прода и пойдёт долбить Yandex API общим лимитом.
> Пошагово — в [06-local-setup.md](06-local-setup.md).

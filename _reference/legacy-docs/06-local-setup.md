# 06. Локальное развёртывание

Состояние на момент написания: `node_modules` **не установлены**, локальной БД **нет**,
дамп прода лежит в корне.

## Что уже есть в системе

| Компонент | Статус |
|---|---|
| Node.js | v24.16.0, npm 11.13.0 |
| Postgres.app 16 | установлен, слушает `localhost:5432`, требует пароль (пароль неизвестен) |
| Docker | запущен; занятые порты: 5433 (`docker-postgres_test-1`), 6380 (redis) — **чужие контейнеры другого проекта, не трогать** |

## Правила безопасности локального запуска

Три вещи, которые нельзя нарушать, иначе задеваем прод:

1. **Отдельный тестовый бот.** `TG_BOT_TOKEN` в `.env` — боевой. Запуск локально в
   режиме polling с этим токеном отвяжет вебхук прода и уведёт весь трафик на ноутбук.
   Нужен новый бот через `@BotFather` и его токен в локальном `.env`.
2. **`DISABLE_CRON=true`.** Иначе локальный инстанс начнёт опрашивать Yandex Fleet API
   боевым ключом парка и съест общую квоту (429 прилетит и проду тоже).
3. **`BOT_MODE=polling`.** Чтобы не требовался публичный HTTPS-туннель.

## Шаг 1. Зависимости

```bash
cd /Users/extiser/git/startups/xalqbonusbot
npm install
```

## Шаг 2. Локальная БД

Рекомендуемый вариант — отдельный Docker-контейнер на свободном порту (5434),
чтобы не пересекаться ни с Postgres.app, ни с контейнерами других проектов.

```bash
docker run -d \
  --name xalqbonus-db \
  -e POSTGRES_USER=xalqbonus \
  -e POSTGRES_PASSWORD=xalqbonus \
  -e POSTGRES_DB=xalqbonus \
  -p 5434:5432 \
  -v xalqbonus-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine
```

Версия образа выбрана под дамп: он снят с PostgreSQL 16.6.
Пользователь БД назван `xalqbonus` — так же, как владелец объектов в дампе,
поэтому `ALTER TABLE ... OWNER TO xalqbonus` отработает без ошибок.

### Восстановление дампа

Дамп — plain SQL, **без** `CREATE DATABASE` и `CREATE ROLE`: он рассчитан на
подключение к уже созданной базе (её создаёт `POSTGRES_DB` выше).

```bash
docker exec -i xalqbonus-db psql -U xalqbonus -d xalqbonus \
  < backup-db-2026-08-15-1258.sql
```

Заливка ~190 МБ, основное время — 1 162 756 строк в `Trips`. Ожидаемо несколько минут.

Проверка:
```bash
docker exec -i xalqbonus-db psql -U xalqbonus -d xalqbonus -c \
  'select count(*) from "Drivers"; select count(*) from "Trips";'
```
Ожидаем 4062 и 1162756.

### Если нужна лёгкая база для разработки

`Trips` — 99% объёма и для отладки UI не нужны. Можно залить полный дамп и почистить,
либо после восстановления:

```sql
TRUNCATE public."Trips";
```

⚠️ Не удалять `Translations` — без них бот покажет `Translation missing for key: ...`
вместо любого текста.

### Альтернатива: Postgres.app

Если предпочтительнее локальный кластер на 5432 — нужно знать/сбросить пароль
суперпользователя, затем:
```bash
createdb -h localhost -p 5432 -U <superuser> xalqbonus
psql -h localhost -p 5432 -U <superuser> -c "CREATE ROLE xalqbonus LOGIN PASSWORD 'xalqbonus'"
psql -h localhost -p 5432 -U <superuser> -d xalqbonus < backup-db-2026-08-15-1258.sql
```

## Шаг 3. Локальный `.env`

Текущий `.env` — боевой. Сохранить копию и заменить значения:

```ini
NODE_ENV=dev
PORT=4000

DB_USER=xalqbonus
DB_PASSWORD=xalqbonus
DB_NAME=xalqbonus
DB_NAME_TEST=xalqbonus_test
DB_NAME_PROD=xalqbonus_prod
DB_HOST=localhost
DB_PORT=5434            # см. предупреждение ниже

YANDEX_BASE_URL=https://fleet-api.taxi.yandex.net/
YANDEX_CLIENT_ID=<боевой или пустой — при DISABLE_CRON не используется>
YANDEX_API_KEY=<...>
YANDEX_PARK_ID=<...>
YANDEX_API_LIMIT_PER_HOUR=5000
YANDEX_REQUEST_INTERVAL_MS=500

TG_BOT_TOKEN=<токен НОВОГО тестового бота>
TG_BOT_WEBHOOK=

BOT_MODE=polling
DISABLE_CRON=true
```

> ⚠️ **`DB_PORT` в коде не читается.** [db.js](../db.js) передаёт в Sequelize только
> `host` и `dialect`, порт берётся дефолтный 5432. Значит либо
> поднимать контейнер на `-p 5432:5432` (конфликт с Postgres.app — тогда сначала
> остановить Postgres.app), либо добавить в `db.js` и `config/config.js`
> `port: process.env.DB_PORT`. Второе — правильнее, это одна строка в каждом файле.

## Шаг 4. Запуск

```bash
npm start
```

Ожидаемый вывод:
```
Cron ОТКЛЮЧЁН (DISABLE_CRON=true)
Server is running on port 4000
Бот запущен в режиме long-polling (тест).
```

Проверка HTTP: `curl http://localhost:4000/xalqbonusbot/status`
→ `{"isRunning":false,"mode":"polling"}`

## Шаг 5. Доступ в админку локально

В дампе есть боевые `Users` с их `chat_id`. Чтобы зайти под `root` со своего аккаунта:

```sql
-- посмотреть существующих
SELECT id, username, chat_id, role_id FROM "Users" ORDER BY role_id;

-- подставить свой Telegram chat_id root-пользователю
UPDATE "Users" SET chat_id = '<ваш_chat_id>' WHERE role_id = 1;
```
Свой `chat_id` можно узнать у `@userinfobot` или из логов бота при `/start`.

Второй путь — команда `/crud` в боте: создаёт `UserRequest`, но подтвердить его
может только существующий `root`, поэтому для первого входа проще UPDATE выше.

## Картинки

`photo_url` в БД — абсолютные пути прод-сервера вида
`/var/www/xalqbonusbot/uploads/1746547949068_file_51.jpg`.
Локально файлы лежат в `./uploads/`. Пока это не исправлено, любой экран с фото
(товары, акции, купоны, рассылки) будет падать на `ENOENT`.

Варианты:
- быстрый костыль для локали: `sudo mkdir -p /var/www/xalqbonusbot && sudo ln -s "$PWD/uploads" /var/www/xalqbonusbot/uploads`
- правильный: перевести `photo_url` на относительные пути + `path.join(process.cwd(), ...)`
  при отдаче (см. B-6 в [07-issues.md](07-issues.md)).

## Чего в проекте нет

- git-репозитория (истории изменений нет);
- тестов любого вида;
- линтера/форматтера;
- Docker-описания (`Dockerfile`/`compose.yml`) — только ручной pm2;
- CI/CD;
- `.env.example`.

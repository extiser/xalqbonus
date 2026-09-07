# 05. Интеграции

## Yandex Fleet API

Клиент — [controllers/yandexApi.js](../controllers/yandexApi.js), `axios`-инстанс с заголовками:

```
X-Client-ID:        YANDEX_CLIENT_ID
X-Api-Key:          YANDEX_API_KEY
X-Park-ID:          YANDEX_PARK_ID
X-Idempotency-Token: '8e03978e-40d5-43e8-bc93-6894a57f9324'   ← захардкожен, один на все запросы
Content-Type:       application/json
```

Base URL: `https://fleet-api.taxi.yandex.net/`

| Функция | Метод | Назначение |
|---|---|---|
| `getDriverProfiles(phone)` | `POST /v1/parks/driver-profiles/list` | поиск водителя по телефону при регистрации, `limit: 5` |
| `getDriverProfile(profile_id)` | `GET /v2/parks/contractors/driver-profile` | полный профиль (ФИО, ВУ, статус) |
| `getDriverProfileByProfileId(id)` | `POST /v1/parks/driver-profiles/list` | профиль + машина (позывной, госномер) |
| `getDriverTrips(profile_id, from, to)` | `POST /v1/parks/orders/list` | поездки за окно, постранично |

### Пагинация поездок

`getDriverTrips` — единственная функция с продуманной обработкой ошибок:

- страницы по 100, `cursor` из ответа, максимум 50 страниц (5000 поездок за прогон);
- `query` передаётся **на всех** страницах (в нём `park.id` = контекст авторизации,
  без него Яндекс отвечает 401);
- ошибка на **первой** странице → `throw` наверх, чтобы вызывающий не сдвинул
  `last_checked` и не потерял окно;
- ошибка на последующей → выход из цикла, уже собранное сохраняется;
- Яндекс иногда отдаёт HTTP 200 с кодом ошибки в теле — проверяется `response.data?.code`.

Остальные три функции ошибку **глотают** (`catch` → `logger.error` → возврат `undefined`).
Например, `driverAuth` при падении `getDriverProfiles` упадёт на
`driverProfiles.find(...)` → `TypeError` → водитель увидит `system_error`.

### Лимиты

`YANDEX_API_LIMIT_PER_HOUR=5000`, `YANDEX_REQUEST_INTERVAL_MS=500`.
Пейсинг реализован как `sleep(500 мс)` перед каждым запросом в
[services/tripService.js](../services/tripService.js). При 4062 водителях
один полный прогон — минимум 4062 × 0.5 с ≈ **34 минуты** без учёта пагинации
и времени ответа. Крон стоит на каждый час — запас есть, но небольшой;
от повторного запуска защищает мьютекс `isRunning`.

> ⚠️ Лимит общий на API-ключ парка. Если локальный инстанс запустить с боевым ключом
> и включённым кроном — он будет отъедать квоту у прода и ловить 429 на обеих сторонах.
> Отсюда `DISABLE_CRON=true` в локальном `.env`.

## Telegram

Библиотека Telegraf 4.16, токен `TG_BOT_TOKEN`.

**Два режима**, переключаются `BOT_MODE`:

| Режим | Условие | Как работает |
|---|---|---|
| webhook (прод) | `BOT_MODE ≠ 'polling'` | Express-роут `POST /xalqbonusbot/bot`; при `NODE_ENV=dev` бот при старте сверяет и переустанавливает webhook на `TG_BOT_WEBHOOK` |
| long-polling (локально) | `BOT_MODE=polling` | `bot.launch()` без await; graceful shutdown по SIGINT/SIGTERM |

> ⚠️ **Один токен = один активный приёмник.** Запуск локального инстанса в polling
> с боевым токеном отвяжет прод-вебхук и уведёт на себя весь боевой трафик.
> Для локальной разработки нужен **отдельный тестовый бот** — см. [06-local-setup.md](06-local-setup.md).

Глобальный обработчик ошибок:
```js
bot.catch((err, ctx) => console.error('Ошибка в боте при обработке апдейта', ctx?.update, err));
```
Только в консоль, не в Winston.

### Файлы

`utils/utils.js → fileDownload(ctx, file_id)`: скачивает файл через
`https://api.telegram.org/file/bot<TOKEN>/<file_path>`, кладёт в `uploads/`
под именем `<timestamp>_<basename>`, возвращает **абсолютный** путь.
Этот абсолютный путь пишется в `photo_url` товаров, акций, купонов, рассылок.

> ⚠️ Пути в БД абсолютные и привязаны к файловой системе прод-сервера.
> Отдача идёт как `{ source: photo_url }` — при локальном запуске с прод-дампом
> все картинки отвалятся, если не перенести `uploads/` в тот же путь или не
> переписать `photo_url` на относительные. См. B-6 в issues.

### Очередь отправки

[utils/TaskQueue.js](../utils/TaskQueue.js) — самописная очередь с лимитом в час
и интервалом между задачами. Используется только для рассылок
(`new TaskQueue(10000, 1000)`). При достижении лимита делает `setTimeout` **на час**.
`p-queue` есть в зависимостях, но нигде не импортируется.

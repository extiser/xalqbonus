# 07. Найденные проблемы

Список составлен по чтению кода и сверке со схемой из прод-дампа. Ничего не исправлялось.
Помечено, что подтверждено чтением кода, а что требует проверки на живой базе.

Категории: **S** — безопасность, **B** — баги, **P** — производительность, **T** — техдолг.

---

## S — Безопасность

### S-1. Нет ни одной проверки роли в обработчиках 🔴 критично

Авторизация реализована исключительно как «какие кнопки нарисовали». Ни в [bot.js](../bot.js),
ни в одном обработчике `actions/*` нет проверки `ctx.session.role` перед действием.
`ctx.session.role` к тому же ставится самим ботом при `/start` и живёт в
`data/sessions.json` — это не источник правды, а кеш.

`callback_data` полностью контролируется клиентом. Любой водитель (или посторонний,
нажавший `/start`) может отправить произвольную строку и попасть в админские сценарии:

| Что отправить | Что получит |
|---|---|
| `catalog` | управление каталогом: добавление/удаление товаров |
| `users` → `change_role\|<id>` → `assign_new_role_admin\|admin\|<id>` | назначение себе роли admin |
| `offices` → `delete_office\|<id>` | удаление офиса |
| `mailing` → `start_mailing\|<id>` | запуск рассылки по всем 4062 водителям |
| `manualy_add_points` | ручное начисление баллов любому водителю |

Исключение — `getEmployees(role)` в [userController.js](../controllers/userController.js),
единственное место, где роль проверяется, и то частично.

**Что делать:** middleware в Telegraf, который на каждый апдейт резолвит пользователя
из БД по `chat_id` (а не из сессии) и таблица «действие → разрешённые роли»,
проверяемая до вызова хендлера.

### S-2. Предсказуемые коды купонов

[couponController.js](../controllers/couponController.js), `driverActivateCoupon`:
```js
const code = Date.now().toString().slice(-6);
```
Последние 6 цифр миллисекундного времени. Проблемы:
- предсказуем — код можно угадать, зная примерное время активации;
- коллизии: два водителя, активировавшие купон в один и тот же миллисекунд по модулю 10⁶
  (раз в ~16.7 минут), получат одинаковый код;
- в модели поле объявлено `unique`, но **в БД уникального индекса нет**
  (колонка `double precision NOT NULL`) — коллизия пройдёт молча;
- `activateCoupon(code)` ищет `findOne({ where: { code } })` — при коллизии погасится
  чужой купон.

**Что делать:** криптослучайный код (`crypto.randomInt`) + `UNIQUE`-индекс в БД + retry на конфликт.

### S-3. Секретный код заказа — 5 цифр, без ограничения попыток

`generateRandomNumber()` даёт число 10000–99999. `checkOrderSecurityCode` не считает
неудачные попытки и не блокирует перебор. Смягчающее обстоятельство: код вводит менеджер
в своём офисе, а не произвольный пользователь — но с учётом S-1 это не гарантия.

### S-4. `.env` с боевыми секретами приехал вместе с кодом

В копии лежат боевой `TG_BOT_TOKEN`, ключи Yandex Fleet API парка и пароль БД.
Файл в `.gitignore`, но физически на диске. При инициализации git убедиться,
что `.gitignore` подхватился до первого коммита. Ротация ключей — на усмотрение,
но факт зафиксировать стоит.

---

## B — Баги

### B-1. Гонка за `Driver.points` между кроновыми задачами 🔴

[index.js](../index.js) запускает три задачи через `Promise.all`, то есть параллельно:

```js
await Promise.all([ processAllDrivers(), proccessAllOrders(), checkBonusForDrivers() ]);
```

При этом:
- [tripService.js](../services/tripService.js) делает **атомарно**:
  `driver.increment('points', { by: N })` → `points = points + N` на стороne БД;
- [bonusService.js](../services/bonusService.js) делает **read-modify-write**:
  ```js
  const drivers = await Driver.findAll({...});        // прочитали points
  // ... цикл ...
  await Driver.update({ points: driver.points + 300 }, { where: { id: driver.id } });
  ```
  `driver.points` — значение на момент `findAll`, то есть до начала цикла.

Если между `findAll` и `update` в bonusService водителю начислились баллы за поездки —
они затираются. Чем больше водителей с `is_bonus='yes'`, тем длиннее цикл и шире окно гонки.

**Фикс:** `Driver.increment('points', { by: 300, where: { id, is_bonus: 'yes' } })`
и отдельным запросом снять флаг — либо один `UPDATE ... SET points = points + 300
WHERE is_bonus='yes' AND ...` с условием в самом запросе.

### B-2. Повторная отмена заказа возвращает баллы дважды 🔴

[orderController.js](../controllers/orderController.js), `cancelCreatedOrder` и `cancelOrderByManager`:

```js
const [updatedCount, order] = await Order.update(
  { status: 'cancelled' },
  { where: { id: order_id }, returning: true },   // ← нет проверки текущего статуса
);
if (updatedCount) { /* откат остатков + возврат баллов */ }
```

`UPDATE` вернёт `updatedCount = 1` и для уже отменённого заказа. Значит откат остатков
и возврат баллов выполнятся повторно.

Как воспроизвести: открыть «Мои заявки», отменить заказ, затем проскроллить чат
к **старому** сообщению того же экрана (кнопка `cancel_order|<id>` там ещё жива)
и нажать снова. Баллы вернутся второй раз, `reserved_quantity` уйдёт в минус.
То же самое для менеджерской отмены и для гонки «водитель отменил / крон автоотменил».

Показательно, что «прямые» операции защищены правильно — `createOrderProducts` и
`checkOrderSecurityCode` сделаны через транзакцию с `FOR UPDATE` и проверкой статуса.
Отмену просто не довели до того же уровня.

**Фикс:** `where: { id: order_id, status: 'pending' }` + транзакция с `FOR UPDATE`,
по образцу `checkOrderSecurityCode`.

### B-3. Повторное голосование накручивает рейтинг менеджера

`saveOrderVote` ([managerRatingController.js](../controllers/managerRatingController.js))
создаёт `ManagerRating` без проверки `Order.voted` и без уникального ключа
`(order_id, driver_id)`. Флаг `voted` выставляется, но нигде не читается перед вставкой.
Повторное нажатие на звёзды в старом сообщении → новая строка + пересчёт среднего.
586 строк в `ManagerRatings` при 715 заказах — стоит проверить на дубли:

```sql
SELECT order_id, count(*) FROM "ManagerRatings"
WHERE vote_type='order_vote' GROUP BY order_id HAVING count(*) > 1;
```

### B-4. Баланс в корзине считается неверно при активной акции

[actions/drivers.js](../actions/drivers.js), `addRemoveExchange`:

```js
let price_points = product.price_point - ((product.price_point / 100) * product.discount);
ctx.session.order.push({ product_id, office_id, price_points });   // ← со скидкой
...
ctx.session.driver_points = ctx.session.driver_points - product.price_point;  // ← БЕЗ скидки
```

Из превью-баланса вычитается полная цена, а в корзину кладётся цена со скидкой.
При удалении из корзины возвращается цена **со скидкой**:
```js
ctx.session.driver_points = ctx.session.driver_points + price_points;   // со скидкой
```

Последствия при активной акции:
- водитель видит заниженный остаток и не может добрать товар, на который баллов реально хватает;
- каждый цикл «добавил → удалил» повышает показанный баланс на величину скидки —
  показанный остаток уползает вверх от настоящего.

На фактическое списание не влияет: оно считается на сервере в `createOrderProducts`
по `price_points` из позиций. Ломается только превью.

### B-5. Новому водителю показывается админское меню купонов

[actions/drivers.js](../actions/drivers.js), `handlePhoneNumber`, после успешной регистрации:
```js
const keys = ['coupons', 'my_points', 'settings'];
```
`coupons` — это админский экран управления купонами (`создать купон / список / архив`),
у водителя должно быть `driver_coupons`. Сравните с [commands/start.js](../commands/start.js)
и [actions/back.js](../actions/back.js), где для водителя корректно `driver_coupons`.

Ошибка проявляется ровно один раз — на экране сразу после регистрации; после `/start`
или «назад» меню становится правильным. Но в сочетании с S-1 это ещё и рабочая кнопка.

### B-6. Водитель без активированных купонов не видит доступных купонов

[couponController.js](../controllers/couponController.js), `getAvailableCoupons`:
```js
const activatedCouponIds = activatedCoupons.map(c => c.coupon_id);   // может быть []
const coupons = await Coupon.findAll({
  where: { status: 'pending', id: { [Op.notIn]: activatedCouponIds } }
});
```
На пустом массиве Sequelize 6 генерирует `id NOT IN (NULL)`, что в SQL даёт `NULL`,
а не `TRUE` — строки отфильтровываются все. То есть водитель, ещё ни разу не
активировавший купон, увидит пустой список.

> Требует проверки на живой БД: включить `logging` у Sequelize и посмотреть сгенерированный SQL.
> Проверка в лоб: `SELECT * FROM "Coupons" WHERE status='pending' AND id NOT IN (NULL);`

**Фикс:** `...(activatedCouponIds.length ? { id: { [Op.notIn]: activatedCouponIds } } : {})`.

### B-7. Абсолютные пути к картинкам

`photo_url` в БД — пути прод-сервера: `/var/www/xalqbonusbot/uploads/1746547949068_file_51.jpg`.
Пишет их `fileDownload()` ([utils/utils.js](../utils/utils.js)), который возвращает
`path.join(process.cwd(), 'uploads', filename)`. Отдаются как `{ source: photo_url }`.

Локально (и на любом другом сервере) все экраны с фото упадут на `ENOENT`.
Обходные пути — в [06-local-setup.md](06-local-setup.md).

**Фикс:** хранить только имя файла, собирать абсолютный путь при отдаче.

### B-8. `trip_score` не описан в модели

Колонка `Trips.trip_score` есть в БД, в модели [Trips.js](../models/Trips.js) её нет.
[tripService.js](../services/tripService.js) передаёт `trip_score` в `findOrCreate`
и в `row.update()` — Sequelize молча выбрасывает неизвестное поле. В БД у всех
новых поездок остаётся дефолт `0`.

На баллы не влияет (логика опирается на `status`), но поле в БД бессмысленно и
любая аналитика по `trip_score` даст ноль.

### B-9. `saveMessageId` получает `undefined` в `_registerCoupon.js`

[actions/textInput/_registerCoupon.js](../actions/textInput/_registerCoupon.js) — четыре места:
```js
const reply = ctx.reply(text, {...});          // ← нет await, reply это Promise
saveMessageId(ctx, reply.message_id, context); // ← undefined
```
В `session.messageIds` копятся `undefined`, эти сообщения потом не удаляются
при переходе меню. Экран погашения купона захламляется.

### B-10. `logger.error(..., error)` вне блока `catch`

Паттерн повторяется: в ветке `if (!x) { ... }` внутри `try` логируется переменная
`error`, которая связана только в `catch`. Обращение к ней даёт `ReferenceError`,
он ловится внешним `catch` — и пользователь получает не «Продукт не найден»,
а общую системную ошибку.

Найдено в:
- [productController.js](../controllers/productController.js) — `changeProductQuantity` (2 ветки);
- [userController.js](../controllers/userController.js) — `changeLanguage`, `changeEmployeeName`;
- [driverController.js](../controllers/driverController.js) — `updateDriverLanguage`
  (там же `${chatId}` — переменная тоже не существует, параметр называется `user_id`);
- [managerController.js](../controllers/managerController.js) — `logger` вообще не импортирован,
  в `catch` будет `ReferenceError: logger is not defined`.

### B-11. Возврат баллов не учитывает количество

[officeProductService.js](../services/officeProductService.js), `rollbackStockQuantityInOffice`:
```js
let totalPricePoints = await Product.sum('price_points', {
  where: { id: products.map(p => p.product_id) },
});
```
Сумма считается по **уникальным товарам**, без умножения на `quantity`, тогда как
списание в `createOrderProducts` идёт как `price_points * quantity`.

Сейчас не стреляет: `confirmOrderLastly` жёстко проставляет `quantity: 1`, а
`addRemoveExchange` не даёт положить один товар дважды. Но при любом введении
количеств возврат станет меньше списания. Плюс сумма берётся из текущей цены
`Products`, а не из цены на момент заказа — при изменении прайса или отмене акции
возврат разойдётся со списанием уже сегодня.

### B-12. `updateDrivers.js` использует `__dirname` в ESM

[updateDrivers.js](../updateDrivers.js) импортирует `fileURLToPath` из `url`,
но не вычисляет `__dirname`, а использует его напрямую (строка 32).
Скрипт разовый (`npm run import`) и сейчас не нужен, но запустится с ошибкой.
Там же в `Driver.create` поле `last_name`, тогда как в модели оно `lastname`.

### B-13. `moment().tz()` работает случайно

[driverController.js](../controllers/driverController.js), `getTodayDrivers` использует
`moment().tz('Asia/Tashkent')` и `moment.tz(...)`, но `moment-timezone` **не является
прямой зависимостью** проекта — в `package.json` только `moment`.

Работает это потому, что `moment-timezone@0.5.46` приходит транзитивно через `sequelize`
и патчит общий хойстнутый инстанс `node_modules/moment`. Как только sequelize перестанет
её тянуть (в v7 moment убран полностью) — экран «Водители, зарегистрированные сегодня»
сломается с `TypeError: moment(...).tz is not a function`.

**Фикс:** добавить `moment-timezone` в `dependencies` и импортировать явно.

### B-14. Мёртвый код

| Что | Проблема |
|---|---|
| [routes/](../routes/) | нигде не подключён; импортирует `authDriver`, `changeDriverLanguage`, которых нет в `driverController`. Внутри лежит собственный `node_modules` |
| [models/index.js](../models/index.js) | шаблон sequelize-cli, требует `config/config.json`, которого нет. Реальная точка сборки — `models/models.js` |
| [models/DriverPoints.js](../models/DriverPoints.js) | не экспортируется из `models.js`; поля (`total_points`, `points_spent`) не совпадают с таблицей (`points`); таблица пустая |
| [controllers/tripController.js](../controllers/tripController.js) | функция `createTrip` с пустым телом |
| `updateDriversProfiles`, `updateDriversCar` | без вызывающих; в `catch` обращаются к `profile` вне области видимости |
| [actions/language.js](../actions/language.js) | пустой файл (0 байт) |
| `p-queue` в зависимостях | нигде не импортируется (используется самописный `TaskQueue`) |
| `editOffice` ([officeController.js](../controllers/officeController.js)), `removeProductFromOffice` ([officeProductController.js](../controllers/officeProductController.js)) | без вызывающих; `editOffice` к тому же пишет в несуществующее поле `office.address` |

---

## P — Производительность

### P-1. `BATCH_SIZE` вырождается в 1

[tripService.js](../services/tripService.js):
```js
BATCH_SIZE = Math.max(1, Math.floor(req_limit / (3600 / (req_interval / 1000))));
//         = max(1, floor(5000 / (3600 / 0.5))) = max(1, floor(5000/7200)) = max(1, 0) = 1
```
Формула задумывалась как «сколько водителей влезет в часовую квоту», но при текущих
значениях даёт 0 → 1. Итог: 4062 отдельных `SELECT ... LIMIT 1 OFFSET n` вместо
разумных пачек. Пагинация с растущим `OFFSET` по 4062 итерациям — лишняя нагрузка на БД.

Реальный пейсинг всё равно обеспечивается `sleep()` перед каждым HTTP-запросом,
так что размер пачки нужен только для выборки из БД. Достаточно поставить
фиксированные 200–500 и не считать формулой.

### P-2. N+1 запросов на каждый экран из-за переводов

[utils/constructor.js](../utils/constructor.js) делает отдельный `SELECT` в `Translations`
на основной текст и **на каждую кнопку**. Кеша нет, таблица всего 237 строк.

Экран из 8 кнопок = 9 запросов. Список из 20 заказов, где у каждого своя клавиатура,
— под сотню запросов на одно нажатие.

**Фикс:** прогреть все 237 строк в память при старте (`Map<key, {ru, uz}>`)
с инвалидацией по требованию. Один запрос вместо тысяч.

### P-3. Рассылка держит один `ctx` больше часа

`sendMailingsToDriver` ([utils/notifications.js](../utils/notifications.js)):
`TaskQueue(10000, 1000)` — 1 секунда между отправками. На 4062 водителя это ~68 минут,
всё это время живёт `ctx` того апдейта, которым запустили рассылку.
Плюс перед каждой отправкой делается **два** `SELECT` статуса рассылки (в цикле
добавления и внутри задачи) — 8124 лишних запроса на прогон.

Отдельно: при достижении лимита `TaskQueue` делает `setTimeout` **ровно на час** —
блокирующая пауза без возможности прервать.

### P-4. Логи 1.4 ГБ

`logs/trips-error1.log` — 1.35 ГБ при заявленном `maxsize: 20 MB`. Ротация Winston
для этого файла не отработала (вероятно, файл рос при перезапусках процесса,
когда `tailable`-нумерация сбивалась). `NODE_ENV=dev` на проде означал ещё и
дублирование всего в stdout → в лог pm2.

Перед началом работ имеет смысл почистить `logs/` (это 82% размера копии проекта).

### P-5. Сессии в JSON-файле

`telegraf-session-local` держит все сессии в `data/sessions.json` и переписывает файл
при изменениях. Сейчас 127 КБ, бэкап от 20.03.2026 — 966 КБ. Ограничения:
один процесс (масштабирование невозможно), неограниченный рост, риск потери при
конкурентной записи.

---

## T — Техдолг

| # | Что |
|---|---|
| T-1 | Нет git-репозитория — истории изменений не существует |
| T-2 | Нет тестов, линтера, форматтера, CI |
| T-3 | `DB_PORT` объявлен в `.env`, но не читается в [db.js](../db.js) и [config/config.js](../config/config.js) |
| T-4 | Нет `.sequelizerc`, из-за чего `sequelize-cli` без явных флагов ищет несуществующий `config/config.json` |
| T-5 | Списки кнопок главного меню продублированы в [commands/start.js](../commands/start.js) и [actions/back.js](../actions/back.js) |
| T-6 | Смешанные контракты возврата: почти везде `{code:'success'\|'error'}`, но `listOffices()` и `getProductsInOffice()` возвращают голый массив при успехе — вызывающий код делает `.length` на объекте ошибки |
| T-7 | Опечатки в публичных именах: `proccessAllOrders`, `seachOfficeRequest`, `handleAddMailining`, `sendBonusUpdatedNofiticationToDriver` |
| T-8 | ~25 булевых флагов `session.awaiting*` вместо конечного автомата; забытый сброс флага уводит ввод в чужой обработчик |
| T-9 | `X-Idempotency-Token` в [yandexApi.js](../controllers/yandexApi.js) захардкожен одним значением на все запросы |
| T-10 | `bot.catch` пишет только в `console.error`, мимо Winston |
| T-11 | `deleteMessagesByContext` вызывается без `await` в `manageContext` — удаление уходит в фон, ошибки глотаются |
| T-12 | Статусы акций расходятся: модель по умолчанию `'future'`, код пишет `'upcoming'`; перехода `upcoming → current` нет нигде — только руками в БД |
| T-13 | В [actions/drivers.js](../actions/drivers.js) 27 КБ и комментарий автора `// to do: распределить функции заказов в отдельный файл` |

---

## Предлагаемый порядок работ

1. **Инфраструктура** — git init, локальная БД из дампа, `.env.example`, чистка `logs/`
   ([06-local-setup.md](06-local-setup.md)).
2. **Безопасность** — S-1 (middleware ролей) как единственная по-настоящему критичная вещь, затем S-2.
3. **Деньги** — B-1 (гонка за баллами), B-2 (двойной возврат), B-3 (накрутка рейтинга).
   Это три места, где расходятся баланс и склад.
4. **Функциональные** — B-6 (купоны не видны), B-4 (баланс в корзине), B-5, B-7 (картинки).
5. **Производительность** — P-2 (кеш переводов) даёт наибольший эффект при наименьшем риске, затем P-1.
6. **Техдолг** — по мере касания соответствующих файлов.

Пункты 3 и 4 стоит закрывать характеризующими тестами: сейчас никакой страховки
от регрессий нет вообще.

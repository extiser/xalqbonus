# 04. Роли, меню и бизнес-сценарии

## Роли

Две независимые сущности пользователей:

- **Сотрудники** — таблица `Users`, роль из `Roles`: `root`, `admin`, `manager`, `coupon_manager`.
- **Водители** — таблица `Drivers`, роли в БД нет; в сессии проставляется `role: 'driver'`.

`/start` ([commands/start.js](../commands/start.js)) сначала ищет `chat_id` в `Users`,
и только если не нашёл — в `Drivers`. Не нашёл нигде → предложение выбрать язык
и зарегистрироваться как водитель.

### Главное меню по ролям

| Роль | Кнопки главного меню |
|---|---|
| `root` | Водители, Купоны, Акции, Пользователи, Офисы, Каталог, Рассылки, Настройки |
| `admin` | Купоны, Акции, Офисы, Каталог, Рассылки, Настройки |
| `manager` | Мой офис, Настройки |
| `coupon_manager` | Погасить купон |
| водитель | Купоны водителя, Мои баллы, Настройки |

Меню собирается в двух местах — [commands/start.js](../commands/start.js) и
[actions/back.js](../actions/back.js) — списки `keys` продублированы. Менять надо оба.

> ⚠️ **Проверок роли внутри обработчиков нет вообще.** Ограничение доступа = «какие
> кнопки нарисовали». `callback_data` контролируется клиентом, поэтому любой водитель,
> отправив, например, `catalog` или `users`, попадёт в админские экраны.
> Подробно — в [07-issues.md](07-issues.md), пункт S-1.

## Карта callback-роутов

Все регистрации — в [bot.js](../bot.js). Формат `callback_data`: `имя|arg1|arg2`.

### Команды
| Команда | Обработчик |
|---|---|
| `/start` | `commands/start.js → startCommand` |
| `/crud` | `commands/crud.js` — заявка на доступ в админку, уведомляет всех `root` |
| `/reset` | `commands/reset.js` — очищает `ctx.session` целиком |

### Общее
| callback | Обработчик |
|---|---|
| `back_to_menu` | `actions/back.js → backToMenu` |

### Менеджер (`actions/manager.js`)
| callback | Действие |
|---|---|
| `my_office` \| `back_to_my_office` | список офисов менеджера + его рейтинг |
| `select_managers_office\|<id>` | меню офиса |
| `search_office_request\|<id>` | запрос номера заявки → ввод текстом |
| `accept_order_by_manager\|<id>` | запрос секретного кода → `acceptOrder` |
| `cancel_order_by_manager\|<id>` | отмена заказа с возвратом баллов и остатков |

### Водители — контроль (`actions/driversControl.js`, только `root`)
`drivers_control`, `drivers_registered_today`, `manualy_add_points`

### Акции (`actions/promotions.js`)
`promotions` / `back_to_promotions`, `current|upcoming|archive_promotions|<status>`,
`add_promotion`, `add_promotion_office|<id>`, `stop_promotion|<id>`

### Пользователи и сотрудники (`actions/users.js`, `actions/employees.js`, `actions/requests.js`)
`users`, `change_role|<id>`, `assign_new_role_<role>|<role>|<id>`, `change_employee_name|<id>`,
`employees`, `assign_to_office|<id>`, `assign_employee_to_office|<office>|<user>`,
`show_assigned_offices|<id>`, `detach_from_office|<office>|<user>`,
`requests`, `assign_role_<role>|<role>|<reqId>`, `cancel_request|<id>`

### Офисы (`actions/offices.js`)
`offices`, `add_office`, `delete_office|<id>`, `confirm_delete_office|<id>`,
`cancel_delete_office|<id>`, `office_products|<id>`

### Каталог (`actions/catalog.js`)
`catalog`, `catalog_list`, `search_product`, `add_product`, `add_special_product`,
`update_product_quantity|<id>`, `distribute_product_to_office|<id>`,
`select_office_for_distribution|<office>|<product>`, `delete_product|<id>`,
`confirm_delete_product|<id>`

### Рассылки (`actions/mailing.js`)
`mailing`, `mailing_list`, `create_mailing`, `start_mailing|<id>`, `stop_mailing|<id>`,
`delete_mailing|<id>`

### Купоны (`actions/coupons.js`)
Админ: `coupons`, `create_coupon`, `add_coupon_manager|<id>`,
`coupons_list|pending`, `archived_coupons|cancelled`, `archive_coupon|<id>`
Водитель: `driver_coupons`, `available_coupons`, `driver_activate_coupon|<id>`, `my_coupons`
Погашение: `register_coupon`, `confirm_coupon|<id>`, `decline_coupon|<id>`

### Водитель (`actions/drivers.js`)
`select_language_<ru|uz>|<lang>`, `my_points`, `my_exchange_requests`,
`exchange_points|<page>|<x>`, `exchange_special|<page>|<x>`,
`show_products_by_office_to_exchange|exchange_page|continue_order|<office>|<page>`,
`add_to_exchange|remove_from_exchange|<office>|<product>`,
`confirm_order`, `confirm_order_lastly`, `confirm_cancel_order`,
`cancel_order|<id>`, `vote_order|<order>|<manager>|<driver>|<stars>`

### Текстовый ввод
`bot.on('message')` → если `ctx.message.contact` → `handlePhoneNumber`,
иначе → [actions/textInput/textInput.js](../actions/textInput/textInput.js).

Это `switch (true)` по ~25 флагам `session.awaiting*`. Флаги — единственное состояние
формы; если предыдущий сценарий не сбросил свой флаг, ввод уедет не туда.
Ни один флаг не проверяет роль отправителя.

## Бизнес-сценарии

### 1. Регистрация водителя

```
/start (chat_id не найден ни в Users, ни в Drivers)
  → выбор языка (select_language_ru|uz)
  → кнопка «отправить контакт» (Markup.button.contactRequest)
  → handlePhoneNumber → driverAuth(chat_id, phone, language)
       ├ найден в Drivers по chat_id           → 'authorized'
       ├ найден в Drivers по phone             → проставляем chat_id, 'chat_id_updated'
       ├ найден в Yandex Fleet API (work_status='working')
       │     → Driver.create(..., is_bonus:'yes') → 'registered'
       └ иначе                                  → 'not_found_api'
```
Новый водитель получает `is_bonus: 'yes'` — это заявка на приветственный бонус
300 баллов, который начислится после 5 завершённых поездок.

> ⚠️ После успешной регистрации рисуется меню `['coupons', 'my_points', 'settings']` —
> кнопка `coupons` ведёт в **админское** меню купонов вместо `driver_coupons`
> ([actions/drivers.js](../actions/drivers.js), `handlePhoneNumber`). См. B-4 в issues.

### 2. Начисление баллов за поездки (крон, раз в час)

[services/tripService.js](../services/tripService.js) → `processAllDrivers()`:

```
BATCH_SIZE = floor(YANDEX_API_LIMIT_PER_HOUR / (3600 / (INTERVAL_MS/1000)))
           = floor(5000 / (3600 / 0.5)) = floor(5000/7200) = 0 → max(1, 0) = 1
```
Водители (кроме `working_status = 'fired'`) читаются пачками по `BATCH_SIZE`
с `ORDER BY id ASC`, для каждого:

1. `sleep(YANDEX_REQUEST_INTERVAL_MS)` — пейсинг перед каждым запросом.
2. Окно запроса: `booked_from = driver.last_checked`, `booked_to = now()` (UTC).
3. `getDriverTrips()` — постраничный обход Fleet API по `cursor`, до 50 страниц.
4. Ошибка запроса (429/таймаут) → `continue`, **`last_checked` не двигаем** — окно
   перезапросится в следующий час, поездки не теряются.
5. По каждой поездке `Trip.findOrCreate({ where: { trip_id } })` — дедуп.
   Засчитывается `+1` балл, если поездка создана со `status='complete'`
   ИЛИ если существующая незавершённая перешла в `complete`.
6. `driver.increment('points', { by: N })` — атомарно, не конфликтует с бонусной задачей.
7. Нет поездок и прошло ≥1 суток → `days_without_trips += разница`.

> ⚠️ `BATCH_SIZE` вычисляется в 1 при текущих значениях env — выборка идёт по одному
> водителю за запрос к БД, 4062 итерации `findAll`. См. P-1 в issues.

### 3. Приветственный бонус

[services/bonusService.js](../services/bonusService.js) → `checkBonusForDrivers()`:
берёт всех с `is_bonus='yes'`, подзапросом считает завершённые поездки,
у кого `>= 5` — `points += 300`, `is_bonus = 'no'`, шлёт уведомление.

> ⚠️ Обновление делает `Driver.update({ points: driver.points + 300 })` — read-modify-write
> непрямым присваиванием. Идёт в `Promise.all` параллельно с `processAllDrivers()`,
> который в это же время делает `increment('points')`. Гонка → потеря начислений. См. B-1.

### 4. Обмен баллов на товар

```
Водитель: «Мои баллы» → «Обменять баллы»
  → список офисов, где есть менеджер (role_id=3) + активная акция
  → пагинированный список товаров офиса (5 на страницу)
  → add_to_exchange / remove_from_exchange — корзина копится в ctx.session.order,
    ctx.session.driver_points уменьшается ЛОКАЛЬНО (превью)
  → confirm_order   → создаётся Order(status='pending', code=5 цифр), показывается состав
  → confirm_order_lastly → createOrderProducts(...)
```

`createOrderProducts()` ([controllers/orderController.js](../controllers/orderController.js))
— единственное место с честной транзакцией:

```
BEGIN
  SELECT ... FROM Orders WHERE id=? FOR UPDATE      -- блокировка от двойного тапа
  проверка status='pending'
  проверка отсутствия OrderItems (идемпотентность)
  UPDATE Drivers SET points = points - total
        WHERE id=? AND points >= total              -- 0 строк → «Недостаточно баллов»
  bulkCreate(OrderItems)
  для каждой позиции:
    UPDATE OfficeProducts SET stock -= qty, reserved += qty
          WHERE ... AND stock_quantity >= qty       -- 0 строк → «Недостаточно товара»
COMMIT
```

Дальше водитель приходит в офис и называет `code`:

```
Менеджер: «Мой офис» → офис → «Найти заявку» → номер заказа
  → карточка заказа → accept_order_by_manager|<id> → ввод секретного кода
  → checkOrderSecurityCode(): транзакция, FOR UPDATE, status must be 'pending',
    code must match → status='completed', manager_id=..., reserved_quantity -= qty
  → водителю уходит запрос оценки менеджера (1–5 звёзд) → vote_order|...
    → ManagerRating + пересчёт среднего в Users.rating
```

Отмена (водителем, менеджером или автоматически):
`rollbackStockQuantityInOffice()` → `stock += qty`, `reserved -= qty`,
считает сумму к возврату с учётом акции → `rollbackPoints()` → `Driver.increment('points')`.

> ⚠️ Возврат баллов считается как `Product.sum('price_points', { id: [...] })` —
> **без учёта количества** и **без дедупликации** одинаковых `product_id`.
> Списание при этом было `price * quantity`. Расхождение при qty > 1. См. B-2.

### 5. Автоотмена зависших заказов (крон)

`proccessAllOrders()`: все `Orders` со `status='pending'`, у кого `createdAt`
старше 2 часов → откат остатков → возврат баллов → `status='cancelled'`, `manager_id=null`.

### 6. Купоны

```
admin/root: create_coupon → title → description → фото → выбор coupon_manager
            → Coupon(status='pending', manager_id)

водитель:   driver_coupons → available_coupons → driver_activate_coupon|<id>
            → ActivatedCoupon(status='pending', code = последние 6 цифр Date.now())
            → водитель показывает код в точке

coupon_manager: register_coupon → вводит код текстом
            → activateCoupon(code) → карточка водителя
            → confirm_coupon|<id> (status='completed') | decline_coupon|<id> ('cancelled')
```

> ⚠️ `code = Date.now().toString().slice(-6)` — предсказуемый и коллизионный;
> в БД колонка `double precision` без `unique`. См. S-2.

### 7. Рассылки

`create_mailing` → заголовок → текст → фото → `Mailing(status='stopped')`.
`start_mailing|<id>` → `sendMailingsToDriver()` ([utils/notifications.js](../utils/notifications.js)):
берёт **всех** водителей, ставит задачи в самописную `TaskQueue` (лимит 10000/час,
интервал 1000 мс), перед каждой отправкой перечитывает статус рассылки из БД —
чтобы `stop_mailing` реально прерывал. По завершении `status='finished'`.

> ⚠️ На 4062 водителя при интервале 1 сек рассылка идёт ~68 минут, и всё это время
> держится один `ctx`. Плюс на каждого водителя — отдельный `SELECT` рассылки (×2).

# 03. Модель данных

БД: PostgreSQL 16. Имена таблиц — PascalCase во множественном числе (`Drivers`, `Orders`),
колонки — snake_case, кроме служебных `createdAt` / `updatedAt` (camelCase, Sequelize).

Точка сборки моделей — [models/models.js](../models/models.js): импортирует все модели
и объявляет **все** ассоциации. Импортировать надо именно его, а не отдельные файлы,
иначе `include` не отработает.

## Таблицы и объёмы (из дампа 15.08.2026)

| Таблица | Строк | Назначение |
|---|---:|---|
| `Trips` | 1 162 756 | поездки из Yandex Fleet API — 99% объёма базы |
| `Drivers` | 4 062 | водители (участники программы) |
| `Orders` | 715 | заказы на обмен баллов |
| `OrderItems` | 643 | позиции заказов |
| `ManagerRatings` | 586 | оценки менеджеров водителями |
| `ProductChanges` | 247 | журнал движения товара |
| `Translations` | 237 | i18n ru/uz |
| `ActivatedCoupons` | 165 | активации купонов водителями |
| `OfficeProducts` | 104 | остатки товара по офисам |
| `Products` | 57 | каталог |
| `SequelizeMeta` | 55 | применённые миграции — совпадает 1-в-1 с файлами в `migrations/` |
| `UserRequests` | 53 | заявки на доступ в админку |
| `UserOffices` | 39 | привязка сотрудник↔офис |
| `Users` | 33 | сотрудники (root/admin/manager/coupon_manager) |
| `Mailings` | 16 | рассылки |
| `Coupons` | 8 | купоны |
| `Promotions` | 5 | акции (скидки в баллах) |
| `Roles` | 4 | root, admin, manager, coupon_manager |
| `Offices` | 3 | физические офисы выдачи |
| `DriverPoints` | 0 | **мёртвая таблица** |

## ER-схема

```
Roles ──1:M──> Users ──M:N(UserOffices)──> Offices
                 │                            │
                 ├─1:M─> Coupons              ├─1:M─> Promotions
                 ├─1:M─> ProductChanges        ├─M:N(OfficeProducts)─> Products
                 └─1:M─> ManagerRatings        └─1:M─> Orders
                                │
Drivers ──1:M──> Trips          │
   │                            │
   ├──1:M──> Orders ──1:M──> OrderItems ──M:1──> Products
   │            └──1:M──> ManagerRatings
   ├──1:M──> ActivatedCoupons ──M:1──> Coupons
   └──1:M──> ManagerRatings

UserRequests   — отдельно, без FK (связь по chat_id при одобрении)
Translations   — отдельно, справочник
Mailings       — отдельно, справочник
```

## Ключевые таблицы

### `Drivers` — водитель
Не связан с `Users`. Идентифицируется по `chat_id` (Telegram) и `profile_id` (Yandex).

Поля: `profile_id`, `name`/`lastname`/`middle_name`, `phone` (unique),
`chat_id` (unique), `callsign` (позывной), `car_number` (unique, дефолт `not_found`),
`working_status` (`fired` = исключён из выборок), `language`, **`points`** (баланс),
`last_checked` (граница окна опроса Yandex), `license_number`/`license_expiration`,
`days_without_trips`, `referral_code`, `is_bonus` (`yes`/`no` — ждёт ли бонус за 5 поездок).

Хук `afterCreate` генерирует `referral_code` вида `XALQTAXI{id}{rand}`.

### `Trips` — поездка
`trip_id` — id заказа в Yandex (**без уникального индекса в БД**, дедуп только
через `findOrCreate` в коде). `status === 'complete'` = засчитывается в баллы.
Колонка `trip_score` есть в БД, но **отсутствует в модели** — см. расхождения ниже.

### `Orders` / `OrderItems` — заказ на обмен
Статусы: `pending` → `completed` (выдан) | `cancelled`.
`code` — 5-значный секретный код выдачи, водитель называет его менеджеру.
`voted` — оценил ли водитель менеджера после выдачи.

Баллы списываются **в момент оформления** заказа, товар переводится
`stock_quantity -= qty`, `reserved_quantity += qty`. При выдаче снимается только резерв.
При отмене — всё возвращается.

### `OfficeProducts` — остатки на офисе
Составной ключ `(office_id, product_id)`, поля `stock_quantity`, `reserved_quantity`.
В модели явно `primaryKey: false` — Sequelize не знает PK, но в БД он есть.

### `Products` — каталог
`price_points` (цена в баллах), `price_currency`, `cost_price`, `stock_quantity`
(центральный склад), `status` (`active`/`deleted` — мягкое удаление),
`special_offer` (флаг «спецпредложения», отдельная витрина в боте).

### `Promotions` — акция
`discount_percentage` даёт скидку в баллах на товары офиса.
Статусы в коде: `upcoming` (при создании) → `current` → `archive`.
⚠️ Модель по умолчанию ставит `status: 'future'`, а `addNewPromotion()` пишет `'upcoming'`.
Переход `upcoming → current` нигде в коде не автоматизирован — только вручную в БД.

## Расхождения «модель ↔ реальная БД»

Проверено сверкой [models/](../models/) с `CREATE TABLE` в дампе. Это то, что укусит
при попытке `sequelize.sync()` или при добавлении новых миграций.

| # | Что | В модели | В БД (прод) | Последствие |
|---|---|---|---|---|
| 1 | `Trips.trip_score` | колонки нет | `double precision DEFAULT 0` | `tripService` пишет `trip_score` в `defaults`/`update` — Sequelize молча его игнорирует, в БД всегда 0 |
| 2 | `ActivatedCoupons.code` | `TEXT, unique` | `double precision NOT NULL` | код купона хранится числом; `unique` в БД нет |
| 3 | `DriverPoints` | модель есть ([DriverPoints.js](../models/DriverPoints.js)) с полями `total_points`, `points_spent`, `last_updated` | таблица есть с полем `points`, 0 строк | модель **не экспортируется** из `models.js` — полностью мёртвая, поля не совпадают |
| 4 | `Orders.code` | `allowNull: false` | `text` (nullable) | расхождение без практических последствий |
| 5 | `Users.office_id` | нет | нет | но `assignNewRoleToUser()` пишет `user.office_id = null` — присваивание в пустоту (после миграции `20241205073820`) |
| 6 | `Promotion.status` default | `'future'` | дефолта нет | фактически всегда `'upcoming'` из кода |

## Миграции

55 файлов в [migrations/](../migrations/), в `SequelizeMeta` дампа — ровно те же 55.
Сверено построчно: расхождений нет, схема полностью соответствует миграциям.
Значит, дамп можно накатывать как есть, а новые миграции — дописывать поверх.

Конфиг для `sequelize-cli` — [config/config.js](../config/config.js), окружения
`dev` / `test` / `prod`. `.sequelizerc` отсутствует, поэтому CLI по умолчанию ищет
`config/config.json` — **его нет**. Отсюда же неработающий [models/index.js](../models/index.js)
(шаблон CLI, требует `config/config.json`). Работать надо через явные флаги
`--config config/config.js --env dev`.

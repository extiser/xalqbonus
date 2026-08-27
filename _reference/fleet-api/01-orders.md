# Yandex Fleet API — группа Orders

Источник: https://fleet.yandex.ru/docs/api/ru/openapi/Orders/
Базовый хост API: `https://fleet-api.taxi.yandex.net`
Дата сбора: 2026-08-27

Собранные страницы:

| # | Эндпоинт | Метод | URL документации | Статус |
|---|----------|-------|------------------|--------|
| 1 | `/v1/parks/orders/list` | POST | `.../Orders/v1parksorderslist-post` | собрано |
| 2 | `/v1/parks/orders/track` | POST | `.../Orders/v1parksorderstrack-post` | собрано |

---

## Краткие ответы на ключевые вопросы (`/v1/parks/orders/list`)

1. **`driver_profile.id` НЕ обязателен.** Объект `query.park.driver_profile` и его поле `id` — опциональные фильтры. Запрашивать заказы по всему парку, указав только `query.park.id`, можно. Обязательным для парка является только `park.id`.
2. **Фильтровать по `ended_at` можно, и `booked_at` при этом НЕ обязателен.** В описании объекта `OrdersListQueryParkOrder` указано дословно: **«Обязательно наличие одного из booked_at или ended_at»**. То есть достаточно указать любой один из двух диапазонов; допустимо задать только `ended_at` (в примере запроса `booked_at` заполнен, а `ended_at: null` — и наоборот тоже валидно). Полное отсутствие обоих — невалидный запрос.
3. **Идентификатор водителя присутствует в каждом объекте заказа в ответе** — поле `orders[].driver_profile.id` (рядом с `orders[].driver_profile.name`).

---

# 1. POST /v1/parks/orders/list — Получение списка заказов

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v1/parks/orders/list`

## 1.1. Заголовки

| Заголовок | Тип | Обязательный | Ограничения | Описание |
|-----------|-----|--------------|-------------|----------|
| `X-API-Key` | string | Да | min length: 1 | Ключ API |
| `X-Client-ID` | string | Да | min length: 1 | Идентификатор клиента |
| `Content-Type` | string | Да | — | `application/json` |

## 1.2. Параметры тела запроса

### Верхний уровень

| Параметр | Тип | Обязательный | Ограничения | Описание |
|----------|-----|--------------|-------------|----------|
| `query` | object (`OrdersListQuery`) | Да | — | Условия отбора заказов |
| `limit` | integer | Нет | min: 1, max: 500 | Ограничение сверху на число заказов в ответе |
| `cursor` | string | Нет | min length: 1 | Курсор для получения следующей порции данных; значение должно быть взято из ответа на предыдущий запрос |

### `query` → `OrdersListQuery`

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `park` | object (`OrdersListQueryPark`) | Да | Условия отбора по парку |

### `query.park` → `OrdersListQueryPark`

| Параметр | Тип | Обязательный | Ограничения | Описание |
|----------|-----|--------------|-------------|----------|
| `id` | string | **Да** | min length: 1, max length: 100 | Идентификатор парка |
| `order` | object (`OrdersListQueryParkOrder`) | Да | — | Условия отбора по заказам |
| `driver_profile` | object | **Нет** | — | Фильтр по водителю |
| `driver_profile.id` | string | **Нет** | min length: 1, max length: 100 | Идентификатор профиля водителя |
| `car` | object | Нет | — | Фильтр по автомобилю |
| `car.id` | string | Нет | min length: 1, max length: 100 | Идентификатор автомобиля |

> Если `driver_profile` не передан, выборка идёт по всему парку (по `park.id`).

### `query.park.order` → `OrdersListQueryParkOrder`

**Условие обязательности:** «Обязательно наличие одного из `booked_at` или `ended_at`».

| Параметр | Тип | Обязательный | Ограничения | Описание |
|----------|-----|--------------|-------------|----------|
| `ids` | array of string | Нет | 1–100 элементов | Идентификаторы заказов |
| `short_ids` | array of integer | Нет | 1–100 элементов | Короткие (порядковые) номера заказов |
| `booked_at` | object `{from, to}` | Условно (см. выше) | ISO 8601 с временной зоной | Диапазон времени подачи |
| `booked_at.from` | string (date-time) | Нет | ISO 8601 с временной зоной | Начало диапазона; может быть `null` |
| `booked_at.to` | string (date-time) | Нет | ISO 8601 с временной зоной | Конец диапазона; может быть `null` |
| `ended_at` | object `{from, to}` | Условно (см. выше) | ISO 8601 с временной зоной | Диапазон времени завершения |
| `ended_at.from` | string (date-time) | Нет | ISO 8601 с временной зоной | Начало диапазона; может быть `null` |
| `ended_at.to` | string (date-time) | Нет | ISO 8601 с временной зоной | Конец диапазона; может быть `null` |
| `type` | object | Нет | — | Фильтр по типу заказа |
| `type.ids` | array of string | Нет | 1–100 элементов | Идентификаторы типов заказа |
| `statuses` | array of enum | Нет | — | Статусы заказов (см. перечень ниже) |
| `payment_methods` | array of enum | Нет | — | Способы оплаты (см. перечень ниже) |
| `providers` | array of enum | Нет | — | Источники заказа (см. перечень ниже) |
| `categories` | array of enum | Нет | — | Тарифные категории (см. перечень ниже) |
| `price` | object `{from, to}` | Нет | строка, max length: 20 | Диапазон стоимости заказа |
| `price.from` | string | Нет | max length: 20 | Нижняя граница; может быть `null` |
| `price.to` | string | Нет | max length: 20 | Верхняя граница; может быть `null` |

**Формат дат:** ISO 8601 с обязательной временной зоной, например `2019-08-08T11:58:01+03:00`.

## 1.3. Перечни enum (запрос и ответ)

### `statuses` / `status` / `events[].order_status` — статусы заказа

```
none
driving
waiting
transporting
complete
cancelled
calling
expired
failed
```

### `payment_methods` / `payment_method` — способы оплаты

```
cash
cashless
card
internal
other
corp
prepaid
```

### `providers` / `provider` — источник заказа

```
none
partner
platform
```

### `categories` / `category` — тарифные категории

```
econom
comfort
comfort_plus
business
minivan
vip
wagon
pool
start
standart
ultimate
maybach
promo
premium_van
premium_suv
suv
personal_driver
express
cargo
```

### `amenities` — опции/удобства заказа (только в ответе)

```
conditioner
no_smoking
child_chair
animal_transport
universal
wifi
check
card
yamoney
newspaper
coupon
creditcard
dont_call
smoking
delivery
vip_event
woman_driver
post_terminal
bicycle
skiing
passenger_plus
cargo_clean
door_to_door
sticker
lightbox
```

## 1.4. Пример тела запроса

```json
{
  "query": {
    "park": {
      "id": "ee6f33c4562b4e1f8646d157bd70b2c4",
      "order": {
        "ids": ["c8d40acf182b4b32af72f6ad2029031b"],
        "short_ids": [248],
        "booked_at": {
          "from": "2019-08-08T11:58:01+03:00",
          "to": null
        },
        "ended_at": null,
        "type": {
          "ids": ["4964b852670045b196e526d59915b777"]
        },
        "statuses": ["complete"],
        "payment_methods": ["card"],
        "providers": ["platform"],
        "categories": ["econom"],
        "price": {
          "from": "12345.1434",
          "to": null
        }
      },
      "driver_profile": {
        "id": "33de650c6a1a40bfa78dd981817da866"
      },
      "car": {
        "id": "5011ade6ba054dfdb7143c8cc9460dbc"
      }
    }
  },
  "limit": 100,
  "cursor": "example"
}
```

## 1.5. Структура ответа 200 OK

### Верхний уровень

| Поле | Тип | Описание |
|------|-----|----------|
| `orders` | array of `Order` | Список заказов |
| `limit` | integer (1–500) | Применённое ограничение на число заказов |
| `cursor` | string | Курсор для запроса следующей порции данных |

### Объект `orders[]`

| Поле | Тип | Nullable | Описание |
|------|-----|----------|----------|
| `id` | string | нет | Идентификатор заказа |
| `short_id` | integer | нет | Короткий (порядковый) номер заказа |
| `status` | enum | нет | Статус заказа (см. перечень статусов) |
| `created_at` | string (date-time, ISO 8601) | нет | Время создания заказа |
| `booked_at` | string (date-time, ISO 8601) | **да** | Время подачи |
| `ended_at` | string (date-time, ISO 8601) | **да** | Время завершения |
| `provider` | enum | нет | Источник заказа: `none`, `partner`, `platform` |
| `category` | enum | нет | Тарифная категория |
| `amenities` | array of enum (string) | нет | Опции заказа |
| `payment_method` | enum | нет | Способ оплаты |
| `price` | string | нет | Стоимость заказа (число с фиксированной точкой в виде строки) |
| `mileage` | string | нет | Пробег по заказу |
| `cancellation_description` | string | нет | Описание причины отмены |
| `address_from` | object `AddressInfo` | нет | Адрес подачи |
| `route_points` | array of `AddressInfo` | нет | Точки маршрута |
| `events` | array of `Event` | нет | История событий по заказу |
| `driver_profile` | object | нет | Профиль водителя |
| `car` | object | нет | Автомобиль |
| `type` | object | нет | Тип заказа |
| `driver_work_rule` | object | нет | Условие работы водителя |
| `park_details` | object | нет | Дополнительные данные парка |

### `AddressInfo` (`address_from`, `route_points[]`)

| Поле | Тип | Описание |
|------|-----|----------|
| `address` | string | Адрес текстом |
| `lat` | number | Широта, градусы |
| `lon` | number | Долгота, градусы |

### `events[]`

| Поле | Тип | Описание |
|------|-----|----------|
| `event_at` | string (date-time, ISO 8601) | Время события |
| `order_status` | enum | Статус заказа на момент события |

### `driver_profile`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | **Идентификатор профиля водителя (присутствует в каждом заказе)** |
| `name` | string | ФИО водителя, напр. `Иванов Пётр Николаевич` |

### `car`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Идентификатор автомобиля |
| `brand_model` | string | Марка и модель, напр. `BMW 5er` |
| `license` | object | Регистрационные данные |
| `license.number` | string | Госномер, напр. `AA01234567` |
| `callsign` | string | Позывной |

### `type`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Идентификатор типа заказа |
| `name` | string | Название типа, напр. `Яндекс.Безналичный` |

### `driver_work_rule`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Идентификатор условия работы |
| `name` | string | Название условия работы, напр. `Аренда` |

### `park_details`

| Поле | Тип | Описание |
|------|-----|----------|
| `tariff.id` | string | Идентификатор тарифа парка |
| `tariff.name` | string | Название тарифа парка |
| `passenger.name` | string | Имя пассажира |
| `passenger.phones` | array of string | Телефоны пассажира |
| `company.id` | string | Идентификатор компании-заказчика |
| `company.name` | string | Название компании |
| `company.slip` | string | Слип |
| `company.comment` | string | Комментарий |

## 1.6. Пример ответа

```json
{
  "orders": [
    {
      "id": "c8d40acf182b4b32af72f6ad2029031b",
      "short_id": 248,
      "status": "complete",
      "created_at": "2019-08-08T11:58:01+03:00",
      "booked_at": null,
      "provider": "platform",
      "category": "econom",
      "amenities": ["wifi"],
      "address_from": {
        "address": "Тверская улица, 8",
        "lat": 55.762235,
        "lon": 37.609651
      },
      "route_points": [
        {
          "address": "Тверская улица, 8",
          "lat": 55.762235,
          "lon": 37.609651
        }
      ],
      "events": [
        {
          "event_at": "2019-08-08T11:58:01+03:00",
          "order_status": "complete"
        }
      ],
      "ended_at": null,
      "payment_method": "card",
      "driver_profile": {
        "id": "33de650c6a1a40bfa78dd981817da866",
        "name": "Иванов Пётр Николаевич"
      },
      "car": {
        "id": "5011ade6ba054dfdb7143c8cc9460dbc",
        "brand_model": "BMW 5er",
        "license": {
          "number": "AA01234567"
        },
        "callsign": "123456789"
      },
      "type": {
        "id": "4964b852670045b196e526d59915b777",
        "name": "Яндекс.Безналичный"
      },
      "price": "12345.1434",
      "driver_work_rule": {
        "id": "e26a3cf21acfe01198d50030487e046b",
        "name": "Аренда"
      },
      "mileage": "example",
      "cancellation_description": "example",
      "park_details": {
        "tariff": {
          "id": "example",
          "name": "example"
        },
        "passenger": {
          "name": "example",
          "phones": ["example"]
        },
        "company": {
          "id": "example",
          "name": "example",
          "slip": "example",
          "comment": "example"
        }
      }
    }
  ],
  "limit": 100,
  "cursor": ""
}
```

## 1.7. Пагинация

Пагинация **курсорная** (не offset-based).

1. В первом запросе передаётся `limit` (1–500), `cursor` не передаётся.
2. В ответе возвращаются `orders`, `limit` и `cursor`.
3. Значение `cursor` из ответа передаётся в поле `cursor` следующего запроса — «значение должно быть взято из ответа на предыдущий запрос».
4. Пустая строка в `cursor` / отсутствие новых заказов означает конец выборки.

Фильтры (`query`) между страницами менять не следует — курсор привязан к исходной выборке.

## 1.8. Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Список заказов успешно получен |
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Тело ответа при ошибке:

```json
{
  "code": "string",
  "message": "string"
}
```

---

# 2. POST /v1/parks/orders/track — Получение трека по заказу

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v1/parks/orders/track`

## 2.1. Заголовки

| Заголовок | Тип | Обязательный | Ограничения | Описание |
|-----------|-----|--------------|-------------|----------|
| `X-API-Key` | string | Да | min length: 1 | Ключ API |
| `X-Client-ID` | string | Да | min length: 1 | Идентификатор клиента |

## 2.2. Параметры запроса (query string)

Параметры передаются в строке запроса; тело запроса не задокументировано (отсутствует).

| Параметр | Тип | Обязательный | Описание | Пример |
|----------|-----|--------------|----------|--------|
| `order_id` | string | **Да** | Идентификатор заказа | `d3639f5f4de4675bb23124b53f63c3d0` |
| `park_id` | string | **Да** | Идентификатор партнёра (парка) | `ee6f33c4562b4e1f8646d157bd70b2c4` |

Пример вызова:

```
POST https://fleet-api.taxi.yandex.net/v1/parks/orders/track?order_id=d3639f5f4de4675bb23124b53f63c3d0&park_id=ee6f33c4562b4e1f8646d157bd70b2c4
```

## 2.3. Структура ответа 200 OK

### Верхний уровень

| Поле | Тип | Описание |
|------|-----|----------|
| `track` | array of `OrderTrackPoint` | Массив точек трека |

### `OrderTrackPoint` (`track[]`)

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `tracked_at` | string (date-time, ISO 8601) | ISO 8601 с временной зоной | Время фиксации точки |
| `location` | object | — | Координаты точки |
| `location.lat` | number | от -90 до 90 | Широта, градусы |
| `location.lon` | number | от -180 до 180 | Долгота, градусы |
| `speed` | number | ≥ 0 | Скорость, метры в секунду |
| `order_status` | enum | см. ниже | Статус заказа в момент фиксации точки |
| `direction` | number | от 0 до 360 | Угол от направления на север, по часовой стрелке |
| `distance` | number | ≥ 0 | Расстояние от первой точки трека, метры |

### Enum `order_status` (для точки трека)

```
driving
waiting
transporting
```

## 2.4. Пример ответа

```json
{
  "track": [
    {
      "tracked_at": "2020-09-10T13:37:00+00:00",
      "location": {
        "lat": 55.751244,
        "lon": 37.618423
      },
      "speed": 17,
      "order_status": "waiting",
      "direction": 342,
      "distance": 323.35060609
    }
  ]
}
```

## 2.5. Пагинация

Пагинация для этого метода **не предусмотрена** — трек возвращается целиком одним массивом `track`. Параметров `limit` / `cursor` / `offset` нет.

## 2.6. Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Трек по заказу успешно получен |
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 404 | Запрашиваемый ресурс не найден |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Тело ответа при ошибке:

```json
{
  "code": "string",
  "message": "string"
}
```

---

## Примечания по сбору

- Обе страницы открылись по слагу первой попытки, 404 не было.
- В `/v1/parks/orders/list` явные пометки «обязательно» на странице проставлены не для всех полей; обязательность `park.id` и `query.park` следует из схемы и примера, а единственная явно сформулированная текстовая оговорка — «Обязательно наличие одного из booked_at или ended_at» в описании `OrdersListQueryParkOrder`.
- Максимальная длина периода `booked_at` / `ended_at` на странице не указана.

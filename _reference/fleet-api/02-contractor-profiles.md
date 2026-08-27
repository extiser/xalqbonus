# Yandex Fleet API — Профили водителей (ContractorProfiles), часть 1

Базовый URL: `https://fleet-api.taxi.yandex.net`

Источник: https://fleet.yandex.ru/docs/api/ru/openapi/ContractorProfiles/

Собранные эндпоинты:

| # | Метод | Путь | Назначение |
|---|-------|------|-----------|
| 1 | POST | `/v1/parks/driver-profiles/list` | Получение списка профилей водителей/курьеров |
| 2 | GET | `/v2/parks/contractors/driver-profile` | Получение профиля водителя/курьера |
| 3 | POST | `/v2/parks/contractors/driver-profile` | Создание профиля водителя |
| 4 | PUT | `/v2/parks/contractors/driver-profile` | Редактирование профиля водителя/курьера |
| 5 | POST | `/v1/parks/contractors/profile` | Создание профиля исполнителя |
| 6 | PUT | `/v1/parks/driver-profiles/car-bindings` | Привязка автомобиля к водителю |
| 7 | DELETE | `/v1/parks/driver-profiles/car-bindings` | Отвязка автомобиля от водителя |

---

# 1. POST /v1/parks/driver-profiles/list — Получение списка профилей водителей/курьеров

> **Главный источник данных о водителях.** Ниже — исчерпывающий перечень всех полей, доступных через этот метод.

**URL:** `POST https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/list`

## 1.1. Заголовки запроса

| Заголовок | Тип | Обязательный | Описание |
|-----------|-----|--------------|----------|
| `X-API-Key` | string (min 1) | Да | API-ключ |
| `X-Client-ID` | string (min 1) | Да | Идентификатор клиента |
| `Accept-Language` | string (min 2) | Нет | Предпочитаемый язык ответа. Пример: `ru` |

## 1.2. Тело запроса (application/json) — корневые параметры

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|----------|-----|--------------|--------------|----------|
| `query` | `DriverProfilesListRequestQuery` | **Да** | — | Фильтры, объединяются через логическое И |
| `fields` | `DriverProfileListRequestFields` | Нет | все поля | Поля профиля для извлечения |
| `sort_order` | `DriverProfileRequestSortOrder[]` | Нет | — | Массив полей для управления порядком профилей |
| `limit` | integer (min 1, max 1000) | Нет | `1000` | Запрашиваемое число элементов |
| `offset` | integer (min 0) | Нет | `0` | Смещение от начала списка |

## 1.3. query

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `park` | object | **Да** | Фильтры по данным партнёра |
| `text` | string | Нет | Произвольный текстовый поисковый запрос |

### query.park

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `id` | string | **Да** | Идентификатор партнёра |
| `driver_profile` | object | Нет | Фильтры по данным водительского профиля |
| `current_status` | object | Нет | Фильтр по текущему состоянию водителя |
| `account` | object | Нет | Фильтры по данным счёта |
| `updated_at` | object | Нет | Фильтры по времени последнего обновления |

### query.park.driver_profile

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string[] | Идентификатор профиля водителя |
| `work_rule_id` | string[] | Идентификатор условия работы |
| `work_status` | `WorkStatus[]` | Статус работы водителя |

### query.park.current_status

| Поле | Тип | Описание |
|------|-----|----------|
| `status` | `DriverStatus[]` | Текущее состояние водителя |

### query.park.account

| Поле | Тип | Описание |
|------|-----|----------|
| `last_transaction_date` | `DateTimeRange` | Полуинтервал времени последней транзакции |

### query.park.updated_at

| Поле | Тип | Описание |
|------|-----|----------|
| `from` | string (ISO 8601) | Время от в формате ISO 8601 |
| `to` | string (ISO 8601) | Время до в формате ISO 8601 |

### DateTimeRange

| Поле | Тип | Описание |
|------|-----|----------|
| `from` | string (ISO 8601) | Время от |
| `to` | string (ISO 8601) | Время до |

Примечание: хотя бы один конец интервала должен быть указан.

## 1.4. fields — управление составом ответа

| Поле | Тип | Описание | Допустимые значения |
|------|-----|----------|---------------------|
| `driver_profile` | string[] | Данные профиля водителя | `id`, `park_id`, `created_date`, `first_name`, `last_name`, `middle_name`, `driver_license`, `phones`, `work_rule_id`, `work_status`, `check_message`, `comment`, `employment_type`, `has_contract_issue` |
| `account` | string[] | Данные счёта | `id`, `type`, `balance`, `balance_limit`, `currency`, `last_transaction_date` |
| `car` | string[] | Данные ТС | `id`, `status`, `amenities`, `category`, `callsign`, `brand`, `model`, `year`, `color`, `number`, `registration_cert`, `vin` |
| `current_status` | string[] | Данные о состоянии водителя | `status`, `status_updated_at` |
| `park` | string[] | Данные партнёра | `id`, `city`, `name` |
| `updated_at` | boolean | Возвращать ли время последнего обновления | `true` / `false` |

## 1.5. sort_order

Массив объектов:

| Поле | Тип | Допустимые значения |
|------|-----|---------------------|
| `direction` | string | `asc`, `desc` |
| `field` | string | `account.current.balance`, `driver_profile.created_date`, `driver_profile.last_name`, `driver_profile.first_name`, `driver_profile.middle_name`, `updated_at` |

## 1.6. Enum-значения

### WorkStatus — статус работы водителя

| Значение | Описание |
|----------|----------|
| `working` | Статус «Работает» |
| `not_working` | Статус «Не работает» |
| `fired` | Статус «Уволен» |

### DriverStatus — текущее состояние водителя

| Значение | Описание |
|----------|----------|
| `offline` | Оффлайн |
| `busy` | Занят |
| `free` | Свободен |
| `in_order_free` | На заказе, свободен (цепочка включена) |
| `in_order_busy` | На заказе, занят (цепочка выключена) |

### EmploymentType — тип занятости водителя

| Значение | Описание |
|----------|----------|
| `selfemployed` | Парковый самозанятый |
| `park_employee` | Парковый исполнитель |
| `individual_entrepreneur` | Индивидуальный предприниматель |

### Статус ТС (`car.status`)

`unknown`, `working`, `not_working`, `repairing`, `no_driver`, `pending`

### Цвет ТС (`car.color`)

`Белый`, `Желтый`, `Бежевый`, `Черный`, `Голубой`, `Серый`, `Красный`, `Оранжевый`, `Синий`, `Зеленый`, `Коричневый`, `Фиолетовый`, `Розовый`

### Удобства ТС (`car.amenities`)

`conditioner`, `no_smoking`, `child_chair`, `animal_transport`, `universal`, `wifi`, `check`, `card`, `yamoney`, `newspaper`, `coupon`, `creditcard`, `dont_call`, `smoking`, `delivery`, `vip_event`, `woman_driver`, `post_terminal`, `bicycle`, `skiing`, `passenger_plus`, `cargo_clean`, `door_to_door`, `sticker`, `lightbox`

### Категории ТС (`car.category`)

`econom`, `comfort`, `comfort_plus`, `business`, `minivan`, `vip`, `wagon`, `pool`, `start`, `standart`, `ultimate`, `maybach`, `promo`, `premium_van`, `premium_suv`, `suv`, `personal_driver`, `express`, `cargo`

## 1.7. Структура ответа 200 OK

### Корневой объект (пагинация)

| Поле | Тип | Описание |
|------|-----|----------|
| `limit` | integer | Запрошённое число элементов списка |
| `offset` | integer | Запрошённое смещение относительно начала списка |
| `total` | integer | Общее количество элементов списка |
| `driver_profiles` | `DriverProfile[]` | Список профилей |
| `parks` | `DriverProfilePark[]` | Список партнёров |

**Пагинация:** страничный обход через `offset` + `limit`; общее число записей — в `total`. Максимальный `limit` = 1000, по умолчанию 1000.

### DriverProfile — элемент массива `driver_profiles`

| Поле | Тип | Описание |
|------|-----|----------|
| `accounts` | `DriverProfileAccount[]` | Счета водителя |
| `car` | `Vehicle` | Привязанное ТС |
| `current_status` | `DriverProfileCurrentStatus` | Текущее состояние водителя |
| `driver_profile` | `DriverProfileModel` | Данные профиля водителя |

### driver_profile — ИСЧЕРПЫВАЮЩИЙ перечень полей о водителе

| Поле | Тип | Категория | Описание |
|------|-----|-----------|----------|
| `id` | string | Идентификация | Идентификатор профиля водителя |
| `park_id` | string | Идентификация | Идентификатор партнёра (парка) |
| `created_date` | string (ISO 8601) | Даты | Дата создания профиля |
| `first_name` | string | Персональные данные | Имя |
| `last_name` | string | Персональные данные | Фамилия |
| `middle_name` | string | Персональные данные | Отчество |
| `driver_license` | `DriverLicense` | Документы | Водительское удостоверение (вложенный объект, см. ниже) |
| `phones` | string[] (pattern `^\+\d{1,15}$`) | Телефоны | Телефонные номера |
| `work_rule_id` | string | Условия работы | Идентификатор условия работы |
| `work_status` | `WorkStatus` | Условия работы / блокировка | Статус работы водителя: `working` / `not_working` / `fired` |
| `check_message` | string | Отзывы | Отзыв о водителе (доступно сотрудникам парка) |
| `comment` | string | Отзывы | Прочее (комментарий) |
| `employment_type` | `EmploymentType` | Условия работы | Тип занятости водителя |
| `has_contract_issue` | boolean | Условия работы / блокировка | Существуют проблемы с подтверждением занятости |

### driver_profile.driver_license — документы (водительское удостоверение)

| Поле | Тип | Описание |
|------|-----|----------|
| `number` | string | Серия и номер |
| `normalized_number` | string | Нормализованные серия и номер (кириллица → латиница) |
| `country` | string | Страна выдачи (трёхбуквенный код), например `rus` |
| `issue_date` | string (ISO 8601, без ТЗ) | Дата выдачи |
| `expiration_date` | string (ISO 8601, без ТЗ) | Дата окончания действия |
| `birth_date` | string (ISO 8601, без ТЗ) | Дата рождения |

### accounts — аккаунт и баланс

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Идентификатор счёта |
| `type` | string (const `current`) | Тип счёта |
| `balance` | string | Текущий баланс (сумма с фиксированной точностью) |
| `balance_limit` | string | Лимит по счёту |
| `currency` | string | Валюта в формате ISO 4217 |
| `last_transaction_date` | string (ISO 8601) | Дата последней транзакции |

### current_status — текущее состояние

| Поле | Тип | Описание |
|------|-----|----------|
| `status` | `DriverStatus` | Текущее состояние водителя |
| `status_updated_at` | string (ISO 8601) | Время последнего обновления текущего состояния |

### car — привязанное ТС

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Идентификатор ТС |
| `status` | string | Статус ТС |
| `amenities` | string[] | Удобства в ТС |
| `category` | string[] | Список категорий ТС |
| `callsign` | string | Позывной |
| `brand` | string | Марка ТС |
| `model` | string | Модель ТС |
| `year` | integer | Год выпуска ТС |
| `color` | string | Цвет |
| `number` | string | Государственный регистрационный номер |
| `registration_cert` | string | Номер свидетельства о регистрации ТС |
| `vin` | string | VIN |

### parks — DriverProfilePark

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string (может быть `null`) | Идентификатор партнёра |
| `city` | string | Город расположения партнёра |
| `name` | string | Название партнёра |

### Полей, которых в ответе НЕТ (проверено по схеме)

`payment_service_id`, `block_orders_on_balance_below_limit`, `hire_date`, `fire_date`, `bank_accounts`, `driver_license_experience`, `address`, `email`, `order_provider`, `is_readonly`, `is_removed_by_request`, `tax_identification_number`, `id_doc` (паспорт).
Их можно получить через `GET /v2/parks/contractors/driver-profile` (см. раздел 2).

## 1.8. Пример запроса

```json
{
  "query": {
    "park": {
      "id": "ee6f33c4562b4e1f8646d157bd70b2c4",
      "driver_profile": {
        "id": ["2111ade6gk054dfdb9iu8c8cc9460mks"],
        "work_rule_id": ["bc43tre6ba054dfdb7143ckfgvcby63e"],
        "work_status": ["working"]
      },
      "current_status": {
        "status": ["free"]
      },
      "account": {
        "last_transaction_date": {
          "from": "2025-01-01T00:00:00Z",
          "to": "2025-01-01T00:00:00Z"
        }
      },
      "updated_at": {
        "from": "2025-01-01T00:00:00Z",
        "to": "2025-01-01T00:00:00Z"
      }
    },
    "text": "example"
  },
  "fields": {
    "account": ["balance"],
    "car": ["color"],
    "current_status": ["status"],
    "driver_profile": ["last_name"],
    "park": ["name"],
    "updated_at": true
  },
  "sort_order": [
    { "direction": "asc", "field": "driver_profile.created_date" }
  ],
  "limit": 200,
  "offset": 0
}
```

## 1.9. Пример ответа 200

```json
{
  "limit": 200,
  "offset": 0,
  "total": 728,
  "driver_profiles": [
    {
      "accounts": [
        {
          "id": "33de650c6a1a40bfa78dd981817da866",
          "type": "current",
          "balance": "700.0000",
          "balance_limit": "50",
          "currency": "RUB"
        }
      ],
      "car": {
        "id": "2111ade6gk054dfdb9iu8c8cc9460mks",
        "status": "working",
        "amenities": ["wifi"],
        "category": ["econom"],
        "callsign": "123456789",
        "brand": "Mercedes-Benz",
        "model": "E-klasse",
        "year": 2019,
        "color": "Черный",
        "number": "Т8654Т99",
        "registration_cert": "123456789",
        "vin": "12345678909876543"
      },
      "current_status": {
        "status": "free",
        "status_updated_at": "2020-04-27T08:44:05.871+0000"
      },
      "driver_profile": {
        "id": "2111ade6gk054dfdb9iu8c8cc9460mks",
        "park_id": "ee6f33c4562b4e1f8646d157bd70b2c4",
        "created_date": "2020-04-23T13:08:05.552+0000",
        "last_name": "Ivanov",
        "first_name": "Ivan",
        "middle_name": "Ivanovich",
        "driver_license": {
          "issue_date": "2020-10-28",
          "expiration_date": "2050-10-28",
          "number": "070236",
          "normalized_number": "AA00123456",
          "country": "rus",
          "birth_date": "1975-10-28"
        },
        "phones": ["+79999999999"],
        "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
        "work_status": "working",
        "check_message": "great driver",
        "comment": "great driver",
        "employment_type": "selfemployed",
        "has_contract_issue": true
      }
    }
  ],
  "parks": [
    {
      "id": "ee6f33c4562b4e1f8646d157bd70b2c4",
      "city": "Москва",
      "name": "Рога и Копыта"
    }
  ]
}
```

## 1.10. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса (ошибка валидации) |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки:

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

---

# 2. GET /v2/parks/contractors/driver-profile — Получение профиля водителя/курьера

**URL:** `GET https://fleet-api.taxi.yandex.net/v2/parks/contractors/driver-profile`

## 2.1. Query-параметры

| Параметр | Тип | Обязательный | Описание | Пример |
|----------|-----|--------------|----------|--------|
| `contractor_profile_id` | string | **Да** | Идентификатор профиля водителя | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |

## 2.2. Заголовки

| Заголовок | Тип | Обязательный | Описание |
|-----------|-----|--------------|----------|
| `X-API-Key` | string (min 1) | **Да** | API-ключ |
| `X-Client-ID` | string (min 1) | **Да** | Идентификатор клиента |
| `X-Park-ID` | string | **Да** | Идентификатор партнёра |

## 2.3. Структура ответа 200 OK

### Корневой уровень

| Поле | Тип | Описание |
|------|-----|----------|
| `account` | `AccountOptional` | Учётная запись водителя |
| `person` | `PersonOptional` | Персональные данные водителя |
| `profile` | `ProfileOptional` | Профиль (трудовые данные) |
| `car_id` | string (1–100) | Идентификатор автомобиля |
| `order_provider` | `OrderProvider` | Информация о провайдерах заказов |

### account

| Поле | Тип | Описание |
|------|-----|----------|
| `balance_limit` | string | Лимит по счёту |
| `work_rule_id` | string | Идентификатор условия работы |
| `payment_service_id` | string | ID для платежа |
| `block_orders_on_balance_below_limit` | boolean | Запрещены ли все заказы при балансе ниже лимита |

### person

| Поле | Тип | Описание |
|------|-----|----------|
| `full_name` | `FullNameOptional` | Полное имя водителя |
| `contact_info` | `ContactInfoOptional` | Контактная информация водителя |
| `driver_license` | `DriverLicenseOptional` | Информация о водительском удостоверении |
| `driver_license_experience` | `DriverLicenseExperience` | Водительский стаж |
| `tax_identification_number` | string (min 1) | Идентификационный номер налогоплательщика (ИНН) |
| `employment_type` | enum | Тип занятости водителя |

#### person.full_name

| Поле | Тип | Описание |
|------|-----|----------|
| `first_name` | string | Имя |
| `middle_name` | string | Отчество |
| `last_name` | string | Фамилия |

#### person.contact_info

| Поле | Тип | Описание |
|------|-----|----------|
| `phone` | string, pattern `^\+\d{1,15}$` | Номер телефона |
| `address` | string | Адрес |
| `email` | string | Электронная почта |

#### person.driver_license

| Поле | Тип | Описание |
|------|-----|----------|
| `number` | string | Серия и номер водительского удостоверения |
| `country` | string | Страна выдачи (трёхбуквенный код) |
| `birth_date` | string (ISO 8601, без ТЗ) | Дата рождения |
| `issue_date` | string (ISO 8601, без ТЗ) | Дата выдачи |
| `expiry_date` | string (ISO 8601, без ТЗ) | Дата окончания действия |

#### person.driver_license_experience

| Поле | Тип | Описание |
|------|-----|----------|
| `total_since_date` | string (ISO 8601, без ТЗ) | Дата начала водительского стажа |

#### person.employment_type — enum

| Значение | Описание |
|----------|----------|
| `selfemployed` | Парковый самозанятый |
| `park_employee` | Парковый исполнитель |
| `individual_entrepreneur` | Индивидуальный предприниматель |

### profile

| Поле | Тип | Описание |
|------|-----|----------|
| `hire_date` | string (ISO 8601, без ТЗ) | Дата приёма в парк |
| `work_status` | enum | Статус работы водителя |
| `fire_date` | string (ISO 8601, без ТЗ) | Дата увольнения из парка |
| `comment` | string | Прочее |
| `feedback` | string | Прочее (доступно сотрудникам парка) |

`work_status`: `working` (Работает), `not_working` (Не работает), `fired` (Уволен).

### order_provider

| Поле | Тип | Описание |
|------|-----|----------|
| `platform` | boolean | Доступны ли заказы от платформы |
| `partner` | boolean | Доступны ли заказы от партнёра |

## 2.4. Пример ответа

```json
{
  "account": {
    "balance_limit": "50",
    "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
    "payment_service_id": "12345",
    "block_orders_on_balance_below_limit": true
  },
  "person": {
    "full_name": {
      "first_name": "Ivan",
      "middle_name": "Ivanovich",
      "last_name": "Ivanov"
    },
    "contact_info": {
      "address": "Moscow, Ivanovskaya Ul., bld. 40/2, appt. 63",
      "email": "example-email@example.com",
      "phone": "+79999999999"
    },
    "driver_license": {
      "birth_date": "1975-10-28",
      "country": "rus",
      "expiry_date": "2050-10-28",
      "issue_date": "2020-10-28",
      "number": "070236"
    },
    "driver_license_experience": {
      "total_since_date": "1970-01-01"
    },
    "tax_identification_number": "7743013902",
    "employment_type": "selfemployed"
  },
  "profile": {
    "hire_date": "2020-10-28",
    "work_status": "working",
    "fire_date": "2020-10-28",
    "comment": "great driver",
    "feedback": "great driver"
  },
  "car_id": "5011ade6ba054dfdb7143c8cc9460dbc",
  "order_provider": {
    "platform": true,
    "partner": true
  }
}
```

## 2.5. Коды ошибок

| Код | Описание |
|-----|----------|
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 404 | Запрашиваемый ресурс не найден |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки: `{ "code": string, "message": string }`, где `code` — машиночитаемый код ошибки, `message` — человекочитаемое сообщение.

---

# 3. POST /v2/parks/contractors/driver-profile — Создание профиля водителя

**URL:** `POST https://fleet-api.taxi.yandex.net/v2/parks/contractors/driver-profile`

## 3.1. Заголовки (все обязательные)

| Заголовок | Тип | Описание |
|-----------|-----|----------|
| `X-API-Key` | string (min 1) | API-ключ |
| `X-Client-ID` | string (min 1) | Идентификатор клиента |
| `X-Park-ID` | string | Идентификатор партнёра |
| `X-Idempotency-Token` | string (16–64) | Токен идемпотентности запроса. Должен состоять только из печатных ASCII-символов |

## 3.2. Тело запроса (application/json)

### Корневой уровень

| Поле | Тип | Описание |
|------|-----|----------|
| `account` | `Account` | Учётная запись водителя |
| `person` | `Person` | Персональные данные водителя |
| `profile` | `Profile` | Профиль |
| `car_id` | string (1–100) | Идентификатор автомобиля |
| `order_provider` | `OrderProvider` | Доступность заказов |

### account

| Поле | Тип | Описание |
|------|-----|----------|
| `balance_limit` | string | Лимит по счёту |
| `work_rule_id` | string | Идентификатор условия работы |
| `payment_service_id` | string | ID для платежа (будет сгенерировано автоматически, если оставить это поле пустым) |
| `block_orders_on_balance_below_limit` | boolean | Запрещены ли все заказы при балансе ниже лимита |

### person

| Поле | Тип | Описание |
|------|-----|----------|
| `full_name` | `FullName` | Полное имя водителя (`first_name`, `middle_name`, `last_name`) |
| `contact_info` | `ContactInfo` | Контактная информация (`phone` pattern `^\+\d{1,15}$`, `address`, `email`) |
| `driver_license` | `DriverLicense` | Информация о водительском удостоверении |
| `driver_license_experience` | `DriverLicenseExperience` | Водительский стаж (`total_since_date`, ISO 8601) |
| `id_doc` | `IdDoc` | Паспортные данные (`address`) |
| `tax_identification_number` | string (min 1) | ИНН |
| `value_added_tax` | string (min 1), enum | НДС % исполнителя |

#### person.driver_license

| Поле | Тип | Описание |
|------|-----|----------|
| `number` | string | Серия и номер |
| `country` | string | Страна выдачи (трёхбуквенный код) |
| `birth_date` | string (ISO 8601, без ТЗ) | Дата рождения |
| `issue_date` | string (ISO 8601, без ТЗ) | Дата выдачи |
| `expiry_date` | string (ISO 8601, без ТЗ) | Дата окончания действия |

#### value_added_tax — enum

| Значение | Описание |
|----------|----------|
| `"0"` | Без НДС |
| `"5"` | 5 % |
| `"7"` | 7 % |
| `"22"` | 22 % |

### profile

| Поле | Тип | Описание |
|------|-----|----------|
| `hire_date` | string (ISO 8601) | Дата приёма в парк |
| `comment` | string | Прочее |

### order_provider

| Поле | Тип | Описание |
|------|-----|----------|
| `platform` | boolean | Доступны ли заказы от платформы |
| `partner` | boolean | Доступны ли заказы от партнёра |

## 3.3. Пример запроса

```json
{
  "account": {
    "balance_limit": "50",
    "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
    "payment_service_id": "12345",
    "block_orders_on_balance_below_limit": true
  },
  "person": {
    "full_name": {
      "first_name": "Ivan",
      "middle_name": "Ivanovich",
      "last_name": "Ivanov"
    },
    "contact_info": {
      "address": "Moscow, Ivanovskaya Ul., bld. 40/2, appt. 63",
      "email": "example-email@example.com",
      "phone": "+79999999999"
    },
    "driver_license": {
      "birth_date": "1975-10-28",
      "country": "rus",
      "expiry_date": "2050-10-28",
      "issue_date": "2020-10-28",
      "number": "070236"
    },
    "driver_license_experience": {
      "total_since_date": "1970-01-01"
    },
    "id_doc": {
      "address": "example"
    },
    "tax_identification_number": "7743013902",
    "value_added_tax": "7"
  },
  "profile": {
    "hire_date": "2020-10-28",
    "comment": "great driver"
  },
  "car_id": "5011ade6ba054dfdb7143c8cc9460dbc",
  "order_provider": {
    "platform": true,
    "partner": true
  }
}
```

## 3.4. Ответ 200 OK

| Поле | Тип | Описание |
|------|-----|----------|
| `contractor_profile_id` | string | Идентификатор созданного профиля водителя |

```json
{ "contractor_profile_id": "2111ade6gk054dfdb9iu8c8cc9460mks" }
```

## 3.5. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки: `{ "code": string, "message": string }`.

---

# 4. PUT /v2/parks/contractors/driver-profile — Редактирование профиля водителя/курьера

**URL:** `PUT https://fleet-api.taxi.yandex.net/v2/parks/contractors/driver-profile`

> Для упрощения формирования запроса можно воспользоваться `GET /v2/parks/contractors/driver-profile`.

## 4.1. Query-параметры

| Параметр | Тип | Обязательный | Описание | Пример |
|----------|-----|--------------|----------|--------|
| `contractor_profile_id` | string | **Да** | Идентификатор профиля водителя | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |

## 4.2. Заголовки

| Заголовок | Тип | Обязательный | Описание |
|-----------|-----|--------------|----------|
| `X-API-Key` | string (min 1) | **Да** | API-ключ |
| `X-Client-ID` | string (min 1) | **Да** | Идентификатор клиента |
| `X-Park-ID` | string | **Да** | Идентификатор партнёра |

## 4.3. Тело запроса (application/json)

### Корневой уровень

| Поле | Тип | Описание |
|------|-----|----------|
| `account` | `AccountUpdate` | Учётная запись водителя |
| `person` | `PersonUpdate` | Персональные данные водителя |
| `profile` | `ProfileUpdate` | Профиль (трудовые данные) |
| `car_id` | string (1–100) | Идентификатор автомобиля |
| `order_provider` | `OrderProvider` | Доступность заказов |

### account (AccountUpdate)

| Поле | Тип | Описание |
|------|-----|----------|
| `balance_limit` | string | Лимит по счёту |
| `work_rule_id` | string | Идентификатор условия работы |
| `payment_service_id` | string | ID для платежа |
| `block_orders_on_balance_below_limit` | boolean | Запрещены ли все заказы при балансе ниже лимита |

### person (PersonUpdate)

| Поле | Тип | Описание |
|------|-----|----------|
| `full_name` | `FullName` | Полное имя водителя (`first_name`, `middle_name`, `last_name`) |
| `contact_info` | `ContactInfo` | Контактная информация (`phone` pattern `^\+\d{1,15}$`, `address`, `email`) |
| `driver_license` | `DriverLicense` | Информация о водительском удостоверении (`number`, `country`, `birth_date`, `issue_date`, `expiry_date`) |
| `driver_license_experience` | `DriverLicenseExperience` | Водительский стаж (`total_since_date`) |
| `tax_identification_number` | string (min 1) | ИНН |

> Обратите внимание: в PUT-версии `PersonUpdate` отсутствуют поля `id_doc` и `value_added_tax` (они есть только при создании).

### profile (ProfileUpdate)

| Поле | Тип | Описание |
|------|-----|----------|
| `hire_date` | string (ISO 8601, без ТЗ) | Дата приёма в парк |
| `work_status` | enum | Статус работы водителя |
| `fire_date` | string (ISO 8601, без ТЗ) | Дата увольнения из парка |
| `comment` | string | Прочее |
| `feedback` | string | Прочее (доступно сотрудникам парка) |

`work_status`: `working` (Работает), `not_working` (Не работает), `fired` (Уволен).

### order_provider

| Поле | Тип | Описание |
|------|-----|----------|
| `platform` | boolean | Доступны ли заказы от платформы |
| `partner` | boolean | Доступны ли заказы от партнёра |

## 4.4. Пример запроса

```json
{
  "account": {
    "balance_limit": "50",
    "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
    "payment_service_id": "12345",
    "block_orders_on_balance_below_limit": true
  },
  "person": {
    "full_name": {
      "first_name": "Ivan",
      "middle_name": "Ivanovich",
      "last_name": "Ivanov"
    },
    "contact_info": {
      "address": "Moscow, Ivanovskaya Ul., bld. 40/2, appt. 63",
      "email": "example-email@example.com",
      "phone": "+79999999999"
    },
    "driver_license": {
      "birth_date": "1975-10-28",
      "country": "rus",
      "expiry_date": "2050-10-28",
      "issue_date": "2020-10-28",
      "number": "070236"
    },
    "driver_license_experience": {
      "total_since_date": "1970-01-01"
    },
    "tax_identification_number": "7743013902"
  },
  "profile": {
    "hire_date": "2020-10-28",
    "work_status": "working",
    "fire_date": "2020-10-28",
    "comment": "great driver",
    "feedback": "great driver"
  },
  "car_id": "5011ade6ba054dfdb7143c8cc9460dbc",
  "order_provider": {
    "platform": true,
    "partner": true
  }
}
```

## 4.5. Ответ

**200 OK** — тело ответа пустое.

## 4.6. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 404 | Запрашиваемый ресурс не найден |
| 409 | Конфликт запроса с текущим состоянием сервера |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

### Машиночитаемые коды ошибок 400

| `code` | Описание |
|--------|----------|
| `cannot_edit_driver_license_and_full_name_when_dkvu_passed` | Запрещено редактирование ФИО водителя или данных водительского удостоверения после проверки |
| `cannot_edit_driver_license_experience_when_dkvu_passed` | Запрещено редактирование стажа водителя после проверки |

Структура ошибки:

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

---

# 5. POST /v1/parks/contractors/profile — Создание профиля исполнителя

**URL:** `POST https://fleet-api.taxi.yandex.net/v1/parks/contractors/profile`

## 5.1. Заголовки (все обязательные)

| Заголовок | Тип | Описание |
|-----------|-----|----------|
| `X-API-Key` | string (min 1) | API-ключ |
| `X-Client-ID` | string (min 1) | Идентификатор клиента |
| `X-Park-ID` | string | Идентификатор партнёра |
| `X-Idempotency-Token` | string (16–64) | Токен идемпотентности запроса, только печатные ASCII-символы |

## 5.2. Тело запроса (application/json) — корневой уровень

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `contractor` | `ContractorFields` | **Да** | Данные исполнителя |
| `profession` | `Profession` (enum) | **Да** | Профессия |
| `employment` | `Employment` (oneOf) | **Да** | Тип сотрудничества |

### contractor (ContractorFields)

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `account` | `Account` | **Да** | Учётная запись водителя |
| `person` | `Person` | **Да** | Персональные данные водителя |
| `profile` | `Profile` | Нет | `hire_date`, `comment` |
| `car_id` | string (1–100) | Нет | Идентификатор автомобиля |
| `order_provider` | `OrderProvider` | Нет | Доступность заказов |

### contractor.account

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `work_rule_id` | string | **Да** | Идентификатор условия работы |
| `balance_limit` | string | Нет | Лимит по счёту |
| `payment_service_id` | string | Нет | ID для платежа (генерируется автоматически, если пусто) |
| `block_orders_on_balance_below_limit` | boolean | Нет | Запрещены ли все заказы при балансе ниже лимита |

### contractor.person

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `full_name` | `FullName` | **Да** | `first_name`, `middle_name`, `last_name` |
| `contact_info` | `ContactInfo` | **Да** | `phone`, `address`, `email` |
| `driver_license` | `DriverLicense` | **Да** | Водительское удостоверение |
| `driver_license_experience` | `DriverLicenseExperience` | **Да** | Стаж: `total_since_date` (ISO 8601) |
| `id_doc` | `IdDoc` | **Да** | Паспортные данные: `address` |
| `tax_identification_number` | string (min 1) | Нет | ИНН |
| `value_added_tax` | string (min 1), enum | Нет | НДС % |

#### contractor.person.contact_info

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `phone` | string, pattern `^\+\d{1,15}$` | **Да** | Номер телефона |
| `address` | string | Нет | Адрес |
| `email` | string | Нет | Электронная почта |

#### contractor.person.driver_license

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `number` | string | **Да** | Серия и номер водительского удостоверения |
| `country` | string | **Да** | Страна выдачи (трёхбуквенный код) |
| `birth_date` | string (ISO 8601, без ТЗ) | **Да** | Дата рождения |
| `issue_date` | string (ISO 8601, без ТЗ) | **Да** | Дата выдачи |
| `expiry_date` | string (ISO 8601, без ТЗ) | **Да** | Дата окончания действия |

### contractor.profile

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `hire_date` | string (ISO 8601) | Нет | Дата приёма в парк |
| `comment` | string | Нет | Прочее |

### contractor.order_provider

| Поле | Тип | Обязательный | Описание |
|------|-----|--------------|----------|
| `platform` | boolean | Нет | Доступны ли заказы от платформы |
| `partner` | boolean | Нет | Доступны ли заказы от партнёра |

## 5.3. Enum-значения

### Profession

| Значение | Описание |
|----------|----------|
| `taxi/driver` | Водитель такси |
| `cargo/courier/on-car` | Курьер на автомобиле |
| `cargo/courier/on-truck` | Курьер на грузовом транспорте |

### Employment — oneOf, 4 варианта

**1. ParkEmployee (парковый сотрудник)**

```json
{ "type": "park_employee" }
```

**2. SelfemployedRus (самозанятый РФ)**

```json
{ "type": "selfemployed", "phone": "string" }
```

**3. IndividualEntrepreneurRus (ИП РФ)**

```json
{ "type": "individual_entrepreneur", "tax_system": "OSN|USN|AUSN|OSNP|USNP" }
```

Ограничения:
- для индивидуального предпринимателя возможна только профессия «водитель такси» (`taxi/driver`);
- требуется `contractor.person.id_doc.address`;
- при `USN` или `USNP` обязателен `contractor.person.value_added_tax`.

**4. IndividualEntrepreneurKaz (ИП Казахстан)**

```json
{ "type": "individual_entrepreneur", "phone": "string", "tax_authority_code": "string" }
```

### TaxSystemRus — системы налогообложения (РФ)

| Значение | Описание |
|----------|----------|
| `OSN` | Общая система налогообложения (ОСН/ОСНО) |
| `USN` | Упрощённая система налогообложения (УСН) |
| `AUSN` | Автоматизированная упрощённая система (АУСН) |
| `OSNP` | Патентная система (ОСН) |
| `USNP` | Патентная система (УСН) |

### ValueAddedTax — НДС

| Значение | Описание |
|----------|----------|
| `0` | Без НДС |
| `5` | 5 % |
| `7` | 7 % |
| `22` | 22 % |

## 5.4. Пример запроса

```json
{
  "contractor": {
    "account": {
      "balance_limit": "50",
      "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
      "payment_service_id": "12345",
      "block_orders_on_balance_below_limit": true
    },
    "person": {
      "full_name": {
        "first_name": "Ivan",
        "middle_name": "Ivanovich",
        "last_name": "Ivanov"
      },
      "contact_info": {
        "address": "Moscow, Ivanovskaya Ul., bld. 40/2, appt. 63",
        "email": "example-email@example.com",
        "phone": "+79999999999"
      },
      "driver_license": {
        "birth_date": "1975-10-28",
        "country": "rus",
        "expiry_date": "2050-10-28",
        "issue_date": "2020-10-28",
        "number": "070236"
      },
      "driver_license_experience": {
        "total_since_date": "1970-01-01"
      },
      "id_doc": {
        "address": "example"
      },
      "tax_identification_number": "7743013902",
      "value_added_tax": "7"
    },
    "profile": {
      "hire_date": "2020-10-28",
      "comment": "great driver"
    },
    "car_id": "5011ade6ba054dfdb7143c8cc9460dbc",
    "order_provider": {
      "platform": true,
      "partner": true
    }
  },
  "profession": "taxi/driver",
  "employment": {
    "type": "park_employee"
  }
}
```

## 5.5. Ответ 200 OK

| Поле | Тип | Описание |
|------|-----|----------|
| `contractor_profile_id` | string | Идентификатор профиля водителя |

```json
{ "contractor_profile_id": "2111ade6gk054dfdb9iu8c8cc9460mks" }
```

## 5.6. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки: `{ "code": string, "message": string }`.

---

# 6. PUT /v1/parks/driver-profiles/car-bindings — Привязка автомобиля к водителю

**URL:** `PUT https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/car-bindings`

## 6.1. Query-параметры

| Параметр | Тип | Обязательный | Описание | Пример |
|----------|-----|--------------|----------|--------|
| `park_id` | string | **Да** | Идентификатор партнёра | `ee6f33c4562b4e1f8646d157bd70b2c4` |
| `driver_profile_id` | string | **Да** | Идентификатор профиля водителя | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |
| `car_id` | string | **Да** | Идентификатор автомобиля | `01d5c2d7672509d454f8a2803fffb52d` |

## 6.2. Заголовки

| Заголовок | Тип | Обязательный | Описание |
|-----------|-----|--------------|----------|
| `X-API-Key` | string (min 1) | **Да** | API-ключ |
| `X-Client-ID` | string (min 1) | **Да** | Идентификатор клиента |

## 6.3. Тело запроса

Не требуется.

## 6.4. Ответ 200 OK

«Запрос обработан успешно». Тело:

```json
{}
```

## 6.5. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки: `{ "code": string, "message": string }`.

---

# 7. DELETE /v1/parks/driver-profiles/car-bindings — Отвязка автомобиля от водителя

**URL:** `DELETE https://fleet-api.taxi.yandex.net/v1/parks/driver-profiles/car-bindings`

## 7.1. Query-параметры

| Параметр | Тип | Обязательный | Описание | Пример |
|----------|-----|--------------|----------|--------|
| `park_id` | string | **Да** | Идентификатор партнёра | `ee6f33c4562b4e1f8646d157bd70b2c4` |
| `driver_profile_id` | string | **Да** | Идентификатор профиля водителя | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |
| `car_id` | string | **Да** | Идентификатор автомобиля | `01d5c2d7672509d454f8a2803fffb52d` |

## 7.2. Заголовки

| Заголовок | Тип | Обязательный | Описание |
|-----------|-----|--------------|----------|
| `X-API-Key` | string (min 1) | **Да** | API-ключ |
| `X-Client-ID` | string (min 1) | **Да** | Идентификатор клиента |

## 7.3. Тело запроса

Не требуется (параметры передаются в query).

## 7.4. Ответ 200 OK

```json
{}
```

## 7.5. Коды ошибок

| Код | Описание |
|-----|----------|
| 400 | Некорректные параметры запроса |
| 401 | Отсутствуют параметры авторизации запроса |
| 403 | Недостаточно прав для выполнения запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Структура ошибки: `{ "code": string, "message": string }`.

---

## Общая структура ошибки для всех эндпоинтов

| Поле | Тип | Описание |
|------|-----|----------|
| `code` | string | Машиночитаемый код ошибки |
| `message` | string | Человекочитаемое сообщение об ошибке |

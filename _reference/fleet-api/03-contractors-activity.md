# Yandex Fleet API — ContractorProfiles, часть 2

Активность, балансы, курьеры.

Базовый хост API: `https://fleet-api.taxi.yandex.net`
Источник документации: `https://fleet.yandex.ru/docs/api/ru/openapi/ContractorProfiles/<slug>`
Дата сбора: 2026-08-27

## Оглавление

| # | Метод | Путь | Назначение | Slug страницы |
|---|-------|------|-----------|---------------|
| 1 | GET | `/v2/parks/contractors/supply-hours` | Время водителя на линии | `v2parkscontractorssupply-hours-get` |
| 2 | GET | `/v1/parks/contractors/blocked-balance` | Баланс и заблокированный баланс | `v1parkscontractorsblocked-balance-get` |
| 3 | GET | `/v1/parks/contractors/applications/list` | Список заявок исполнителей из гаража | `ContractorsApplicationsListV1` |
| 4 | POST | `/v2/parks/contractors/auto-courier-profile` | Создание профиля авто курьера | `v2parkscontractorsauto-courier-profile-post` |
| 5 | POST | `/v2/parks/contractors/walking-courier-profile` | Создание профиля пешего курьера | `v2parkscontractorswalking-courier-profile-post` |
| 6 | POST | `/v3/parks/contractors/walking-courier-profile` | Создание профиля ПСМЗ пешего курьера | `v3parkscontractorswalking-courier-profile-post` |
| 7 | POST | `/v1/performer/create` | Создание профиля курьера Еды и Платформы | `v1PerformerCreate` |
| 8 | GET | `/v1/contractor-profiles/status` | Статус готовности профиля курьера Еды | `v1ContractorProfilesStatus` |

> Примечание по слагам: три эндпоинта (3, 7, 8) не следуют правилу «путь без слэшей + метод». В навигации документации они названы по operationId: `ContractorsApplicationsListV1`, `v1PerformerCreate`, `v1ContractorProfilesStatus`. Слаги вида `v1parkscontractorsapplicationslist-get`, `v1performercreate-post`, `v1contractor-profilesstatus-get` отдают 404.

---

## 1. GET /v2/parks/contractors/supply-hours — Время водителя на линии

**Описание:** «Получение времени водителя на линии»

**Полный URL:** `GET https://fleet-api.taxi.yandex.net/v2/parks/contractors/supply-hours`

### Query-параметры

| Параметр | Тип | Обязателен | Описание | Ограничения |
|----------|-----|-----------|---------|------------|
| `contractor_profile_id` | string | Да | «Идентификатор профиля водителя» | Одиночное значение, не массив |
| `period_from` | string | Да | «Дата начала периода в формате ISO 8601 с временной зоной» | ISO 8601 с таймзоной; спецсимволы URL-кодируются: `:` → `%3A`, `+` → `%2B` |
| `period_to` | string | Да | «Дата окончания периода в формате ISO 8601 с временной зоной» | То же |

Пример значения параметра даты: `2019-08-08T11%3A58%3A01%2B03%3A00` (то есть `2019-08-08T11:58:01+03:00`).

### Заголовки

| Заголовок | Тип | Обязателен | Описание | Ограничения |
|-----------|-----|-----------|---------|------------|
| `X-API-Key` | string | Да | «API-ключ» | Min length: 1 |
| `X-Client-ID` | string | Да | «Идентификатор клиента» | Min length: 1 |
| `X-Park-ID` | string | Да | «Идентификатор партнера» | — |

### Ответ 200 OK (`application/json`)

```json
{
  "supply_duration_seconds": 3600,
  "total_seconds": 3600
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `supply_duration_seconds` | integer | «Время водителя на линии за запрошенный период в секундах» |
| `total_seconds` | integer | «Общая продолжительность запрошенного периода в секундах» |

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | «Некорректные параметры запроса» |
| 401 | «Отсутствуют параметры авторизации запроса» |
| 403 | «Недостаточно прав для выполнения запроса» |
| 404 | «Запрашиваемый ресурс не найден» |
| 429 | «Превышено допустимое число запросов» |
| 500 | «Внутренняя ошибка сервера» |

Тело ошибки:

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

### Разбор: что именно даёт supply-hours

Это ключевой для нас пункт, поэтому разбираем отдельно — и отдельно помечаем, что документация утверждает явно, а чего в ней **нет**.

**Что документация утверждает явно:**

1. **Период задаётся произвольно.** Два обязательных параметра `period_from` и `period_to` в ISO 8601 **с обязательной временной зоной**. То есть период — не фиксированные «сутки» или «месяц», а любой интервал, который мы зададим сами, с точностью до секунды (пример в документации содержит секунды: `11:58:01`).
2. **Гранулярность ответа — агрегат за весь период, без разбивки.** Ответ содержит ровно два скалярных числа и **не содержит массива по дням, часам или сменам**. То есть за один вызов мы получаем суммарное число секунд на линии за весь интервал целиком. Разбивку по дням придётся строить самим — отдельными вызовами на каждый день (или час).
3. **Только один водитель за вызов.** `contractor_profile_id` — одиночная строка, не массив, и в схеме нет ни постраничности, ни параметра списка. Пакетно по многим водителям запросить нельзя: для парка из N водителей это N запросов, а при разбивке по дням — N × (число дней) запросов. Это главный практический ограничитель.
4. **Единица измерения — секунды**, оба поля целочисленные.
5. **`total_seconds` — это длина самого запрошенного окна**, а не показатель водителя. Пара полей задумана как «числитель и знаменатель»: `supply_duration_seconds / total_seconds` даёт долю времени на линии от календарной длительности периода — то есть готовый коэффициент утилизации/загрузки.

**Чего в документации НЕТ (проверено отдельным проходом по странице):**

- Максимальной длины периода (никаких «не более 31 дня», «не более 24 часов» на странице не заявлено).
- Глубины истории — насколько далеко в прошлое можно уходить `period_from`, не сказано.
- Заявленного правила `period_from < period_to` (явно не оговорено, но на практике очевидно; при нарушении ожидаем 400).
- Указания, по какой сетке сервер агрегирует данные внутри (часы/минуты) — сказано лишь, что результат в секундах.
- Поведения при отсутствии данных (вернётся ли `0` или 404) — не описано.
- Персональных rate limits для метода: есть только общий код 429 «Превышено допустимое число запросов».

**Вывод для нас:** метрика пригодна как второй показатель активности помимо числа поездок — она отвечает на вопрос «сколько времени водитель реально был на линии», чего число поездок не даёт (водитель мог отработать смену с малым числом заказов). Ограничения по датам не документированы, поэтому фактические лимиты диапазона и глубины истории нужно определить эмпирически на реальном ключе; закладываться следует на построчный обход водителей (1 запрос = 1 водитель = 1 период) и на самостоятельную нарезку по дням.

---

## 2. GET /v1/parks/contractors/blocked-balance — Баланс и заблокированный баланс

**Описание:** «Получение баланса и заблокированного баланса водителя»

**Полный URL:** `GET https://fleet-api.taxi.yandex.net/v1/parks/contractors/blocked-balance`

### Query-параметры

| Параметр | Тип | Обязателен | Описание |
|----------|-----|-----------|---------|
| `contractor_id` | string | Да | «Идентификатор профиля водителя» |

> Внимание: здесь параметр называется `contractor_id`, а не `contractor_profile_id`, как в supply-hours.

### Заголовки

| Заголовок | Тип | Обязателен | Описание | Ограничения |
|-----------|-----|-----------|---------|------------|
| `X-API-Key` | string | Да | «API-ключ» | Min length: 1 |
| `X-Park-ID` | string | Да | «Идентификатор партнера» | — |

### Ответ 200 OK (`application/json`)

```json
{
  "balance": "Decimal4",
  "blocked_balance": "Decimal4",
  "details": {
    "blocked_tips": "Decimal4",
    "blocked_cashless": "Decimal4",
    "blocked_bonuses": "Decimal4",
    "blocked_financial_statements": "Decimal4",
    "blocked_closing_documents": "Decimal4"
  }
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `balance` | Decimal4 | «Баланс водителя» |
| `blocked_balance` | Decimal4 | «Заблокированный баланс водителя» |
| `details` | BalanceDetails | «Детали заблокированного баланса водителя» |

**Тип `Decimal4`:** `string`, pattern `^-?[0-9]+(\.[0-9]{1,4})?$` — десятичное число строкой, до 4 знаков после точки, допускает отрицательные значения.

**Объект `BalanceDetails`:**

| Поле | Тип | Описание |
|------|-----|---------|
| `blocked_tips` | Decimal4 | «Заблокированные чаевые» |
| `blocked_cashless` | Decimal4 | «Заблокированные деньги за поездки» |
| `blocked_bonuses` | Decimal4 | «Заблокированные бонусы» |
| `blocked_financial_statements` | Decimal4 | «Заблокированные деньги за финансовые отчеты» |
| `blocked_closing_documents` | Decimal4 | «Заблокированные деньги за закрывающие документы» |

### Коды ошибок

| Код | Описание |
|-----|---------|
| 401 | «Отсутствуют параметры авторизации запроса» |
| 403 | «Недостаточно прав для выполнения запроса» |
| 404 | «Запрашиваемый ресурс не найден» |
| 429 | «Превышено допустимое число запросов» |
| 500 | «Внутренняя ошибка сервера» |

Тело ошибки: `{"code": "string", "message": "Текстовое описание ошибки"}`.

> Практическая заметка: метод даёт не только общий баланс, но и **разложение заблокированной суммы по 5 причинам блокировки**. Это позволяет отличить «деньги есть, но заморожены за поездки/чаевые» от «денег нет». Как и supply-hours, запрос идёт **по одному водителю за вызов**.

---

## 3. GET /v1/parks/contractors/applications/list — Список заявок исполнителей из гаража

**Описание:** «Получение списка заявок исполнителей из гаража с пагинацией»

**Полный URL:** `GET https://fleet-api.taxi.yandex.net/v1/parks/contractors/applications/list`

### Query-параметры

| Параметр | Тип | Обязателен | По умолчанию | Ограничения | Описание |
|----------|-----|-----------|--------------|------------|---------|
| `cursor` | string | Нет | — | — | «Курсор для получения следующий порции данных». Пример: `eyJsZWFkX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0=` |
| `date_start` | string (date-time, ISO 8601) | Нет | — | Только на первой странице (без `cursor`) | «Начальная дата фильтрации по времени последнего бронирования в формате ISO 8601». Пример: `2026-01-01T10:00:00Z` |
| `limit` | integer | Нет | 100 | Min: 1, Max: 100 | «Ограничение количества элементов в ответе» |

### Заголовки

| Заголовок | Тип | Обязателен | Ограничения | Описание |
|-----------|-----|-----------|------------|---------|
| `X-API-Key` | string | Да | Min length: 1 | «API-ключ» |
| `X-Client-ID` | string | Да | Min length: 1 | «Идентификатор клиента» |
| `X-Park-ID` | string | Да | — | «Идентификатор партнера». Пример: `ee6f33c4562b4e1f8646d157bd70b2c4` |
| `Accept-Language` | string | Нет | Min length: 2 | «Предпочитаемый язык ответа. Если не указан, используется ru.» |

### Ответ 200 OK (`application/json`)

```json
{
  "items": [
    {
      "lead_id": "550e8400-e29b-41d4-a716-446655440000",
      "driver_id": "33de650c6a1a40bfa78dd981817da866",
      "driver_link": "https://fleet.yandex.ru/contractors?park_id=ee6f33c4562b4e1f8646d157bd70b2c4&contractor_id=33de650c6a1a40bfa78dd981817da866",
      "driver_name": {
        "first_name": "Ivan",
        "middle_name": "Ivanovich",
        "last_name": "Ivanov"
      },
      "driver_license": "7700123456",
      "phone": "+79999999999",
      "vehicle_id": "5011ade6ba054dfdb7143c8cc9460dbc",
      "vehicle_brand": "Toyota",
      "vehicle_model": "Camry",
      "territory_id": "213",
      "territory_name": "Москва",
      "offer_link": "https://garage.yandex.ru/offer?posting_id=posting_id1&territory_id=213",
      "schema": {
        "price": "1500.0000",
        "working_days": 6,
        "non_working_days": 1
      },
      "request_type": "multiple",
      "created_at": "2023-12-15T09:00:00+03:00",
      "updated_at": "2023-12-15T14:30:00+03:00"
    }
  ],
  "cursor": "eyJsZWFkX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIn0="
}
```

**Верхний уровень:**

| Поле | Тип | Описание |
|------|-----|---------|
| `items` | array of ContractorApplicationItem | «Список заявок» |
| `cursor` | string | «Курсор для получения следующей страницы» |

**Объект `ContractorApplicationItem`:**

| Поле | Тип | Описание |
|------|-----|---------|
| `lead_id` | string (uuid) | «Идентификатор лида» |
| `driver_id` | string | «Идентификатор водителя» |
| `driver_link` | string | «Ссылка на профиль исполнителя или кандидата в Диспетчерской» |
| `driver_name` | object (FullName) | Поля: `first_name` (string), `middle_name` (string), `last_name` (string) |
| `driver_license` | string | «Номер водительского удостоверения» |
| `phone` | string | «Номер телефона» |
| `vehicle_id` | string | «Идентификатор автомобиля» |
| `vehicle_brand` | string | «Марка автомобиля» |
| `vehicle_model` | string | «Модель автомобиля» |
| `territory_id` | string | «Идентификатор локации» |
| `territory_name` | string | «Название локации» |
| `offer_link` | string | «Ссылка на объявление в гараже» |
| `schema` | object | Схема аренды: `price` (string, pattern `^[0-9]+(\.[0-9]{1,4})?$`), `working_days` (integer), `non_working_days` (integer) |
| `request_type` | string (enum) | «Тип заявки» |
| `created_at` | string (date-time) | «Дата и время создания заявки» |
| `updated_at` | string (date-time) | «Дата и время обновления заявки» |

**Enum `request_type`:**

| Значение | Расшифровка |
|----------|-------------|
| `phonecall` | «создана по телефонному звонку» |
| `multiple` | «мультибронирование» |

### Пагинация

Курсорная. `cursor` из ответа передаётся в следующий запрос. `date_start` допустим **только на первой странице** (когда `cursor` не передан).

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | «Некорректные параметры запроса» |
| 401 | «Отсутствуют параметры авторизации запроса» |
| 403 | «Недостаточно прав для выполнения запроса» |
| 429 | «Превышено допустимое число запросов» |
| 500 | «Внутренняя ошибка сервера» |

Тело ошибки: `{"code": "example", "message": "Текстовое описание ошибки"}`.

---

## 4. POST /v2/parks/contractors/auto-courier-profile — Создание профиля авто курьера

**Описание:** «Создание профиля авто курьера»

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v2/parks/contractors/auto-courier-profile`

### Заголовки

| Заголовок | Тип | Обязателен | Описание |
|-----------|-----|-----------|---------|
| `X-API-Key` | string | Да | «API-ключ» (min length: 1) |
| `X-Client-ID` | string | Да | «Идентификатор клиента» (min length: 1) |
| `X-Park-ID` | string | Да | «Идентификатор партнера» |
| `X-Idempotency-Token` | string | Да | «Токен идемпотентности запроса. Должен состоять только из печатных ASCII символов» (min: 16, max: 64) |

### Тело запроса (`application/json`)

**Верхний уровень:**

| Поле | Тип | Обязательно | Описание |
|------|-----|------------|---------|
| `account` | Account | Да | Настройки счёта |
| `person` | Person | Да | Персональные данные |
| `profile` | Profile | Да | Данные профиля |
| `car_id` | string | Да | Идентификатор автомобиля (min: 1, max: 100) |
| `order_provider` | OrderProvider | Да | Настройки источников заказов |

**`account`:**

| Поле | Тип | Обязательно | Описание |
|------|-----|------------|---------|
| `balance_limit` | string | Нет | «Лимит по счету» |
| `work_rule_id` | string | Нет | «Идентификатор условия работы» |
| `payment_service_id` | string | Нет | «ID для платежа (будет сгенерировано автоматически, если оставить это поле пустым)» |
| `block_orders_on_balance_below_limit` | boolean | Нет | «Запрещены ли все заказы при балансе ниже лимита» |

**`person`:**

| Поле | Тип | Обязательно | Описание |
|------|-----|------------|---------|
| `full_name` | FullName | Да | Компоненты ФИО |
| `contact_info` | ContactInfo | Да | Контактные данные |
| `driver_license` | DriverLicense | Да | Водительское удостоверение |
| `driver_license_experience` | DriverLicenseExperience | Нет | Стаж вождения |
| `id_doc` | IdDoc | Нет | Документ, удостоверяющий личность |
| `tax_identification_number` | string | Нет | «Идентификационный номер налогоплательщика» (min: 1) |
| `value_added_tax` | string (enum) | Нет | Ставка НДС |

**Enum `value_added_tax`:** `"0"`, `"5"`, `"7"`, `"22"`.

**`person.full_name` (FullName):**

| Поле | Тип | Обязательно |
|------|-----|------------|
| `first_name` | string | Да |
| `middle_name` | string | Нет |
| `last_name` | string | Да |

**`person.contact_info` (ContactInfo):**

| Поле | Тип | Обязательно | Ограничения |
|------|-----|------------|------------|
| `phone` | string | Да | Pattern: `^\+\d{1,15}$` |
| `address` | string | Нет | Адрес проживания |
| `email` | string | Нет | Электронная почта |

**`person.driver_license` (DriverLicense):**

| Поле | Тип | Обязательно | Ограничения |
|------|-----|------------|------------|
| `birth_date` | string | Да | ISO 8601 без временной зоны |
| `country` | string | Да | Трёхбуквенный код страны (например `rus`) |
| `expiry_date` | string | Да | ISO 8601 |
| `issue_date` | string | Да | ISO 8601 |
| `number` | string | Да | Серия и номер ВУ |

**`person.driver_license_experience`:**

| Поле | Тип | Обязательно | Ограничения |
|------|-----|------------|------------|
| `total_since_date` | string | Нет | ISO 8601 |

**`person.id_doc` (IdDoc):**

| Поле | Тип | Обязательно | Описание |
|------|-----|------------|---------|
| `address` | string | Нет | Адрес регистрации |

**`profile` (Profile):**

| Поле | Тип | Обязательно | Ограничения |
|------|-----|------------|------------|
| `hire_date` | string | Да | ISO 8601 |
| `comment` | string | Нет | Комментарий |

**`order_provider` (OrderProvider):**

| Поле | Тип | Обязательно | Описание |
|------|-----|------------|---------|
| `platform` | boolean | Да | Заказы платформы |
| `partner` | boolean | Да | Заказы партнёра |

### Пример запроса

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

### Ответ 200 OK

```json
{
  "contractor_profile_id": "2111ade6gk054dfdb9iu8c8cc9460mks"
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `contractor_profile_id` | string | «Идентификатор профиля водителя» |

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | Некорректные параметры запроса |
| 429 | Превышено допустимое число запросов |
| 500 | Внутренняя ошибка сервера |

Тело ошибки: `{"code": "example", "message": "Текстовое описание ошибки"}` — `code` (string), `message` (string).

---

## 5. POST /v2/parks/contractors/walking-courier-profile — Создание профиля пешего курьера

**Описание:** «Создание профиля пешего курьера»

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v2/parks/contractors/walking-courier-profile`

### Заголовки

| Заголовок | Тип | Описание | Ограничения |
|-----------|-----|---------|------------|
| `X-API-Key` | string | «API-ключ» | Min length: 1 |
| `X-Client-ID` | string | «Идентификатор клиента» | Min length: 1 |
| `X-Park-ID` | string | «Идентификатор партнера» | — |
| `X-Idempotency-Token` | string | «Токен идемпотентности запроса. Должен состоять только из печатных ASCII символов» | Min: 16, Max: 64 |

### Тело запроса (`application/json`)

| Поле | Тип | Описание | Ограничения |
|------|-----|---------|------------|
| `full_name` | FullName | «Полное имя водителя» | — |
| `full_name.first_name` | string | «Имя» | — |
| `full_name.middle_name` | string | «Отчество» | — |
| `full_name.last_name` | string | «Фамилия» | — |
| `phone` | string | «Номер телефона» | Pattern: `^\+\d{1,15}$` |
| `birth_date` | string (Date) | «Дата в формате ISO 8601 без временной зоны» | Формат `YYYY-MM-DD` |
| `work_rule_id` | string | «Идентификатор условия работы» | — |
| `city` | string | «Город» | Min: 1, Max: 50 |
| `registration_country_code` | string | «Гражданство (код страны)» | Min: 1, Max: 16 |

> Обязательность отдельных полей на странице явно не размечена — в примере присутствуют все поля.

### Пример запроса

```json
{
  "full_name": {
    "first_name": "Ivan",
    "middle_name": "Ivanovich",
    "last_name": "Ivanov"
  },
  "phone": "+79999999999",
  "birth_date": "1970-01-01",
  "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
  "city": "Москва",
  "registration_country_code": "RU"
}
```

### Ответ 200 OK

```json
{
  "contractor_profile_id": "2111ade6gk054dfdb9iu8c8cc9460mks"
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `contractor_profile_id` | string | «Идентификатор профиля водителя» |

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | Bad Request |
| 429 | «Превышено допустимое число запросов» |
| 500 | «Внутренняя ошибка сервера» |

Тело ошибки:

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `code` | string | «Машиночитаемый код ошибки» |
| `message` | string | «Человекочитаемое сообщение об ошибке» |

---

## 6. POST /v3/parks/contractors/walking-courier-profile — Создание профиля ПСМЗ пешего курьера

**Описание:** Создание профиля паркового самозанятого (ПСМЗ) пешего курьера в Российской Федерации.

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v3/parks/contractors/walking-courier-profile`

### Заголовки

| Заголовок | Тип | Обязателен | Описание |
|-----------|-----|-----------|---------|
| `X-API-Key` | string | Да | «API-ключ» (мин. длина: 1) |
| `X-Client-ID` | string | Да | «Идентификатор клиента» (мин. длина: 1) |
| `X-Park-ID` | string | Да | «Идентификатор партнера» |
| `X-Idempotency-Token` | string | Да | «Токен идемпотентности запроса. Должен состоять только из печатных ASCII символов» (мин: 16, макс: 64) |

### Тело запроса (`application/json`)

**`profile` (WalkingCourierWriteModel):**

| Поле | Тип | Обязателен | Описание | Ограничения |
|------|-----|-----------|---------|------------|
| `birth_date` | string (Date) | Да | «Дата в формате ISO 8601 без временной зоны» | `YYYY-MM-DD` |
| `full_name` | FullName | Да | «Полное имя водителя» | вложенный объект |
| `phone` | string | Да | «Номер телефона» | Pattern: `^\+\d{1,15}$` |
| `work_rule_id` | string | Да | «Идентификатор условия работы» | — |

**`full_name` (FullName):**

| Поле | Тип | Обязателен | Описание |
|------|-----|-----------|---------|
| `first_name` | string | Да | «Имя» |
| `middle_name` | string | Нет | «Отчество» |
| `last_name` | string | Да | «Фамилия» |

**`selfemployed` (WalkingCourierSelfemployed):**

| Поле | Тип | Обязателен | Описание | Ограничения |
|------|-----|-----------|---------|------------|
| `address` | string | Да | «Адрес регистрации» | — |
| `phone` | string | Да | «Номер телефона в приложении "Мой налог"» | Pattern: `^\+\d{1,15}$` |
| `address_apartment` | string | Нет | «Номер квартиры» | — |
| `deactivation_contractor_id` | string | Нет | «Идентификатор исполнителя, которого переводят в паркового самозанятого» | — |

### Пример запроса

```json
{
  "profile": {
    "birth_date": "1970-01-01",
    "full_name": {
      "first_name": "Ivan",
      "middle_name": "Ivanovich",
      "last_name": "Ivanov"
    },
    "phone": "+79999999999",
    "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e"
  },
  "selfemployed": {
    "address": "Moscow, Ivanovskaya Ul., bld. 40/2",
    "phone": "+79999999999",
    "address_apartment": "65",
    "deactivation_contractor_id": "817def613d3b45a0ac95f179eb285263"
  }
}
```

### Ответ 200 OK

```json
{
  "id": "2111ade6gk054dfdb9iu8c8cc9460mks"
}
```

| Поле | Тип | Описание |
|------|-----|---------|
| `id` | string | «Идентификатор профиля пешего курьера» |

> Отличие от v2: поле ответа называется `id`, а не `contractor_profile_id`.

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | «Некорректные параметры запроса» |
| 429 | «Превышено допустимое число запросов» |
| 500 | «Внутренняя ошибка сервера» |

Тело ошибки: `code` (string, «Машиночитаемый код ошибки»), `message` (string, «Человекочитаемое сообщение об ошибке»).

---

## 7. POST /v1/performer/create — Создание профиля курьера Еды и Платформы

**Описание:** «Создание профиля курьера Еды и Платформы»

**Полный URL:** `POST https://fleet-api.taxi.yandex.net/v1/performer/create`

### Заголовки

| Заголовок | Тип | Обязателен | Ограничения | Пример |
|-----------|-----|-----------|------------|--------|
| `Accept-Language` | string | Нет | Min length: 2 | `ru` |
| `X-API-Key` | string | Да | Min length: 1 | — |
| `X-Client-ID` | string | Да | Min length: 1 | — |
| `X-Idempotency-Token` | string | Да | Min: 16, Max: 64, только печатные ASCII | `c56fa6537e5a4adbbce6ef3593210fb9` |
| `X-Park-ID` | string | Да | — | `ee6f33c4562b4e1f8646d157bd70b2c4` |

### Тело запроса (`application/json`)

| Поле | Тип | Обязательно | Ограничения | Описание |
|------|-----|------------|------------|---------|
| `last_name` | string | Да | Min length: 1 | Фамилия |
| `first_name` | string | Да | Min length: 1 | Имя |
| `middle_name` | string | Нет | Min length: 1 | Отчество |
| `phone` | string | Да | Min length: 1 | «Номер телефона; для РФ — должен быть зарегистрирован в Моём налоге» |
| `region_geobase_id` | integer | Да | — | Идентификатор города в иерархии geobase |
| `birth_date` | string (date) | Да | — | Дата рождения |
| `registration_address` | string | Условно | Min length: 1 | «Адрес регистрации. Обязателен для РФ или при `employment_type = park_direct` в Казахстане» |
| `citizenship_code2` | string | Да | Pattern: `^[A-Z]{2}$` | «Код страны в формате ISO 3166-1 alpha-2» |
| `employment_type` | string (enum) | Да | `park_direct`, `courier_service` | «Тип занятости» |
| `work_rule_id` | string | Да | Min length: 1 | «Идентификатор условия работы, назначаемого курьеру. Значение можно получить методом получения списка условий работы партнёра» |
| `instant_payments_id` | string (uuid) | Нет | — | «Идентификатор правила моментальных выплат, назначаемого курьеру. Если не указан, применяется правило по умолчанию, настроенное для партнёра, при его наличии» |
| `tax_identification_number` | string | Условно | Min length: 1 | «Налоговый идентификатор курьера в стране регистрации: ИНН, ИИН, ПИНФЛ или ПИН. Обязательность зависит от страны и типа занятости» |

**Enum `employment_type`:**

| Значение | Расшифровка |
|----------|-------------|
| `park_direct` | ПСМЗ |
| `courier_service` | «Парковый исполнитель в терминах Fleet» |

**`citizenship_code2`:** коды ISO 3166-1 alpha-2 (`RU`, `KZ` и т. д.).

Справочники для полей: список регионов — `v1RegionsList`, список гражданств — `v1CitizenshipsList` (соседние методы в той же группе).

### Пример запроса

```json
{
  "last_name": "Иванов",
  "first_name": "Иван",
  "middle_name": "Иванович",
  "phone": "+79999999999",
  "region_geobase_id": 1,
  "birth_date": "1990-01-01",
  "registration_address": "ул. Мира, д. 1",
  "instant_payments_id": "550e8400-e29b-41d4-a716-446655440000",
  "work_rule_id": "bc43tre6ba054dfdb7143ckfgvcby63e",
  "citizenship_code2": "RU",
  "employment_type": "park_direct",
  "tax_identification_number": "1234567890"
}
```

### Ответ 200 OK — «Данные созданного профиля»

| Поле | Тип | Описание |
|------|-----|---------|
| `park_id` | string | Идентификатор парка профиля |
| `contractor_id` | string | Идентификатор профиля в платформе |
| `polling_settings` | object | Настройки для поллинга |
| `polling_settings.polling_interval_ms` | integer | «Частота вызова ручки проверки создания профиля» |
| `polling_settings.polling_timeout_sec` | integer | «Общий таймаут на поллинг ручки проверки создания профиля» |

```json
{
  "park_id": "ee6f33c4562b4e1f8646d157bd70b2c4",
  "contractor_id": "9b17db0cb1f24a38a5c3c8b4f6e4f63b",
  "polling_settings": {
    "polling_interval_ms": 0,
    "polling_timeout_sec": 0
  }
}
```

> Создание асинхронное: ответ возвращает `polling_settings`, по которым нужно опрашивать метод 8 (`GET /v1/contractor-profiles/status`) до статуса `ready` или `error`.

### Коды ошибок

| Код | Описание |
|-----|---------|
| 400 | «Некорректные параметры запроса» |
| 422 | «Некорректные параметры запроса» (Unprocessable Entity) |

Тело ошибки: `code` (string, «Машиночитаемый код ошибки»), `message` (string, «Человекочитаемое сообщение об ошибке»).

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

---

## 8. GET /v1/contractor-profiles/status — Статус готовности профиля курьера Еды

**Описание:** «Возвращает статус профиля курьера Еды по ID курьера»

**Полный URL:** `GET https://fleet-api.taxi.yandex.net/v1/contractor-profiles/status`

### Query-параметры

| Параметр | Тип | Обязателен | Пример |
|----------|-----|-----------|--------|
| `contractor_id` | string | Да | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |

### Заголовки

| Заголовок | Тип | Обязателен | Ограничения | Пример |
|-----------|-----|-----------|------------|--------|
| `Accept-Language` | string | Нет | Min length: 2 | `ru` |
| `X-API-Key` | string | Да | Min length: 1 | — |
| `X-Client-ID` | string | Да | Min length: 1 | — |
| `X-Park-ID` | string | Да | — | `ee6f33c4562b4e1f8646d157bd70b2c4` |

### Ответ 200 OK (`application/json`)

| Поле | Тип | Описание | Пример |
|------|-----|---------|--------|
| `contractor_id` | string | «ID контрактора» | `9b17db0cb1f24a38a5c3c8b4f6e4f63b` |
| `park_id` | string | «ID парка» | `ee6f33c4562b4e1f8646d157bd70b2c4` |
| `profile_status` | string (enum) | «Статус профиля» | `processing` |

**Enum `profile_status`:**

| Значение | Расшифровка |
|----------|-------------|
| `processing` | профиль обрабатывается |
| `ready` | профиль готов |
| `error` | ошибка при создании профиля |

```json
{
  "park_id": "ee6f33c4562b4e1f8646d157bd70b2c4",
  "contractor_id": "9b17db0cb1f24a38a5c3c8b4f6e4f63b",
  "profile_status": "processing"
}
```

### Коды ошибок

| Код | Описание |
|-----|---------|
| 404 | «Ответ при отсутствии профиля с указанным идентификатором» |

Тело ошибки: `code` (string, «Машиночитаемый код ошибки»), `message` (string, «Человекочитаемое сообщение об ошибке»).

```json
{
  "code": "example",
  "message": "Текстовое описание ошибки"
}
```

---

## Сводные замечания

### Заголовки авторизации по методам

| Метод | X-API-Key | X-Client-ID | X-Park-ID | X-Idempotency-Token | Accept-Language |
|-------|-----------|-------------|-----------|---------------------|-----------------|
| supply-hours | Да | Да | Да | — | — |
| blocked-balance | Да | **нет в схеме** | Да | — | — |
| applications/list | Да | Да | Да | — | Опц. |
| auto-courier-profile | Да | Да | Да | Да | — |
| v2 walking-courier | Да | Да | Да | Да | — |
| v3 walking-courier | Да | Да | Да | Да | — |
| performer/create | Да | Да | Да | Да | Опц. |
| contractor-profiles/status | Да | Да | Да | — | Опц. |

### Разнобой в именовании идентификатора исполнителя

- `contractor_profile_id` — supply-hours (запрос), ответ auto-courier и v2 walking-courier;
- `contractor_id` — blocked-balance (запрос), performer/create (ответ), contractor-profiles/status (запрос и ответ);
- `id` — ответ v3 walking-courier;
- `driver_id` — элементы списка заявок.

При интеграции это разные имена **одной и той же сущности**, но в разных методах — легко ошибиться.

### Наблюдения по применимости

- **supply-hours** и **blocked-balance** — единственные два метода в этой части, читающие метрики по конкретному исполнителю; оба работают строго по одному водителю за вызов, без батчинга и пагинации.
- **applications/list** — единственный метод здесь с курсорной пагинацией (`limit` до 100).
- Создание профилей: три «синхронных» метода (возвращают id сразу) и один асинхронный (`/v1/performer/create` + поллинг статуса).

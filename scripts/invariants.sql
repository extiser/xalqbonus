-- Инварианты базы: четыре запроса журнала баллов из docs/points.md и один запрос
-- о пересечении ролей.
--
-- Каждый запрос возвращает ПУСТОЙ результат, когда всё хорошо. Непустой — повод
-- разбираться, а не чинить автоматически.
--
-- Схема указана явно в каждой ссылке на таблицу. `?schema=xb` в строке подключения
-- понимает Prisma, а не `pg`: у сырого соединения search_path остаётся дефолтным,
-- и запрос без префикса молча уйдёт в `public` и честно вернёт правдоподобный ответ.
-- Проверка инварианта, посчитанная не по тем таблицам, хуже отсутствующей.
--
-- Запуск: make invariants. Цель возвращает ненулевой код, если хоть один запрос
-- вернул строки: проверка, о результате которой надо догадываться по выводу, бесполезна.
--
-- Пары `-- invariant:begin N` / `-- invariant:end` — контракт с тестом
-- tests/integration/points/invariants.test.ts: он берёт запросы отсюда, а не держит
-- их вторую копию у себя. Копия инварианта разошлась бы с оригиналом на первой правке.
-- Ими размечены ровно четыре инварианта журнала: пятый появляется правкой docs/points.md,
-- а не молча. Проверка пересечения ролей журналу баллов не принадлежит и размечена своей
-- парой `-- cross-role:begin` / `-- cross-role:end` — её берёт тест сотрудников.
--
-- На переходный период, пока жив старый бот, расхождение по второму инварианту
-- ожидаемо: старый бот продолжает править балансы в `public` мимо нашего журнала.
-- Сверка это показывает, но не исправляет (docs/principles.md).

-- Отказ обязан останавливать прогон: без этого RAISE в конце файла напечатается
-- и psql всё равно выйдет с нулём.
\set ON_ERROR_STOP on

-- Заголовки идут в stderr, чтобы stdout оставался только результатами запросов.
\warn '=== 1. Перевод, у которого не две записи или их сумма не ноль ==='
-- invariant:begin 1
-- Ловит битую вставку: половину перевода записали, вторую нет. Считается от переводов,
-- а не от записей, иначе перевод вообще без записей в результат не попадёт.
SELECT
    transfer.id,
    transfer.reason,
    transfer.idempotency_key,
    COUNT(entry.id)                 AS entries,
    COALESCE(SUM(entry.delta), 0)   AS delta_sum
FROM xb.point_transfers AS transfer
LEFT JOIN xb.point_entries AS entry ON entry.transfer_id = transfer.id
GROUP BY transfer.id, transfer.reason, transfer.idempotency_key
HAVING COUNT(entry.id) <> 2 OR COALESCE(SUM(entry.delta), 0) <> 0
-- invariant:end
;
SELECT :ROW_COUNT > 0 AS violated_first \gset

\warn '=== 2. Сумма записей по счёту расходится с кэшем баланса ==='
-- invariant:begin 2
-- Ловит запись мимо сервиса журнала: баланс правили напрямую.
SELECT
    account.id,
    account.type,
    account.person_id,
    account.balance                        AS cached_balance,
    COALESCE(SUM(entry.delta), 0)          AS journal_balance,
    account.balance - COALESCE(SUM(entry.delta), 0) AS difference
FROM xb.accounts AS account
LEFT JOIN xb.point_entries AS entry ON entry.account_id = account.id
GROUP BY account.id, account.type, account.person_id, account.balance
HAVING account.balance <> COALESCE(SUM(entry.delta), 0)
-- invariant:end
;
SELECT :ROW_COUNT > 0 AS violated_second \gset

\warn '=== 3. Сумма записей по всем счетам не равна нулю ==='
-- invariant:begin 3
-- Ловит потерянную половину перевода в масштабе всего журнала.
SELECT SUM(delta) AS total_delta
FROM xb.point_entries
HAVING SUM(delta) <> 0
-- invariant:end
;
SELECT :ROW_COUNT > 0 AS violated_third \gset

\warn '=== 4. Водительский счёт с отрицательным балансом ==='
-- invariant:begin 4
-- Ловит двойное списание при обмене. Эмиссионный счёт в минусе — норма:
-- его отрицательный баланс и есть объём выданных баллов.
SELECT
    id,
    person_id,
    balance
FROM xb.accounts
WHERE type = 'driver' AND balance < 0
-- invariant:end
;
SELECT :ROW_COUNT > 0 AS violated_fourth \gset

\warn '=== 5. Пересечение ролей: сотрудник с активной водительской привязкой ==='
-- cross-role:begin
-- Водителем и сотрудником одновременно быть нельзя. Правило держится кодом — проверкой
-- с обеих сторон, при принятии приглашения и при привязке водителя, — потому что таблицы
-- не связаны и уникальным индексом не пересекаются (docs/decisions.md → «Учётка сотрудника
-- и роли»). Этот запрос ловит пересечение, если код однажды его пропустит.
--
-- Телефон сверяется наравне с Telegram: учётка сотрудника, заведённая на номер, по которому
-- у водителя идёт автопривязка, — то же самое пересечение, только со второй стороны.
SELECT
    employee.id                AS employee_id,
    employee.role,
    employee.telegram_user_id,
    employee.phone_e164,
    link.person_id             AS driver_person_id,
    link.telegram_chat_id
FROM xb.employees AS employee
JOIN xb.telegram_links AS link
  ON link.closed_at IS NULL
 AND (
      (employee.telegram_user_id IS NOT NULL
        AND (link.telegram_chat_id = employee.telegram_user_id
          OR link.telegram_user_id = employee.telegram_user_id))
   OR (employee.phone_e164 IS NOT NULL
        AND link.person_id IN (
              SELECT profile.person_id
                FROM xb.profile_phones AS phone
                JOIN xb.park_profiles AS profile ON profile.profile_id = phone.profile_id
               WHERE phone.closed_at IS NULL
                 AND phone.phone_e164 = employee.phone_e164
            ))
     )
-- cross-role:end
;
SELECT :ROW_COUNT > 0 AS violated_fifth \gset

-- Значения подставляются как литералы (`:'имя'`), а не как голый текст: без кавычек
-- в запрос уехало бы `t`, что для SQL не булево, а неизвестное имя.
SELECT (
    :'violated_first'::boolean
 OR :'violated_second'::boolean
 OR :'violated_third'::boolean
 OR :'violated_fourth'::boolean
 OR :'violated_fifth'::boolean
) AS any_violated \gset

\if :any_violated
DO $$ BEGIN
    RAISE EXCEPTION 'инварианты нарушены — разбирать по выводу выше';
END $$;
\else
\warn 'Инварианты сходятся: журнал баллов и разделение ролей.'
\endif

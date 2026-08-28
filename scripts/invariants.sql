-- Инварианты журнала баллов. Четыре запроса из docs/points.md.
--
-- Каждый запрос возвращает ПУСТОЙ результат, когда всё хорошо. Непустой — повод
-- разбираться, а не чинить автоматически.
--
-- Схема указана явно в каждой ссылке на таблицу. `?schema=xb` в строке подключения
-- понимает Prisma, а не `pg`: у сырого соединения search_path остаётся дефолтным,
-- и запрос без префикса молча уйдёт в `public` и честно вернёт правдоподобный ответ.
-- Проверка инварианта, посчитанная не по тем таблицам, хуже отсутствующей.
--
-- Запуск: make invariants
--
-- На переходный период, пока жив старый бот, расхождение по второму инварианту
-- ожидаемо: старый бот продолжает править балансы в `public` мимо нашего журнала.
-- Сверка это показывает, но не исправляет (docs/principles.md).

\echo '=== 1. Перевод, у которого не две записи или их сумма не ноль ==='
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
HAVING COUNT(entry.id) <> 2 OR COALESCE(SUM(entry.delta), 0) <> 0;

\echo '=== 2. Сумма записей по счёту расходится с кэшем баланса ==='
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
HAVING account.balance <> COALESCE(SUM(entry.delta), 0);

\echo '=== 3. Сумма записей по всем счетам не равна нулю ==='
-- Ловит потерянную половину перевода в масштабе всего журнала.
SELECT SUM(delta) AS total_delta
FROM xb.point_entries
HAVING SUM(delta) <> 0;

\echo '=== 4. Водительский счёт с отрицательным балансом ==='
-- Ловит двойное списание при обмене. Эмиссионный счёт в минусе — норма:
-- его отрицательный баланс и есть объём выданных баллов.
SELECT
    id,
    person_id,
    balance
FROM xb.accounts
WHERE type = 'driver' AND balance < 0;

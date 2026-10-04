# Единственная входная дверь в стек: docker compose и npx руками не набираются — у любой
# операции есть цель (docs/infra.md → «Единственная входная дверь — Makefile»).
COMPOSE = docker compose -f docker/compose.local.yml --env-file .env
COMPOSE_PROD = docker compose -f docker/compose.prod.yml --env-file .env
COMPOSE_PROXY = docker compose -f docker/compose.proxy.yml --env-file .env
COMPOSE_COPY = docker compose -f docker/compose.local.yml -f docker/compose.copy.yml --env-file .env

.DEFAULT_GOAL := help

.PHONY: help up up-d down restart logs ps shell psql sql migrate migrate-rolled-back migrate-create migrate-diff migrate-sql generate typecheck old-engine-guard test test-db \
        db-restore db-drop db-schema invariants license-collisions legacy-vs-api import-legacy import-legacy-awarded-trips \
        employee-owner prod-employee-owner \
        import-legacy-dump \
        copy-restore copy-up copy-psql copy-status metrics-recompute report-print \
        sync-orders sync-registry sync-state fleet-history fleet-history-status \
        prod-up prod-down prod-restart prod-logs prod-ps prod-shell prod-psql prod-invariants prod-migrate prod-migrate-rolled-back \
        prod-stop prod-start prod-sql prod-db-restore prod-uploads-restore \
        prod-import-legacy prod-import-legacy-check prod-import-legacy-awarded-trips \
        prod-fleet-history prod-fleet-history-logs prod-fleet-history-stop prod-fleet-history-status \
        prod-deploy prod-rollback \
        proxy-up proxy-down proxy-ps proxy-logs proxy-validate proxy-reload

help: ## Показать список доступных команд
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Поднять local-стек (foreground)
	$(COMPOSE) up

up-d: ## Поднять local-стек в фоне (detached) — не занимает терминал
	$(COMPOSE) up -d

down: ## Остановить local-стек
	$(COMPOSE) down

# В Fleet воркер локального стека по расписанию не ходит: SYNC_LIVE_ENABLED, SYNC_CATCHUP_ENABLED
# и SYNC_REGISTRY_ENABLED в `.env` выключены. Зато он гоняет расписания просрочки заказов,
# сгорания наград и итогов акций, и они меняют рабочую базу, пока идёт ручная проверка.
# Обратно — make up-d.
worker-stop: ## Остановить worker local-стека — расписания не меняют рабочую базу во время ручной проверки. Обратно — make up-d
	$(COMPOSE) stop worker

restart: ## Перезапустить процессы local-стека — .env не перечитывает, после правки .env: make up-d
	$(COMPOSE) restart

logs: ## Следить за логами local-стека
	$(COMPOSE) logs -f

ps: ## Статус контейнеров local-стека
	$(COMPOSE) ps

shell: ## Shell внутри app-контейнера (local)
	$(COMPOSE) exec app sh

# Без `db=` — рабочая локальная база. С ним — другая база того же стека, например база
# репетиции переноса (scripts/rehearse-legacy-import.sh): закрывать столкновения привязок
# руками надо именно в ней, а не в рабочей.
psql: ## Войти в psql локальной БД. Другая база стека: make psql db=xalqbonus_0928
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$(or $(db),$$POSTGRES_DB)"'

# Прогон SQL-файла по локальной базе одной сессией: временные таблицы, созданные
# в начале файла, видны запросам в конце — сверки строятся именно так. Файл уходит
# на stdin, поэтому `exec -T`: без него docker отказывается цеплять не-терминал.
#
# Схема в запросах указывается явно — `xb.trips`, а не `trips`. У сырого соединения
# `search_path` дефолтный, и запрос без префикса ушёл бы в `public`, где живут таблицы
# старого бота (docs/decisions.md → «В сыром SQL схема указывается явно»).
#
# `-v ON_ERROR_STOP=1` — чтобы ошибка в запросе останавливала прогон и давала ненулевой код:
# по умолчанию psql печатает ошибку, идёт дальше и выходит с нулём. `-X` — чтобы личный
# `.psqlrc` не менял поведение прогона. `-q` глушит служебные `CREATE TABLE` / `INSERT 0 N`,
# результаты запросов остаются обычными таблицами psql. `db=` — другая база стека, как у `psql`.
sql: ## Прогнать SQL-файл по локальной БД одной сессией. make sql file=scripts/sync-state.sql [db=xalqbonus_prod_copy]
	@test -n "$(file)" || { echo "укажите файл: make sql file=<путь>.sql"; exit 1; }
	@test -f "$(file)" || { echo "файла нет: $(file)"; exit 1; }
	$(COMPOSE) exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$(or $(db),$$POSTGRES_DB)" -q' < "$(file)"

migrate: ## Применить миграции к локальной БД
	$(COMPOSE) exec app npx prisma migrate deploy

# Упавшая миграция откатывается транзакцией целиком, но запись о неудаче остаётся и не даёт
# `migrate deploy` идти дальше. Цель снимает эту запись — только для миграции, которая
# в базе действительно не оставила ничего.
migrate-rolled-back: ## Отметить упавшую миграцию откатившейся. Использование: make migrate-rolled-back name=20260921132514_rewards
	@test -n "$(name)" || { echo "укажите миграцию: make migrate-rolled-back name=<имя каталога из prisma/migrations>"; exit 1; }
	$(COMPOSE) exec app npx prisma migrate resolve --rolled-back "$(name)"

migrate-create: ## Создать миграцию из изменённой схемы, не применяя. Использование: make migrate-create name=point_entries
	$(COMPOSE) exec app npx prisma migrate dev --create-only --name $(name)

# Клиент собирается при установке зависимостей (postinstall), а `migrate deploy` его
# не трогает: после правки схемы типы в `server/generated/` остаются прежними, и правка
# доезжает до кода только этой целью.
generate: ## Пересобрать клиент Prisma из схемы
	$(COMPOSE) exec app npx prisma generate

# Схема наших таблиц. `public` не трогается ничем и никогда: она принадлежит старому боту
# и только читается (CLAUDE.md → «Важные ограничения»).
db-schema: ## Завести схему xb в локальной БД, если её ещё нет
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -c "CREATE SCHEMA IF NOT EXISTS xb;"'

# Восстановление идёт в схему public как есть, поверх пустой базы. Дамп в формате custom,
# поэтому pg_restore, а не psql. Перезалив поверх наполненной базы стоит полутора часов,
# поэтому цель сначала считает водителей и отказывается работать, если они уже есть.
db-restore: ## Восстановить продовый дамп в локальную БД. Использование: make db-restore dump=_backup/xalqbonus-2026-08-27-1247.dump
	@test -n "$(dump)" || { echo "укажите файл: make db-restore dump=_backup/<файл>.dump"; exit 1; }
	@test -f "$(dump)" || { echo "файла нет: $(dump)"; exit 1; }
	@tables=$$($(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "select count(*) from information_schema.tables where table_schema = '"'"'public'"'"'"' 2>/dev/null | tr -d "\r"); \
	if [ "$$tables" != "0" ]; then \
		echo "в схеме public уже $$tables таблиц — восстановление отменено."; \
		echo "перезалив поверх рабочей копии удаляет основание отчётов в _reference/legacy/."; \
		exit 1; \
	fi
	cat "$(dump)" | $(COMPOSE) exec -T postgres sh -c 'pg_restore --no-owner --no-privileges -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' 
	$(MAKE) db-schema

# Инварианты журнала баллов. Запросы возвращают пустой результат, когда всё сходится;
# схема в них указана явно — search_path у сырого соединения дефолтный, и запрос без
# префикса ушёл бы в `public` и вернул правдоподобный ответ не по тем таблицам.
# Ненулевой код возврата даёт сам скрипт: при непустом результате он поднимает исключение,
# и psql под ON_ERROR_STOP выходит с ошибкой. Проверка, о результате которой надо
# догадываться, вглядываясь в вывод, бесполезна.
invariants: ## Прогнать запросы инвариантов журнала баллов по локальной БД (ненулевой код при расхождении)
	$(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q' < scripts/invariants.sql

# Первый владелец: единственный сотрудник, которого заводят руками. Приглашением `owner`
# не заводится — приглашать можно роль строго ниже своей, а выше владельца ролей нет
# (docs/decisions.md → «Учётка сотрудника и роли»). Дальше цепочка идёт сама: владелец
# приглашает админов, админы — менеджеров.
#
# Идемпотентна: повторный прогон на существующем телефоне второй учётки не создаёт и пароль
# не меняет. Пароль приходит аргументом и остаётся в истории команд — на боевой машине его
# стоит сменить из приложения после первого входа.
# Локальная цель — под прогон сценариев доступа на локальной базе. Владелец боевой машины
# заводится `prod-employee-owner` ниже: стеки разные, базы разные, и цель, ходящая
# в локальный стек, на машине либо не найдёт контейнеров, либо заведёт владельца не в ту базу.
employee-owner: ## Завести владельца локально. make employee-owner phone=+998XXXXXXXXX name="Имя Фамилия" password=<пароль>
	@test -n "$(phone)" || { echo 'укажите телефон: make employee-owner phone=+998XXXXXXXXX name="Имя Фамилия" password=<пароль>'; exit 1; }
	@test -n "$(name)" || { echo 'укажите имя: make employee-owner phone=$(phone) name="Имя Фамилия" password=<пароль>'; exit 1; }
	@test -n "$(password)" || { echo 'укажите пароль: make employee-owner phone=$(phone) name="$(name)" password=<пароль>'; exit 1; }
	$(COMPOSE) exec -T app npx tsx scripts/create-owner.ts "$(phone)" "$(name)" "$(password)"

# Тот же сценарий на боевой машине — первый шаг дня выката, до снятия auth_basic
# (docker/DEPLOY-MANUAL.md → «Порядок первого выката с входом»).
#
# Зовётся собранный бандл, а не `npx tsx scripts/...`: в боевом образе нет ни исходников,
# ни tsx — dev-зависимости вычищены, а `scripts/` в него не копируется (docker/Dockerfile).
prod-employee-owner: ## Завести владельца на проде. make prod-employee-owner phone=+998XXXXXXXXX name="Имя Фамилия" password=<пароль>
	@test -n "$(phone)" || { echo 'укажите телефон: make prod-employee-owner phone=+998XXXXXXXXX name="Имя Фамилия" password=<пароль>'; exit 1; }
	@test -n "$(name)" || { echo 'укажите имя: make prod-employee-owner phone=$(phone) name="Имя Фамилия" password=<пароль>'; exit 1; }
	@test -n "$(password)" || { echo 'укажите пароль: make prod-employee-owner phone=$(phone) name="$(name)" password=<пароль>'; exit 1; }
	$(COMPOSE_PROD) exec -T app node .output/create-owner.mjs "$(phone)" "$(name)" "$(password)"

# Считает по выгрузке реестра из _reference/fleet-api/dumps/ — в репозитории её нет.
license-collisions: ## Счётчик коллизий номеров ВУ до и после нормализации
	npx tsx scripts/license-collisions.ts

# Читает выгрузки из _reference/fleet-api/dumps/ — в репозитории их нет — и локальную
# копию старой базы. Сеанс поднимается только для чтения: записать в public скрипт
# не может физически.
legacy-vs-api: ## Сверка старой базы с Fleet API: потеря поездок и охват программы
	python3 scripts/legacy-vs-api.py

# Перенос реестра парка и балансов из public в xb. Гоняется внутри app-контейнера:
# сеть стека и строка подключения с именем `postgres` живут там же, где тесты.
# Скрипт идемпотентен — повторный прогон не меняет ни одной цифры отчёта.
import-legacy: ## Перенести реестр парка и балансы из public в xb (идемпотентно)
	$(COMPOSE) exec -T app npx tsx scripts/import-legacy.ts

# Один шаг переноса отдельно: заказы, за которые балл уже дал старый бот (issue #274).
# Для базы, где перенос прошёл раньше, чем шаг появился: граница со старым ботом обязана
# лечь до первого догоняющего прогона. Выгрузка реестра не нужна, остальные шаги не идут.
import-legacy-awarded-trips: ## Перенести только засчитанные старым ботом заказы (идемпотентно)
	$(COMPOSE) exec -T app npx tsx scripts/import-legacy.ts --only legacy-awarded-trips

# Проверочный прогон переноса на другом дампе старой базы — в отдельной базе рядом,
# рабочая копия не трогается. Контрольные цифры больше не зашиты в код, и убедиться,
# что эталон снимается сам, можно только на дампе с другими цифрами: в день выката дамп
# будет третьим, и цифры третьими (docs/roadmap.md → «Выход в прод»).
#
# Схему xb в отдельной базе разворачивает та же миграция — второго описания структуры
# не заводится. Цель идемпотентна: базу создаёт, только если её нет; дамп восстанавливает,
# только если public в ней пуста; миграции и перенос применяет всегда.
#
# Выгрузка реестра парка берётся та же, что у обычного прогона, либо своя параметром
# profiles=: реестр приходит из Fleet API, а не из дампа старой базы, и к его дате
# отношения не имеет.
import-legacy-dump: ## Прогон переноса на другом дампе в отдельной базе. Использование: make import-legacy-dump dump=_backup/<файл>.dump db=xalqbonus_0907
	@test -n "$(dump)" || { echo "укажите дамп: make import-legacy-dump dump=_backup/<файл>.dump db=<база>"; exit 1; }
	@test -f "$(dump)" || { echo "файла нет: $(dump)"; exit 1; }
	@test -n "$(db)" || { echo "укажите базу: make import-legacy-dump dump=$(dump) db=<база>"; exit 1; }
	@$(COMPOSE) exec -T postgres sh -c '\
		test "$(db)" != "$$POSTGRES_DB" || { echo "$(db) — рабочая копия, проверочный прогон идёт в отдельной базе"; exit 1; }; \
		if [ "$$(psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '"'"'$(db)'"'"'")" = "1" ]; then \
			echo "база $(db) уже есть"; \
		else \
			createdb -U "$$POSTGRES_USER" "$(db)" && echo "база $(db) создана"; \
		fi'
	@tables=$$($(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$(db)" -tAc "select count(*) from information_schema.tables where table_schema = '"'"'public'"'"'"' 2>/dev/null | tr -d "\r"); \
	if [ "$$tables" != "0" ]; then \
		echo "в схеме public базы $(db) уже $$tables таблиц — дамп не перезаливается"; \
	else \
		cat "$(dump)" | $(COMPOSE) exec -T postgres sh -c 'pg_restore --no-owner --no-privileges -U "$$POSTGRES_USER" -d "$(db)"'; \
	fi
	$(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$(db)" -c "CREATE SCHEMA IF NOT EXISTS xb;"'
	$(COMPOSE) exec -T app sh -c 'DATABASE_URL="postgresql://$$POSTGRES_USER:$$POSTGRES_PASSWORD@postgres:5432/$(db)?schema=xb" npx prisma migrate deploy'
	$(COMPOSE) exec -T app sh -c 'DATABASE_URL="postgresql://$$POSTGRES_USER:$$POSTGRES_PASSWORD@postgres:5432/$(db)?schema=xb" npx tsx scripts/import-legacy.ts $(or $(profiles),_reference/fleet-api/dumps/driver-profiles-2026-08-27.jsonl) _reference/legacy/import-report-$(db).md'

# Разовый прогон синхронизации заказов мимо очереди — тем же кодом, каким ходит воркер.
# Гоняется внутри app-контейнера: сеть стека и строка подключения с именем `postgres`
# живут там же. Выключатель SYNC_LIVE_ENABLED на разовый прогон не влияет — он снимает
# расписание, а не запрещает синхронизацию.
sync-orders: ## Разовый прогон синхронизации заказов. Использование: make sync-orders [kind=orders_catchup]
	$(COMPOSE) exec -T app npx tsx scripts/sync-orders.ts $(or $(kind),orders)

# История заказов всего парка (issues #315, #317), в свою таблицу `xb.fleet_order_history`,
# без начислений и мимо `trips`. Два режима: список дат (`dates=`) — проба глубины, ноль заказов
# останавливает список; диапазон (`from= to= budget=`) — полный прогон от старых суток к новым,
# с паузой `pause=` секунд между страницами, охраной живой синхронизации и паузой `cooldown=`
# минут после отказов по лимиту. Закрытые сутки пропускаются, повтор команды добирает остальное.
# Ходит в Fleet API на ключе из `.env`, поэтому бюджет запросов жёсткий: у списка по умолчанию 60,
# у диапазона обязателен.
fleet-history: ## История заказов парка. make fleet-history dates=2026-09-24,2026-07-01 [budget=60] | from=2025-08-01 to=2026-09-30 budget=N [pause=5] [cooldown=10]
	$(COMPOSE) exec -T app npx tsx scripts/fleet-history.ts \
		dates="$(dates)" from="$(from)" to="$(to)" budget="$(budget)" pause="$(pause)" cooldown="$(cooldown)"

# Диапазон сводки по умолчанию — тот, что прогоняется целиком (issue #317).
FLEET_HISTORY_FROM = 2025-08-01
FLEET_HISTORY_TO = 2026-09-30

fleet-history-status: ## Сводка прогона истории по журналу суток. make fleet-history-status [from=2025-08-01] [to=2026-09-30]
	$(COMPOSE) exec -T postgres sh -c 'psql -X -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q -v from="$$1" -v to="$$2"' \
		sh "$(or $(from),$(FLEET_HISTORY_FROM))" "$(or $(to),$(FLEET_HISTORY_TO))" < scripts/fleet-history-status.sql

# Разовый прогон синхронизации профилей парка мимо очереди — тем же кодом, каким ходит
# воркер. Полный обход запускается только отсюда: по расписанию он не ходит никогда,
# берёт весь парк нарезкой и идёт около получаса. Поводы — первое наполнение реестра,
# подозрение на расхождение, аудит.
sync-registry: ## Разовый прогон синхронизации профилей. Использование: make sync-registry [kind=registry_full]
	$(COMPOSE) exec -T app npx tsx scripts/sync-registry.ts $(or $(kind),registry)

# Что синхронизация думает о себе: отметки и последние прогоны со счётчиками.
sync-state: ## Показать отметки синхронизации и последние прогоны
	$(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q' < scripts/sync-state.sql

# Расхождение модели с боевой структурой. Молчит, когда схема и база сходятся; печатает
# разницу, когда нет. Нужна там, где колонку правят миграцией руками или наоборот — модель
# догоняет базу: `String?` на колонке `NOT NULL` не ловится ни типами, ни тестами, и жил он
# так две задачи (issue #120).
migrate-diff: ## Показать расхождение schema.prisma с локальной БД
	$(COMPOSE) exec -T app npx prisma migrate diff --from-schema prisma/schema.prisma --to-config-datasource --exit-code

# Черновик миграции без терминала: `migrate-create` зовёт `migrate dev`, а тот отказывается
# работать вне интерактивной сессии. Печатает SQL, приводящий локальную БД к схеме, —
# его кладут в `prisma/migrations/<метка>_<имя>/migration.sql` и дописывают руками то,
# чего Prisma выразить не умеет.
migrate-sql: ## Напечатать SQL, приводящий локальную БД к schema.prisma (черновик миграции)
	$(COMPOSE) exec -T app npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

typecheck: ## Проверить типы приложения и тестов (nuxt typecheck + tsconfig.tests.json)
	npm run typecheck

# Скрипт проверки движка Mini App (issue #223) — строка, которую сборщик не транспилирует:
# выполниться он обязан на браузере, который не понимает остальное приложение. Цель проверяет
# его текст — `esbuild --target=es5` без ошибок, без переписанного синтаксиса и без вызовов
# новее ES5. На хосте, как `typecheck`: базе и контейнеру здесь делать нечего. Конфиг — Nuxt:
# в нём живут псевдонимы `#shared` и `~`, которыми скрипт собирается.
# Удаление базы локального стека — прежде всего базы репетиции переноса, которую
# scripts/rehearse-legacy-import.sh не переиспользует. Рабочая база не удаляется никогда:
# цель берёт только имя вида <рабочая>_<суффикс> (xalqbonus_0928, xalqbonus_test), всё
# остальное — отказ без изменений. Проверки идут внутри контейнера, по его же POSTGRES_DB,
# а не по тому, что думает о нём хост.
db-drop: ## Удалить базу локального стека, не рабочую. Использование: make db-drop db=xalqbonus_0928
	@test -n "$(db)" || { echo "укажите базу: make db-drop db=<база>"; exit 1; }
	@case "$(db)" in *[!A-Za-z0-9_]*) echo "имя базы — только латиница, цифры и _: $(db)"; exit 1;; esac
	@$(COMPOSE) exec -T postgres sh -c '\
		if [ "$$1" = "$$POSTGRES_DB" ]; then echo "$$1 — рабочая база, не удаляется"; exit 1; fi; \
		case "$$1" in "$$POSTGRES_DB"_?*) ;; *) echo "удаляются только базы вида $${POSTGRES_DB}_<суффикс>, а не $$1"; exit 1;; esac; \
		dropdb -U "$$POSTGRES_USER" "$$1" && echo "база $$1 удалена"' sh "$(db)"

old-engine-guard: ## Проверить, что скрипт проверки движка Mini App написан на ES5
	npx tsx --tsconfig .nuxt/tsconfig.app.json scripts/check-old-engine-guard.ts

# Отдельная база под тесты, в том же контейнере. Схему в ней создаёт та же миграция —
# второго описания структуры не заводится. Цель идемпотентна: базу создаёт, только если
# её нет, миграции применяет всегда.
test-db: ## Завести базу xalqbonus_test и накатить на неё миграции
	@$(COMPOSE) exec -T postgres sh -c '\
		test -n "$$POSTGRES_TEST_DB" || { echo "POSTGRES_TEST_DB не задана — см. .env.example"; exit 1; }; \
		if [ "$$(psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '"'"'"$$POSTGRES_TEST_DB"'"'"'")" = "1" ]; then \
			echo "база $$POSTGRES_TEST_DB уже есть"; \
		else \
			createdb -U "$$POSTGRES_USER" "$$POSTGRES_TEST_DB" && echo "база $$POSTGRES_TEST_DB создана"; \
		fi'
	$(COMPOSE) exec -T app sh -c 'DATABASE_URL="$$TEST_DATABASE_URL" npx prisma migrate deploy'

# Тесты гоняются внутри app-контейнера, а не на хосте: ядру баллов нужна настоящая база,
# а имя `postgres` из DATABASE_URL с хоста не разрешается — снаружи у той же базы адрес
# localhost:5434 (docs/infra.md → «Порты»).
#
# Ходят они ТОЛЬКО в xalqbonus_test: строку подключения подменяет tests/setup.ts из
# TEST_DATABASE_URL и роняет прогон, если её нет или имя базы не кончается на `_test`.
# В рабочей базе живут настоящие люди, настоящие балансы и настоящий журнал, а тесты
# пишут переводы с общего эмиссионного счёта и правят его кэш при уборке — прогон,
# упавший посередине, оставил бы счёт неверным (docs/infra.md → «Тесты»).
test: test-db ## Прогнать тесты (vitest внутри app-контейнера, база xalqbonus_test)
	$(COMPOSE) exec -T app npm run test

# Копия боевой базы (issue #365). Цифры дашборда смотрятся на настоящих данных без выката:
# ночная копия `pg-backup.sh daily` приезжает на Мак в `_backup/prod-daily/`, заливается
# в отдельную базу локального стека, и приложение поднимается на ней.
#
# Копия всегда одна и называется одинаково. Имя зашито `override`-ом, а не передаётся:
# `make copy-restore COPY_DB=...` его не подменит, и рабочую базу заливка не тронет ни при каких
# аргументах — сверх того цель сверяет имя с POSTGRES_DB внутри контейнера.
#
# Режим копии — `docker/compose.copy.yml` поверх локального, только для приложения: своя база,
# своя база Redis под очереди, выключенная синхронизация и недостижимый адрес Fleet — копия
# не тратит квоту ключа парка ни расписанием, ни разовым прогоном. Писать водителям ей не даёт
# TG_OUTGOING_ALLOWLIST из `.env`, он не переопределяется. Воркер в режиме копии остановлен:
# его расписания — просрочка заказов, сгорание наград, подарки, итоги кампаний — пишут в базу,
# и копия перестала бы быть снимком ночи. Обратно на рабочую базу вместе с воркером —
# `make up-d`, в каком режиме стек — `make copy-status`.
#
# Копия снята без `--clean` и поверх таблиц не ложится, поэтому база копии каждый раз
# удаляется и создаётся заново (`--force` рвёт соединения поднятого на ней приложения).
# Обычный вывод заливки — результаты `setval` по каждой последовательности — уходит
# в /dev/null, ошибки под `ON_ERROR_STOP` идут в stderr и остаются на экране. Затем схема
# копии догоняет код ветки той же миграцией, что и рабочая база.
override COPY_DB := xalqbonus_prod_copy

copy-restore: ## Залить копию pg-backup.sh в базу копии вместо прежней. make copy-restore dump=_backup/prod-daily/<файл>.sql.gz
	@test -n "$(dump)" || { echo "укажите копию: make copy-restore dump=_backup/prod-daily/<файл>.sql.gz"; exit 1; }
	@test -f "$(dump)" || { echo "файла нет: $(dump)"; exit 1; }
	@case "$(dump)" in *.sql.gz) ;; *) echo "копия базы — файл .sql.gz от pg-backup.sh, а не $(dump)"; exit 1;; esac
	@gzip -t "$(dump)" || { echo "копия не проходит проверку gzip: $(dump)"; exit 1; }
	@$(COMPOSE) exec -T postgres sh -c '\
		test "$$1" != "$$POSTGRES_DB" || { echo "$$1 — рабочая база, копия в неё не заливается"; exit 1; }; \
		dropdb --if-exists --force -U "$$POSTGRES_USER" "$$1" && \
		createdb -U "$$POSTGRES_USER" "$$1" && echo "база $$1 создана заново"' sh "$(COPY_DB)"
	gunzip < "$(dump)" | $(COMPOSE) exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$(COPY_DB)"' >/dev/null
	$(COMPOSE) exec -T app sh -c 'DATABASE_URL="postgresql://$$POSTGRES_USER:$$POSTGRES_PASSWORD@postgres:5432/$(COPY_DB)?schema=xb" npx prisma migrate deploy'
	@$(COMPOSE) exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$(COPY_DB)"' < scripts/copy-summary.sql

copy-up: ## Поднять app на копии боевой базы, в фоне, и остановить worker. Обратно на рабочую базу — make up-d
	@exists=$$($(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '"'"'$(COPY_DB)'"'"'"') \
		|| { echo "база стека не отвечает — поднимите стек: make up-d"; exit 1; }; \
	test "$$exists" = "1" || { echo "копии $(COPY_DB) нет — сначала make copy-restore dump=_backup/prod-daily/<файл>.sql.gz"; exit 1; }
	$(COMPOSE_COPY) up -d app
	$(COMPOSE) stop worker
	@echo "app на копии $(COPY_DB), worker остановлен: make copy-status; обратно на рабочую базу — make up-d"

# Разовый пересчёт таблицы метрик дашборда (issue #371) мимо очереди — тем же сервисом, что
# ночная задача воркера. Идёт в базу, на которой стоит app: в режиме копии (`make copy-up`) —
# в копию, где воркер остановлен и таблицу наполняет только эта цель. Боевой цели нет:
# на проде таблицу наполнит первая ночь.
metrics-recompute: ## Пересчитать таблицу метрик дашборда разово, в базу app (на копии — в копию)
	$(COMPOSE) exec -T app npx tsx scripts/metrics-recompute.ts

# Отчёт текстом мимо веба (issue #372) — теми же сервисами, что ручки. Идёт в базу, на которой
# стоит app: в режиме копии (`make copy-up`) — в копию. Только чтение.
report-print: ## Отчёт по всему парку текстом. make report-print report=points-economy|sales|rewards from=ГГГГ-ММ-ДД to=ГГГГ-ММ-ДД
	$(COMPOSE) exec -T app npx tsx scripts/report-print.ts "$(report)" "$(from)" "$(to)"

copy-psql: ## Войти в psql копии боевой базы
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$(COPY_DB)"'

# Смотрит в окружение работающих контейнеров, а не в файлы: режим определяет то, с чем
# контейнер создан. Из строки подключения печатается только имя базы — пароль в ней тот же,
# что в `.env`. Остановленный контейнер — штатное состояние воркера в режиме копии, и `exec`
# в него не ходит: цель печатает «остановлен» и идёт дальше.
copy-status: ## Режим стека: на какую базу и какой адрес Fleet смотрят app и worker
	@for service in app worker; do \
		if [ -z "$$($(COMPOSE) ps -q --status running $$service)" ]; then echo "$$service: остановлен"; continue; fi; \
		$(COMPOSE) exec -T $$service sh -c '\
			database=$${DATABASE_URL##*/}; database=$${database%%\?*}; \
			if [ "$$database" = "$$2" ]; then mode="копия"; else mode="рабочая"; fi; \
			echo "$$1: $$mode — база $$database, Fleet $$YANDEX_BASE_URL"' sh "$$service" "$(COPY_DB)" || exit 1; \
	done

# Боевой набор. Сборка образа входит в подъём: отдельной цели build нет, как и цели
# с созданием миграций — на проде миграции только применяются.
prod-up: ## Поднять prod-стек в фоне (detached)
	$(COMPOSE_PROD) up -d --build

prod-down: ## Остановить prod-стек
	$(COMPOSE_PROD) down

prod-restart: ## Перезапустить процессы prod-стека — .env не перечитывает, после правки .env: make prod-start services="app worker"
	$(COMPOSE_PROD) restart

prod-logs: ## Следить за логами prod-стека. Один сервис: make prod-logs services=worker
	$(COMPOSE_PROD) logs -f $(services)

prod-ps: ## Статус контейнеров prod-стека
	$(COMPOSE_PROD) ps

prod-shell: ## Shell внутри app-контейнера (prod)
	$(COMPOSE_PROD) exec app sh

prod-psql: ## Войти в psql prod-БД
	$(COMPOSE_PROD) exec postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

# То же, что `invariants`, но по базе prod-стека — на стенде и на боевой машине. Запускается
# на самой машине, руками: CLI на серверы не ходит (CLAUDE.md → «Важные ограничения»).
prod-invariants: ## Прогнать запросы инвариантов по prod-БД (ненулевой код при расхождении)
	$(COMPOSE_PROD) exec -T postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q' < scripts/invariants.sql

# То же, что `sql`, но по базе prod-стека: сводка синхронизации, столкновения привязок перед
# переносом (docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката», шаги 6 и 9).
# Флаги те же, что у локальной цели, и по той же причине: ошибка в запросе даёт ненулевой код.
prod-sql: ## Прогнать SQL-файл по prod-БД одной сессией. Использование: make prod-sql file=scripts/sync-state.sql
	@test -n "$(file)" || { echo "укажите файл: make prod-sql file=<путь>.sql"; exit 1; }
	@test -f "$(file)" || { echo "файла нет: $(file)"; exit 1; }
	$(COMPOSE_PROD) exec -T postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q' < "$(file)"

# Приложение и воркер по отдельности от базы и очереди: сценарии переноса и восстановления
# гасят тех, кто пишет в базу, а база с очередью остаются поднятыми — запросы и заливка идут
# в них. Поэтому цели принимают только `app` и `worker`: база и очередь гасятся и поднимаются
# всем стеком, `prod-down` и `prod-up`.
#
# `prod-start` — это `up -d`, а не `start`: после правки выключателей в `.env` compose видит
# изменённую конфигурацию и пересоздаёт контейнер, а `start` поднял бы прежний со старым
# окружением (DEPLOY-MANUAL.md → шаги 9 и 10). Остановленный контейнер с прежней
# конфигурацией `up -d` поднимает так же, как `start`. Образ не собирается — `--build` есть
# только у `prod-up`.
#
# Зависимости `prod-start` не трогает — `--no-deps`. Без флага `up -d` сверяет и `postgres`
# с `redis` и пересоздаёт их, если их конфигурация изменилась: цель, названная про приложение
# и воркер, рвала бы соединения с базой посреди переноса или восстановления. Во всех местах
# сценария, где цель стоит, база и очередь уже подняты.
PROD_APP_SERVICES = app worker

prod-stop: ## Остановить приложение и/или воркер prod-стека. make prod-stop services="app worker"
	@test -n "$(services)" || { echo 'укажите сервисы: make prod-stop services="app worker"'; exit 1; }
	@for service in $(services); do \
		case " $(PROD_APP_SERVICES) " in *" $$service "*) ;; *) echo "сервис $$service целью не гасится — только $(PROD_APP_SERVICES); весь стек — make prod-down"; exit 1;; esac; \
	done
	$(COMPOSE_PROD) stop $(services)

prod-start: ## Поднять приложение и/или воркер prod-стека с текущим .env. make prod-start services="app worker"
	@test -n "$(services)" || { echo 'укажите сервисы: make prod-start services="app worker"'; exit 1; }
	@for service in $(services); do \
		case " $(PROD_APP_SERVICES) " in *" $$service "*) ;; *) echo "сервис $$service целью не поднимается — только $(PROD_APP_SERVICES); весь стек — make prod-up"; exit 1;; esac; \
	done
	$(COMPOSE_PROD) up -d --no-deps $(services)

# Возврат prod-БД из копии `pg-backup.sh` (DEPLOY-MANUAL.md → «Откат образа ≠ откат базы»
# и «Перенос старой базы в день выката», шаг 11). Копия — простой SQL, снятый без `--clean`:
# поверх существующих таблиц она не ложится — первый же `CREATE` падает. Поэтому цель сначала
# считает таблицы в `xb` и `public` и отказывается работать, если они есть: схемы сносит
# человек, до вызова. Под `ON_ERROR_STOP` заливка останавливается на первой ошибке, а не
# доезжает до конца поверх сломанного начала.
prod-db-restore: ## Залить копию pg-backup.sh в пустые xb и public prod-БД. make prod-db-restore dump=/srv/xalqbonus-backups/pre-migrate/xalqbonus_pre-migrate_20260928_101500.sql.gz
	@test -n "$(dump)" || { echo "укажите копию: make prod-db-restore dump=/srv/xalqbonus-backups/pre-migrate/<файл>.sql.gz"; exit 1; }
	@test -f "$(dump)" || { echo "файла нет: $(dump)"; exit 1; }
	@case "$(dump)" in *.sql.gz) ;; *) echo "копия базы — файл .sql.gz от pg-backup.sh, а не $(dump)"; exit 1;; esac
	@gzip -t "$(dump)" || { echo "копия не проходит проверку gzip: $(dump)"; exit 1; }
	@tables=$$($(COMPOSE_PROD) exec -T postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -tAc "select count(*) from information_schema.tables where table_schema in ('"'"'public'"'"', '"'"'xb'"'"')"' 2>/dev/null | tr -d "\r"); \
	case "$$tables" in \
		0) ;; \
		''|*[!0-9]*) echo "число таблиц prod-БД не получено, ответ '$$tables' — заливка отменена"; exit 1;; \
		*) echo "в схемах xb и public уже $$tables таблиц — заливка отменена."; \
		   echo "копия снята без --clean и поверх таблиц не ляжет: схемы сносятся до заливки,"; \
		   echo "docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката», шаг 11."; exit 1;; \
	esac
	gunzip < "$(dump)" | $(COMPOSE_PROD) exec -T postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

# Распаковка архива тома с фото — тем же способом, которым его снимает `pg-backup.sh daily`:
# одноразовый контейнер, том смонтирован на запись, архив приезжает потоком в stdin. Образ
# для `tar` — от контейнера базы, он заведомо есть на машине (DEPLOY-MANUAL.md → «Копия тома
# с фото»). Тома нет — отказ: `docker run -v` молча завёл бы пустой том с этим именем,
# и архив лёг бы мимо приложения.
PROD_UPLOADS_VOLUME = xalqbonus-prod_uploads

prod-uploads-restore: ## Распаковать архив тома с фото поверх тома prod-стека. make prod-uploads-restore archive=/srv/xalqbonus-backups/uploads_20260928_230000.tar.gz
	@test -n "$(archive)" || { echo "укажите архив: make prod-uploads-restore archive=/srv/xalqbonus-backups/uploads_<отметка>.tar.gz"; exit 1; }
	@test -f "$(archive)" || { echo "файла нет: $(archive)"; exit 1; }
	@case "$(notdir $(archive))" in uploads_*.tar.gz) ;; *) echo "архив тома — файл uploads_<отметка>.tar.gz от pg-backup.sh, а не $(archive)"; exit 1;; esac
	@gzip -t "$(archive)" || { echo "архив не проходит проверку gzip: $(archive)"; exit 1; }
	@docker volume inspect $(PROD_UPLOADS_VOLUME) >/dev/null 2>&1 || { echo "тома $(PROD_UPLOADS_VOLUME) нет — архив не распакован, проверьте выкат compose.prod.yml"; exit 1; }
	@image=$$($(COMPOSE_PROD) images -q postgres | head -n 1); \
	test -n "$$image" || { echo "образ контейнера postgres не определён — архив не распакован"; exit 1; }; \
	echo "gunzip < $(archive) | docker run --rm -i -v $(PROD_UPLOADS_VOLUME):/data $$image tar -xf - -C /data"; \
	gunzip < "$(archive)" | docker run --rm -i -v $(PROD_UPLOADS_VOLUME):/data "$$image" tar -xf - -C /data

# Перенос старой базы на боевой машине — бандлом из образа, одноразовым контейнером `app`
# (docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката», шаги 7 и 10). Каталог
# выгрузки и отчётов монтируется внутрь как `/import`, отчёт ложится туда же, на хост.
# `profiles=` и `report=` — имена файлов в этом каталоге, без пути: всё, что перенос читает
# и пишет на машине, лежит в одном месте. Запускается на самой машине, руками: CLI на серверы
# не ходит (CLAUDE.md → «Важные ограничения»).
PROD_IMPORT_DIR ?= /srv/xalqbonus-import

prod-import-legacy: ## Перенос старой базы на проде. make prod-import-legacy profiles=driver-profiles-<дата>.jsonl [report=import-report.md]
	@test -n "$(profiles)" || { echo "укажите выгрузку: make prod-import-legacy profiles=driver-profiles-<дата>.jsonl [report=import-report.md]"; exit 1; }
	@case "$(profiles) $(report)" in */*) echo "profiles= и report= — имена файлов в $(PROD_IMPORT_DIR), без каталога"; exit 1;; esac
	@test -f "$(PROD_IMPORT_DIR)/$(profiles)" || { echo "нет выгрузки: $(PROD_IMPORT_DIR)/$(profiles)"; exit 1; }
	@test -f "$(PROD_IMPORT_DIR)/$(basename $(profiles)).meta.json" || { echo "рядом с выгрузкой нет $(basename $(profiles)).meta.json — по нему ставится отметка реестра"; exit 1; }
	$(COMPOSE_PROD) run --rm -T -v "$(PROD_IMPORT_DIR):/import" \
		app node .output/import-legacy.mjs "/import/$(profiles)" "/import/$(or $(report),import-report.md)"

# Проверка до дня переноса: бандл переноса есть в образе, выкаченном на машину. Одноразовый
# контейнер без зависимостей — ни база, ни очередь для `ls` не нужны.
prod-import-legacy-check: ## Проверить, что в выкаченном образе есть бандл переноса
	$(COMPOSE_PROD) run --rm --no-deps -T app ls -l .output/import-legacy.mjs

# Один шаг переноса отдельно — засчитанные старым ботом заказы (issue #274): для машины, где
# перенос прошёл раньше, чем шаг появился. Выгрузка реестра не нужна.
prod-import-legacy-awarded-trips: ## Перенести на проде только засчитанные старым ботом заказы. make prod-import-legacy-awarded-trips [report=import-report-awarded-trips.md]
	@case "$(report)" in */*) echo "report= — имя файла в $(PROD_IMPORT_DIR), без каталога"; exit 1;; esac
	$(COMPOSE_PROD) run --rm -T -v "$(PROD_IMPORT_DIR):/import" \
		app node .output/import-legacy.mjs --only legacy-awarded-trips "/import/$(or $(report),import-report-awarded-trips.md)"

# Полный прогон истории заказов парка на боевой машине (issue #317) — бандлом из образа,
# одноразовым контейнером `app` в фоне: прогон идёт часами и обязан пережить обрыв ssh.
# Имя контейнера постоянное — по нему цели ниже смотрят лог, останавливают и не дают поднять
# второй прогон рядом с идущим. `--rm` нет намеренно: остановленный контейнер держит лог
# с итогом запуска, и `prod-fleet-history-logs` показывает его и после конца прогона. Прежний
# остановленный контейнер удаляется при следующем запуске. `--no-deps` — база уже поднята,
# а пересоздавать её ради разового прогона нельзя. Запускается на самой машине, руками:
# CLI на серверы не ходит (CLAUDE.md → «Важные ограничения»). Порядок —
# docker/DEPLOY-MANUAL.md → «Прогон истории заказов парка».
PROD_FLEET_HISTORY_CONTAINER = xalqbonus-fleet-history

prod-fleet-history: ## Прогон истории заказов в фоне (prod). make prod-fleet-history from=2025-08-01 to=2026-09-30 budget=500 [pause=5] [cooldown=10]
	@test -n "$(from)" && test -n "$(to)" && test -n "$(budget)" || { echo "укажите диапазон и бюджет: make prod-fleet-history from=2025-08-01 to=2026-09-30 budget=500 [pause=5] [cooldown=10]"; exit 1; }
	@state=$$(docker inspect -f '{{.State.Status}}' $(PROD_FLEET_HISTORY_CONTAINER) 2>/dev/null || true); \
	case "$$state" in \
		'') ;; \
		running|restarting|paused) echo "прогон истории уже идёт (контейнер $(PROD_FLEET_HISTORY_CONTAINER), $$state): make prod-fleet-history-logs, остановить — make prod-fleet-history-stop"; exit 1;; \
		*) echo "удаляется прежний контейнер $(PROD_FLEET_HISTORY_CONTAINER) ($$state) вместе с логом прошлого запуска"; docker rm $(PROD_FLEET_HISTORY_CONTAINER) >/dev/null || exit 1;; \
	esac
	$(COMPOSE_PROD) run -d --no-deps --name $(PROD_FLEET_HISTORY_CONTAINER) \
		app node .output/fleet-history.mjs from="$(from)" to="$(to)" budget="$(budget)" pause="$(pause)" cooldown="$(cooldown)"
	@echo "прогон запущен: make prod-fleet-history-logs, сводка — make prod-fleet-history-status"

prod-fleet-history-logs: ## Хвост лога прогона истории (prod), и идущего, и закончившегося. make prod-fleet-history-logs [lines=200]
	docker logs -f --tail $(or $(lines),200) $(PROD_FLEET_HISTORY_CONTAINER)

# Ждём до минуты: прогон по сигналу дожидается ушедшего запроса, сохраняет частичные итоги
# суток и печатает итог запуска. Незакрытые сутки доберёт следующий запуск.
prod-fleet-history-stop: ## Остановить прогон истории (prod) — штатно, с итогом в логе
	docker stop -t 60 $(PROD_FLEET_HISTORY_CONTAINER)

prod-fleet-history-status: ## Сводка прогона истории по журналу суток (prod). make prod-fleet-history-status [from=2025-08-01] [to=2026-09-30]
	$(COMPOSE_PROD) exec -T postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -X -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q -v from="$$1" -v to="$$2"' \
		sh "$(or $(from),$(FLEET_HISTORY_FROM))" "$(or $(to),$(FLEET_HISTORY_TO))" < scripts/fleet-history-status.sql

# Обе прод-цели миграций идут одноразовым контейнером, а не `exec`: так же мигрирует сам выкат
# (`docker/scripts/deploy-manual.sh`, шаг 4), и работающий `app` для них не нужен. Образ берётся
# по `IMAGE_TAG` из `.env` — выкат переписывает его только после зелёной проверки готовности,
# поэтому после неудачного выката это по-прежнему выкаченная версия, та же, что у `exec`.
prod-migrate: ## Применить миграции к prod-БД
	$(COMPOSE_PROD) run --rm -T app ./node_modules/.bin/prisma migrate deploy

# Прод-вариант `migrate-rolled-back`: снимает запись о неудаче, которую упавшая миграция
# оставляет в `_prisma_migrations`, — без неё `prod-deploy` дальше миграции не идёт. Звать
# только для миграции, которая упала целиком в своей транзакции и в базе не оставила ничего.
# Миграция, оставившая часть изменений, этой целью не снимается: её разбирают руками, иначе
# база останется с половиной схемы при записи, что миграции не было. Причину сбоя — данные
# или схему — чинят до вызова, иначе следующий выкат упадёт на том же месте.
# Порядок восстановления — docker/DEPLOY-MANUAL.md → «Упавшая миграция».
prod-migrate-rolled-back: ## Отметить упавшую миграцию откатившейся (prod). Использование: make prod-migrate-rolled-back name=20260921132514_rewards
	@test -n "$(name)" || { echo "укажите миграцию: make prod-migrate-rolled-back name=<имя каталога из prisma/migrations>"; exit 1; }
	$(COMPOSE_PROD) run --rm -T app ./node_modules/.bin/prisma migrate resolve --rolled-back "$(name)"

# Выкат и откат прода. Исполняются на боевой машине, а не с машины разработчика: скрипты
# работают в каталоге выката /srv/xalqbonus и собирают образ там же. Прочие prod-цели выше —
# отдельные действия над уже выкаченным стеком; обновление версии делается только этими двумя.
# Ни одна из них не требует ручного ввода посреди прогона: всё, что нужно, приходит аргументом.
# Порядок шагов, откат образа и восстановление базы — docker/DEPLOY-MANUAL.md.
prod-deploy: ## Выкат прода: сборка образа на сервере, миграции, подъём. make prod-deploy [ref=origin/main]
	bash docker/scripts/deploy-manual.sh $(ref)

prod-rollback: ## Откат прода на последний годный образ. make prod-rollback [sha=<short-sha>]
	bash docker/scripts/rollback.sh $(sha)

# Входная дверь машины: одна на сервер, окружению не принадлежит. Цели гасят и поднимают
# только её. Цели с удалением томов здесь нет ни под каким именем — в томе двери живут
# выпущенные сертификаты.
#
# На сегодняшней боевой машине ни одна из этих целей не применяется: дверь там — nginx
# хоста, 80 и 443 держит он, и Caddy рядом с ним не поднимется. Приложение отдаётся наружу
# петлевым портом, который проксирует nginx. Цели и compose.proxy.yml остаются под переезд
# на чистый сервер, где дверью станет Caddy — условие возврата к ним и образец конфига
# nginx в docker/DEPLOY-MANUAL.md, раздел «Входная дверь машины».
proxy-up: ## Поднять входную дверь машины (Caddy) в фоне. На боевой машине не применяется — дверь там nginx хоста
	$(COMPOSE_PROXY) up -d

proxy-down: ## Остановить входную дверь машины (тома не трогает)
	$(COMPOSE_PROXY) down

proxy-ps: ## Статус контейнера входной двери
	$(COMPOSE_PROXY) ps

proxy-logs: ## Следить за логами входной двери
	$(COMPOSE_PROXY) logs -f

# Разовый контейнер, а не exec в работающий: проверка нужна и до первого подъёма двери,
# на развёртывании машины конфиг проверяется, пока порты ещё держит прежний прокси.
proxy-validate: ## Проверить конфиг двери, ничего не применяя — обязательный шаг перед proxy-reload
	$(COMPOSE_PROXY) run --rm -T caddy caddy validate --config /etc/caddy/Caddyfile

proxy-reload: ## Перечитать Caddyfile двери (graceful) — только после proxy-validate. На боевой машине не применяется: там nginx, его перечитывает человек
	$(COMPOSE_PROXY) exec -T caddy caddy reload --config /etc/caddy/Caddyfile

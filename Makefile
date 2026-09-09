# Единственная входная дверь в стек: docker compose и npx руками не набираются — у любой
# операции есть цель (docs/infra.md → «Единственная входная дверь — Makefile»).
COMPOSE = docker compose -f docker/compose.local.yml --env-file .env
COMPOSE_PROD = docker compose -f docker/compose.prod.yml --env-file .env
COMPOSE_PROXY = docker compose -f docker/compose.proxy.yml --env-file .env

.DEFAULT_GOAL := help

.PHONY: help up up-d down restart logs ps shell psql migrate migrate-create typecheck test test-db \
        db-restore db-schema invariants license-collisions legacy-vs-api import-legacy \
        import-legacy-dump \
        sync-orders sync-registry sync-state \
        prod-up prod-down prod-restart prod-logs prod-ps prod-shell prod-psql prod-migrate \
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

restart: ## Перезапустить local-стек
	$(COMPOSE) restart

logs: ## Следить за логами local-стека
	$(COMPOSE) logs -f

ps: ## Статус контейнеров local-стека
	$(COMPOSE) ps

shell: ## Shell внутри app-контейнера (local)
	$(COMPOSE) exec app sh

psql: ## Войти в psql локальной БД
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

migrate: ## Применить миграции к локальной БД
	$(COMPOSE) exec app npx prisma migrate deploy

migrate-create: ## Создать миграцию из изменённой схемы, не применяя. Использование: make migrate-create name=point_entries
	$(COMPOSE) exec app npx prisma migrate dev --create-only --name $(name)

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

# Разовый прогон синхронизации профилей парка мимо очереди — тем же кодом, каким ходит
# воркер. Полный обход запускается только отсюда: по расписанию он не ходит никогда,
# берёт весь парк нарезкой и идёт около получаса. Поводы — первое наполнение реестра,
# подозрение на расхождение, аудит.
sync-registry: ## Разовый прогон синхронизации профилей. Использование: make sync-registry [kind=registry_full]
	$(COMPOSE) exec -T app npx tsx scripts/sync-registry.ts $(or $(kind),registry)

# Что синхронизация думает о себе: отметки и последние прогоны со счётчиками.
sync-state: ## Показать отметки синхронизации и последние прогоны
	$(COMPOSE) exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -q' < scripts/sync-state.sql

typecheck: ## Проверить типы (nuxt typecheck)
	npm run typecheck

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

# Боевой набор. Сборка образа входит в подъём: отдельной цели build нет, как и цели
# с созданием миграций — на проде миграции только применяются.
prod-up: ## Поднять prod-стек в фоне (detached)
	$(COMPOSE_PROD) up -d --build

prod-down: ## Остановить prod-стек
	$(COMPOSE_PROD) down

prod-restart: ## Перезапустить prod-стек
	$(COMPOSE_PROD) restart

prod-logs: ## Следить за логами prod-стека
	$(COMPOSE_PROD) logs -f

prod-ps: ## Статус контейнеров prod-стека
	$(COMPOSE_PROD) ps

prod-shell: ## Shell внутри app-контейнера (prod)
	$(COMPOSE_PROD) exec app sh

prod-psql: ## Войти в psql prod-БД
	$(COMPOSE_PROD) exec postgres sh -c 'PGPASSWORD="$$POSTGRES_PASSWORD" psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

prod-migrate: ## Применить миграции к prod-БД
	$(COMPOSE_PROD) exec app ./node_modules/.bin/prisma migrate deploy

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

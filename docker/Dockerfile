# Этап 1: build — полные зависимости, сборка приложения и бандлов воркера и владельца
FROM node:24-alpine AS build
WORKDIR /srv
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build
# Бандл воркера кладётся рядом с `.output/server/`, а не внутрь — см. `--outfile` в build:worker.
# Внешние пакеты (`--packages=external`) резолвятся в рантайме снизу вверх от файла бандла,
# а в `.output/server/node_modules` Nitro кладёт огрызок `@prisma/client`: только package.json
# и два файла wasm-компилятора запросов. Node находит пакет там, считает поиск законченным
# и до полного `/srv/node_modules/@prisma/client` не поднимается — воркер падал на старте
# с ERR_MODULE_NOT_FOUND на `@prisma/client/runtime/client.js` (issue #49). На уровень выше
# `node_modules` нет вовсе, и поиск сразу уходит в полное дерево `/prod`.
#
# Отвергнуто:
# — собирать воркер вторым входом Nitro: Nitro не даёт второй точки входа со своим CMD,
#   пришлось бы городить ветвление по переменной внутри одного серверного бандла — ровно то
#   размывание границы между веб-частью и синхронизацией, ради которой они разведены
#   по контейнерам (docs/infra.md → «Приложение и воркер — разные контейнеры»);
# — перестать держать рантайм Prisma внешним: бандлить его пришлось бы вместе с wasm-файлами
#   компилятора запросов, которые esbuild не переносит, и с нативным `pg` — чинили бы сборку
#   на каждом обновлении Prisma;
# — докладывать файлы поверх нитровского `node_modules`: лечит симптом на одной версии Prisma
#   и молча ломается на следующей (issue #49 → «Не делать»).
RUN npm run build:worker
# Заведение владельца — тем же бандлом и по той же причине, что воркер. В финальном образе
# нет ни `scripts/`, ни `server/`, ни tsx: исходники туда не копируются, а devDependencies
# вычищены `--omit=dev`. Цель `make prod-employee-owner`, зовущая `npx tsx scripts/...`,
# на машине не нашла бы ни файла, ни tsx и полезла бы за ним в сеть под пользователем `node`.
#
# Кладётся рядом с `.output/worker.mjs`, а не внутрь `.output/server/`, — ровно по причине,
# описанной выше: в `.output/server/node_modules` лежит огрызок `@prisma/client`, и поиск
# внешних пакетов оттуда до полного дерева не поднимается.
RUN npm run build:create-owner
# Production-зависимости собираются отдельным деревом, а не вычищаются на месте: этот же этап
# служит образом локального стека (compose.local.yml → target: build), а там нужны tsx, vitest
# и prisma CLI. Дерево /prod едет в финальный образ, дерево /srv остаётся полным.
RUN mkdir -p /prod \
 && cp package.json package-lock.json /prod/ \
 && npm ci --omit=dev --ignore-scripts --prefix /prod

# Этап 2: migrate-tools — инструмент миграций для финального образа, и только он.
# Версии берутся из манифеста репозитория, чтобы CLI миграций не разъезжался с клиентом.
FROM node:24-alpine AS migrate-tools
WORKDIR /tools
# Манифест репозитория кладётся в сторону: он нужен как источник версий, а не как манифест
# этого этапа — иначе npm init его перезапишет.
COPY package.json /src/package.json
RUN npm init -y >/dev/null \
 && npm i --no-audit --no-fund \
      "prisma@$(node -p "require('/src/package.json').devDependencies.prisma")" \
      "dotenv@$(node -p "require('/src/package.json').devDependencies.dotenv")"

# Этап 3: runner — финальный production образ
FROM node:24-alpine AS runner
WORKDIR /srv
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
# Два дерева зависимостей сливаются в одно: сперва инструмент миграций, поверх —
# production-зависимости приложения. Порядок важен: при совпадении имени пакета побеждает
# версия из локфайла репозитория, а не та, что подтянул к себе CLI.
COPY --from=migrate-tools /tools/node_modules ./node_modules
COPY --from=build /prod/node_modules ./node_modules
COPY --from=build /srv/.output ./.output
EXPOSE 3000
# Проба образа бьёт в /api/health — здоровье процесса. Готовность (/api/ready) ждёт выкат:
# упавшая база не должна перезапускать приложение. Воркер HTTP не слушает и подменяет
# эту пробу своей — по отметке живого цикла (compose-файлы окружений).
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -sf http://127.0.0.1:3000/api/health || exit 1
USER node
# Проверка бандла воркера запуском. Собранный бандл до этой задачи не исполнялся нигде:
# локальный стек гоняет воркер через tsx по исходникам, а «сборка прошла» подтверждало только
# то, что esbuild не упал, — дефект #49 доехал до боевой машины именно так. Проверка стоит
# в сборке образа, а не в чьей-то голове: собрать образ, не прогнав её, нельзя.
#
# Гарантирует она ровно две вещи: граф модулей бандла разрешился целиком и старт дошёл
# до попытки открыть соединение с базой. Сломанный резолв сюда не доходит никогда — он падает
# на связывании модулей, ещё до первой строки нашего кода. Больше проверка не утверждает:
# ни живой очереди, ни отработавшего прогона синхронизации здесь нет.
#
# Признак — отказ соединения с базой, поэтому очередь уведена на несуществующее имя, а не
# на закрытый порт. С закрытым портом ioredis печатает собственный ECONNREFUSED с первой
# секунды и раньше Prisma, и признак перестаёт быть однозначным: поломка рантайма Prisma
# или wasm-компилятора запросов прошла бы молча — проверка увидела бы редисовый ECONNREFUSED
# и сказала «бандл поднялся». Замерено: при недоступной базе и очереди на закрытом порту
# в выводе 82 вхождения ECONNREFUSED, все от очереди, и ни одного от базы. С несуществующим
# именем очередь даёт ENOTFOUND, и ECONNREFUSED приходит только от базы.
#
# timeout обязателен: у очереди maxRetriesPerRequest: null, то есть ретраи вечные. Сегодня
# процесс гарантированно роняет top-level await на failAbandonedRuns, но стоит обращению
# к базе уехать ниже по server/queues/worker.ts или обернуться в try — и сборка образа
# повиснет насмерть, без единой строки в логе.
RUN out="$(DATABASE_URL='postgresql://smoke:smoke@127.0.0.1:1/smoke?schema=xb' \
           REDIS_URL='redis://redis-smoke-unreachable:6379' \
           timeout 60 node .output/worker.mjs 2>&1 || true)"; \
    if echo "$out" | grep -q 'DatabaseNotReachable\|ECONNREFUSED'; then \
      echo 'бандл воркера поднялся: старт дошёл до соединения с базой'; \
    else \
      echo 'бандл воркера не поднялся — старт не дошёл до соединения с базой:'; \
      echo "$out" | head -c 2000; \
      exit 1; \
    fi
# Проверка бандла владельца — тем же способом и по той же причине. Исполняется он ровно
# один раз за жизнь машины, в день выката, до снятия пароля с корня: сломанный бандл,
# обнаруженный в этот момент, останавливает выкат целиком.
#
# Запуск без аргументов: скрипт печатает подсказку и выходит с единицей, до базы не доходя.
# Утверждает это одно — граф модулей разрешился. Сломанный резолв сюда не доходит: он падает
# на связывании, и подсказки в выводе не появляется вовсе. Строка подключения заведомо
# нерабочая, чтобы проверка не оказалась зависящей от чужой машины.
RUN out="$(DATABASE_URL='postgresql://smoke:smoke@127.0.0.1:1/smoke?schema=xb' \
           node .output/create-owner.mjs 2>&1 || true)"; \
    if echo "$out" | grep -q 'create-owner'; then \
      echo 'бандл владельца поднялся: граф модулей разрешился'; \
    else \
      echo 'бандл владельца не поднялся:'; \
      echo "$out" | head -c 2000; \
      exit 1; \
    fi
CMD ["node", ".output/server/index.mjs"]

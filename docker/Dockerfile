# Этап 1: build — полные зависимости, сборка приложения и бандла воркера
FROM node:24-alpine AS build
WORKDIR /srv
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm run build:worker
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
CMD ["node", ".output/server/index.mjs"]

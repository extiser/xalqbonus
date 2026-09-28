#!/usr/bin/env bash
# Репетиция переноса старой базы на копии прода — локально, в отдельной базе.
#
# На проде перенос ложится не на пустую `xb`, как во всех прогонах до сих пор, а поверх живых
# данных: каталог, остатки, сотрудники, демо, водители, прошедшие регистрацию. Репетиция
# собирает ровно это состояние из двух дампов одного дня — копии базы контейнера прода
# и `public` старого бота — и прогоняет перенос тем же бандлом, что поедет на машину.
#
# Рабочая локальная база не трогается: всё идёт в отдельную базу, и существующую скрипт
# не переиспользует — повторная репетиция поверх прошлой смешала бы два прогона. Базу от
# прошлого раза удаляют руками, командой из текста отказа.
#
# Шаги — те же, что в день выката (docker/DEPLOY-MANUAL.md → «Перенос старой базы в день
# выката»), кроме снятия дампов: они уже лежат в `_backup/`.
#
# Выгрузка реестра — аргументом, обязательно: её снимает scripts/export-registry.py, и рядом
# с ней должен лежать `.meta.json`. Какую выгрузку репетировать, решает запускающий.
#
# Запуск из корня репозитория, при поднятом локальном стеке (`make up-d`):
#   bash scripts/rehearse-legacy-import.sh <выгрузка реестра .jsonl>
#
# Остановка на столкновениях привязок — штатный исход, база при этом остаётся. Каждое
# столкновение закрывается руками в базе репетиции, примером из шага 6 сценария, и репетиция
# продолжается с проверки столкновений, без пересоздания базы:
#   bash scripts/rehearse-legacy-import.sh <та же выгрузка .jsonl> --continue
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../docker/scripts/_log.sh
source "${REPO_ROOT}/docker/scripts/_log.sh"

DB_NAME="xalqbonus_0928"
# Копия базы контейнера прода: `xb` со всеми живыми данными, `public` в ней пуста.
XB_DUMP="_backup/xalqbonus_20260928_064051.sql.gz"
# `pg_dump -Fc -n public` старого бота из системного Postgres машины.
PUBLIC_DUMP="_backup/legacy-public-2026-09-28.dump"
# Реестр приходит из Fleet API, а не из дампов, и к их дате отношения не имеет. Записи старой
# базы, заведённые после выгрузки, уйдут в несопоставленные, и эталон это учтёт: он снимается
# по той же выгрузке.
PROFILES="${1:-}"
# `--continue` — продолжить на базе, где шаги 1–4 уже прошли: с проверки столкновений.
MODE="${2:-}"
REPORT="_reference/legacy/import-report-${DB_NAME}.md"

COMPOSE_FILE="docker/compose.local.yml"
ENV_FILE=".env"

case "$PROFILES" in
  -h | --help)
    sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  '')
    log_error старт "выгрузка реестра не названа: bash scripts/rehearse-legacy-import.sh <выгрузка .jsonl>"
    exit 1
    ;;
esac

case "$MODE" in
  '' | --continue) ;;
  *)
    log_error старт "второй аргумент может быть только --continue, получено «${MODE}»"
    exit 1
    ;;
esac

cd "$REPO_ROOT"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# --- Проверки до первого изменения ----------------------------------------------------

for file in "$XB_DUMP" "$PUBLIC_DUMP" "$PROFILES" "${PROFILES%.jsonl}.meta.json"; do
  if [ ! -f "$file" ]; then
    log_error старт "файла нет: ${file} — ничего не изменено"
    exit 1
  fi
done

WORKING_DB="$(compose exec -T postgres printenv POSTGRES_DB | tr -d '\r' || true)"
if [ -z "$WORKING_DB" ]; then
  log_error старт "локальный стек не отвечает — поднимите его: make up-d"
  exit 1
fi
if [ "$DB_NAME" = "$WORKING_DB" ]; then
  log_error старт "${DB_NAME} — рабочая локальная база, репетиция идёт только в отдельной"
  exit 1
fi

DB_EXISTS="$(compose exec -T postgres sh -c \
  'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '"'"'$1'"'"'"' \
  sh "$DB_NAME" | tr -d '[:space:]')"
if [ "$MODE" = --continue ]; then
  if [ "$DB_EXISTS" != "1" ]; then
    log_error старт "базы ${DB_NAME} нет — продолжать нечего, запустите репетицию без --continue"
    exit 1
  fi
  log_info старт "продолжение на ${DB_NAME}: шаги 1–4 пропущены, с проверки столкновений"
elif [ "$DB_EXISTS" = "1" ]; then
  log_error старт "база ${DB_NAME} уже есть — репетиция отменена, ничего не изменено"
  echo "продолжить её после остановки на столкновениях: bash scripts/rehearse-legacy-import.sh ${PROFILES} --continue" >&2
  echo "удалить базу прошлой репетиции: docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec postgres sh -c 'dropdb -U \"\$POSTGRES_USER\" ${DB_NAME}'" >&2
  exit 1
fi

# Шаги 1–4 собирают базу и в режиме продолжения не повторяются: копия `xb` и заливка `public`
# на уже собранной базе упали бы, а закрытые руками привязки откатились бы вместе с ней.
if [ "$MODE" != --continue ]; then

# --- 1. Отдельная база ------------------------------------------------------------------

compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$DB_NAME"
log_info база "создана ${DB_NAME}"

# --- 2. Копия базы прода: `xb` со всеми данными -----------------------------------------
#
# Дамп текстовый — так его снимает pg-backup.sh, — поэтому psql, а не pg_restore. ON_ERROR_STOP:
# копия, легшая наполовину, дала бы репетицию не того состояния, которое на машине.
gzip -dc "$XB_DUMP" | compose exec -T postgres sh -c \
  'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" >/dev/null' sh "$DB_NAME"
log_info "копия xb" "${XB_DUMP} → ${DB_NAME}"

# --- 3. `public` старого бота — тем же скриптом, что на машине --------------------------

bash docker/scripts/restore-legacy-public.sh local "$PUBLIC_DUMP" "$DB_NAME"

# --- 4. Миграции ------------------------------------------------------------------------
#
# Копия прода стоит на тех миграциях, что выкачены сегодня; перенос идёт кодом этой ветки.
compose exec -T app sh -c \
  'DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$1?schema=xb" npx prisma migrate deploy' \
  sh "$DB_NAME"
log_info миграция "применены к ${DB_NAME}"

fi

# --- 5. Столкновения привязок — тем же запросом, что на машине перед переносом ----------
#
# Непустой результат — остановка: перенос на такой базе упал бы посередине на уникальном
# индексе привязок. Столкновения на копии прода решаются так же, как на машине, — руками.
if ! compose exec -T postgres sh -c 'psql -X -q -U "$POSTGRES_USER" -d "$1"' \
     sh "$DB_NAME" < docker/scripts/legacy-link-collisions.sql; then
  log_error привязки "столкновения — перенос не запущен, база ${DB_NAME} оставлена как есть"
  cat >&2 <<HINT
Каждую строку выше решает человек. Закрыть привязку — примером из сценария
(docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката», шаг 6), в базе репетиции:
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec postgres sh -c 'psql -U "\$POSTGRES_USER" -d ${DB_NAME}'
Продолжить репетицию с проверки столкновений, без пересоздания базы:
  bash scripts/rehearse-legacy-import.sh ${PROFILES} --continue
HINT
  exit 1
fi
log_info привязки "столкновений нет"

# --- 6. Перенос — бандлом, который поедет на машину -------------------------------------
#
# Не `npx tsx scripts/import-legacy.ts`: на машине исполняется `.output/import-legacy.mjs`,
# и репетировать надо его. Собирается внутри app-контейнера — там же, где потом запускается.
compose exec -T app npm run build:import-legacy
log_info сборка ".output/import-legacy.mjs"

compose exec -T app sh -c \
  'DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$1?schema=xb" node .output/import-legacy.mjs "$2" "$3"' \
  sh "$DB_NAME" "$PROFILES" "$REPORT"
log_info перенос "отчёт: ${REPORT}"

# --- 7. Инварианты журнала — как `make prod-invariants` после переноса на машине ---------

compose exec -T postgres sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' \
  sh "$DB_NAME" < scripts/invariants.sql
log_info итог "репетиция на ${DB_NAME} прошла до инвариантов · отчёт ${REPORT}"

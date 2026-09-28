#!/usr/bin/env bash
# Заливка схемы `public` старого бота в базу, где живёт наша `xb`.
#
# Перенос (`scripts/import-legacy.ts`) ходит в обе схемы одной строкой `DATABASE_URL`, а на
# машине они в разных базах: `public` старого бота — в системном Postgres (`sudo -u postgres`,
# база `xalqbonus`), `xb` — в контейнере стека. Проверено 28-09-2026: в базе контейнера схема
# `public` пуста. Дамп `pg_dump -Fc -n public` старого бота заливается сюда, и дальше перенос
# идёт как локально (docs/decisions.md → «База прода поднимается на чистой, в контейнере стека»).
#
# Работает и на локальном стеке, и на машине: стек называется первым аргументом, а не
# угадывается. Умолчания нет намеренно — скрипт, который по забывчивости уходит в боевую базу,
# хуже скрипта, который без аргумента отказывается работать.
#
# Схема `xb` не трогается никак, и это свойство вызова, а не аккуратности: `pg_restore --schema
# public` восстанавливает только объекты схемы `public`, что бы ни лежало в файле.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_log.sh
source "${SCRIPT_DIR}/_log.sh"

# Корень репозитория — два уровня вверх от скрипта: пути compose-файлов и `.env` записаны от него,
# а звать скрипт могут из любого каталога.
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE=".env"

usage() {
  cat <<USAGE
restore-legacy-public.sh — заливка дампа public старого бота в базу, где живёт xb.

  bash docker/scripts/restore-legacy-public.sh <local|prod> <дамп> [база]

  local|prod  стек: docker/compose.local.yml или docker/compose.prod.yml
  дамп        файл pg_dump -Fc -n public старого бота
  база        база в контейнере postgres стека; по умолчанию POSTGRES_DB из контейнера

Отказывает без изменений, если файла нет, базы нет или в public базы уже есть таблицы.
Заливка идёт одной транзакцией: или public целиком, или ничего.
Порядок дня выката — docker/DEPLOY-MANUAL.md → «Перенос старой базы в день выката».
USAGE
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
  local)
    COMPOSE_FILE="docker/compose.local.yml"
    ;;
  prod)
    COMPOSE_FILE="docker/compose.prod.yml"
    ;;
  *)
    log_error заливка "стек не назван: первым аргументом local или prod"
    usage >&2
    exit 1
    ;;
esac

DUMP_ARG="${2:-}"
if [ -z "$DUMP_ARG" ]; then
  log_error заливка "дамп не назван"
  usage >&2
  exit 1
fi

# Путь к дампу приводится к абсолютному до перехода в корень репозитория: относительный путь
# человек пишет от того каталога, где стоит.
if [ ! -f "$DUMP_ARG" ] || [ ! -r "$DUMP_ARG" ]; then
  log_error заливка "файла нет или он не читается: ${DUMP_ARG} — ничего не изменено"
  exit 1
fi
DUMP_FILE="$(cd "$(dirname "$DUMP_ARG")" && pwd)/$(basename "$DUMP_ARG")"

cd "$REPO_ROOT"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# Имя базы — аргументом или из окружения контейнера, как в pg-backup.sh. Пустое значение значит,
# что контейнер не поднят: заливать вслепую нельзя.
DB_NAME="${3:-}"
if [ -z "$DB_NAME" ]; then
  DB_NAME="$(compose exec -T postgres printenv POSTGRES_DB | tr -d '\r' || true)"
fi
if [ -z "$DB_NAME" ]; then
  log_error заливка "POSTGRES_DB не прочитан из контейнера postgres (${COMPOSE_FILE}) — ничего не изменено"
  exit 1
fi

# Запрос к базе стека. Имя базы уходит в контейнер позиционным аргументом `sh -c`, а не
# подстановкой в текст команды: кавычки в нём ничего не сломают. Пароль передаётся так же, как
# в pg-backup.sh: на машине подключение по паролю, локально он просто не спрашивается.
query() {
  compose exec -T postgres sh -c \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -U "$POSTGRES_USER" -d "$1" -tAc "$2"' \
    sh "$DB_NAME" "$1"
}

# Проверка до заливки — как у `make db-restore`: в public уже что-то есть — отказ. Перезалив
# поверх наполненной схемы смешал бы два состояния старой базы, и эталон контрольных цифр
# снимался бы с того, чего не было ни на одну дату. Непрочитанный ответ — ошибка, а не пустота:
# иначе недоступная база выглядела бы пустой, и заливка пошла бы не туда.
PUBLIC_TABLES="$(query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" \
  | tr -d '[:space:]' || true)"
case "$PUBLIC_TABLES" in
  '' | *[!0-9]*)
    log_error заливка "база ${DB_NAME} не отвечает или её нет, ответ '${PUBLIC_TABLES}' — ничего не изменено"
    exit 1
    ;;
esac
if [ "$PUBLIC_TABLES" -ne 0 ]; then
  log_error заливка "в public базы ${DB_NAME} уже ${PUBLIC_TABLES} таблиц — заливка отменена, ничего не изменено"
  exit 1
fi

DUMP_SIZE="$(wc -c < "$DUMP_FILE" | tr -d '[:space:]')"
log_info заливка "${DUMP_FILE} (${DUMP_SIZE} б) → public базы ${DB_NAME}, стек ${COMPOSE_FILE}"

# `--single-transaction`: заливка, упавшая посередине, не оставляет половины схемы — повторный
# запуск иначе упёрся бы в проверку выше, а разбирать остатки пришлось бы руками.
# `--no-owner --no-privileges`: владельцы и права старой базы к пользователю контейнера
# отношения не имеют. `--schema public` — см. шапку.
if ! compose exec -T postgres sh -c \
     'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --no-owner --no-privileges --schema public --single-transaction -U "$POSTGRES_USER" -d "$1"' \
     sh "$DB_NAME" < "$DUMP_FILE"; then
  log_error заливка "pg_restore не прошёл — транзакция откатилась, public базы ${DB_NAME} пуста"
  exit 1
fi

# Итог — по базе, а не по коду возврата: строка должна говорить, что именно легло.
PUBLIC_TABLES="$(query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" | tr -d '[:space:]')"
DRIVERS="$(query 'SELECT count(*) FROM public."Drivers"' | tr -d '[:space:]')"
XB_TABLES="$(query "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'xb'" | tr -d '[:space:]')"
log_info итог "public базы ${DB_NAME}: таблиц ${PUBLIC_TABLES}, записей Drivers ${DRIVERS} · таблиц xb ${XB_TABLES}"

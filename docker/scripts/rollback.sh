#!/usr/bin/env bash
# Откат прода на последний годный образ или на явный short-SHA.
# Парный к deploy-manual.sh: тот же каталог, обратное направление.
# Forward-only: откатывается только образ, база не трогается.
# Использование: bash docker/scripts/rollback.sh [SHA]
# SHA — явный short-SHA; если не задан, читается из файла последнего годного образа.
set -Eeuo pipefail

# Общая с deploy-manual.sh часть: журнал (_log.sh), пути машины, чтение последнего годного тега
# и запись IMAGE_TAG в .env. Путь считается от расположения самого скрипта, а не от текущего
# каталога: ниже идёт `cd` в каталог выката, да и вызывать скрипт можно откуда угодно.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_log.sh
source "${SCRIPT_DIR}/_log.sh"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

# Подсказка по вызову — до перехода в каталог выката, которого на машине разработчика нет.
# Идёт как есть, мимо формата журнала: адресована человеку у терминала прямо сейчас.
case "${1:-}" in
  -h | --help)
    cat <<USAGE
rollback.sh — откат прода на предыдущий образ. Базу не трогает (forward-only).

  bash docker/scripts/rollback.sh [SHA]
  make prod-rollback [sha=<short-sha>]

  SHA — тег образа; если не задан, берётся из ${LAST_GOOD_FILE}.

  Каталог выката: ${DEPLOY_DIR}
  Образ:          ${IMAGE_BASE}:<sha>

Откат образа не отменяет применённую миграцию. Если причина сбоя в схеме базы —
восстановление из дампа перед миграцией, порядок в docker/DEPLOY-MANUAL.md.
USAGE
    exit 0
    ;;
esac

# Каталог выката проверяется отдельной строкой, а не молчаливым `cd` под `set -e`: откат
# зовут в аварии, и обрыв без строки журнала здесь дороже всего.
if ! cd "$DEPLOY_DIR"; then
  log_error откат "каталог выката ${DEPLOY_DIR} недоступен — откат не начинался"
  exit 1
fi

# Тег отката: явный аргумент или последний годный.
ROLLBACK_TAG=""
if [ -n "${1:-}" ]; then
  ROLLBACK_TAG="$1"
  log_info откат "тег из аргумента: ${ROLLBACK_TAG}"
else
  ROLLBACK_TAG="$(read_last_good_tag)"
  if [ -z "$ROLLBACK_TAG" ]; then
    log_error откат "тег не передан, файл последнего годного образа пуст или не найден"
    # Подсказки по вызову — не журнал: они адресованы человеку у терминала прямо сейчас,
    # поэтому идут как есть, мимо формата строки.
    echo "Ожидался: ${LAST_GOOD_FILE}" >&2
    echo "Укажите тег явно: bash docker/scripts/rollback.sh <sha>" >&2
    echo "Что лежит на машине: docker image ls ${IMAGE_BASE}" >&2
    exit 1
  fi
  log_info откат "тег из ${LAST_GOOD_FILE}: ${ROLLBACK_TAG}"
fi

log_info откат "откат → ${IMAGE_BASE}:${ROLLBACK_TAG}"

# Образ должен лежать на машине: реестра у проекта нет, скачать нечего и неоткуда.
if ! docker image inspect "${IMAGE_BASE}:${ROLLBACK_TAG}" > /dev/null 2>&1; then
  log_error откат "образ ${IMAGE_BASE}:${ROLLBACK_TAG} не найден на машине — откат остановлен"
  echo "Что лежит на машине: docker image ls ${IMAGE_BASE}" >&2
  echo "Если нужного образа нет, его собирает выкат на нужную ссылку:" >&2
  echo "  make prod-deploy ref=<коммит>" >&2
  exit 1
fi

# Поднять стек на целевом образе.
log_info подъём "compose up -d, IMAGE_TAG=${ROLLBACK_TAG}"
IMAGE_TAG="$ROLLBACK_TAG" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Проверка готовности отката — 3 попытки: образ уже работал на этой машине, и долгий прогрев
# первого развёртывания здесь не при чём.
log_info готовность "проверка /api/ready, попыток 3"
for attempt in 1 2 3; do
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app curl -sf -o /dev/null http://localhost:3000/api/ready; then
    log_info готовность "получена с попытки ${attempt}"
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    log_error готовность "не получена за 3 попытки — откат остановлен"
    exit 1
  fi
  log_warn готовность "не получена, попытка ${attempt}/3, пауза $((10 * attempt)) с"
  sleep $((10 * attempt))
done

# Записать тег отката в серверный .env (функция — в _common.sh) — иначе файл продолжит
# указывать на неисправную версию, и ручной `make prod-up` вернул бы её обратно.
# Неудача записи откат не отменяет — образ уже поднят и проверен.
write_image_tag_to_env "$ROLLBACK_TAG" || log_warn версия "запись IMAGE_TAG в ${ENV_FILE} не отработала"

# Файл последнего годного образа откат не переписывает намеренно: там лежит версия, которая
# работала, — и это как раз та, на которую откат только что встал. Записать сюда что-то
# по итогу отката значило бы объявить годным образ, о котором известно только, что он поднялся.
log_info итог "откат завершён на ${ROLLBACK_TAG}"
log_info итог "база не изменена, откат только образа"

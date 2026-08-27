#!/usr/bin/env python3
"""
Выгрузка заказов парка за последние 7 суток по времени завершения.

Только чтение. В базу не пишет, ничего в парке не меняет.
Результат — файл _reference/fleet-api/dumps/orders-YYYY-MM-DD.jsonl,
по заказу в строке, ровно как его отдал API, плюс .meta.json со сводкой
об обходе.

Окно строится в UTC: API отдаёт и фильтрует время в UTC, подстановка
местного времени сдвинула бы выборку на пять часов.

Выгрузка возобновляемая: страницы копятся в .part.jsonl, курсор пагинации —
в .checkpoint.json рядом. При продолжении окно берётся из чекпоинта, а не
пересчитывается от текущего момента: иначе курсор указывал бы в одну выборку,
а фильтр описывал другую.

Выгрузка содержит адреса и маршруты и в репозиторий не коммитится:
каталог dumps/ закрыт в .gitignore.

Запуск из корня репозитория:
    python3 scripts/export-orders.py [стартовая пауза в секундах] [--restart]
"""

import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import (MAX_PAUSE, UTC, FleetClient, LimitExhausted, ResumableDump,
                          iso_utc, parse_export_args)

PAGE_SIZE = 500             # максимум, разрешённый документацией для этого метода
WINDOW_DAYS = 7
PATH = "/v1/parks/orders/list"
BASE_NAME = "orders"
MAX_PAGES = 2000            # предохранитель от бесконечной пагинации


def build_body(park_id, ended_from, ended_to, cursor):
    body = {
        "limit": PAGE_SIZE,
        "query": {"park": {"id": park_id, "order": {
            "ended_at": {"from": ended_from, "to": ended_to},
        }}},
    }
    if cursor:
        body["cursor"] = cursor
    return body


def order_id(record):
    return record.get("id")


def main():
    arguments = parse_export_args("Выгрузка заказов парка за 7 суток")
    client = FleetClient(arguments.pause)
    dump = ResumableDump(BASE_NAME, order_id, restart=arguments.restart)

    if dump.resumed and dump.context.get("ended_at_from"):
        ended_from = dump.context["ended_at_from"]
        ended_to = dump.context["ended_at_to"]
    else:
        now = datetime.now(UTC)
        ended_from, ended_to = iso_utc(now - timedelta(days=WINDOW_DAYS)), iso_utc(now)
    dump.context = {
        "page_size": PAGE_SIZE,
        "window_days": WINDOW_DAYS,
        "ended_at_from": ended_from,
        "ended_at_to": ended_to,
    }

    print(f"\nВыгрузка заказов — {dump.stamp}")
    print(f"Парк: {client.park_id[:8]}…  Окно по ended_at: {ended_from} … {ended_to}")
    print(f"Страница: {PAGE_SIZE}")
    print(f"Пауза: с {client.start_pause:g} c, растёт до {MAX_PAUSE:.0f} c "
          "на отказах по лимиту")

    position = dump.position or {}
    cursor = position.get("cursor")
    pages = position.get("pages", 0)
    if dump.resumed:
        print(f"Продолжаю прошлый обход: в выгрузке уже {dump.records} заказов, "
              f"страниц пройдено {pages}\n")
    else:
        print("Обход с нуля\n")

    interrupted = None
    exhausted = False

    try:
        while pages < MAX_PAGES:
            payload, seconds = client.post(
                PATH, build_body(client.park_id, ended_from, ended_to, cursor),
                f"заказы, страница {pages + 1}")

            orders = payload.get("orders", [])
            cursor = payload.get("cursor")
            pages += 1
            # Курсор без заказов означает конец выборки: следующая страница пуста.
            exhausted = not cursor or not orders

            dump.write_page(orders, {"cursor": cursor, "pages": pages}, client.stats())
            print(f"   страница {pages:>4} → получено {len(orders):>4} за {seconds:>4.2f} c, "
                  f"в выгрузке {dump.records}")

            if exhausted:
                break
        else:
            print(f"\nВНИМАНИЕ: сработал предохранитель на {MAX_PAGES} страницах — "
                  "выгрузка может быть неполной")
    except LimitExhausted as error:
        interrupted = error
    except BaseException:
        dump.keep(client.stats())
        raise

    if interrupted:
        dump.keep(client.stats())
        print(f"\nОстановка: «{interrupted.description}» не прошла за все попытки — "
              "лимит ключа не отпустил.")
        print(f"В выгрузке {dump.records} заказов, пройдено страниц {pages}. "
              "Прогресс сохранён.")
        print("Повторный запуск продолжит с этого места. Начать заново — с --restart.")
        sys.exit(1)

    meta = dump.commit(client.stats(), {"pages": pages})

    print(f"\nЗаписано заказов: {meta['records']}   страниц: {pages}")
    print(f"Различных id: {meta['distinct_ids']}   "
          f"повторов id между страницами: {meta['duplicate_ids_between_pages']}")
    print(f"Файл: {dump.dump_path}")
    print(f"\nТехника обхода: запусков {meta['runs']}, запросов {meta['requests']}, "
          f"отказов по лимиту {meta['limit_refusals']}, "
          f"ждали из-за лимита {meta['waited_seconds']:.0f} c, "
          f"всего {meta['elapsed_seconds']:.0f} c")


if __name__ == "__main__":
    main()

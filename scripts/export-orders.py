#!/usr/bin/env python3
"""
Выгрузка заказов парка за последние 7 суток по времени завершения.

Только чтение. В базу не пишет, ничего в парке не меняет.
Результат — файл _reference/fleet-api/dumps/orders-YYYY-MM-DD.jsonl,
по заказу в строке, ровно как его отдал API, плюс .meta.json со сводкой
об обходе.

Окно строится в UTC: API отдаёт и фильтрует время в UTC, подстановка
местного времени сдвинула бы выборку на пять часов.

Выгрузка содержит адреса и маршруты и в репозиторий не коммитится:
каталог dumps/ закрыт в .gitignore.

Запуск из корня репозитория:
    python3 scripts/export-orders.py [стартовая пауза в секундах]
"""

import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import UTC, DUMPS_DIR, DumpWriter, FleetClient, MAX_PAUSE, MIN_PAUSE, iso_utc

PAGE_SIZE = 500             # максимум, разрешённый документацией для этого метода
WINDOW_DAYS = 7
PATH = "/v1/parks/orders/list"
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



def parse_start_pause(argv):
    """
    Стартовая пауза задаётся аргументом, потому что подходящий темп для этого
    ключа заранее не известен и меняется от того, кто ещё его сейчас занимает.
    Меньше MIN_PAUSE не опускается.
    """
    if len(argv) > 1:
        try:
            return float(argv[1])
        except ValueError:
            sys.exit(f"первым аргументом ожидается стартовая пауза в секундах, получено «{argv[1]}»")
    return MIN_PAUSE

def main():
    client = FleetClient(parse_start_pause(sys.argv))
    now = datetime.now(UTC)
    ended_from, ended_to = iso_utc(now - timedelta(days=WINDOW_DAYS)), iso_utc(now)
    stamp = now.strftime("%Y-%m-%d")
    dump_path = os.path.join(DUMPS_DIR, f"orders-{stamp}.jsonl")
    meta_path = os.path.join(DUMPS_DIR, f"orders-{stamp}.meta.json")
    writer = DumpWriter(dump_path)

    print(f"\nВыгрузка заказов — {now:%d.%m.%Y %H:%M} UTC")
    print(f"Парк: {client.park_id[:8]}…  Окно по ended_at: {ended_from} … {ended_to}")
    print(f"Страница: {PAGE_SIZE}")
    print(f"Пауза: с {client.start_pause:g} c, растёт до {MAX_PAUSE:.0f} c "
          "на отказах по лимиту\n")

    seen_ids = set()
    duplicates = 0
    cursor = None
    pages = 0

    try:
        while pages < MAX_PAGES:
            payload, seconds = client.post(
                PATH, build_body(client.park_id, ended_from, ended_to, cursor),
                f"заказы, страница {pages + 1}")

            orders = payload.get("orders", [])
            for order in orders:
                order_id = order.get("id")
                if order_id in seen_ids:
                    duplicates += 1
                else:
                    seen_ids.add(order_id)
                writer.write(order)

            pages += 1
            print(f"   страница {pages:>4} → получено {len(orders):>4} за {seconds:>4.2f} c, "
                  f"всего {writer.written}")

            cursor = payload.get("cursor")
            # Курсор без заказов означает конец выборки: следующая страница пуста.
            if not cursor or not orders:
                break
        else:
            print(f"\nВНИМАНИЕ: сработал предохранитель на {MAX_PAGES} страницах — "
                  "выгрузка может быть неполной")
    except BaseException:
        writer.discard()
        raise

    written = writer.commit()

    meta = {
        "dump": os.path.basename(dump_path),
        "finished_at": datetime.now(UTC).isoformat(),
        "window_days": WINDOW_DAYS,
        "ended_at_from": ended_from,
        "ended_at_to": ended_to,
        "page_size": PAGE_SIZE,
        "pages": pages,
        "orders_written": written,
        "distinct_order_ids": len(seen_ids),
        "duplicate_ids_between_pages": duplicates,
        **client.stats(),
    }
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"\nЗаписано строк: {written}   страниц: {pages}")
    print(f"Различных id: {len(seen_ids)}   повторов id между страницами: {duplicates}")
    print(f"Файл: {dump_path}")
    client.print_stats("Техника обхода")


if __name__ == "__main__":
    main()

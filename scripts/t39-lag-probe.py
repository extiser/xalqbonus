#!/usr/bin/env python3
"""
T39 — замер отставания Fleet API: через сколько после `ended_at` заказ виден в выдаче.

Только чтение. В базу не пишет, в продуктовый код не идёт.

Раз в TICK_SEC запрашивает заказы всего парка с окном `ended_at` за последние
WINDOW_MIN минут и для каждого впервые увиденного завершённого заказа пишет строку
в CSV: когда увидели, что за заказ, его `ended_at` и разница.

Первый такт помечается warmup=1 и в статистику не идёт: в него попадает всё окно
разом, и лаг у этих строк фиктивный.

Прерывается Ctrl+C, при повторном запуске продолжает тот же файл.
"""

import csv
import os
import statistics
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fleet_client import UTC, FleetClient, LimitExhausted, iso_utc

PATH = "/v1/parks/orders/list"
PAGE_SIZE = 500
TICK_SEC = 30
WINDOW_MIN = 20
MAX_PAGES = 20
OUT = "_reference/analysis/t39-lag-2026-09-19.csv"
COLUMNS = ["observed_at", "order_id", "profile_id", "ended_at", "lag_sec", "warmup"]


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


def load_seen(path):
    if not os.path.exists(path):
        return set(), []
    seen, lags = set(), []
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            seen.add(row["order_id"])
            if row["warmup"] == "0":
                lags.append(float(row["lag_sec"]))
    return seen, lags


def summary(lags):
    if not lags:
        return "наблюдений пока нет"
    ordered = sorted(lags)
    p90 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.9))]
    return (f"наблюдений {len(ordered)}, медиана {statistics.median(ordered):.0f} c, "
            f"p90 {p90:.0f} c, максимум {ordered[-1]:.0f} c")


def main():
    client = FleetClient(1.5)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    seen, lags = load_seen(OUT)
    fresh_file = not os.path.exists(OUT)

    print(f"\nT39 — замер отставания Fleet API")
    print(f"Парк: {client.park_id[:8]}…  такт {TICK_SEC} c, окно {WINDOW_MIN} мин")
    print(f"Файл: {OUT}" + ("" if fresh_file else f" (продолжаю, в нём {len(seen)} заказов)"))
    print("Остановка — Ctrl+C\n")

    handle = open(OUT, "a", newline="")
    writer = csv.DictWriter(handle, fieldnames=COLUMNS)
    if fresh_file:
        writer.writeheader()
        handle.flush()

    warmup = fresh_file
    tick = 0
    try:
        while True:
            tick += 1
            started = time.time()
            now = datetime.now(UTC)
            ended_from = iso_utc(now - timedelta(minutes=WINDOW_MIN))
            ended_to = iso_utc(now + timedelta(minutes=1))

            cursor, pages, added = None, 0, 0
            while pages < MAX_PAGES:
                payload, _ = client.post(
                    PATH, build_body(client.park_id, ended_from, ended_to, cursor),
                    f"такт {tick}, страница {pages + 1}")
                orders = payload.get("orders", [])
                cursor = payload.get("cursor")
                pages += 1
                observed = datetime.now(UTC)

                for order in orders:
                    order_id = order.get("id")
                    ended_at = order.get("ended_at")
                    if not order_id or not ended_at or order.get("status") != "complete":
                        continue
                    if order_id in seen:
                        continue
                    seen.add(order_id)
                    ended = datetime.fromisoformat(ended_at.replace("Z", "+00:00"))
                    lag = (observed - ended).total_seconds()
                    writer.writerow({
                        "observed_at": iso_utc(observed),
                        "order_id": order_id,
                        "profile_id": (order.get("driver_profile") or {}).get("id", ""),
                        "ended_at": iso_utc(ended),
                        "lag_sec": f"{lag:.1f}",
                        "warmup": "1" if warmup else "0",
                    })
                    added += 1
                    if not warmup:
                        lags.append(lag)

                if not cursor or not orders:
                    break

            handle.flush()
            mark = " (прогрев, в статистику не идёт)" if warmup else ""
            print(f"такт {tick:>4} → новых {added:>3}{mark}; отказов по лимиту "
                  f"{client.limit_refusals}; {summary(lags)}")
            warmup = False

            remaining = TICK_SEC - (time.time() - started)
            if remaining > 0:
                time.sleep(remaining)
    except LimitExhausted as error:
        print(f"\nОстановка: {error}")
    except KeyboardInterrupt:
        print("\nОстановлено вручную")
    finally:
        handle.close()
        print(f"\nИтог: {summary(lags)}")
        print(f"Отказов по лимиту за прогон: {client.limit_refusals}")
        print(f"Файл: {OUT}")


if __name__ == "__main__":
    main()

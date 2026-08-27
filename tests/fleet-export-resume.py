#!/usr/bin/env python3
"""
Проверка возобновляемости выгрузок Fleet API на моке транспорта.

Ни одного запроса к API: вместо FleetClient подставляется заглушка, которая
раздаёт синтетические страницы и обрывается там, где велено. Проверяем главное —
после обрыва и повторного запуска в выгрузке ровно те же записи, что и при
непрерывном обходе: ничего не задвоилось и ничего не потерялось.

Каталог выгрузок на время прогона подменяется временным, живые dumps/
не трогаются.

Запуск из корня репозитория:
    python3 tests/fleet-export-resume.py
"""

import importlib.util
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
sys.path.insert(0, SCRIPTS)

import fleet_client
from fleet_client import LimitExhausted

PAGE = 100                  # мелкая страница, чтобы обход был из нескольких шагов

checks = []


def check(title, passed, detail=""):
    print(("OK   " if passed else "ПРОВАЛ ") + title)
    for line in detail.splitlines():
        print(f"       {line}")
    checks.append(passed)


def load_script(name, filename):
    """Имена скриптов с дефисом обычным import не берутся."""
    spec = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeClient:
    """
    Заглушка транспорта. Отдаёт страницы из подготовленного набора и падает
    LimitExhausted на странице с номером fail_on — так же, как настоящий клиент,
    когда попытки на страницу кончились.
    """

    def __init__(self, pages, fail_on=None):
        self.pages = pages
        self.fail_on = fail_on
        self.park_id = "park-under-test"
        self.start_pause = 1.5
        self.calls = 0
        self.requests = []

    def __call__(self, start_pause=None):
        return self

    def post(self, path, body, description):
        self.calls += 1
        self.requests.append(body)
        if self.fail_on is not None and self.calls >= self.fail_on:
            raise LimitExhausted(description, refusals=5, waited=75.0)
        return self.pages(body), 0.01

    def stats(self):
        return {
            "runs": 1,
            "requests": self.calls,
            "limit_refusals": 0,
            "waited_seconds": 0.0,
            "elapsed_seconds": 0.1,
            "pause_start_seconds": self.start_pause,
            "pause_final_seconds": self.start_pause,
        }


def run(module, client, argv):
    """Один запуск скрипта выгрузки. Возвращает код выхода."""
    saved_client, saved_argv = module.FleetClient, sys.argv
    module.FleetClient = client
    sys.argv = argv
    try:
        module.main()
        return 0
    except SystemExit as exit_signal:
        return exit_signal.code or 0
    finally:
        module.FleetClient, sys.argv = saved_client, saved_argv


def read_dump(path):
    return [json.loads(line) for line in open(path, encoding="utf-8") if line.strip()]


# ------------------------------------------------------------------ реестр


def registry_pages(total):
    def pages(body):
        offset, limit = body["offset"], body["limit"]
        profiles = [{"driver_profile": {"id": f"driver-{number:05d}"}}
                    for number in range(offset, min(offset + limit, total))]
        return {"total": total, "driver_profiles": profiles}
    return pages


def test_registry(dumps_dir):
    module = load_script("export_registry", "export-registry.py")
    module.PAGE_SIZE = PAGE
    total = 450
    expected = [f"driver-{number:05d}" for number in range(total)]

    # --- обрыв на третьей странице
    broken = FakeClient(registry_pages(total), fail_on=3)
    code = run(module, broken, ["export-registry.py"])
    part_path = os.path.join(dumps_dir, "driver-profiles.part.jsonl")
    checkpoint_path = os.path.join(dumps_dir, "driver-profiles.checkpoint.json")
    checkpoint = json.load(open(checkpoint_path, encoding="utf-8"))
    check("реестр: обрыв сохраняет прогресс и чекпоинт",
          code == 1 and os.path.exists(part_path) and checkpoint["position"]["offset"] == 200,
          f"код выхода {code}, в .part {len(read_dump(part_path))} записей, "
          f"чекпоинт на offset {checkpoint['position']['offset']}")

    # --- имитация падения между записью страницы и чекпоинтом
    with open(part_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps({"driver_profile": {"id": "driver-00200"}}) + "\n")
        handle.write('{"driver_profile": {"id": "driver-0020')      # оборванная строка

    # --- продолжение
    resumed = FakeClient(registry_pages(total))
    code = run(module, resumed, ["export-registry.py"])
    dump_path = os.path.join(dumps_dir, f"driver-profiles-{checkpoint['stamp']}.jsonl")
    records = read_dump(dump_path)
    identifiers = [profile["driver_profile"]["id"] for profile in records]

    check("реестр: продолжение началось с места обрыва, а не с нуля",
          resumed.requests[0]["offset"] == 200,
          f"первый запрос второго прогона — offset {resumed.requests[0]['offset']}")
    check("реестр: хвост после последнего чекпоинта отброшен",
          identifiers.count("driver-00200") == 1,
          "недописанная страница не задвоила запись driver-00200")
    check("реестр: в выгрузке ровно все записи, без потерь и повторов",
          identifiers == expected,
          f"записей {len(identifiers)}, различных {len(set(identifiers))}, "
          f"ожидалось {total}")
    check("реестр: чекпоинт и .part сняты после завершения",
          not os.path.exists(checkpoint_path) and not os.path.exists(part_path),
          f"осталось в каталоге: {sorted(os.listdir(dumps_dir))}")

    meta = json.load(open(os.path.join(dumps_dir,
                                       f"driver-profiles-{checkpoint['stamp']}.meta.json"),
                          encoding="utf-8"))
    check("реестр: техника обхода просуммирована по обоим запускам",
          meta["runs"] == 2 and meta["requests"] == broken.calls + resumed.calls,
          f"запусков {meta['runs']}, запросов {meta['requests']} "
          f"({broken.calls} + {resumed.calls})")

    # --- --restart начинает заново
    broken_again = FakeClient(registry_pages(total), fail_on=3)
    run(module, broken_again, ["export-registry.py"])
    restarted = FakeClient(registry_pages(total), fail_on=2)
    run(module, restarted, ["export-registry.py", "--restart"])
    check("реестр: --restart сбрасывает чекпоинт и идёт с нуля",
          restarted.requests[0]["offset"] == 0,
          f"первый запрос после --restart — offset {restarted.requests[0]['offset']}")


# ------------------------------------------------------------------ заказы


def orders_pages(total):
    def pages(body):
        cursor = body.get("cursor")
        start = int(cursor.split("-")[1]) if cursor else 0
        limit = body["limit"]
        orders = [{"id": f"order-{number:05d}"} for number in range(start, min(start + limit, total))]
        next_start = start + len(orders)
        return {"orders": orders,
                "cursor": f"cursor-{next_start}" if next_start < total else None}
    return pages


def test_orders(dumps_dir):
    module = load_script("export_orders", "export-orders.py")
    module.PAGE_SIZE = PAGE
    total = 350
    expected = [f"order-{number:05d}" for number in range(total)]

    broken = FakeClient(orders_pages(total), fail_on=3)
    code = run(module, broken, ["export-orders.py"])
    checkpoint_path = os.path.join(dumps_dir, "orders.checkpoint.json")
    checkpoint = json.load(open(checkpoint_path, encoding="utf-8"))
    window = (checkpoint["context"]["ended_at_from"], checkpoint["context"]["ended_at_to"])
    check("заказы: обрыв сохраняет курсор и окно",
          code == 1 and checkpoint["position"]["cursor"] == "cursor-200" and all(window),
          f"курсор {checkpoint['position']['cursor']}, окно {window[0]} … {window[1]}")

    resumed = FakeClient(orders_pages(total))
    run(module, resumed, ["export-orders.py"])
    records = read_dump(os.path.join(dumps_dir, f"orders-{checkpoint['stamp']}.jsonl"))
    identifiers = [order["id"] for order in records]

    check("заказы: продолжение пошло с сохранённого курсора",
          resumed.requests[0].get("cursor") == "cursor-200",
          f"первый запрос второго прогона — курсор {resumed.requests[0].get('cursor')}")
    check("заказы: окно взято из чекпоинта, а не пересчитано",
          (resumed.requests[0]["query"]["park"]["order"]["ended_at"]["from"],
           resumed.requests[0]["query"]["park"]["order"]["ended_at"]["to"]) == window,
          "иначе курсор указывал бы в одну выборку, а фильтр описывал другую")
    check("заказы: в выгрузке ровно все записи, без потерь и повторов",
          identifiers == expected,
          f"записей {len(identifiers)}, различных {len(set(identifiers))}, "
          f"ожидалось {total}")


# ------------------------------------------------------------------ запуск


def main():
    dumps_dir = tempfile.mkdtemp(prefix="fleet-dumps-")
    fleet_client.DUMPS_DIR = dumps_dir
    print(f"\nПроверка возобновляемости выгрузок. Каталог: {dumps_dir}")
    print("Запросов к API не делается.\n")
    try:
        test_registry(dumps_dir)
        print()
        test_orders(dumps_dir)
    finally:
        shutil.rmtree(dumps_dir, ignore_errors=True)

    failed = checks.count(False)
    print(f"\nПроверок пройдено: {len(checks) - failed} из {len(checks)}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

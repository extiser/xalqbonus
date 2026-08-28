#!/usr/bin/env python3
"""Сверка старой базы с выгрузкой Fleet API по issue #12.

Считает две разные вещи и держит их раздельно:

  часть 1 — полнота записи поездок: сколько заказов недели старый бот не записал.
            Считается только по водителям, которые есть в старой базе;
  часть 2 — охват программы: сколько из активных за неделю водителей парка
            заведены в бонусной программе.

Ключ сопоставления — `Drivers.profile_id` → `driver_profile.id`, обоснование
в `_reference/legacy/public-schema-2026-08-27.md`, §3.

Ничего никуда не пишет. Читает выгрузки из `_reference/fleet-api/dumps/`
и локальную копию старой базы через psql в сеансе
`default_transaction_read_only = on`: любая попытка записи отобьётся базой.

Запуск:
    python3 scripts/legacy-vs-api.py
"""

import collections
import csv
import io
import json
import os
import re
import statistics
import subprocess
import sys
from datetime import datetime, timedelta

ORDERS_DUMP = "_reference/fleet-api/dumps/orders-2026-08-27.jsonl"
ORDERS_META = "_reference/fleet-api/dumps/orders-2026-08-27.meta.json"
REGISTRY_DUMP = "_reference/fleet-api/dumps/driver-profiles-2026-08-27.jsonl"
REGISTRY_META = "_reference/fleet-api/dumps/driver-profiles-2026-08-27.meta.json"

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://xalqbonus:xalqbonus@localhost:5434/xalqbonus"
)

# Длина идентификатора профиля в Fleet API. Запись с другой длиной водителем
# не является: в старой базе такая одна — profile_id обрезан до 31 символа,
# в реестре парка отсутствует, car_number = 'not_found', 100 002 299 баллов.
# Разбор — `_reference/legacy/public-schema-2026-08-27.md`, §7.1.
PROFILE_ID_LENGTH = 32

CYRILLIC_TO_LATIN = {
    "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "К": "K", "М": "M",
    "О": "O", "Р": "P", "Т": "T", "У": "Y", "Х": "X", "Г": "G", "Л": "L",
    "П": "P", "Д": "D",
}


def normalize_license(value):
    """Ключ сравнения для номера ВУ: латиница, без разделителей, без префикса страны."""
    if not value:
        return ""
    upper = "".join(CYRILLIC_TO_LATIN.get(char, char) for char in value.strip().upper())
    return re.sub(r"^UZ", "", re.sub(r"[^A-Z0-9]", "", upper))


def normalize_phone(value):
    """Ключ сравнения для телефона: только цифры."""
    return re.sub(r"\D", "", value or "")


def parse_moment(value):
    """Разбирает момент времени из ISO-строки. Оба источника отдают его с зоной."""
    if not value:
        return None
    return datetime.fromisoformat(value)


def read_only_psql(query):
    """Выполняет SELECT через psql в сеансе только для чтения и отдаёт CSV-строки."""
    environment = dict(os.environ, PGOPTIONS="-c default_transaction_read_only=on")
    result = subprocess.run(
        ["psql", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True,
        text=True,
        check=True,
        env=environment,
    )
    return result.stdout


def load_json_lines(path, key_path):
    """Читает jsonl в словарь по вложенному ключу."""
    records = {}
    with open(path, encoding="utf-8") as dump:
        for line in dump:
            record = json.loads(line)
            value = record
            for step in key_path:
                value = value[step]
            records[value] = record
    return records


def load_legacy_drivers():
    """Выгружает public.Drivers: одна строка — одна учётная запись программы."""
    query = (
        'COPY (SELECT id, profile_id, license_number, phone, points FROM "Drivers") '
        "TO STDOUT CSV HEADER"
    )
    return list(csv.DictReader(io.StringIO(read_only_psql(query))))


def load_legacy_horizon():
    """Момент снятия дампа: позже него в старой базе поездок нет по построению."""
    query = 'COPY (SELECT max("updatedAt") FROM "Trips") TO STDOUT CSV'
    return parse_moment(read_only_psql(query).strip().replace(" ", "T"))


def stream_legacy_trips(order_ids, window_from, window_to):
    """Проходит public.Trips потоком и оставляет только то, что нужно для счёта.

    Полный вывод — 1.19 млн строк и 115 МБ, в память целиком не берётся:
    нужны поездки, попавшие в окно по времени завершения, и поездки, чей
    идентификатор встречается в выгрузке заказов, — остальное отбрасывается.
    """
    query = (
        'COPY (SELECT trip_id, driver_id, status, booked_at, ended_at FROM "Trips") '
        "TO STDOUT CSV HEADER"
    )
    environment = dict(os.environ, PGOPTIONS="-c default_transaction_read_only=on")
    process = subprocess.Popen(
        ["psql", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", query],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=environment,
    )

    # Поездки старой базы, чей идентификатор есть в выгрузке заказов:
    # ключ — (trip_id, driver_id), потому что trip_id в старой базе не уникален
    # и один и тот же заказ записан на обеих половинах двойника.
    known_to_api = {}
    # Поездки старой базы, завершившиеся внутри окна, — объём базы за неделю.
    inside_window = {}
    # Сырые строки того же окна: разница с дедуплицированным счётом — вклад дублей.
    raw_rows_in_window = collections.Counter()
    total_rows = 0

    for row in csv.DictReader(process.stdout):
        total_rows += 1
        trip_id = row["trip_id"]
        driver_id = int(row["driver_id"])
        ended_at = parse_moment(row["ended_at"].replace(" ", "T") or None)
        pair = (trip_id, driver_id)

        if trip_id in order_ids:
            previous = known_to_api.get(pair)
            # из копий одной поездки оставляем самую продвинутую: с временем завершения
            if previous is None or (previous["ended_at"] is None and ended_at is not None):
                known_to_api[pair] = {"status": row["status"], "ended_at": ended_at}

        if ended_at is not None and window_from <= ended_at <= window_to:
            inside_window[pair] = {"status": row["status"], "ended_at": ended_at}
            raw_rows_in_window[pair] += 1

    process.stdout.close()
    process.wait()
    if process.returncode != 0:
        sys.exit(process.stderr.read())

    return known_to_api, inside_window, raw_rows_in_window, total_rows


class PersonGroups:
    """Склейка учётных записей в людей: сначала общий profile_id, затем номер ВУ."""

    def __init__(self):
        self.parent = {}

    def add(self, item):
        self.parent.setdefault(item, item)

    def find(self, item):
        root = item
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[item] != root:
            self.parent[item], item = root, self.parent[item]
        return root

    def union(self, left, right):
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root

    def groups(self):
        collected = collections.defaultdict(list)
        for item in self.parent:
            collected[self.find(item)].append(item)
        return list(collected.values())


def build_persons(drivers, registry):
    """Возвращает группы записей старой базы, каждая группа — один человек."""
    groups = PersonGroups()
    by_profile = collections.defaultdict(list)
    by_license = collections.defaultdict(list)

    for driver in drivers:
        groups.add(driver["id"])
        by_profile[driver["profile_id"]].append(driver["id"])
        record = registry.get(driver["profile_id"])
        if record:
            license_key = normalize_license(
                (record["driver_profile"].get("driver_license") or {}).get("normalized_number")
            )
            if license_key:
                by_license[license_key].append(driver["id"])

    for shared in list(by_profile.values()) + list(by_license.values()):
        for other in shared[1:]:
            groups.union(shared[0], other)

    return groups.groups()


def percent(part, whole):
    return f"{part / whole:.2%}" if whole else "—"


def mask(value):
    """Маскирует идентификатор для отчёта: видны только концы."""
    return f"{value[:2]}***{value[-2:]}" if value and len(value) > 4 else "***"


def report_header(title):
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def main():
    for path in (ORDERS_DUMP, REGISTRY_DUMP):
        if not os.path.exists(path):
            sys.exit(f"нет выгрузки: {path}")

    orders_meta = json.load(open(ORDERS_META, encoding="utf-8"))
    registry_meta = json.load(open(REGISTRY_META, encoding="utf-8"))
    work_rules = registry_meta["work_rules"]

    window_from = parse_moment(orders_meta["ended_at_from"])
    window_to = parse_moment(orders_meta["ended_at_to"])

    registry = load_json_lines(REGISTRY_DUMP, ["driver_profile", "id"])
    orders = [json.loads(line) for line in open(ORDERS_DUMP, encoding="utf-8")]
    drivers = load_legacy_drivers()
    horizon = load_legacy_horizon()

    report_header("Исходные данные")
    print(f"заказов в выгрузке API      : {len(orders)}")
    print(f"профилей в реестре парка    : {len(registry)}")
    print(f"записей в старой базе       : {len(drivers)}")
    print(f"окно выгрузки по ended_at   : {window_from.isoformat()} … {window_to.isoformat()}")
    print(f"горизонт старой базы        : {horizon.isoformat()} (max Trips.updatedAt)")
    print(f"окно обрезано горизонтом на : {window_to - horizon}")

    # --- проверка часового пояса ---------------------------------------------
    #
    # Trips.ended_at объявлен timestamptz, но объявлению верить нельзя: старый бот
    # мог писать местное время как UTC, и тогда окно съедет на пять часов.
    # Проверяется данными: у заказов, найденных с обеих сторон, время завершения
    # обязано совпадать.
    order_ids = {order["id"] for order in orders}
    orders_by_id = {order["id"]: order for order in orders}

    known_to_api, inside_window, raw_rows_in_window, total_trip_rows = stream_legacy_trips(
        order_ids, window_from, window_to
    )

    offsets = collections.Counter()
    for (trip_id, _), trip in known_to_api.items():
        api_ended_at = parse_moment(orders_by_id[trip_id].get("ended_at"))
        if trip["ended_at"] and api_ended_at:
            offsets[round((trip["ended_at"] - api_ended_at).total_seconds())] += 1

    report_header("Проверка часового пояса")
    print(f"строк в public.Trips        : {total_trip_rows}")
    print(f"пар с временем на обеих сторонах: {sum(offsets.values())}")
    for offset, count in offsets.most_common(5):
        print(f"  расхождение {offset:+6} сек : {count}")

    # --- подмножество водителей ----------------------------------------------
    legacy_by_profile = collections.defaultdict(list)
    phantoms = []
    for driver in drivers:
        is_driver = (
            len(driver["profile_id"]) == PROFILE_ID_LENGTH and driver["profile_id"] in registry
        )
        if not is_driver:
            phantoms.append(driver)
            continue
        legacy_by_profile[driver["profile_id"]].append(int(driver["id"]))

    legacy_driver_ids = {driver_id for ids in legacy_by_profile.values() for driver_id in ids}

    report_header("Часть 1 — полнота записи поездок")
    print(f"записей исключено как «не водитель»: {len(phantoms)}")
    print(f"учётных записей в счёте            : {len(legacy_driver_ids)}")
    print(f"профилей парка за ними             : {len(legacy_by_profile)}")

    # Сравнение ведётся только по водителям, которые есть в старой базе,
    # и только внутри окна, обрезанного горизонтом дампа: позже горизонта
    # старая база пуста по построению, и весь объём API там ушёл бы в «потери».
    effective_to = min(window_to, horizon)
    # Опрос старого бота идёт часовым кроном, треть парка каждый час получает
    # отказ по лимиту и обслуживается следующим проходом. Поэтому последние часы
    # перед снятием дампа недозаписаны не из-за поломки, а из-за лага опроса —
    # для «осевшего» окна они отрезаются.
    POLL_LAG_HOURS = 3
    settled_to = horizon.replace(minute=0, second=0, microsecond=0) - timedelta(
        hours=POLL_LAG_HOURS
    )

    # обратный индекс: заказ → учётные записи старой базы, на которых он записан
    owners_of_trip = collections.defaultdict(set)
    for trip_id, driver_id in known_to_api:
        owners_of_trip[trip_id].add(driver_id)

    def measure(cut_to):
        """Считает объёмы и разложение недостачи на окне [window_from, cut_to]."""
        subset = [
            order
            for order in orders
            if order["driver_profile"]["id"] in legacy_by_profile
            and (ended := parse_moment(order.get("ended_at")))
            and window_from <= ended <= cut_to
        ]
        subset_ids = {order["id"] for order in subset}

        # Объём старой базы на том же подмножестве водителей и в том же окне,
        # дедуплицированный по (trip_id, driver_id): trip_id в базе не уникален.
        legacy = {
            pair: trip
            for pair, trip in inside_window.items()
            if pair[1] in legacy_driver_ids and trip["ended_at"] <= cut_to
        }

        recorded, stuck, missing, foreign = [], [], [], []
        for order in subset:
            owners = legacy_by_profile[order["driver_profile"]["id"]]
            copies = [
                known_to_api[(order["id"], owner)]
                for owner in owners
                if (order["id"], owner) in known_to_api
            ]
            if not copies:
                # заказа нет ни на одной учётной записи этого профиля
                if owners_of_trip[order["id"]] & legacy_driver_ids:
                    foreign.append(order)
                else:
                    missing.append(order)
            elif all(copy["ended_at"] is None for copy in copies):
                stuck.append(order)
            else:
                recorded.append(order)

        return {
            "cut_to": cut_to,
            "subset": subset,
            "legacy": legacy,
            "legacy_trip_ids": {pair[0] for pair in legacy},
            "raw_rows": sum(raw_rows_in_window[pair] for pair in legacy),
            "recorded": recorded,
            "stuck": stuck,
            "missing": missing,
            "foreign": foreign,
            "orphans": {pair[0] for pair in legacy if pair[0] not in subset_ids},
        }

    full = measure(window_to)
    truncated = measure(effective_to)
    settled = measure(settled_to)

    print("\nобъём API по водителям программы в трёх окнах")
    print(f"  окно API целиком, до {window_to.isoformat()}   : {len(full['subset'])}")
    print(f"  обрезано горизонтом, до {effective_to.isoformat()} : {len(truncated['subset'])}")
    print(f"  осевшее (минус {POLL_LAG_HOURS} ч лага), до {settled_to.isoformat()}   : {len(settled['subset'])}")

    for title, measurement in (
        ("окно, обрезанное горизонтом дампа", truncated),
        (f"осевшее окно (минус {POLL_LAG_HOURS} ч лага опроса)", settled),
    ):
        subset = measurement["subset"]
        legacy = measurement["legacy"]
        difference = len(subset) - len(measurement["legacy_trip_ids"])
        print(f"\n— {title}: {window_from.isoformat()} … {measurement['cut_to'].isoformat()}")
        print(f"  заказов по API                     : {len(subset)}")
        print(f"  строк в старой базе до дедупа      : {measurement['raw_rows']}")
        print(f"  поездок в старой базе (дедуп)      : {len(legacy)}")
        print(f"  различных заказов в старой базе    : {len(measurement['legacy_trip_ids'])}")
        print(f"  разница, штук                      : {difference}")
        print(f"  разница, % от API                  : {percent(difference, len(subset))}")
        print(f"  записаны и завершены в базе        : {len(measurement['recorded'])}"
              f"  ({percent(len(measurement['recorded']), len(subset))})")
        print(f"  записаны, но зависли без ended_at  : {len(measurement['stuck'])}"
              f"  ({percent(len(measurement['stuck']), len(subset))})")
        print(f"  записаны на чужой учётной записи   : {len(measurement['foreign'])}")
        print(f"  не записаны вовсе                  : {len(measurement['missing'])}"
              f"  ({percent(len(measurement['missing']), len(subset))})")
        print(f"  записи базы без пары в API         : {len(measurement['orphans'])}")

        api_cancelled = sum(1 for order in subset if order["status"] == "cancelled")
        legacy_cancelled = sum(1 for trip in legacy.values() if trip["status"] == "cancelled")
        print(f"  отменённых по API                  : {api_cancelled}"
              f" ({percent(api_cancelled, len(subset))})")
        print(f"  отменённых в старой базе           : {legacy_cancelled}"
              f" ({percent(legacy_cancelled, len(legacy))})")

        completed_subset = [order for order in subset if order["status"] != "cancelled"]
        completed_legacy = {
            pair[0] for pair, trip in legacy.items() if trip["status"] != "cancelled"
        }
        print(f"  без отменённых: API {len(completed_subset)}, база {len(completed_legacy)}, "
              f"разница {len(completed_subset) - len(completed_legacy)}"
              f" ({percent(len(completed_subset) - len(completed_legacy), len(completed_subset))})")

        missing_cancelled = sum(1 for order in measurement["missing"] if order["status"] == "cancelled")
        stuck_cancelled = sum(1 for order in measurement["stuck"] if order["status"] == "cancelled")
        print(f"  из «не записаны вовсе» отменённых  : {missing_cancelled}"
              f" ({percent(missing_cancelled, len(measurement['missing']))})")
        print(f"  из «зависших» отменённых по API    : {stuck_cancelled}"
              f" ({percent(stuck_cancelled, len(measurement['stuck']))})")

    subset = truncated["subset"]
    recorded, stuck, missing_entirely = truncated["recorded"], truncated["stuck"], truncated["missing"]
    recorded_outside_window = truncated["foreign"]

    # --- по водителям: недостача ровным слоем или у отдельных записей ----------
    orders_per_driver = collections.Counter(order["driver_profile"]["id"] for order in subset)
    lost_per_driver = collections.Counter(
        order["driver_profile"]["id"] for order in stuck + missing_entirely
    )
    print(f"\nнедостача по водителям, окно до {effective_to.isoformat()}")
    print(f"  водителей программы с заказами за неделю : {len(orders_per_driver)}")
    print(f"  из них хотя бы с одной потерянной        : {len(lost_per_driver)}"
          f" ({percent(len(lost_per_driver), len(orders_per_driver))})")
    shares = sorted(
        lost_per_driver[profile_id] / orders_per_driver[profile_id]
        for profile_id in orders_per_driver
    )
    print(f"  медианная доля потерь у водителя         : {statistics.median(shares):.2%}")
    print(f"  водителей, у кого потеряно больше трети  : "
          f"{sum(1 for share in shares if share > 1 / 3)}")
    print(f"  водителей без единой потери              : "
          f"{sum(1 for share in shares if share == 0)}")

    # --- распределение по дням -------------------------------------------------
    by_day = collections.defaultdict(lambda: {"api": 0, "recorded": 0, "stuck": 0, "missing": 0})
    for group, key in ((recorded, "recorded"), (stuck, "stuck"), (missing_entirely, "missing")):
        for order in group:
            day = parse_moment(order["ended_at"]).date().isoformat()
            by_day[day][key] += 1
            by_day[day]["api"] += 1
    for order in recorded_outside_window:
        by_day[parse_moment(order["ended_at"]).date().isoformat()]["api"] += 1

    print("\nраспределение по дням окна (UTC)")
    print(f"  {'день':12} {'API':>6} {'записано':>9} {'зависло':>8} {'нет вовсе':>10} {'недостача':>10}")
    for day in sorted(by_day):
        counts = by_day[day]
        shortfall = counts["stuck"] + counts["missing"]
        print(f"  {day:12} {counts['api']:6} {counts['recorded']:9} {counts['stuck']:8} "
              f"{counts['missing']:10} {percent(shortfall, counts['api']):>10}")

    # --- почасовой хвост перед горизонтом -------------------------------------
    print("\nпоследние 12 часов перед горизонтом дампа (лаг опроса виден здесь)")
    print(f"  {'час UTC':17} {'API':>6} {'записано':>9} {'зависло':>8} {'нет вовсе':>10}")
    tail_from = horizon - timedelta(hours=12)
    by_hour = collections.defaultdict(lambda: {"api": 0, "recorded": 0, "stuck": 0, "missing": 0})
    for group, key in ((recorded, "recorded"), (stuck, "stuck"), (missing_entirely, "missing")):
        for order in group:
            ended = parse_moment(order["ended_at"])
            if ended >= tail_from:
                hour = ended.strftime("%Y-%m-%d %H:00")
                by_hour[hour][key] += 1
                by_hour[hour]["api"] += 1
    for hour in sorted(by_hour):
        counts = by_hour[hour]
        print(f"  {hour:17} {counts['api']:6} {counts['recorded']:9} {counts['stuck']:8} {counts['missing']:10}")

    missing_by_driver = collections.Counter(
        order["driver_profile"]["id"] for order in missing_entirely
    )
    stuck_by_driver = collections.Counter(order["driver_profile"]["id"] for order in stuck)
    top_missing = sum(count for _, count in missing_by_driver.most_common(10))
    print(f"\nконцентрация двух вёдер недостачи по водителям")
    print(f"  «нет вовсе» {len(missing_entirely)} заказов у {len(missing_by_driver)} водителей;"
          f" на первую десятку приходится {top_missing}"
          f" ({percent(top_missing, len(missing_entirely))})")
    print(f"  «зависло»   {len(stuck)} заказов у {len(stuck_by_driver)} водителей;"
          f" на первую десятку приходится "
          f"{sum(count for _, count in stuck_by_driver.most_common(10))}"
          f" ({percent(sum(count for _, count in stuck_by_driver.most_common(10)), len(stuck))})")

    print("\nпримеры заказов, не записанных вовсе (маскировано)")
    print(f"  {'заказ':12} {'профиль':12} {'статус API':12} завершён")
    for order in sorted(missing_entirely, key=lambda item: item["ended_at"])[:8]:
        print(f"  {mask(order['id']):12} {mask(order['driver_profile']['id']):12} "
              f"{order['status']:12} {order['ended_at']}")

    # ======================================================================
    report_header("Часть 2 — охват программы")

    active_profiles = collections.Counter(order["driver_profile"]["id"] for order in orders)
    print(f"водителей с хотя бы одним заказом за неделю: {len(active_profiles)}")

    phantom_ids = {driver["id"] for driver in phantoms}
    persons = build_persons(
        [driver for driver in drivers if driver["id"] not in phantom_ids], registry
    )
    driver_by_id = {int(d["id"]): d for d in drivers}
    person_of_profile = {}
    for index, group in enumerate(persons):
        for driver_id in group:
            person_of_profile.setdefault(driver_by_id[int(driver_id)]["profile_id"], index)

    print(f"учётных записей программы (без фантома)   : {len(drivers) - len(phantoms)}")
    print(f"их же как людей, после склейки двойников  : {len(persons)}")
    print(f"склеенных пар                             : "
          f"{sum(1 for group in persons if len(group) > 1)}")

    # Ключ реестрового ВУ для человека — им ловятся переоформленные профили.
    license_of_person = collections.defaultdict(set)
    for index, group in enumerate(persons):
        for driver_id in group:
            record = registry.get(driver_by_id[int(driver_id)]["profile_id"])
            if record:
                key = normalize_license(
                    (record["driver_profile"].get("driver_license") or {}).get("normalized_number")
                )
                if key:
                    license_of_person[key].add(index)

    covered_direct = {}
    covered_via_license = {}
    uncovered = {}
    for profile_id, trips in active_profiles.items():
        if profile_id in person_of_profile:
            covered_direct[profile_id] = trips
            continue
        record = registry.get(profile_id)
        key = normalize_license(
            ((record or {}).get("driver_profile", {}).get("driver_license") or {}).get("normalized_number")
        ) if record else ""
        if key and key in license_of_person:
            covered_via_license[profile_id] = trips
        else:
            uncovered[profile_id] = trips

    print(f"\nиз {len(active_profiles)} активных водителей парка")
    print(f"  есть в программе по profile_id            : {len(covered_direct)}"
          f" ({percent(len(covered_direct), len(active_profiles))})")
    print(f"  есть в программе, но под другим профилем  : {len(covered_via_license)}"
          f"  (переоформление в парке, в резерв не идут)")
    print(f"  в программе нет                           : {len(uncovered)}"
          f" ({percent(len(uncovered), len(active_profiles))})")

    # Встречная проверка резерва двумя независимыми полями. Если активный водитель
    # на самом деле в программе, но под другим профилем, его телефон или номер ВУ
    # из реестра совпадёт с тем, что записано в старой базе. Такие вычитаются
    # из резерва отдельной строкой: это грязь ключа, а не непокрытый человек.
    legacy_phones = {normalize_phone(driver["phone"]) for driver in drivers}
    legacy_licenses = set()
    for driver in drivers:
        key = normalize_license(driver["license_number"])
        if key:
            legacy_licenses.add(key)

    found_by_phone, found_by_legacy_license = [], []
    for profile_id in list(uncovered):
        profile = (registry.get(profile_id) or {}).get("driver_profile", {})
        phones = {normalize_phone(phone) for phone in profile.get("phones") or []}
        license_key = normalize_license(
            (profile.get("driver_license") or {}).get("normalized_number")
        )
        if phones & legacy_phones:
            found_by_phone.append(profile_id)
        elif license_key and license_key in legacy_licenses:
            found_by_legacy_license.append(profile_id)

    print("\nвстречная проверка резерва независимыми полями")
    print(f"  нашлись по телефону из реестра            : {len(found_by_phone)}")
    print(f"  нашлись по номеру ВУ, записанному в базе  : {len(found_by_legacy_license)}")
    print(f"  резерв после вычета грязи ключа           : "
          f"{len(uncovered) - len(found_by_phone) - len(found_by_legacy_license)}")

    if uncovered:
        counts = sorted(uncovered.values())
        print(f"\nрезерв — активные вне программы: {len(uncovered)} человек")
        print(f"  заказов за неделю всего : {sum(counts)}")
        print(f"  медиана на человека     : {statistics.median(counts)}")
        print(f"  минимум / максимум      : {counts[0]} / {counts[-1]}")
        completed_by_profile = collections.Counter(
            order["driver_profile"]["id"]
            for order in orders
            if order["status"] != "cancelled" and order["driver_profile"]["id"] in uncovered
        )
        completed_counts = sorted(completed_by_profile.values())
        print(f"  без отменённых: заказов {sum(completed_counts)}, "
              f"медиана {statistics.median(completed_counts) if completed_counts else 0}")

        print("\n  примеры резерва — крупнейшие по числу заказов (маскировано)")
        print(f"    {'профиль':12} {'заказов':>8} {'без отмен':>10}  условие работы")
        for profile_id, count in sorted(uncovered.items(), key=lambda item: (-item[1], item[0]))[:10]:
            rule_id = registry[profile_id]["driver_profile"].get("work_rule_id") or "—"
            print(f"    {mask(profile_id):12} {count:8} {completed_by_profile[profile_id]:10}"
                  f"  {work_rules.get(rule_id, rule_id)}")

    # Тот же счёт по участникам программы — резерв без этой рамки не читается:
    # 26 заказов в неделю много или мало, видно только рядом с медианой программы.
    covered_counts = sorted(covered_direct.values())
    covered_completed = collections.Counter(
        order["driver_profile"]["id"]
        for order in orders
        if order["status"] != "cancelled" and order["driver_profile"]["id"] in covered_direct
    )
    print(f"\nдля сравнения — активные участники программы: {len(covered_counts)} человек")
    print(f"  заказов за неделю всего : {sum(covered_counts)}")
    print(f"  медиана на человека     : {statistics.median(covered_counts)}")
    print(f"  минимум / максимум      : {covered_counts[0]} / {covered_counts[-1]}")
    print(f"  без отменённых: заказов {sum(covered_completed.values())}, "
          f"медиана {statistics.median([covered_completed[p] for p in covered_direct])}")

    active_persons = {person_of_profile[profile_id] for profile_id in covered_direct}
    print(f"\nиз {len(persons)} человек в программе")
    print(f"  активны за неделю по API : {len(active_persons)}"
          f" ({percent(len(active_persons), len(persons))})")
    print(f"  ни одного заказа         : {len(persons) - len(active_persons)}"
          f" ({percent(len(persons) - len(active_persons), len(persons))})")

    # --- условия работы --------------------------------------------------------
    rules_registered = collections.Counter()
    rules_reserve = collections.Counter()
    for profile_id in active_profiles:
        record = registry.get(profile_id)
        rule_id = (record or {}).get("driver_profile", {}).get("work_rule_id") or "—"
        target = rules_reserve if profile_id in uncovered else rules_registered
        target[rule_id] += 1

    all_rules = set(rules_registered) | set(rules_reserve)
    print(f"\nусловия работы среди активных: {len(all_rules)} из {len(work_rules)} в парке")
    print(f"  {'условие':40} {'в программе':>12} {'вне':>5} {'всего':>7}")
    for rule_id in sorted(
        all_rules, key=lambda r: (-(rules_registered[r] + rules_reserve[r]), work_rules.get(r, r))
    ):
        title = work_rules.get(rule_id, rule_id)[:38]
        total = rules_registered[rule_id] + rules_reserve[rule_id]
        print(f"  {title:40} {rules_registered[rule_id]:12} {rules_reserve[rule_id]:5} {total:7}")

    # --- статусы работы активных ------------------------------------------------
    statuses = collections.Counter(
        (registry.get(profile_id) or {}).get("driver_profile", {}).get("work_status", "—")
        for profile_id in active_profiles
    )
    print(f"\nwork_status активных за неделю: {dict(statuses)}")


if __name__ == "__main__":
    main()

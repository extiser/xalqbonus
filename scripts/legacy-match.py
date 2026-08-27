#!/usr/bin/env python3
"""Сопоставление записей старой базы (public.Drivers) с реестром парка из Fleet API.

Отвечает на вопрос issue #6: по какому полю старую запись водителя можно связать
с профилем парка. Считает долю однозначных попаданий по каждому кандидату в ключ
и ищет двойные учётные записи.

Ничего никуда не пишет. Читает:
  - выгрузку реестра  _reference/fleet-api/dumps/driver-profiles-*.jsonl
  - локальную копию старой базы через psql (только SELECT)

Запуск:
    python3 scripts/legacy-match.py
"""

import collections
import csv
import io
import json
import os
import re
import subprocess
import sys

DUMP = "_reference/fleet-api/dumps/driver-profiles-2026-08-27.jsonl"
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://xalqbonus:xalqbonus@localhost:5434/xalqbonus"
)

# Кириллические буквы в номерах ВУ визуально совпадают с латинскими и приходят
# вперемешку — приводим к латинице, иначе один и тот же номер даёт два ключа.
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
    return re.sub(r"\D", "", value or "")


def load_registry(path):
    """Читает выгрузку реестра в словарь profile_id → запись."""
    registry = {}
    with open(path, encoding="utf-8") as dump:
        for line in dump:
            record = json.loads(line)
            registry[record["driver_profile"]["id"]] = record
    return registry


def load_legacy_drivers():
    """Выгружает public.Drivers через psql в режиме только для чтения."""
    query = (
        "COPY (SELECT id, profile_id, license_number, phone, callsign, "
        "working_status, chat_id, points, language, \"createdAt\" "
        "FROM \"Drivers\") TO STDOUT CSV HEADER"
    )
    # режим только для чтения ставим на сеанс: любой UPDATE/INSERT отобьётся базой
    environment = dict(os.environ, PGOPTIONS="-c default_transaction_read_only=on")
    result = subprocess.run(
        ["psql", DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True,
        text=True,
        check=True,
        env=environment,
    )
    return list(csv.DictReader(io.StringIO(result.stdout)))


def build_indexes(registry):
    """Обратные индексы реестра по каждому кандидату в ключ сопоставления."""
    by_license_raw = collections.defaultdict(set)
    by_license_normalized = collections.defaultdict(set)
    by_phone = collections.defaultdict(set)
    by_callsign = collections.defaultdict(set)

    for profile_id, record in registry.items():
        profile = record["driver_profile"]
        license_number = (profile.get("driver_license") or {}).get("normalized_number")
        if license_number:
            by_license_raw[license_number.strip().upper()].add(profile_id)
            by_license_normalized[normalize_license(license_number)].add(profile_id)
        for phone in profile.get("phones") or []:
            by_phone[normalize_phone(phone)].add(profile_id)
        callsign = (record.get("car") or {}).get("callsign")
        if callsign:
            by_callsign[callsign.strip()].add(profile_id)

    return by_license_raw, by_license_normalized, by_phone, by_callsign


def measure(title, drivers, key_of, index):
    """Считает, сколько записей ключ приводит ровно к одному профилю парка."""
    unambiguous = ambiguous = missing = empty = 0
    for driver in drivers:
        key = key_of(driver)
        if not key:
            empty += 1
            continue
        profiles = index.get(key)
        if not profiles:
            missing += 1
        elif len(profiles) == 1:
            unambiguous += 1
        else:
            ambiguous += 1
    total = len(drivers)
    print(
        f"{title:38} однозначно {unambiguous:5} ({unambiguous / total:6.2%})  "
        f"неоднозначно {ambiguous:4}  нет в реестре {missing:5}  пусто {empty:4}"
    )


def cross_check(drivers, registry):
    """Проверяет пары, найденные по profile_id, независимыми полями."""
    license_agree = license_differ = license_absent = 0
    phone_agree = phone_differ = phone_absent = 0
    statuses = collections.Counter()
    unmatched = []

    for driver in drivers:
        record = registry.get(driver["profile_id"])
        if not record:
            unmatched.append(driver)
            continue
        profile = record["driver_profile"]
        statuses[profile["work_status"]] += 1

        registry_license = normalize_license(
            (profile.get("driver_license") or {}).get("normalized_number")
        )
        legacy_license = normalize_license(driver["license_number"])
        if not registry_license or not legacy_license:
            license_absent += 1
        elif registry_license == legacy_license:
            license_agree += 1
        else:
            license_differ += 1

        registry_phones = {normalize_phone(p) for p in profile.get("phones") or []}
        if not registry_phones:
            phone_absent += 1
        elif normalize_phone(driver["phone"]) in registry_phones:
            phone_agree += 1
        else:
            phone_differ += 1

    print(
        f"\nсверка пар, найденных по profile_id:\n"
        f"  ВУ  совпал {license_agree}, разошёлся {license_differ}, отсутствует {license_absent}\n"
        f"  тел совпал {phone_agree}, разошёлся {phone_differ}, "
        f"в реестре телефона нет {phone_absent}\n"
        f"  work_status сматченных: {dict(statuses)}"
    )
    return unmatched


def find_duplicate_people(drivers, registry):
    """Группирует записи по человеку: ключ — номер ВУ из реестра, а не из старой базы."""
    groups = collections.defaultdict(list)
    for driver in drivers:
        record = registry.get(driver["profile_id"])
        if not record:
            continue
        key = normalize_license(
            (record["driver_profile"].get("driver_license") or {}).get("normalized_number")
        )
        if key:
            groups[key].append(driver)
    return [group for group in groups.values() if len(group) > 1]


def main():
    if not os.path.exists(DUMP):
        sys.exit(f"нет выгрузки реестра: {DUMP}")

    registry = load_registry(DUMP)
    drivers = load_legacy_drivers()
    by_license_raw, by_license_normalized, by_phone, by_callsign = build_indexes(registry)

    print(f"записей в старой базе: {len(drivers)}; профилей в реестре: {len(registry)}\n")

    measure("profile_id → driver_profile.id", drivers,
            lambda d: d["profile_id"], {key: {key} for key in registry})
    measure("ВУ как есть → normalized_number", drivers,
            lambda d: (d["license_number"] or "").strip().upper(), by_license_raw)
    measure("ВУ нормализованный", drivers,
            lambda d: normalize_license(d["license_number"]), by_license_normalized)
    measure("телефон (только цифры)", drivers,
            lambda d: normalize_phone(d["phone"]), by_phone)
    measure("позывной", drivers,
            lambda d: (d["callsign"] or "").strip(), by_callsign)

    unmatched = cross_check(drivers, registry)
    print(f"\nне сопоставилось ни по чему: {len(unmatched)}")
    for driver in unmatched:
        profile_id = driver["profile_id"]
        print(
            f"  id={driver['id']} profile_id={profile_id[:2]}***{profile_id[-2:]} "
            f"(длина {len(profile_id)}) баллы={driver['points']} "
            f"статус={driver['working_status'] or 'ПУСТО'}"
        )

    duplicates = find_duplicate_people(drivers, registry)
    shared_profile = sum(1 for g in duplicates if len({d["profile_id"] for d in g}) == 1)
    print(
        f"\nдвойных учётных записей: {len(duplicates)} групп, "
        f"{sum(len(g) for g in duplicates)} записей, "
        f"{sum(int(d['points'] or 0) for g in duplicates for d in g)} баллов\n"
        f"  из них ловятся общим profile_id: {shared_profile}\n"
        f"  требуют сверки по номеру ВУ: {len(duplicates) - shared_profile}"
    )


if __name__ == "__main__":
    main()

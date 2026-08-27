#!/usr/bin/env python3
"""
Полная выгрузка реестра водителей парка из Yandex Fleet API.

Только чтение. В базу не пишет, ничего в парке не меняет.
Результат — файл _reference/fleet-api/dumps/driver-profiles-YYYY-MM-DD.jsonl,
по одному профилю в строке, ровно как его отдал API, плюс сводка о самом
обходе рядом в .meta.json — отчёту нужны число запросов и время.

Выгрузка содержит персональные данные и в репозиторий не коммитится:
каталог dumps/ закрыт в .gitignore.

Запуск из корня репозитория:
    python3 scripts/export-registry.py [стартовая пауза в секундах]
"""

import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import UTC, DUMPS_DIR, DumpWriter, FleetClient, MAX_PAUSE, MIN_PAUSE

PAGE_SIZE = 1000            # максимум, разрешённый документацией для этого метода
PATH = "/v1/parks/driver-profiles/list"


def build_body(park_id, offset):
    """
    Страница реестра. Сортировка задана явно: обход по offset без
    устойчивого порядка теряет и дублирует записи между страницами.
    """
    return {
        "query": {"park": {"id": park_id}},
        "sort_order": [{"field": "driver_profile.created_date", "direction": "asc"}],
        "limit": PAGE_SIZE,
        "offset": offset,
    }



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
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    dump_path = os.path.join(DUMPS_DIR, f"driver-profiles-{stamp}.jsonl")
    meta_path = os.path.join(DUMPS_DIR, f"driver-profiles-{stamp}.meta.json")
    writer = DumpWriter(dump_path)

    print(f"\nВыгрузка реестра парка — {datetime.now(UTC):%d.%m.%Y %H:%M} UTC")
    print(f"Парк: {client.park_id[:8]}…  Страница: {PAGE_SIZE}")
    print(f"Пауза: с {client.start_pause:g} c, растёт до {MAX_PAUSE:.0f} c "
          "на отказах по лимиту\n")

    seen_ids = set()
    duplicates = 0
    total_reported = None
    offset = 0

    try:
        while True:
            payload, seconds = client.post(PATH, build_body(client.park_id, offset),
                                           f"реестр, offset {offset}")

            if total_reported is None:
                total_reported = payload.get("total")
                print(f"API сообщает всего профилей: {total_reported}")

            profiles = payload.get("driver_profiles", [])
            if not profiles:
                break

            for profile in profiles:
                profile_id = (profile.get("driver_profile") or {}).get("id")
                if profile_id in seen_ids:
                    duplicates += 1
                else:
                    seen_ids.add(profile_id)
                writer.write(profile)

            print(f"   offset {offset:>6} → получено {len(profiles):>4} "
                  f"за {seconds:>4.2f} c, всего {offset + len(profiles)}")
            offset += len(profiles)

            if total_reported is not None and offset >= total_reported:
                break
    except BaseException:
        writer.discard()
        raise

    written = writer.commit()

    meta = {
        "dump": os.path.basename(dump_path),
        "finished_at": datetime.now(UTC).isoformat(),
        "page_size": PAGE_SIZE,
        "total_reported_by_api": total_reported,
        "profiles_written": written,
        "distinct_profile_ids": len(seen_ids),
        "duplicate_ids_between_pages": duplicates,
        **client.stats(),
    }
    json.dump(meta, open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"\nЗаписано строк: {written}")
    print(f"Различных профилей: {len(seen_ids)}   повторов id между страницами: {duplicates}")
    if total_reported is not None and written != total_reported:
        print(f"ВНИМАНИЕ: API обещал {total_reported}, выгружено {written} — расхождение "
              f"{written - total_reported:+d}")
    print(f"Файл: {dump_path}")
    client.print_stats("Техника обхода")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Полная выгрузка реестра водителей парка из Yandex Fleet API.

Только чтение. В базу не пишет, ничего в парке не меняет.
Результат — файл _reference/fleet-api/dumps/driver-profiles-YYYY-MM-DD.jsonl,
по одному профилю в строке, ровно как его отдал API, плюс сводка об обходе
рядом в .meta.json — отчёту нужны число запросов и время.

Выгрузка возобновляемая: страницы копятся в .part.jsonl, позиция обхода —
в .checkpoint.json рядом. Оборванный прогон продолжается с той же страницы,
итоговый файл появляется только когда обход дошёл до конца.

Выгрузка содержит персональные данные и в репозиторий не коммитится:
каталог dumps/ закрыт в .gitignore.

Запуск из корня репозитория:
    python3 scripts/export-registry.py [стартовая пауза в секундах] [--restart]
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import (MAX_PAUSE, FleetClient, LimitExhausted, ResumableDump,
                          parse_export_args)

PAGE_SIZE = 1000            # максимум, разрешённый документацией для этого метода
PATH = "/v1/parks/driver-profiles/list"
BASE_NAME = "driver-profiles"


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


def profile_id(record):
    return (record.get("driver_profile") or {}).get("id")


def main():
    arguments = parse_export_args("Выгрузка реестра водителей парка")
    client = FleetClient(arguments.pause)
    dump = ResumableDump(BASE_NAME, profile_id, restart=arguments.restart)
    dump.context = {"page_size": PAGE_SIZE}

    print(f"\nВыгрузка реестра парка — {dump.stamp}")
    print(f"Парк: {client.park_id[:8]}…  Страница: {PAGE_SIZE}")
    print(f"Пауза: с {client.start_pause:g} c, растёт до {MAX_PAUSE:.0f} c "
          "на отказах по лимиту")

    offset = (dump.position or {}).get("offset", 0)
    if dump.resumed:
        print(f"Продолжаю прошлый обход: в выгрузке уже {dump.records} профилей, "
              f"следующий offset {offset}\n")
    else:
        print("Обход с нуля\n")

    total_reported = None
    interrupted = None

    try:
        while True:
            payload, seconds = client.post(PATH, build_body(client.park_id, offset),
                                           f"реестр, offset {offset}")

            if total_reported is None:
                total_reported = payload.get("total")
                dump.context["total_reported_by_api"] = total_reported
                print(f"API сообщает всего профилей: {total_reported}")

            profiles = payload.get("driver_profiles", [])
            if not profiles:
                break

            offset += len(profiles)
            dump.write_page(profiles, {"offset": offset}, client.stats())
            print(f"   получено {len(profiles):>4} за {seconds:>4.2f} c, "
                  f"в выгрузке {dump.records} из {total_reported}")

            if total_reported is not None and offset >= total_reported:
                break
    except LimitExhausted as error:
        interrupted = error
    except BaseException:
        dump.keep(client.stats())
        raise

    if interrupted:
        dump.keep(client.stats())
        print(f"\nОстановка: «{interrupted.description}» не прошла за все попытки — "
              "лимит ключа не отпустил.")
        print(f"В выгрузке {dump.records} профилей, следующий offset {offset}. "
              "Прогресс сохранён.")
        print("Повторный запуск продолжит с этого места. Начать заново — с --restart.")
        sys.exit(1)

    meta = dump.commit(client.stats())

    print(f"\nЗаписано профилей: {meta['records']}")
    print(f"Различных профилей: {meta['distinct_ids']}   "
          f"повторов id между страницами: {meta['duplicate_ids_between_pages']}")
    if total_reported is not None and meta["records"] != total_reported:
        print(f"ВНИМАНИЕ: API обещал {total_reported}, выгружено {meta['records']} — "
              f"расхождение {meta['records'] - total_reported:+d}")
    print(f"Файл: {dump.dump_path}")
    print(f"\nТехника обхода: запусков {meta['runs']}, запросов {meta['requests']}, "
          f"отказов по лимиту {meta['limit_refusals']}, "
          f"ждали из-за лимита {meta['waited_seconds']:.0f} c, "
          f"всего {meta['elapsed_seconds']:.0f} c")


if __name__ == "__main__":
    main()

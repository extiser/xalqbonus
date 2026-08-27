#!/usr/bin/env python3
"""
Полная выгрузка реестра водителей парка из Yandex Fleet API.

Только чтение. В базу не пишет, ничего в парке не меняет.
Результат — файл _reference/fleet-api/dumps/driver-profiles-YYYY-MM-DD.jsonl,
по одному профилю в строке, ровно как его отдал API, плюс сводка об обходе
рядом в .meta.json — отчёту нужны техника обхода, число запросов и время.

Реестр берётся кусками, а не сквозным offset. Причина в лимитере Fleet API:
он оценивает стоимость запроса, а не частоту, и глубокая offset-страница
дорога по определению — чтобы отдать записи с десятитысячной, сервер
отсчитывает их от начала. Замерено 27.08.2026: запрос одной записи на глубине
10 000 отбивается мгновенно, запрос тысячи записей с нуля проходит. Пауза
здесь не лечит ничего, лечит мелкая глубина.

Отсюда обход: `fired` и `not_working` — каждый своим куском, `working` — по
куску на условие работы. Кусок крупнее TWO_END_THRESHOLD берётся с двух
концов, по половине в каждую сторону сортировки, — так максимальная глубина
offset падает вдвое. Кусок, который и так не укладывается в MAX_OFFSET_DEPTH,
дробится окнами по updated_at.

Выгрузка возобновляемая: страницы копятся в .part.jsonl, позиция обхода —
в .checkpoint.json рядом. Оборванный прогон продолжается с того же куска,
итоговый файл появляется только когда сошёлся общий счёт.

Выгрузка содержит персональные данные и в репозиторий не коммитится:
каталог dumps/ закрыт в .gitignore.

Запуск из корня репозитория:
    python3 scripts/export-registry.py [стартовая пауза в секундах] [--restart]
"""

import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import (MAX_PAUSE, UTC, FleetClient, LimitExhausted, ResumableDump,
                          iso_utc, parse_export_args)

PAGE_SIZE = 1000            # максимум, разрешённый документацией для этого метода
TWO_END_THRESHOLD = 3000    # кусок крупнее берётся с двух концов
MAX_OFFSET_DEPTH = 3500     # глубже offset в прогоне не уходит ни на одной странице
MIN_WINDOW_SECONDS = 60     # окно мельче минуты не дробим: дальше дробить нечего
PATH = "/v1/parks/driver-profiles/list"
RULES_PATH = "/v1/parks/driver-work-rules"
BASE_NAME = "driver-profiles"
LAYOUT = "chunks-v1"        # раскладка чекпоинта; сквозной offset ей несовместим

STATUS_CHUNKS = ("fired", "not_working")

# Ступени обхода куска. Каждая следующая берётся, только если предыдущая
# не свела число различных id с размером куска.
STAGES = ("direct", "windows", "windows_strict")
STAGE_REASON = {
    "windows": "не берётся такой глубиной offset",
    "windows_strict": "не сошёлся по числу профилей",
}


class ChunkShort(Exception):
    """
    Кусок не сошёлся с собственным `total` даже после дробления окнами.
    Отдельным исключением, а не sys.exit: выгрузка должна успеть закрыть
    .part и чекпоинт, чтобы прогресс не пропал.
    """


# ------------------------------------------------------------- запросы


def build_body(park_id, chunk_filter, window, direction, offset, limit=PAGE_SIZE):
    """
    Страница куска. Сортировка задана явно: обход по offset без устойчивого
    порядка теряет и дублирует записи между страницами.
    """
    park = {"id": park_id}
    if chunk_filter:
        park["driver_profile"] = dict(chunk_filter)
    if window:
        park["updated_at"] = {"from": window["from"], "to": window["to"]}
    return {
        "query": {"park": park},
        "sort_order": [{"field": "driver_profile.created_date", "direction": direction}],
        "limit": limit,
        "offset": offset,
    }


def profile_id(record):
    return (record.get("driver_profile") or {}).get("id")


def probe_total(client, chunk_filter, window, description):
    """
    Размер куска — полем `total` из ответа на запрос одной записи.
    Пустой кусок после этого не стоит ни одной страницы.
    """
    body = build_body(client.park_id, chunk_filter, window, "asc", 0, 1)
    payload, _ = client.post(PATH, body, description)
    return payload.get("total") or 0


def fetch_work_rules(client):
    """Справочник условий работы: по куску на каждое из них."""
    payload, _ = client.get(RULES_PATH, {"park_id": client.park_id},
                            "справочник условий работы")
    return payload.get("rules") or []


# --------------------------------------------------------- схема обхода


def pages_for(target):
    return max(1, math.ceil(target / PAGE_SIZE))


def passes_for(total):
    """
    Проходы по куску: (направление сортировки, сколько записей взять).
    Крупный кусок берётся с двух концов — половина по возрастанию
    `created_date`, половина по убыванию.
    """
    if total <= TWO_END_THRESHOLD:
        return [("asc", total)]
    head = (total + 1) // 2
    return [("asc", head), ("desc", total - head)]


def deepest_offset(passes):
    """Самый глубокий offset, который потребует такая схема прохода."""
    return max((pages_for(target) - 1) * PAGE_SIZE for _, target in passes)


def fits(total):
    return total > 0 and deepest_offset(passes_for(total)) <= MAX_OFFSET_DEPTH


def parse_time(value):
    """ISO 8601 из ответа API, в том числе со смещением вида +0000."""
    if not isinstance(value, str) or not value:
        return None
    text = value.strip()
    if len(text) > 5 and (text[-5] in "+-") and text[-3] != ":":
        text = text[:-2] + ":" + text[-2:]
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


# ------------------------------------------------- учёт уникальных по кускам


class ChunkIndex:
    """
    Сколько различных профилей уже лежит в выгрузке по каждому куску.

    Считается по самим записям, а не по счётчику новых строк: кусок, который
    добирался окнами после неудачи, встречает собственные прежние записи как
    повторы, и прирост строк перестал бы отражать его покрытие.
    """

    def __init__(self):
        self.ids_by_slot = defaultdict(set)     # (work_status, work_rule_id) → id
        self.known = set()

    def add(self, record):
        driver = record.get("driver_profile") or {}
        identifier = driver.get("id")
        if identifier is None or identifier in self.known:
            return
        self.known.add(identifier)
        self.ids_by_slot[(driver.get("work_status"),
                          driver.get("work_rule_id"))].add(identifier)

    def add_all(self, records):
        for record in records:
            self.add(record)

    def count(self, chunk):
        statuses = chunk["filter"]["work_status"]
        rules = chunk["filter"].get("work_rule_id")
        collected = 0
        for (status, rule), identifiers in self.ids_by_slot.items():
            if status in statuses and (rules is None or rule in rules):
                collected += len(identifiers)
        return collected

    @property
    def total(self):
        return len(self.known)


def rebuild_index(part_path):
    """Восстановление учёта по кускам из уже собранного .part при возобновлении."""
    index = ChunkIndex()
    if not os.path.exists(part_path):
        return index
    with open(part_path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                index.add(json.loads(line))
    return index


# -------------------------------------------------------------- план обхода


def build_plan(client):
    """
    Нарезка реестра на куски и размер каждого. Куски не пересекаются:
    профиль попадает ровно в один по паре (work_status, work_rule_id).
    """
    registry_total = probe_total(client, None, None, "весь реестр, размер")
    print(f"API сообщает всего профилей: {registry_total}")

    chunks = []
    for status in STATUS_CHUNKS:
        total = probe_total(client, {"work_status": [status]}, None,
                            f"кусок {status}, размер")
        chunks.append({"key": status, "title": status,
                       "filter": {"work_status": [status]}, "total": total})
        print(f"   {status}: {total}")

    working_total = probe_total(client, {"work_status": ["working"]}, None,
                                "кусок working, размер")
    print(f"   working: {working_total}")

    rules = fetch_work_rules(client)
    print(f"   условий работы в парке: {len(rules)}")

    rule_names = {rule["id"]: rule.get("name") or "" for rule in rules}
    rule_chunks = []
    for rule in rules:
        chunk_filter = {"work_status": ["working"], "work_rule_id": [rule["id"]]}
        total = probe_total(client, chunk_filter, None,
                            f"кусок working/{rule['id'][:8]}…, размер")
        rule_chunks.append({"key": f"working:{rule['id']}",
                            "title": f"working / {rule.get('name') or rule['id'][:8]}",
                            "filter": chunk_filter, "total": total})

    by_rules = sum(chunk["total"] for chunk in rule_chunks)
    if by_rules == working_total:
        chunks.extend(rule_chunks)
    else:
        # Условия работы не покрывают статус целиком: у части профилей
        # `work_rule_id` не из справочника или пуст. Такой остаток фильтром
        # не выразить, поэтому `working` берётся одним куском — он не влезает
        # по глубине и уйдёт в дробление окнами по updated_at.
        print(f"   ВНИМАНИЕ: сумма по условиям работы {by_rules} не сходится "
              f"с working {working_total}, расхождение {by_rules - working_total:+d}")
        print("   working берётся одним куском с дроблением окнами по updated_at")
        chunks.append({"key": "working", "title": "working (целиком)",
                       "filter": {"work_status": ["working"]}, "total": working_total})

    non_empty = [chunk for chunk in chunks if chunk["total"]]
    planned = sum(chunk["total"] for chunk in chunks)
    print(f"\nКусков: {len(chunks)}, из них непустых {len(non_empty)}, "
          f"сумма размеров {planned}")
    if planned != registry_total:
        print(f"   ВНИМАНИЕ: сумма кусков {planned} не сходится с реестром "
              f"{registry_total}, расхождение {planned - registry_total:+d}")
    return registry_total, chunks, rule_names


# ------------------------------------------------------------ окна по времени


def chunk_edges(client, chunk):
    """Крайние `updated_at` куска — границы, внутри которых нарезаются окна."""
    edges = []
    for direction in ("asc", "desc"):
        body = build_body(client.park_id, chunk["filter"], None, direction, 0, 1)
        body["sort_order"] = [{"field": "updated_at", "direction": direction}]
        payload, _ = client.post(PATH, body,
                                 f"{chunk['title']}: край updated_at {direction}")
        records = payload.get("driver_profiles") or []
        edges.append(parse_time(records[0].get("updated_at")) if records else None)
    return edges


def accepts(stage):
    """
    Когда окно считается достаточно мелким.

    На ступени `windows` довольно того, чтобы окно бралось разрешённой
    глубиной. На ступени `windows_strict` окно режется до одной страницы:
    туда кусок попадает, не сойдясь по числу профилей, а теряются строки
    ровно на стыке страниц — у окна в одну страницу стыка нет.
    """
    if stage == "windows_strict":
        return lambda total: total <= PAGE_SIZE
    return fits


def split_window(client, chunk, since, until, windows, accept):
    """
    Дробление куска окнами по `updated_at`, пока каждое окно не станет
    приниматься правилом ступени. Соседние окна перекрываются на секунду:
    полуинтервал в документации не оговорён, а лишний повтор снимается по id,
    потерянная же запись не восстанавливается ничем.
    """
    window = {"from": iso_utc(since), "to": iso_utc(until)}
    total = probe_total(client, chunk["filter"], window,
                        f"{chunk['title']}: окно {window['from']}…{window['to']}, размер")
    if total == 0:
        return
    if accept(total):
        windows.append({**window, "total": total})
        print(f"      окно {window['from']} … {window['to']}: {total}")
        return
    span = (until - since).total_seconds()
    if span <= MIN_WINDOW_SECONDS:
        raise ChunkShort(
            f"кусок «{chunk['title']}»: окно {window['from']}…{window['to']} "
            f"держит {total} профилей и дальше не дробится")
    middle = since + timedelta(seconds=span / 2)
    split_window(client, chunk, since, middle, windows, accept)
    split_window(client, chunk, middle - timedelta(seconds=1), until, windows, accept)


def build_windows(client, chunk, stage):
    since, until = chunk_edges(client, chunk)
    if since is None or until is None:
        raise ChunkShort(f"кусок «{chunk['title']}»: не удалось определить границы "
                         "updated_at, дробить окнами нечем")
    windows = []
    split_window(client, chunk, since, until + timedelta(seconds=1), windows,
                 accepts(stage))
    print(f"      окон получилось {len(windows)}")
    return windows


# ---------------------------------------------------------------- обход


def run_pass(client, dump, index, chunk, window, direction, target, state, offset):
    """
    Один проход по куску в одну сторону сортировки. Страницы берутся целиком:
    хвост, вылезающий за половину, перекрывается со встречным проходом и
    снимается по id — перекрытие дешевле, чем дыра на стыке половин.
    """
    while offset < target:
        body = build_body(client.park_id, chunk["filter"], window, direction, offset)
        description = f"{chunk['title']}, {direction} offset {offset}"
        payload, seconds = client.post(PATH, body, description)

        profiles = payload.get("driver_profiles") or []
        if not profiles:
            break

        state["max_depth"] = max(state["max_depth"], offset)
        offset += len(profiles)
        state["current"]["offset"] = offset
        index.add_all(profiles)
        dump.write_page(profiles, dict(state), client.stats())

        print(f"   {chunk['title']}: {direction} offset {offset - len(profiles)}, "
              f"получено {len(profiles)} за {seconds:.2f} c, "
              f"в выгрузке {dump.records}")

        if len(profiles) < PAGE_SIZE:
            break


def run_segments(client, dump, index, chunk, segments, state, phase):
    """
    Сегмент — либо кусок целиком (окна не понадобились), либо одно окно.
    Позиция внутри сегмента живёт в чекпоинте: обрыв продолжается с той же
    страницы, а не с начала куска.
    """
    current = state["current"]
    for segment_index in range(current.get("segment_index", 0), len(segments)):
        window, total = segments[segment_index]
        passes = passes_for(total)
        resuming = (current.get("phase") == phase
                    and current.get("segment_index") == segment_index)
        for pass_index in range(current.get("pass_index", 0) if resuming else 0,
                                len(passes)):
            direction, target = passes[pass_index]
            offset = (current.get("offset", 0)
                      if resuming and current.get("pass_index") == pass_index else 0)
            current.update({"phase": phase, "segment_index": segment_index,
                            "pass_index": pass_index, "offset": offset})
            run_pass(client, dump, index, chunk, window, direction, target,
                     state, offset)
        current["pass_index"] = 0
        current["offset"] = 0


def take_chunk(client, dump, index, chunk, state):
    """
    Кусок считается взятым, только когда число различных id сошлось с его
    `total`. Не сошлось — виноват равный `created_date` у массово заведённых
    профилей: при равных значениях сортировки offset-пагинация теряет строки
    на стыке страниц, а встречный проход по такому куску повторяет прямой.
    Такой кусок дробится окнами по `updated_at` и берётся заново.
    """
    refusals_before = client.limit_refusals
    current = state["current"]
    if not current.get("phase"):
        first = "direct" if fits(chunk["total"]) else "windows"
        current.update({"phase": first, "segment_index": 0, "pass_index": 0,
                        "offset": 0})

    collected = index.count(chunk)
    stage = current["phase"]
    while True:
        if stage == "direct":
            segments = [(None, chunk["total"])]
        else:
            print(f"   {chunk['title']}: {chunk['total']} профилей, собрано "
                  f"{collected} — {STAGE_REASON[stage]}, дроблю окнами "
                  "по updated_at")
            if not chunk.get(stage):
                chunk[stage] = build_windows(client, chunk, stage)
            segments = [(window, window["total"]) for window in chunk[stage]]

        run_segments(client, dump, index, chunk, segments, state, stage)
        collected = index.count(chunk)
        if collected == chunk["total"] or stage == STAGES[-1]:
            break
        # Не сошёлся по счёту — дальше только окна в одну страницу. Ступень
        # «по глубине» тут ничего не даст: она нарежет окна того же размера,
        # что и неудавшийся проход, и повторит ровно ту же потерю.
        stage = STAGES[-1]
        current.update({"phase": stage, "segment_index": 0, "pass_index": 0,
                        "offset": 0})

    state["refusals"][chunk["key"]] = (state["refusals"].get(chunk["key"], 0)
                                       + client.limit_refusals - refusals_before)
    if collected != chunk["total"]:
        raise ChunkShort(f"кусок «{chunk['title']}»: собрано {collected} "
                         f"из {chunk['total']}, окна положение не исправили")
    return collected


# ----------------------------------------------------------------- запуск


def main():
    arguments = parse_export_args("Выгрузка реестра водителей парка")
    client = FleetClient(arguments.pause)
    dump = ResumableDump(BASE_NAME, profile_id, restart=arguments.restart,
                         layout=LAYOUT, skip_duplicates=True)

    print(f"\nВыгрузка реестра парка — {dump.stamp}")
    print(f"Парк: {client.park_id[:8]}…  Страница: {PAGE_SIZE}")
    print(f"Пауза: с {client.start_pause:g} c, растёт до {MAX_PAUSE:.0f} c "
          "на отказах по лимиту")
    print(f"Глубина offset: не глубже {MAX_OFFSET_DEPTH}, "
          f"кусок крупнее {TWO_END_THRESHOLD} берётся с двух концов\n")

    if dump.resumed and dump.context.get("chunks"):
        registry_total = dump.context.get("total_reported_by_api")
        chunks = dump.context["chunks"]
        state = dict(dump.position or {})
        state.setdefault("done", [])
        state.setdefault("current", {})
        state.setdefault("max_depth", 0)
        state.setdefault("refusals", {})
        index = rebuild_index(dump.part_path)
        print(f"Продолжаю прошлый обход: в выгрузке {dump.records} профилей, "
              f"закрытых кусков {len(state['done'])} из {len(chunks)}\n")
    else:
        try:
            registry_total, chunks, rule_names = build_plan(client)
        except LimitExhausted as error:
            # Разметка идёт до первой страницы, терять тут нечего: сообщаем
            # причину и выходим, а не роняем трейсбек на пустой выгрузке.
            print(f"\nОстановка: «{error.description}» не прошла за все попытки — "
                  "лимит ключа не отпустил ещё на разметке кусков.")
            print("Ничего не выгружено, повторный запуск начнёт разметку заново.")
            sys.exit(1)
        dump.context = {
            "page_size": PAGE_SIZE,
            "total_reported_by_api": registry_total,
            "chunks": chunks,
            "work_rules": rule_names,
        }
        state = {"done": [], "current": {}, "max_depth": 0, "refusals": {}}
        index = ChunkIndex()
        print()

    interrupted = None
    failed = None

    try:
        for chunk in chunks:
            if chunk["key"] in state["done"]:
                continue
            if chunk["total"] == 0:
                state["done"].append(chunk["key"])
                continue
            if state["current"].get("key") != chunk["key"]:
                state["current"] = {"key": chunk["key"]}
            collected = take_chunk(client, dump, index, chunk, state)
            state["done"].append(chunk["key"])
            state["current"] = {}
            dump.write_page([], dict(state), client.stats())
            print(f"   {chunk['title']}: закрыт, {collected} профилей "
                  f"({len(state['done'])} из {len(chunks)} кусков)")
    except LimitExhausted as error:
        interrupted = error
    except ChunkShort as error:
        failed = error
    except BaseException:
        dump.keep(client.stats())
        raise

    if interrupted or failed:
        dump.keep(client.stats())
        if interrupted:
            print(f"\nОстановка: «{interrupted.description}» не прошла за все "
                  "попытки — лимит ключа не отпустил.")
        else:
            print(f"\nОстановка: {failed}")
        print(f"В выгрузке {dump.records} профилей, закрыто кусков "
              f"{len(state['done'])} из {len(chunks)}. Прогресс сохранён.")
        print("Повторный запуск продолжит с этого места. Начать заново — с --restart.")
        sys.exit(1)

    if registry_total is not None and index.total != registry_total:
        dump.keep(client.stats())
        print(f"\nОстановка: собрано {index.total} различных профилей, "
              f"API обещал {registry_total}. Куски сошлись каждый со своим "
              "размером, а общий счёт — нет.")
        sys.exit(1)

    meta = dump.commit(client.stats(), extra_meta={
        "layout": LAYOUT,
        "chunks_total": len(chunks),
        "chunks_non_empty": sum(1 for chunk in chunks if chunk["total"]),
        "chunks_windowed": [chunk["key"] for chunk in chunks
                            if chunk.get("windows") or chunk.get("windows_strict")],
        "chunk_totals": {chunk["key"]: chunk["total"] for chunk in chunks},
        "max_offset_depth": state["max_depth"],
        "max_offset_depth_allowed": MAX_OFFSET_DEPTH,
        "two_end_threshold": TWO_END_THRESHOLD,
        "limit_refusals_by_chunk": {key: count for key, count
                                    in state["refusals"].items() if count},
    })

    print(f"\nЗаписано профилей: {meta['records']}")
    print(f"Различных профилей: {meta['distinct_ids']}   "
          f"повторов id между страницами: {meta['duplicate_ids_between_pages']}")
    print(f"Максимальная глубина offset: {meta['max_offset_depth']} "
          f"(потолок {MAX_OFFSET_DEPTH})")
    print(f"Файл: {dump.dump_path}")
    print(f"\nТехника обхода: кусков {meta['chunks_non_empty']} непустых из "
          f"{meta['chunks_total']}, запусков {meta['runs']}, "
          f"запросов {meta['requests']}, "
          f"отказов по лимиту {meta['limit_refusals']}, "
          f"ждали из-за лимита {meta['waited_seconds']:.0f} c, "
          f"всего {meta['elapsed_seconds']:.0f} c")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Отчёт по выгрузкам реестра парка и заказов.

Читает _reference/fleet-api/dumps/driver-profiles-*.jsonl и orders-*.jsonl,
пишет _reference/fleet-api/registry-report-YYYY-MM-DD.md.

В отчёт попадают только агрегаты. Персональных данных в нём нет: номера ВУ
и телефоны в примерах маскируются так же, как в samples/ — AB***57, +9989***09.
Адреса, маршруты, имена и позывные в отчёт не выносятся вообще.

Запуск из корня репозитория, после обоих скриптов выгрузки:
    python3 scripts/registry-report.py [YYYY-MM-DD]
"""

import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fleet_client import UTC, DUMPS_DIR, REPORTS_DIR, read_jsonl

PHONE_PATTERN = re.compile(r"^\+998\d{9}$")

# ------------------------------------------------------------------ утилиты


def mask_license(value):
    """AB1234567 → AB***67, как в samples/."""
    if not isinstance(value, str) or len(value) < 5:
        return "***"
    return value[:2] + "***" + value[-2:]


def mask_phone(value):
    """+998901234509 → +9989***09, как в samples/."""
    if not isinstance(value, str) or len(value) < 9:
        return "***"
    return value[:5] + "***" + value[-2:]


def parse_time(value):
    """ISO 8601 из ответа API. Возвращает None на пустом и на мусоре."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def parse_number(value):
    """price и mileage приходят строками вида «31500.0000»."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_filled(value):
    return value is not None and value != "" and value != [] and value != {}


def percent(part, whole):
    return f"{part / whole * 100:.1f}%" if whole else "—"


def counted(part, whole):
    return f"{part} ({percent(part, whole)})"


def percentile(sorted_values, share):
    if not sorted_values:
        return None
    index = min(len(sorted_values) - 1, int(len(sorted_values) * share))
    return sorted_values[index]


def table(header, rows):
    """Markdown-таблица. Пустой набор строк заменяется явной пометкой."""
    if not rows:
        return "_нет данных_\n"
    lines = ["| " + " | ".join(header) + " |",
             "|" + "|".join(["---"] * len(header)) + "|"]
    for row in rows:
        lines.append("| " + " | ".join(str(cell) for cell in row) + " |")
    return "\n".join(lines) + "\n"


# ------------------------------------------------- сводка ключей выгрузки


class KeyProfile:
    """
    Частота ключей по всей выгрузке. Вложенные объекты раскрываются до листьев,
    массивы объектов — как `route_points[].address`: ключ считается встреченным
    в записи, если он есть хотя бы в одном элементе массива.
    """

    def __init__(self):
        self.seen = Counter()
        self.filled = Counter()
        self.types = defaultdict(set)
        self.records = 0

    def add(self, record):
        self.records += 1
        seen_here, filled_here = set(), set()
        self._walk(record, "", seen_here, filled_here)
        self.seen.update(seen_here)
        self.filled.update(filled_here)

    def _walk(self, node, prefix, seen_here, filled_here):
        if isinstance(node, dict):
            for key, value in node.items():
                path = f"{prefix}.{key}" if prefix else key
                seen_here.add(path)
                if is_filled(value):
                    filled_here.add(path)
                self._note_type(path, value)
                self._walk(value, path, seen_here, filled_here)
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, (dict, list)):
                    self._walk(item, prefix + "[]", seen_here, filled_here)

    def _note_type(self, path, value):
        if isinstance(value, bool):
            self.types[path].add("bool")
        elif isinstance(value, int):
            self.types[path].add("int")
        elif isinstance(value, float):
            self.types[path].add("float")
        elif isinstance(value, str):
            self.types[path].add("string")
        elif isinstance(value, list):
            self.types[path].add("array")
        elif isinstance(value, dict):
            self.types[path].add("object")
        elif value is None:
            self.types[path].add("null")

    def rows(self):
        for path in sorted(self.seen):
            yield (f"`{path}`",
                   "/".join(sorted(self.types.get(path, {"—"}))),
                   counted(self.seen[path], self.records),
                   counted(self.filled[path], self.records))


# ------------------------------------------------------- отчёт по реестру


def build_registry_section(dump_path, meta):
    profiles = 0
    keys = KeyProfile()

    without_license = 0
    empty_normalized = 0
    license_owners = defaultdict(list)          # номер ВУ → статусы профилей
    number_mismatch = []                        # (number, normalized) — маскируются
    mismatch_kinds = Counter()
    countries = Counter()
    license_expired = 0
    license_expiring_year = 0
    license_no_expiration = 0

    phones_missing = 0
    phones_multiple = 0
    phone_owners = defaultdict(set)          # номер → профили, на которых он встретился
    phone_bad_format = 0
    phone_bad_examples = []

    work_status = Counter()
    employment_type = Counter()
    selfemployed = Counter()
    contract_issue = Counter()
    hire_years = Counter()
    hire_missing = 0
    work_rules = Counter()
    without_car = 0
    callsigns = defaultdict(set)             # позывной → профили, на которых он встретился
    updated_buckets = Counter()

    now = datetime.now(UTC)

    for record in read_jsonl(dump_path):
        profiles += 1
        keys.add(record)

        driver = record.get("driver_profile") or {}
        license_data = driver.get("driver_license") or {}

        # --- водительское удостоверение
        if not license_data:
            without_license += 1
        normalized = license_data.get("normalized_number")
        if not normalized:
            empty_normalized += 1
        else:
            license_owners[normalized].append(driver.get("work_status") or "(пусто)")

        number = license_data.get("number")
        if normalized and number and number != normalized:
            mismatch_kinds[classify_mismatch(number, normalized)] += 1
            if len(number_mismatch) < 5:
                number_mismatch.append((mask_license(number), mask_license(normalized)))

        if license_data:
            countries[license_data.get("country") or "(пусто)"] += 1
            expiration = parse_time(license_data.get("expiration_date"))
            if expiration is None:
                license_no_expiration += 1
            elif expiration < now:
                license_expired += 1
            elif expiration < now + timedelta(days=365):
                license_expiring_year += 1

        # --- телефоны
        phones = driver.get("phones") or []
        if not phones:
            phones_missing += 1
        elif len(phones) > 1:
            phones_multiple += 1
        for phone in phones:
            phone_owners[phone].add(driver.get("id"))
            if not PHONE_PATTERN.match(phone or ""):
                phone_bad_format += 1
                if len(phone_bad_examples) < 5:
                    phone_bad_examples.append(mask_phone(phone))

        # --- трудоустройство
        work_status[driver.get("work_status") or "(пусто)"] += 1
        employment_type[driver.get("employment_type") or "(пусто)"] += 1
        selfemployed[repr_flag(driver.get("is_selfemployed"))] += 1
        contract_issue[repr_flag(driver.get("has_contract_issue"))] += 1

        hire_date = parse_time(driver.get("hire_date"))
        if hire_date is None:
            hire_missing += 1
        else:
            hire_years[hire_date.year] += 1

        work_rules[driver.get("work_rule_id") or "(пусто)"] += 1

        # --- автомобиль
        car = record.get("car") or {}
        if not car:
            without_car += 1
        elif car.get("callsign"):
            callsigns[car["callsign"]].add(driver.get("id"))

        updated_buckets[recency_bucket(parse_time(record.get("updated_at")), now)] += 1

    return render_registry(locals())


def classify_mismatch(number, normalized):
    """В чём именно расходятся number и normalized_number."""
    if number.upper() == normalized.upper():
        return "только регистр"
    if re.sub(r"\s", "", number) == re.sub(r"\s", "", normalized):
        return "пробелы"
    if re.sub(r"[\s\-№]", "", number).upper() == re.sub(r"[\s\-№]", "", normalized).upper():
        return "разделители и регистр"
    if re.sub(r"\D", "", number) == re.sub(r"\D", "", normalized):
        return "буквенная часть"
    return "иное"


def repr_flag(value):
    if value is None:
        return "(пусто)"
    return "да" if value else "нет"


def recency_bucket(moment, now):
    if moment is None:
        return "(пусто)"
    age = now - moment
    if age <= timedelta(days=1):
        return "за сутки"
    if age <= timedelta(days=7):
        return "за неделю"
    if age <= timedelta(days=30):
        return "за месяц"
    return "старше месяца"


def render_registry(data):
    profiles = data["profiles"]
    meta = data["meta"]
    parts = []
    add = parts.append

    add(f"## Реестр парка\n\n**Всего профилей в выгрузке: {profiles}**")
    if meta.get("total_reported_by_api") is not None:
        add(f"API сообщил `total`: {meta['total_reported_by_api']}. "
            f"Повторов `id` между страницами: {meta.get('duplicate_ids_between_pages', 0)}, "
            f"различных профилей: {meta.get('distinct_ids', '—')}.")

    # --- ВУ
    add("\n### Водительское удостоверение\n")
    add(table(["Показатель", "Профилей"], [
        ["без объекта `driver_license`", counted(data["without_license"], profiles)],
        ["с пустым `normalized_number`", counted(data["empty_normalized"], profiles)],
    ]))

    shared = {number: statuses for number, statuses in data["license_owners"].items()
              if len(statuses) > 1}
    affected = sum(len(statuses) for statuses in shared.values())
    add(f"**Номера ВУ более чем на одном профиле: {len(shared)}**, "
        f"затронуто профилей: {counted(affected, profiles)}.\n")

    pairs = Counter()
    for statuses in shared.values():
        pairs["+".join(sorted(statuses))] += 1
    add("Разбивка по сочетаниям `work_status` внутри группы:\n")
    add(table(["Сочетание статусов", "Номеров ВУ"],
              [[combination, count] for combination, count in pairs.most_common()]))

    add(f"**Расхождения `number` против `normalized_number`: "
        f"{counted(sum(data['mismatch_kinds'].values()), profiles)}**\n")
    add(table(["В чём расхождение", "Профилей"],
              [[kind, count] for kind, count in data["mismatch_kinds"].most_common()]))
    if data["number_mismatch"]:
        add("Примеры (маскированы): " +
            ", ".join(f"`{number}` → `{normalized}`"
                      for number, normalized in data["number_mismatch"]) + "\n")

    non_uzb = sum(count for country, count in data["countries"].items() if country != "uzb")
    add(f"**`country` не `uzb`: {counted(non_uzb, profiles)}**\n")
    add(table(["country", "Профилей"],
              [[country, count] for country, count in data["countries"].most_common()]))

    add(table(["`expiration_date`", "Профилей"], [
        ["уже истёк", counted(data["license_expired"], profiles)],
        ["истекает в ближайшие 12 месяцев", counted(data["license_expiring_year"], profiles)],
        ["дата не заполнена", counted(data["license_no_expiration"], profiles)],
    ]))

    # --- телефоны
    add("\n### Телефоны\n")
    shared_phones = {phone: owners for phone, owners in data["phone_owners"].items()
                     if len(owners) > 1}
    phone_affected = len(set().union(*shared_phones.values())) if shared_phones else 0
    add(table(["Показатель", "Значение"], [
        ["профилей без телефона", counted(data["phones_missing"], profiles)],
        ["профилей с двумя и более", counted(data["phones_multiple"], profiles)],
        ["номеров более чем на одном профиле", len(shared_phones)],
        ["профилей, затронутых общими номерами", counted(phone_affected, profiles)],
        ["номеров не по формату `+998XXXXXXXXX`", data["phone_bad_format"]],
    ]))
    if data["phone_bad_examples"]:
        add("Примеры не по формату (маскированы): " +
            ", ".join(f"`{phone}`" for phone in data["phone_bad_examples"]) + "\n")

    # --- трудоустройство
    add("\n### Трудоустройство\n")
    add(table(["`work_status`", "Профилей"],
              [[status, counted(count, profiles)]
               for status, count in data["work_status"].most_common()]))
    add(table(["`employment_type`", "Профилей"],
              [[value, counted(count, profiles)]
               for value, count in data["employment_type"].most_common()]))
    add(table(["`is_selfemployed`", "Профилей"],
              [[value, counted(count, profiles)]
               for value, count in data["selfemployed"].most_common()]))
    add(table(["`has_contract_issue`", "Профилей"],
              [[value, counted(count, profiles)]
               for value, count in data["contract_issue"].most_common()]))

    add(f"`hire_date` не заполнена: {counted(data['hire_missing'], profiles)}\n")
    add(table(["Год найма", "Профилей"],
              [[year, data["hire_years"][year]] for year in sorted(data["hire_years"])]))

    # --- условия работы и машина
    add("\n### Условия работы и автомобиль\n")
    rule_names = meta.get("work_rules") or {}
    add(f"Различных `work_rule_id` в выгрузке: **{len(data['work_rules'])}**, "
        f"условий работы в справочнике парка: "
        f"**{len(rule_names) if rule_names else '—'}**\n")
    rule_rows = [[rule if rule == "(пусто)" else f"`{rule}`",
                  rule_names.get(rule, "—"), counted(count, profiles)]
                 for rule, count in data["work_rules"].most_common()]
    # Условия работы без единого профиля тоже строки таблицы: пустое условие
    # и условие, которым никто не пользуется, — разные вещи, и видно это только
    # рядом с остальными.
    rule_rows += [[f"`{rule}`", name, counted(0, profiles)]
                  for rule, name in sorted(rule_names.items(), key=lambda pair: pair[1])
                  if rule not in data["work_rules"]]
    add(table(["`work_rule_id`", "Название", "Профилей"], rule_rows))

    repeated_callsigns = {callsign: owners for callsign, owners in data["callsigns"].items()
                          if len(owners) > 1}
    callsign_affected = (len(set().union(*repeated_callsigns.values()))
                         if repeated_callsigns else 0)
    add(table(["Показатель", "Значение"], [
        ["профилей без `car`", counted(data["without_car"], profiles)],
        ["позывных более чем на одном профиле", len(repeated_callsigns)],
        ["профилей, затронутых повторами позывных", counted(callsign_affected, profiles)],
    ]))

    # --- давность обновления
    add("\n### Давность `updated_at`\n")
    add("Определяет, возможна ли инкрементальная синхронизация реестра.\n")
    order = ["за сутки", "за неделю", "за месяц", "старше месяца", "(пусто)"]
    add(table(["Давность", "Профилей"],
              [[bucket, counted(data["updated_buckets"][bucket], profiles)]
               for bucket in order if data["updated_buckets"][bucket]]))

    # --- ключи
    add("\n### Сводка ключей ответа\n")
    add("По всей выгрузке. «Встречен» — ключ присутствует в записи, «заполнен» — "
        "значение не `null`, не пустая строка и не пустой массив.\n")
    add(table(["Ключ", "Тип", "Встречен", "Заполнен"], list(data["keys"].rows())))

    # --- техника обхода
    add("\n### Техника обхода реестра\n")
    add("Реестр берётся кусками по `work_status` и `work_rule_id`, а не сквозным "
        "`offset`: лимитер Fleet API считает стоимость запроса, и глубокая "
        "offset-страница отбивается независимо от паузы.\n")
    add(table(["Показатель", "Значение"], [
        ["кусков", f"{meta.get('chunks_non_empty', '—')} непустых "
                   f"из {meta.get('chunks_total', '—')}"],
        ["кусков добиралось окнами по `updated_at`",
         len(meta.get("chunks_windowed") or [])],
        ["размер страницы", meta.get("page_size", "—")],
        ["кусок берётся с двух концов от", meta.get("two_end_threshold", "—")],
        ["максимальная глубина `offset`",
         f"{meta.get('max_offset_depth', '—')} при потолке "
         f"{meta.get('max_offset_depth_allowed', '—')}"],
        ["пауза между запросами", f"с {meta.get('pause_start_seconds', '—')} c "
                                  f"до {meta.get('pause_final_seconds', '—')} c"],
        ["запусков выгрузки", meta.get("runs", "—")],
        ["запросов", meta.get("requests", "—")],
        ["отказов по лимиту", meta.get("limit_refusals", "—")],
        ["ждали из-за лимита", f"{meta.get('waited_seconds', '—')} c"],
        ["общее время", f"{meta.get('elapsed_seconds', '—')} c"],
    ]))

    refusals_by_chunk = meta.get("limit_refusals_by_chunk") or {}
    if refusals_by_chunk:
        add("\nОтказы по лимиту в разбивке по кускам. Куски, прошедшие без "
            "единого отказа, в таблицу не попадают.\n")
        add(table(["Кусок", "Отказов", "Размер куска"],
                  [[f"`{key}`", count, (meta.get("chunk_totals") or {}).get(key, "—")]
                   for key, count in sorted(refusals_by_chunk.items(),
                                            key=lambda pair: -pair[1])]))
    else:
        add("\nНи один кусок не получил отказа по лимиту.\n")

    return "\n".join(parts)


# ------------------------------------------------------- отчёт по заказам


def build_orders_section(dump_path, meta):
    orders = 0
    keys = KeyProfile()

    statuses = Counter()
    categories = Counter()
    payment_methods = Counter()
    providers = Counter()
    type_names = Counter()

    filled = Counter()
    without_driver = 0
    route_point_counts = Counter()

    complete_orders = 0
    complete_without_events = 0
    ended_mismatch = 0
    ended_missing_for_complete = 0

    prices, mileages = [], []
    price_zero = price_negative = price_missing = 0
    mileage_zero = mileage_negative = mileage_missing = 0

    for record in read_jsonl(dump_path):
        orders += 1
        keys.add(record)

        statuses[record.get("status") or "(пусто)"] += 1
        categories[record.get("category") or "(пусто)"] += 1
        payment_methods[record.get("payment_method") or "(пусто)"] += 1
        providers[record.get("provider") or "(пусто)"] += 1
        type_names[(record.get("type") or {}).get("name") or "(пусто)"] += 1

        for field in ("price", "mileage", "address_from", "route_points"):
            if is_filled(record.get(field)):
                filled[field] += 1
        driver_id = (record.get("driver_profile") or {}).get("id")
        if driver_id:
            filled["driver_profile.id"] += 1
        else:
            without_driver += 1

        route_points = record.get("route_points") or []
        route_point_counts[len(route_points)] += 1

        events = record.get("events") or []
        if record.get("status") == "complete":
            complete_orders += 1
            if not events:
                complete_without_events += 1
            else:
                ended_at = parse_time(record.get("ended_at"))
                last_event = max((parse_time(event.get("event_at")) for event in events
                                  if parse_time(event.get("event_at"))), default=None)
                if ended_at is None:
                    ended_missing_for_complete += 1
                elif last_event is not None and ended_at != last_event:
                    ended_mismatch += 1

        price = parse_number(record.get("price"))
        if price is None:
            price_missing += 1
        else:
            prices.append(price)
            if price == 0:
                price_zero += 1
            elif price < 0:
                price_negative += 1

        mileage = parse_number(record.get("mileage"))
        if mileage is None:
            mileage_missing += 1
        else:
            mileages.append(mileage)
            if mileage == 0:
                mileage_zero += 1
            elif mileage < 0:
                mileage_negative += 1

    return render_orders(locals())


def numeric_rows(values, zeros, negatives, missing, total):
    """Строки таблицы для price и mileage. Выброс — больше десяти медиан."""
    ordered = sorted(values)
    median = percentile(ordered, 0.50)
    outlier_threshold = median * 10 if median else None
    outliers = sum(1 for value in ordered if outlier_threshold and value > outlier_threshold)
    return [
        ["заполнено", counted(len(ordered), total)],
        ["не заполнено", counted(missing, total)],
        ["нулей", counted(zeros, total)],
        ["отрицательных", counted(negatives, total)],
        ["минимум", f"{ordered[0]:.2f}" if ordered else "—"],
        ["медиана", f"{median:.2f}" if median is not None else "—"],
        ["90-й процентиль", f"{percentile(ordered, 0.90):.2f}" if ordered else "—"],
        ["99-й процентиль", f"{percentile(ordered, 0.99):.2f}" if ordered else "—"],
        ["максимум", f"{ordered[-1]:.2f}" if ordered else "—"],
        ["выбросов (> 10 медиан)",
         counted(outliers, total) if outlier_threshold else "— (медиана 0, порог не определён)"],
        ["порог выброса", f"{outlier_threshold:.0f}" if outlier_threshold else "—"],
    ]


def render_orders(data):
    orders = data["orders"]
    meta = data["meta"]
    parts = []
    add = parts.append

    add(f"\n## Заказы\n\n**Всего заказов в выгрузке: {orders}**")
    add(f"Окно по `ended_at`: `{meta.get('ended_at_from', '—')}` … "
        f"`{meta.get('ended_at_to', '—')}` (UTC), страниц: {meta.get('pages', '—')}.")

    add("\n### Встреченные значения\n")
    for title, counter in (("`status`", data["statuses"]),
                           ("`category`", data["categories"]),
                           ("`payment_method`", data["payment_methods"]),
                           ("`provider`", data["providers"]),
                           ("`type.name`", data["type_names"])):
        add(table([title, "Заказов"],
                  [[value, counted(count, orders)] for value, count in counter.most_common()]))

    add("\n### Заполненность полей\n")
    add(table(["Поле", "Заполнено"],
              [[f"`{field}`", counted(data["filled"][field], orders)]
               for field in ("price", "mileage", "address_from", "route_points",
                             "driver_profile.id")]))
    add(f"**Заказов без водителя (`driver_profile.id` пуст): "
        f"{counted(data['without_driver'], orders)}**\n")

    add("\n### Точки маршрута\n")
    add(table(["Точек в `route_points`", "Заказов"],
              [[count, counted(data["route_point_counts"][count], orders)]
               for count in sorted(data["route_point_counts"])]))
    add(f"Максимум точек: **{max(data['route_point_counts'], default=0)}**\n")

    add("\n### Завершение и события\n")
    add(table(["Показатель", "Значение"], [
        ["заказов со статусом `complete`", counted(data["complete_orders"], orders)],
        ["из них без `events`", counted(data["complete_without_events"],
                                        data["complete_orders"] or 1)],
        ["из них без `ended_at`", counted(data["ended_missing_for_complete"],
                                          data["complete_orders"] or 1)],
        ["из них `ended_at` не совпадает с последним событием",
         counted(data["ended_mismatch"], data["complete_orders"] or 1)],
    ]))

    add("\n### `price` и `mileage`\n")
    add("**`price`**\n")
    add(table(["Показатель", "Значение"],
              numeric_rows(data["prices"], data["price_zero"], data["price_negative"],
                           data["price_missing"], orders)))
    add("**`mileage`**\n")
    add(table(["Показатель", "Значение"],
              numeric_rows(data["mileages"], data["mileage_zero"], data["mileage_negative"],
                           data["mileage_missing"], orders)))

    add("\n### Пагинация\n")
    add(table(["Показатель", "Значение"], [
        ["различных `id`", meta.get("distinct_ids", "—")],
        ["повторов `id` между страницами", meta.get("duplicate_ids_between_pages", "—")],
        ["размер страницы", meta.get("page_size", "—")],
        ["пауза между запросами", f"с {meta.get('pause_start_seconds', '—')} c "
                                  f"до {meta.get('pause_final_seconds', '—')} c"],
        ["запусков выгрузки", meta.get("runs", "—")],
        ["запросов", meta.get("requests", "—")],
        ["отказов по лимиту", meta.get("limit_refusals", "—")],
        ["ждали из-за лимита", f"{meta.get('waited_seconds', '—')} c"],
        ["общее время", f"{meta.get('elapsed_seconds', '—')} c"],
    ]))

    add("\n### Сводка ключей ответа\n")
    add(table(["Ключ", "Тип", "Встречен", "Заполнен"], list(data["keys"].rows())))

    return "\n".join(parts)


# ------------------------------------------------------------------ запуск


def latest_dump(prefix, stamp):
    if stamp:
        path = os.path.join(DUMPS_DIR, f"{prefix}-{stamp}.jsonl")
        if not os.path.exists(path):
            sys.exit(f"не найдена выгрузка {path}")
        return path
    found = sorted(glob.glob(os.path.join(DUMPS_DIR, f"{prefix}-*.jsonl")))
    if not found:
        sys.exit(f"в {DUMPS_DIR} нет выгрузок {prefix}-*.jsonl — сначала запустите экспорт")
    return found[-1]


def load_meta(dump_path):
    meta_path = dump_path.replace(".jsonl", ".meta.json")
    if not os.path.exists(meta_path):
        print(f"   предупреждение: рядом с выгрузкой нет {os.path.basename(meta_path)}, "
              "техника обхода в отчёт не попадёт")
        return {}
    return json.load(open(meta_path, encoding="utf-8"))


def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else None
    registry_dump = latest_dump("driver-profiles", stamp)
    orders_dump = latest_dump("orders", stamp)

    print(f"\nРеестр:  {registry_dump}")
    print(f"Заказы:  {orders_dump}\n")

    registry_section = build_registry_section(registry_dump, load_meta(registry_dump))
    orders_section = build_orders_section(orders_dump, load_meta(orders_dump))

    now = datetime.now(UTC)
    report_path = os.path.join(REPORTS_DIR, f"registry-report-{now:%Y-%m-%d}.md")
    header = (
        f"# Отчёт по выгрузкам Fleet API\n\n"
        f"Сформирован {now:%d.%m.%Y %H:%M} UTC скриптом `scripts/registry-report.py`.\n"
        f"Источники: `{os.path.basename(registry_dump)}`, `{os.path.basename(orders_dump)}` "
        f"из `_reference/fleet-api/dumps/` — сами выгрузки в репозиторий не коммитятся.\n\n"
        f"Отчёт содержит только агрегаты. Номера ВУ и телефоны в примерах маскированы.\n"
    )
    with open(report_path, "w", encoding="utf-8") as handle:
        handle.write(header + "\n" + registry_section + "\n" + orders_section + "\n")

    print(f"\nОтчёт: {report_path}")


if __name__ == "__main__":
    main()

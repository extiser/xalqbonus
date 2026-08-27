#!/usr/bin/env python3
"""
Разведка Yandex Fleet API на живых данных.

Только чтение. Ничего не создаёт, ничего не меняет, в базу не пишет.
Между запросами пауза, при 429 останавливается.

Запуск из корня репозитория:
    python3 scripts/probe-fleet.py

Ключи берутся из .env рядом. Результат печатается в терминал и складывается
в _reference/fleet-api/samples/ с вычищенными персональными данными пассажиров.
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone


def make_ssl_context():
    """
    Питон на macOS часто не видит корневые сертификаты системы: сборка
    с python.org не ходит в связку ключей, и любой https падает с
    CERTIFICATE_VERIFY_FAILED. Берём связку оттуда, где она есть.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    for bundle in ("/etc/ssl/cert.pem",
                   "/opt/homebrew/etc/openssl@3/cert.pem",
                   "/usr/local/etc/openssl@3/cert.pem",
                   "/etc/ssl/certs/ca-certificates.crt"):
        if os.path.exists(bundle):
            return ssl.create_default_context(cafile=bundle)
    return ssl.create_default_context()


SSL_CONTEXT = make_ssl_context()

TZ = timezone(timedelta(hours=5))          # Ташкент
PAUSE = 20.0                                # пауза между запросами, секунд.
                                            # Замер 27.08.2026: три запроса подряд,
                                            # четвёртый — Limit exceeded. Идём медленно.
OUT_DIR = os.path.join("_reference", "fleet-api", "samples")

# ---------------------------------------------------------------- окружение

def load_env(path=".env"):
    if not os.path.exists(path):
        sys.exit(f"не найден {path} — запускайте из корня репозитория")
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for key in ("YANDEX_BASE_URL", "YANDEX_CLIENT_ID", "YANDEX_API_KEY", "YANDEX_PARK_ID"):
        if not env.get(key):
            sys.exit(f"в .env не заполнен {key}")
    return env

E = load_env()
BASE = E["YANDEX_BASE_URL"].rstrip("/")
PARK = E["YANDEX_PARK_ID"]

# ---------------------------------------------------------------- транспорт

stats = {"calls": 0, "429": 0, "waited": 0.0}
RETRIES = 4               # попыток на запрос при 429
RATE_HEADERS = ("retry-after", "x-ratelimit-limit", "x-ratelimit-remaining",
                "x-ratelimit-reset", "ratelimit-limit", "ratelimit-remaining",
                "ratelimit-reset")


def _once(path, body, method, params):
    """Один сетевой вызов. Возвращает (код, тело, секунды, заголовки)."""
    stats["calls"] += 1
    url = BASE + path + params
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "X-Client-ID": E["YANDEX_CLIENT_ID"],
        "X-API-Key": E["YANDEX_API_KEY"],
        "Accept-Language": "ru",
        "Content-Type": "application/json",
    })
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as resp:
            return (resp.status, json.loads(resp.read().decode()),
                    round(time.time() - started, 2), dict(resp.headers))
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = {"raw": raw[:400]}
        return err.code, payload, round(time.time() - started, 2), dict(err.headers or {})
    except Exception as err:                        # сеть, таймаут, TLS
        return 0, {"error": str(err)}, round(time.time() - started, 2), {}


def call(path, body=None, method="POST", params=""):
    """
    Запрос с отступлением при 429. Лимит ключа делится с работающим старым ботом,
    поэтому 429 здесь — норма ожидания, а не аварийная остановка.
    Возвращает (код, тело, секунды) — как раньше.
    """
    delay = 5
    for attempt in range(1, RETRIES + 1):
        code, payload, secs, headers = _once(path, body, method, params)

        seen = {k.lower(): v for k, v in headers.items() if k.lower() in RATE_HEADERS}
        if seen:
            print("      [заголовки лимита] " + ", ".join(f"{k}={v}" for k, v in seen.items()))

        if code != 429:
            return code, payload, secs

        stats["429"] += 1
        retry_after = seen.get("retry-after")
        wait = int(retry_after) if (retry_after or "").isdigit() else delay
        if attempt == RETRIES:
            print(f"      429 на попытке {attempt}, отступать больше не будем")
            return code, payload, secs
        print(f"      429 (попытка {attempt}/{RETRIES}) — жду {wait} c и повторяю")
        time.sleep(wait)
        stats["waited"] += wait
        delay = min(delay * 2, 60)
    return code, payload, secs


def scrub(obj):
    """Убрать персональные данные пассажиров и замаскировать телефоны."""
    if isinstance(obj, dict):
        clean = {}
        for key, value in obj.items():
            if key == "passenger":
                clean[key] = "<<вычищено>>"
            elif key == "phones" and isinstance(value, list):
                clean[key] = [p[:5] + "***" + p[-2:] if len(p) > 8 else "***" for p in value]
            elif key in ("number", "normalized_number") and isinstance(value, str) and len(value) > 4:
                clean[key] = value[:2] + "***" + value[-2:]
            else:
                clean[key] = scrub(value)
        return clean
    if isinstance(obj, list):
        return [scrub(item) for item in obj]
    return obj


def orders_query(ended_from=None, ended_to=None, booked_from=None, booked_to=None,
                 driver=None, limit=1, cursor=None):
    order = {}
    if ended_from:
        order["ended_at"] = {"from": ended_from, "to": ended_to}
    if booked_from:
        order["booked_at"] = {"from": booked_from, "to": booked_to}
    park = {"id": PARK, "order": order}
    if driver:
        park["driver_profile"] = {"id": driver}
    body = {"limit": limit, "query": {"park": park}}
    if cursor:
        body["cursor"] = cursor
    return body


def iso(dt):
    return dt.replace(microsecond=0).isoformat()


results = []

def check(number, title, ok, detail):
    mark = "OK  " if ok else "!!! "
    print(f"{mark}{number}. {title}")
    for line in detail.splitlines():
        print(f"      {line}")
    print()
    results.append((number, title, ok, detail))


def stop_if_throttled(code):
    """
    Раньше здесь была аварийная остановка. Теперь отступление живёт внутри call(),
    и сюда мы попадаем, только если 429 не отпустил за все попытки — тогда
    продолжать бессмысленно: старый бот в этот час занял лимит целиком.
    """
    if code == 429:
        print("\n>>> 429 не отпускает после всех попыток.")
        print(">>> Старый бот сейчас идёт по всем водителям и занимает лимит ключа.")
        print(">>> Запустите разведку с DISABLE_CRON=true либо сразу после того,")
        print(">>> как /xalqbonusbot/status вернёт isRunning: false.")
        sys.exit(1)


# ---------------------------------------------------------------- проверки

now = datetime.now(TZ)
print(f"\nРазведка Fleet API — {now:%d.%m.%Y %H:%M} (Ташкент)")
print(f"Парк: {PARK[:8]}…  База: {BASE}")
print("Только чтение. Пауза между запросами: %.0f c\n" % PAUSE)
print("=" * 72)

# 1 — авторизация и главная гипотеза сразу: запрос без указания водителя
code, payload, secs = call("/v1/parks/orders/list",
                           orders_query(ended_from=iso(now - timedelta(hours=2)),
                                        ended_to=iso(now), limit=1))
stop_if_throttled(code)
if code == 401:
    sys.exit("HTTP 401 — ключи не приняты. Проверьте X-Client-ID и X-API-Key в .env")
if code == 403:
    sys.exit("HTTP 403 — ключ есть, но прав недостаточно.")
if code != 200:
    print(json.dumps(payload, ensure_ascii=False, indent=1)[:1000])
    if "CERTIFICATE_VERIFY_FAILED" in json.dumps(payload):
        print("\nПитон не нашёл корневые сертификаты. Установите связку и повторите:")
        print("    pip3 install --user certifi")
        print("либо, для сборки с python.org, запустите один раз:")
        print('    /Applications/Python\\ 3.*/Install\\ Certificates.command')
    sys.exit(f"HTTP {code} — неожиданный ответ на первом же запросе, разведка прервана")

orders = payload.get("orders", [])
check("01", "Запрос всего парка без указания водителя",
      True,
      f"HTTP 200 за {secs} c. Заказов в ответе: {len(orders)}.\n"
      f"Ключи ответа: {', '.join(payload.keys())}\n"
      "Значит driver_profile в запросе не обязателен — опрос по каждому водителю не нужен.")
time.sleep(PAUSE)

# 2 — идентификатор водителя в каждом заказе
if orders:
    sample = orders[0]
    has_driver = "driver_profile" in sample and sample["driver_profile"].get("id")
    check("02", "Идентификатор водителя присутствует в заказе",
          bool(has_driver),
          f"Поля заказа: {', '.join(sorted(sample.keys()))}\n"
          f"driver_profile.id: {'есть' if has_driver else 'ОТСУТСТВУЕТ — начислять некому'}")
else:
    check("02", "Идентификатор водителя присутствует в заказе", False,
          "За последние 2 часа заказов нет, проверить не на чем — окно расширяется ниже.")

# 3 — что реально приходит в ended_at и как с часовым поясом
if orders:
    s = orders[0]
    check("03", "Формат времени и часовой пояс",
          True,
          f"booked_at: {s.get('booked_at')}\n"
          f"ended_at:  {s.get('ended_at')}\n"
          f"created_at:{s.get('created_at')}\n"
          f"Сейчас в Ташкенте: {iso(now)}")

# 4 — сутки: сколько заказов и работает ли пагинация
day_from, day_to = iso(now - timedelta(days=1)), iso(now)
code, payload, secs = call("/v1/parks/orders/list",
                           orders_query(ended_from=day_from, ended_to=day_to, limit=500))
stop_if_throttled(code)
day_orders = payload.get("orders", []) if code == 200 else []
cursor = payload.get("cursor") if code == 200 else None
check("04", "Окно в сутки, limit 500",
      code == 200,
      f"HTTP {code} за {secs} c. Заказов получено: {len(day_orders)}.\n"
      f"Курсор в ответе: {'есть — значит есть следующая страница' if cursor else 'нет — выборка закончилась'}")
time.sleep(PAUSE)

# 5 — пагинация курсором
if cursor:
    code, payload, secs = call("/v1/parks/orders/list",
                               orders_query(ended_from=day_from, ended_to=day_to,
                                            limit=500, cursor=cursor))
    stop_if_throttled(code)
    page2 = payload.get("orders", []) if code == 200 else []
    first_ids = {o.get("id") for o in day_orders}
    overlap = len({o.get("id") for o in page2} & first_ids)
    check("05", "Пагинация курсором",
          code == 200 and overlap == 0,
          f"HTTP {code}. Вторая страница: {len(page2)} заказов.\n"
          f"Пересечение с первой страницей: {overlap} "
          f"{'— страницы не дублируются' if overlap == 0 else '— ВНИМАНИЕ, курсор нестабилен'}")
    time.sleep(PAUSE)

# 6 — статусы за сутки: подтверждаем связь ended_at и статуса
if day_orders:
    by_status = {}
    empty_ended = 0
    for o in day_orders:
        by_status[o.get("status")] = by_status.get(o.get("status"), 0) + 1
        if not o.get("ended_at"):
            empty_ended += 1
    check("06", "Статусы и заполненность времени завершения",
          True,
          "Статусы за сутки: " + ", ".join(f"{k}={v}" for k, v in sorted(by_status.items())) +
          f"\nЗаказов без ended_at в выборке по ended_at: {empty_ended}\n"
          "Если незавершённые сюда не попадают — фильтр по завершению работает так, как нужно.")

# 7 — длина окна: неделя и месяц
for label, days in (("неделя", 7), ("месяц", 30)):
    code, payload, secs = call("/v1/parks/orders/list",
                               orders_query(ended_from=iso(now - timedelta(days=days)),
                                            ended_to=iso(now), limit=1))
    stop_if_throttled(code)
    check(f"07{days:02d}", f"Окно длиной {label}",
          code == 200,
          f"HTTP {code} за {secs} c. " +
          ("Принято." if code == 200 else f"Отклонено: {json.dumps(payload, ensure_ascii=False)[:200]}"))
    time.sleep(PAUSE)

# 8 — глубина истории: год назад
year_ago = now - timedelta(days=365)
code, payload, secs = call("/v1/parks/orders/list",
                           orders_query(ended_from=iso(year_ago),
                                        ended_to=iso(year_ago + timedelta(days=1)), limit=1))
stop_if_throttled(code)
got = len(payload.get("orders", [])) if code == 200 else 0
check("08", "Глубина истории — окно год назад",
      code == 200,
      f"HTTP {code} за {secs} c. Заказов: {got}.\n"
      + ("История за год доступна — перепроверка прошлого возможна."
         if got else "За тот день заказов не вернулось. Либо их не было, либо история обрезана."))
time.sleep(PAUSE)

# 9 — профили водителей: сколько в парке и отдаются ли телефоны
code, payload, secs = call("/v1/parks/driver-profiles/list",
                           {"query": {"park": {"id": PARK}}, "limit": 1, "offset": 0})
stop_if_throttled(code)
if code == 200:
    total = payload.get("total")
    items = payload.get("driver_profiles", [])
    prof = items[0].get("driver_profile", {}) if items else {}
    phones = prof.get("phones")
    lic = prof.get("driver_license", {}) or {}
    check("09", "Профили водителей парка",
          True,
          f"Всего водителей в парке: {total}\n"
          f"(в нашей базе зарегистрировано 4 099 — разница показывает, кого мы не видим)\n"
          f"Поля профиля: {', '.join(sorted(prof.keys()))}\n"
          f"phones: {'ОТДАЮТСЯ, ' + str(len(phones)) + ' шт.' if phones else 'НЕ отдаются или пусты'}\n"
          f"driver_license: {', '.join(sorted(lic.keys())) if lic else 'нет'}\n"
          f"normalized_number: {'есть — годится как ключ личности' if lic.get('normalized_number') else 'НЕТ'}")
    open(os.path.join(OUT_DIR, "_tmp"), "a").close() if False else None
else:
    check("09", "Профили водителей парка", False,
          f"HTTP {code}: {json.dumps(payload, ensure_ascii=False)[:300]}")

# ---------------------------------------------------------------- сохранение

os.makedirs(OUT_DIR, exist_ok=True)
stamp = now.strftime("%Y-%m-%d")
if day_orders:
    path = os.path.join(OUT_DIR, f"orders-list-{stamp}.json")
    json.dump(scrub(day_orders[:3]), open(path, "w"), ensure_ascii=False, indent=1)
    print(f"Пример ответа заказов сохранён: {path} (персональные данные вычищены)")
if code == 200 and "driver_profiles" in (payload or {}):
    path = os.path.join(OUT_DIR, f"driver-profiles-{stamp}.json")
    json.dump(scrub(payload.get("driver_profiles", [])[:2]), open(path, "w"), ensure_ascii=False, indent=1)
    print(f"Пример профиля водителя сохранён: {path} (телефоны и ВУ замаскированы)")

print("\n" + "=" * 72)
failed = [r for r in results if not r[2]]
print(f"Запросов сделано: {stats['calls']}   Ответов 429: {stats['429']}   Ждали из-за лимита: {stats['waited']:.0f} c")
print(f"Проверок пройдено: {len(results) - len(failed)} из {len(results)}")
if failed:
    print("\nНе прошли:")
    for number, title, _, _ in failed:
        print(f"  {number}. {title}")
print("\nЗамер порога запросов сюда намеренно не включён — он делается отдельно "
      "и осознанно, чтобы не поймать блокировку боевого ключа.\n")

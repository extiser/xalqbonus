#!/usr/bin/env python3
"""
Замер настоящего порога запросов Fleet API.

Запускать ТОЛЬКО при выключенном кроне старого бота
(/xalqbonusbot/status должен вернуть cronStopped: true, isRunning: false).

Логика: сначала полная тишина, чтобы окно лимита сбросилось. Потом по одному
лёгкому запросу с уменьшающейся паузой — пока не прилетит 429. Останавливаемся
на первом же отказе, не долбим. Всего не больше ~25 запросов.

    python3 scripts/probe-ratelimit.py
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=5))
QUIET = 90                 # секунд тишины перед замером
MAX_PROBES = 20            # предохранитель: больше этого не делаем


def make_ssl_context():
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


CTX = make_ssl_context()


def load_env(path=".env"):
    if not os.path.exists(path):
        sys.exit(f"не найден {path} — запускайте из корня репозитория")
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


E = load_env()
BASE = E["YANDEX_BASE_URL"].rstrip("/")
PARK = E["YANDEX_PARK_ID"]


def request(limit=1, hours=2):
    """Один запрос. Возвращает (код, секунды, заголовки, тело)."""
    now = datetime.now(TZ)
    body = {
        "limit": limit,
        "query": {"park": {"id": PARK, "order": {"ended_at": {
            "from": (now - timedelta(hours=hours)).replace(microsecond=0).isoformat(),
            "to": now.replace(microsecond=0).isoformat(),
        }}}},
    }
    req = urllib.request.Request(
        BASE + "/v1/parks/orders/list",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "X-Client-ID": E["YANDEX_CLIENT_ID"],
            "X-API-Key": E["YANDEX_API_KEY"],
            "Accept-Language": "ru",
            "Content-Type": "application/json",
        },
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
            payload = json.loads(resp.read().decode())
            return resp.status, round(time.time() - started, 2), dict(resp.headers), payload
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = {"raw": raw[:400]}
        return err.code, round(time.time() - started, 2), dict(err.headers or {}), payload
    except Exception as err:
        return 0, round(time.time() - started, 2), {}, {"error": str(err)}


print(f"\nЗамер порога запросов — {datetime.now(TZ):%H:%M:%S} (Ташкент)")
print("Крон старого бота должен быть выключен. Проверьте /xalqbonusbot/status.\n")
print("=" * 72)

# --- шаг 1: тишина, чтобы окно лимита сбросилось --------------------------
print(f"\nШаг 1. Тишина {QUIET} c — даём окну лимита сброситься.")
for left in range(QUIET, 0, -15):
    print(f"   осталось {left} c…")
    time.sleep(min(15, left))

# --- шаг 2: первый одиночный запрос, смотрим всё ---------------------------
print("\nШаг 2. Один лёгкий запрос (limit=1) после тишины.\n")
code, secs, headers, payload = request(limit=1)
print(f"   HTTP {code} за {secs} c")
print("   --- все заголовки ответа ---")
for key in sorted(headers):
    print(f"   {key}: {headers[key]}")
if code != 200:
    print("   --- тело ответа ---")
    print("   " + json.dumps(payload, ensure_ascii=False)[:600])
    print("\nПосле полутора минут тишины лимит всё ещё закрыт.")
    print("Значит дело не в частоте наших запросов — ключом пользуется кто-то ещё,")
    print("либо квота считается за длинное окно (час или сутки).")
    print("Дальше мерить бессмысленно, разбираться надо на стороне парка и Яндекса.")
    sys.exit(0)

print("\n   Лимит отпустил. Значит окно короткое и восстанавливается.\n")

# --- шаг 3: сколько лёгких запросов подряд проходит ------------------------
print("Шаг 3. Считаем, сколько запросов проходит подряд. Пауза 3 c, стоп на первом 429.\n")
ok = 0
started_at = time.time()
for i in range(1, MAX_PROBES + 1):
    code, secs, headers, payload = request(limit=1)
    elapsed = round(time.time() - started_at, 1)
    mark = "ok " if code == 200 else "!!!"
    print(f"   {mark} запрос {i:2d}  HTTP {code}  {secs:4.2f} c   (с начала: {elapsed} c)")
    if code == 429:
        rate = ok / elapsed * 60 if elapsed else 0
        print(f"\n   Порог найден: {ok} успешных запросов за {elapsed} c "
              f"(~{rate:.0f} запросов в минуту).")
        retry_after = {k.lower(): v for k, v in headers.items()}.get("retry-after")
        print(f"   Retry-After: {retry_after if retry_after else 'не прислан'}")
        print("   Тело отказа: " + json.dumps(payload, ensure_ascii=False)[:300])
        break
    if code != 200:
        print(f"   неожиданный код, останавливаемся: {json.dumps(payload, ensure_ascii=False)[:200]}")
        break
    ok += 1
    time.sleep(3)
else:
    print(f"\n   {MAX_PROBES} запросов подряд прошли без отказа — предохранитель сработал.")
    print("   При паузе 3 c порог не достигается, этого для наших целей достаточно.")

print("\n" + "=" * 72)
print("""
Что это значит для проекта.

Живому синку нужен ОДИН запрос в минуту на окно заказов плюс несколько
запросов в сутки на профили водителей. Если выше получилось хотя бы
несколько запросов в минуту — запаса хватает с многократным перекрытием,
и узкое место не в лимите, а в том, кто ещё пользуется этим ключом.
""")

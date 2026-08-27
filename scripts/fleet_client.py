#!/usr/bin/env python3
"""
Общий транспорт к Yandex Fleet API для скриптов выгрузки.

Только чтение. Ничего не создаёт, ничего не меняет, в базу не пишет.

Правила обхода, общие для всех выгрузок:
  - запросы строго последовательные, никакого параллелизма;
  - пауза между запросами не меньше MIN_PAUSE;
  - на отказ по лимиту пауза удваивается, попыток на страницу не больше MAX_ATTEMPTS;
  - когда попытки исчерпаны — остановка с ошибкой, а не тихий пропуск страницы.

Модуль импортируется скриптами рядом, самостоятельно не запускается.
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import timezone

MIN_PAUSE = 1.5             # пауза между запросами, секунд
MAX_ATTEMPTS = 5            # попыток на одну страницу при отказе по лимиту
FIRST_BACKOFF = 5.0         # пауза перед первым повтором, дальше удваивается
MAX_BACKOFF = 120.0         # выше этого пауза не растёт

DUMPS_DIR = os.path.join("_reference", "fleet-api", "dumps")
REPORTS_DIR = os.path.join("_reference", "fleet-api")

UTC = timezone.utc


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


def load_env(path=".env"):
    if not os.path.exists(path):
        sys.exit(f"не найден {path} — запускайте из корня репозитория")
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    for key in ("YANDEX_BASE_URL", "YANDEX_CLIENT_ID", "YANDEX_API_KEY", "YANDEX_PARK_ID"):
        if not env.get(key):
            sys.exit(f"в .env не заполнен {key}")
    return env


def iso_utc(moment):
    """ISO 8601 с зоной — Fleet API отвечает и фильтрует в UTC."""
    return moment.astimezone(UTC).replace(microsecond=0).isoformat()


class FleetClient:
    """Последовательный клиент Fleet API с отступлением по лимиту."""

    def __init__(self):
        env = load_env()
        self.base_url = env["YANDEX_BASE_URL"].rstrip("/")
        self.client_id = env["YANDEX_CLIENT_ID"]
        self.api_key = env["YANDEX_API_KEY"]
        self.park_id = env["YANDEX_PARK_ID"]
        self.requests_made = 0
        self.limit_refusals = 0
        self.waited_seconds = 0.0
        self.started_at = time.time()
        self.last_request_at = 0.0

    # ---------------------------------------------------------- транспорт

    def _single_request(self, path, body):
        """Один сетевой вызов. Возвращает (код, тело, секунды)."""
        self.requests_made += 1
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(body).encode(),
            method="POST",
            headers={
                "X-Client-ID": self.client_id,
                "X-API-Key": self.api_key,
                "Accept-Language": "ru",
                "Content-Type": "application/json",
            },
        )
        started = time.time()
        try:
            with urllib.request.urlopen(request, timeout=120, context=SSL_CONTEXT) as response:
                return (response.status,
                        json.loads(response.read().decode()),
                        round(time.time() - started, 2))
        except urllib.error.HTTPError as error:
            raw = error.read().decode(errors="replace")
            try:
                payload = json.loads(raw)
            except ValueError:
                payload = {"raw": raw[:400]}
            return error.code, payload, round(time.time() - started, 2)
        except Exception as error:                      # сеть, таймаут, TLS
            return 0, {"error": str(error)}, round(time.time() - started, 2)

    def _respect_pause(self):
        """Выдержать MIN_PAUSE с момента предыдущего запроса."""
        if not self.last_request_at:
            return
        remaining = MIN_PAUSE - (time.time() - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def post(self, path, body, description):
        """
        Запрос страницы. При отказе по лимиту повторяет с удвоением паузы.
        Когда попытки кончились — останавливает скрипт: пропустить страницу
        нельзя, выгрузка с дырой хуже, чем её отсутствие.
        """
        backoff = FIRST_BACKOFF
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._respect_pause()
            code, payload, seconds = self._single_request(path, body)
            self.last_request_at = time.time()

            if code == 200:
                return payload, seconds

            if code == 429:
                self.limit_refusals += 1
                if attempt == MAX_ATTEMPTS:
                    break
                print(f"      отказ по лимиту ({attempt}/{MAX_ATTEMPTS}) на «{description}» — "
                      f"жду {backoff:.0f} c и повторяю")
                time.sleep(backoff)
                self.waited_seconds += backoff
                backoff = min(backoff * 2, MAX_BACKOFF)
                continue

            if code == 401:
                sys.exit("HTTP 401 — ключи не приняты. Проверьте X-Client-ID и X-API-Key в .env")
            if code == 403:
                sys.exit("HTTP 403 — ключ есть, но прав недостаточно.")

            detail = json.dumps(payload, ensure_ascii=False)[:400]
            if "CERTIFICATE_VERIFY_FAILED" in detail:
                sys.exit("Питон не нашёл корневые сертификаты. Установите связку:\n"
                         "    pip3 install --user certifi")
            sys.exit(f"HTTP {code} на «{description}», выгрузка прервана: {detail}")

        sys.exit(
            f"\nОстановка: «{description}» не прошла за {MAX_ATTEMPTS} попыток — лимит ключа не отпустил.\n"
            f"Всего отказов по лимиту за прогон: {self.limit_refusals}, "
            f"ждали {self.waited_seconds:.0f} c.\n"
            "Продолжать нельзя: страница пропущена не будет, выгрузка с дырой бесполезна.\n"
            "Решение о выключении крона старого бота принимает Руслан — скрипт этого не делает."
        )

    # ---------------------------------------------------------- статистика

    def stats(self):
        return {
            "requests": self.requests_made,
            "limit_refusals": self.limit_refusals,
            "waited_seconds": round(self.waited_seconds, 1),
            "elapsed_seconds": round(time.time() - self.started_at, 1),
        }

    def print_stats(self, title):
        stats = self.stats()
        print(f"\n{title}: запросов {stats['requests']}, "
              f"отказов по лимиту {stats['limit_refusals']}, "
              f"ждали из-за лимита {stats['waited_seconds']:.0f} c, "
              f"всего {stats['elapsed_seconds']:.0f} c")


class DumpWriter:
    """
    Пишет JSONL через временный файл. Повторный запуск перезаписывает выгрузку
    целиком: подмена происходит одним os.replace в самом конце, поэтому
    оборванный прогон не оставляет полуфабрикат под именем выгрузки.
    """

    def __init__(self, path):
        self.path = path
        self.temp_path = path + ".tmp"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.handle = open(self.temp_path, "w", encoding="utf-8")
        self.written = 0

    def write(self, record):
        self.handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.written += 1

    def commit(self):
        self.handle.close()
        os.replace(self.temp_path, self.path)
        return self.written

    def discard(self):
        """
        Оборванная выгрузка удаляется целиком: без всех страниц она бесполезна,
        а хранить персональные данные, которыми нельзя пользоваться, незачем.
        """
        self.handle.close()
        if os.path.exists(self.temp_path):
            os.remove(self.temp_path)


def read_jsonl(path):
    """Построчное чтение выгрузки. Ленивое: файлы бывают в сотни мегабайт."""
    if not os.path.exists(path):
        sys.exit(f"не найдена выгрузка {path} — сначала запустите скрипт экспорта")
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)

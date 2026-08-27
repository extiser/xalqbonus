#!/usr/bin/env python3
"""
Общий транспорт к Yandex Fleet API и возобновляемая выгрузка для скриптов рядом.

Только чтение. Ничего не создаёт, ничего не меняет, в базу не пишет.

Правила обхода, общие для всех выгрузок:
  - запросы строго последовательные, никакого параллелизма;
  - стартовая пауза задаётся аргументом скрипта и не опускается ниже MIN_PAUSE;
  - на отказ по лимиту пауза повтора удваивается, попыток на страницу
    не больше MAX_ATTEMPTS;
  - отказ по лимиту поднимает паузу между запросами на весь остаток прогона,
    а не только для текущей страницы: квота Fleet API скользящая и пополняется
    медленно, разгон обратно упирается в ту же границу на следующей странице;
  - когда попытки исчерпаны — остановка с ошибкой, а не тихий пропуск страницы.

Модуль импортируется скриптами рядом, самостоятельно не запускается.
"""

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

MIN_PAUSE = 1.5             # ниже этого пауза между запросами не опускается
MAX_PAUSE = 45.0            # выше этого пауза между запросами не растёт
MAX_ATTEMPTS = 5            # попыток на одну страницу при отказе по лимиту
FIRST_BACKOFF = 5.0         # пауза перед первым повтором, дальше удваивается
MAX_BACKOFF = 120.0         # выше этого пауза повтора не растёт

DUMPS_DIR = os.path.join("_reference", "fleet-api", "dumps")
REPORTS_DIR = os.path.join("_reference", "fleet-api")

UTC = timezone.utc

EMPTY_TOTALS = {
    "runs": 0,
    "requests": 0,
    "limit_refusals": 0,
    "waited_seconds": 0.0,
    "elapsed_seconds": 0.0,
    "pause_final_seconds": 0.0,
}


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


def parse_export_args(description):
    """Общие аргументы обоих скриптов выгрузки."""
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "pause", nargs="?", type=float, default=MIN_PAUSE,
        help=f"стартовая пауза между запросами в секундах, не меньше {MIN_PAUSE} "
             f"(по умолчанию {MIN_PAUSE})")
    parser.add_argument(
        "--restart", action="store_true",
        help="сбросить чекпоинт и начать обход с нуля вместо продолжения")
    return parser.parse_args()


# ---------------------------------------------------------------- транспорт


class FleetClient:
    """Последовательный клиент Fleet API с отступлением по лимиту."""

    def __init__(self, start_pause=MIN_PAUSE):
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
        self.start_pause = max(start_pause, MIN_PAUSE)
        self.pause = self.start_pause          # растёт на отказах и не опускается

    def _single_request(self, path, body, method, query):
        """Один сетевой вызов. Возвращает (код, тело, секунды)."""
        self.requests_made += 1
        url = self.base_url + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode() if body is not None else None,
            method=method,
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
        """Выдержать текущую паузу с момента предыдущего запроса."""
        if not self.last_request_at:
            return
        remaining = self.pause - (time.time() - self.last_request_at)
        if remaining > 0:
            time.sleep(remaining)

    def _slow_down(self):
        """
        Отказ по лимиту означает, что выбранный темп для этого ключа слишком
        быстрый. Сбавляем на весь остаток прогона: назад пауза не отыгрывается,
        иначе следующая страница снова упрётся в ту же границу.
        """
        self.pause = min(max(self.pause * 2, FIRST_BACKOFF), MAX_PAUSE)

    def post(self, path, body, description):
        """Список: тело запроса уходит в JSON, как во всех методах выборки."""
        return self._with_retries(path, body, description, "POST", None)

    def get(self, path, query, description):
        """Справочник: параметры уходят в строку запроса, тела нет."""
        return self._with_retries(path, None, description, "GET", query)

    def _with_retries(self, path, body, description, method, query):
        """
        Запрос страницы. При отказе по лимиту повторяет с удвоением паузы.
        Когда попытки кончились — останавливает скрипт: пропустить страницу
        нельзя, выгрузка с дырой хуже, чем её отсутствие.
        """
        backoff = FIRST_BACKOFF
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._respect_pause()
            code, payload, seconds = self._single_request(path, body, method, query)
            self.last_request_at = time.time()

            if code == 200:
                return payload, seconds

            if code == 429:
                self.limit_refusals += 1
                self._slow_down()
                if attempt == MAX_ATTEMPTS:
                    break
                print(f"      отказ по лимиту ({attempt}/{MAX_ATTEMPTS}) на «{description}» — "
                      f"жду {backoff:.0f} c, дальше пауза {self.pause:.0f} c")
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

        raise LimitExhausted(description, self.limit_refusals, self.waited_seconds)

    def stats(self):
        return {
            "runs": 1,
            "requests": self.requests_made,
            "limit_refusals": self.limit_refusals,
            "waited_seconds": round(self.waited_seconds, 1),
            "elapsed_seconds": round(time.time() - self.started_at, 1),
            "pause_start_seconds": self.start_pause,
            "pause_final_seconds": round(self.pause, 1),
        }


class LimitExhausted(Exception):
    """
    Попытки на страницу кончились. Отдельным исключением, а не sys.exit:
    выгрузка должна успеть закрыть .part и чекпоинт, чтобы следующий запуск
    продолжил с этого места, а не начал обход заново.
    """

    def __init__(self, description, refusals, waited):
        super().__init__(description)
        self.description = description
        self.refusals = refusals
        self.waited = waited


# ------------------------------------------------------ возобновляемая выгрузка


class ResumableDump:
    """
    Выгрузка, переживающая обрыв.

    Страницы дописываются в `.part.jsonl` по мере получения, рядом лежит
    чекпоинт с позицией обхода. Итоговый файл под именем с датой появляется
    атомарной заменой только когда обход дошёл до конца.

    Порядок записи важен: сначала страница на диск и `fsync`, только потом
    чекпоинт. Обратный порядок оставил бы чекпоинт, обещающий страницы,
    которых в файле нет, и следующий запуск пропустил бы их молча.

    Чекпоинт хранит длину `.part` в байтах. При возобновлении файл обрезается
    до неё: хвост, дописанный после последнего чекпоинта, — это ровно те
    записи, про которые мы не знаем, на какой они позиции обхода.
    """

    def __init__(self, base_name, extract_id, restart=False, layout=None,
                 skip_duplicates=False):
        self.base_name = base_name
        self.extract_id = extract_id
        # Раскладка позиции обхода. Чекпоинт с чужой раскладкой продолжать нельзя:
        # прежний обход описывал позицию иначе, и его числа для нового обхода
        # означают не то же самое.
        self.layout = layout
        self.skip_duplicates = skip_duplicates
        self.part_path = os.path.join(DUMPS_DIR, f"{base_name}.part.jsonl")
        self.checkpoint_path = os.path.join(DUMPS_DIR, f"{base_name}.checkpoint.json")
        os.makedirs(DUMPS_DIR, exist_ok=True)

        self.position = None
        self.context = {}
        self.records = 0
        self.duplicates = 0
        self.seen_ids = set()
        self.carried = dict(EMPTY_TOTALS)
        self.resumed = False
        self.stamp = datetime.now(UTC).strftime("%Y-%m-%d")

        checkpoint = None if restart else self._load_checkpoint()
        if checkpoint:
            self._restore(checkpoint)
        else:
            self._reset()
        # Длину считаем сами: tell() у текстового потока возвращает непрозрачный
        # маркер, а чекпоинт сравнивается с реальным размером файла на диске.
        self.bytes_written = os.path.getsize(self.part_path) if os.path.exists(self.part_path) else 0
        self.handle = open(self.part_path, "a", encoding="utf-8")

    # ---------------------------------------------------------- чекпоинт

    def _load_checkpoint(self):
        if not os.path.exists(self.checkpoint_path):
            return None
        try:
            checkpoint = json.load(open(self.checkpoint_path, encoding="utf-8"))
        except ValueError:
            print(f"   чекпоинт {os.path.basename(self.checkpoint_path)} не читается — "
                  "начинаю обход заново")
            return None
        if not os.path.exists(self.part_path):
            print("   чекпоинт есть, а выгрузки рядом нет — начинаю обход заново")
            return None
        if checkpoint.get("layout") != self.layout:
            print(f"   чекпоинт от прежней раскладки обхода "
                  f"({checkpoint.get('layout') or 'без имени'}) несовместим "
                  f"с нынешней ({self.layout or 'без имени'}) — начинаю обход заново")
            return None
        return checkpoint

    def _reset(self):
        for path in (self.part_path, self.checkpoint_path):
            if os.path.exists(path):
                os.remove(path)

    def _restore(self, checkpoint):
        self.stamp = checkpoint.get("stamp", self.stamp)
        self.position = checkpoint.get("position")
        self.context = checkpoint.get("context") or {}
        self.carried = {**EMPTY_TOTALS, **(checkpoint.get("totals") or {})}

        # Обрезаем хвост, дописанный после последнего чекпоинта.
        promised_bytes = checkpoint.get("bytes", 0)
        actual_bytes = os.path.getsize(self.part_path)
        if actual_bytes > promised_bytes:
            with open(self.part_path, "r+b") as handle:
                handle.truncate(promised_bytes)
            print(f"   отброшен хвост {actual_bytes - promised_bytes} байт "
                  "после последнего чекпоинта")

        for line in open(self.part_path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            self.records += 1
            record_id = self.extract_id(json.loads(line))
            if record_id in self.seen_ids:
                self.duplicates += 1
            else:
                self.seen_ids.add(record_id)

        # Повторы, снятые при записи, в файле не лежат — их число живёт только
        # в чекпоинте, иначе после продолжения счётчик начинался бы с нуля.
        self.duplicates = max(self.duplicates, checkpoint.get("duplicates", 0))

        promised_records = checkpoint.get("records")
        if promised_records is not None and promised_records != self.records:
            print(f"   ВНИМАНИЕ: чекпоинт обещал {promised_records} записей, "
                  f"в файле {self.records} — продолжаю по файлу")
        self.resumed = True

    def _save_checkpoint(self, position, stats):
        checkpoint = {
            "stamp": self.stamp,
            "layout": self.layout,
            "position": position,
            "context": self.context,
            "records": self.records,
            "bytes": self.bytes_written,
            "duplicates": self.duplicates,
            "updated_at": datetime.now(UTC).isoformat(),
            "totals": self.totals(stats),
        }
        temporary = self.checkpoint_path + ".tmp"
        with open(temporary, "w", encoding="utf-8") as handle:
            json.dump(checkpoint, handle, ensure_ascii=False, indent=1)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.checkpoint_path)
        self.position = position

    # ------------------------------------------------------------ запись

    def write_page(self, records, position, stats):
        """Страница на диск, затем чекпоинт. Порядок менять нельзя."""
        for record in records:
            record_id = self.extract_id(record)
            if record_id in self.seen_ids:
                self.duplicates += 1
                # Половины куска перекрываются в середине по построению обхода.
                # Повтор считаем, но в выгрузку не пишем: отчёт считает профили
                # по строкам файла, и задвоенная строка сломала бы все агрегаты.
                if self.skip_duplicates:
                    continue
            else:
                self.seen_ids.add(record_id)
            line = json.dumps(record, ensure_ascii=False) + "\n"
            self.handle.write(line)
            self.bytes_written += len(line.encode("utf-8"))
            self.records += 1
        self.handle.flush()
        os.fsync(self.handle.fileno())
        self._save_checkpoint(position, stats)

    def totals(self, stats):
        """Итоги по всем запускам выгрузки, а не только по текущему."""
        return {
            "runs": self.carried["runs"] + stats["runs"],
            "requests": self.carried["requests"] + stats["requests"],
            "limit_refusals": self.carried["limit_refusals"] + stats["limit_refusals"],
            "waited_seconds": round(self.carried["waited_seconds"] + stats["waited_seconds"], 1),
            "elapsed_seconds": round(self.carried["elapsed_seconds"] + stats["elapsed_seconds"], 1),
            "pause_final_seconds": max(self.carried["pause_final_seconds"],
                                       stats["pause_final_seconds"]),
        }

    @property
    def dump_path(self):
        return os.path.join(DUMPS_DIR, f"{self.base_name}-{self.stamp}.jsonl")

    @property
    def meta_path(self):
        return os.path.join(DUMPS_DIR, f"{self.base_name}-{self.stamp}.meta.json")

    def commit(self, stats, extra_meta=None):
        """
        Обход дошёл до конца: .part становится выгрузкой одной заменой,
        чекпоинт снимается.
        """
        self.handle.flush()
        os.fsync(self.handle.fileno())
        self.handle.close()
        os.replace(self.part_path, self.dump_path)
        if os.path.exists(self.checkpoint_path):
            os.remove(self.checkpoint_path)

        meta = {
            "dump": os.path.basename(self.dump_path),
            "finished_at": datetime.now(UTC).isoformat(),
            "records": self.records,
            "duplicate_ids_between_pages": self.duplicates,
            "distinct_ids": len(self.seen_ids),
            **self.context,
            **self.totals(stats),
            "pause_start_seconds": stats["pause_start_seconds"],
        }
        meta.update(extra_meta or {})
        json.dump(meta, open(self.meta_path, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        return meta

    def keep(self, stats):
        """
        Обход оборвался: дописываем в чекпоинт итоги оборванного запуска и
        оставляем .part на месте для продолжения. Позиция не двигается —
        страница, на которой встали, не получена.

        Без этого запросы упавшей страницы не попадали бы в счётчики вовсе,
        а это ровно те запросы, которые уткнулись в лимит.
        """
        self.handle.flush()
        os.fsync(self.handle.fileno())
        self._save_checkpoint(self.position, stats)
        self.handle.close()


def read_jsonl(path):
    """Построчное чтение выгрузки. Ленивое: файлы бывают в сотни мегабайт."""
    if not os.path.exists(path):
        sys.exit(f"не найдена выгрузка {path} — сначала запустите скрипт экспорта")
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)

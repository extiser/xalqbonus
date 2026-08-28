# XalqBonus

Бонусная программа таксопарка Xalq Taxi. Переписанная версия проекта
`../xalqbonusbot` — Nuxt 4 + Nitro, Prisma, BullMQ, PostgreSQL 16,
Telegram Mini App как основной интерфейс.

## Состояние

Этап 0 — окружение готово: стек поднимается, ядро не спроектировано.

## Навигация

| Куда | Что там |
|---|---|
| `CLAUDE.md` | инструкции для Claude Code CLI: режим работы, pre-flight, ограничения |
| `docs/` | спецификации — источник истины. Начинать с `docs/README.md` |
| `docs/analysis.md` | почему переписываем, модель данных, алгоритм синхронизации |
| `docs/roadmap.md` | пошаговая реализация, что чем блокируется |
| `docker/` | описания стеков — `local`, `prod`, входная дверь машины |
| `Makefile` | единственная входная дверь: `make help` печатает список целей |
| `../xalqbonusbot/docs/` | разбор старого проекта |

Задачи живут на GitHub — `github.com/extiser/xalqbonus/issues`.

## Порты

Смещены, чтобы не конфликтовать с другими локальными проектами:
приложение **3003**, PostgreSQL **5434**, Redis **6381**.

## Быстрый старт

```bash
cp .env.example .env                                     # заполнить ключи Fleet API
make up-d                                                # app, worker, postgres, redis
make db-restore dump=_backup/<файл>.dump                 # продовый дамп в схему public
```

`make db-restore` заводит заодно пустую схему `xb` и отказывается работать, если
`public` уже наполнена. Наши таблицы живут только в `xb`, `public` принадлежит
старому боту и только читается.

Проверка: `curl localhost:3003/api/health` и `curl localhost:3003/api/ready`.

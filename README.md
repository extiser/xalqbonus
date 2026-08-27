# XalqBonus

Бонусная программа таксопарка Xalq Taxi. Переписанная версия проекта
`../xalqbonusbot` — Nuxt 4 + Nitro, Prisma, BullMQ, PostgreSQL 16,
Telegram Mini App как основной интерфейс.

## Состояние

Этап 0 — окружение. Кода пока нет.

## Навигация

| Куда | Что там |
|---|---|
| `CLAUDE.md` | инструкции для Claude Code CLI: режим работы, pre-flight, ограничения |
| `docs/` | спецификации — источник истины. Начинать с `docs/README.md` |
| `docs/analysis.md` | почему переписываем, модель данных, алгоритм синхронизации |
| `docs/roadmap.md` | пошаговая реализация, что чем блокируется |
| `issues/` | задачи для CLI, одна задача = один файл = один PR |
| `product/` | продуктовые обсуждения, утверждаются с заказчиком |
| `../xalqbonusbot/docs/` | разбор старого проекта |

## Порты

Смещены, чтобы не конфликтовать с другими локальными проектами:
PostgreSQL **5433**, Redis **6380**.

## Быстрый старт

```bash
cp .env.example .env      # заполнить ключи Fleet API
docker compose up -d
# дальше — issues/01-infra-environment.md
```

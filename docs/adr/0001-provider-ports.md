# ADR 0001: Внешние системы подключаются через порты

- Статус: принято
- Дата: 2026-08-14

## Решение

Application зависит от `IdentityProvider`, `PropertyProvider`, `SigningProvider`, `NotificationProvider` и `DocumentStorageProvider`, но не от vendor SDK/DTO. Выбор реализации выполняет server-only composition root. Production не переключается на mock автоматически.

## Последствия

Можно реализовывать и тестировать core без внешних API и заменять интеграции отдельно. Потребуются mapping/contract tests и поддержка adapters как самостоятельных модулей.

# ADR 0002: Business state является серверным

- Статус: принято
- Дата: 2026-08-14

## Решение

Identity, property eligibility, vote drafts/submissions, signing evidence и документы хранятся и проверяются сервером. Browser storage разрешён только для неопасных UI preferences. Session — opaque cookie плюс server-side store.

## Последствия

Перезагрузка текущего demo больше не восстанавливает ответы и canvas-подпись. Полноценное продолжение черновика появится после database repository; это осознанный security trade-off.

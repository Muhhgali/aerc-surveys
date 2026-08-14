# Модель данных Stage 2.5

Источник истины схемы — `src/infrastructure/database/schema.ts` и последовательные SQL-миграции в `drizzle/`. Таблицы нельзя создавать вручную через Supabase Dashboard. Domain и application layers не импортируют Supabase SDK: runtime использует Drizzle/PostgreSQL через `postgres.js`.

## Таблицы

- Identity: `users`, `external_identities`, `auth_sessions`.
- Organizations: `organizations`, `organization_members`.
- Property read model: `properties`, `personal_accounts`.
- Survey: `surveys`, `survey_questions`, `survey_targets`, `survey_participants`.
- Voting: `vote_sessions`, `votes`, `vote_answers`, `vote_autosaves`.
- Зарезервировано для следующего этапа: `signature_requests`, `documents`, `document_versions`.
- Traceability: `audit_logs`, `integration_requests`.

`properties` и `personal_accounts` — локальная read model. После подключения Астана-ЕРЦ authoritative ownership/relationship остаётся у внешней системы, а нормализованный результат сохраняется через repository boundary.

## Ключевые инварианты

- `external_identities(provider, provider_subject)` уникален.
- `auth_sessions.token_hash` уникален; raw token в базе отсутствует.
- Участник уникален по survey/user/property.
- Один незавершённый workflow обеспечивается partial unique index по survey/user/property для любого статуса кроме `invalidated`.
- Второй `submitted` vote запрещён отдельным partial unique index.
- В `vote_answers` одна строка на `(vote_id, question_id)`; autosave выполняет upsert.
- `vote_autosaves(vote_id, idempotency_key)` уникален и хранит hash payload для обнаружения replay с другим содержимым.
- Final submit блокирует vote, повторно проверяет ownership, survey window, eligibility и полноту required questions в одной PostgreSQL transaction.

## Миграции и fixtures

```bash
npm run db:generate
npm run db:migrate
npm run db:check
npm run db:smoke
```

Development seed содержит mock identity, организацию, дом по адресу Геодезическая 12, квартиру 52, счёт 1911, Protocol №12 и шесть required questions. Счёт 1911 допустим только в seed и `MockPropertyProvider` fixture.

Seed намеренно fail-closed: нужны одновременно `APP_ENV=development`, `ALLOW_DEVELOPMENT_SEED=true` и `DEVELOPMENT_DATABASE_NAME`, точно совпадающий с именем базы в `DATABASE_URL`. Reset дополнительно требует `CONFIRM_DEVELOPMENT_RESET=RESET_DEVELOPMENT_DATA`.

PGlite используется только migration/constraint tests. Staging и production обязаны иметь явно настроенный persistent PostgreSQL.

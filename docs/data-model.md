# Production data model и backend API

## PostgreSQL

TypeScript source of truth: `src/infrastructure/database/schema.ts`. Версионируемая миграция находится в `drizzle/`. Drizzle Kit используется для generate/migrate, production runtime — PostgreSQL через `postgres.js`.

### Группы таблиц

- Identity: `users`, `external_identities`, `auth_sessions`.
- Organizations: `organizations`, `organization_members`.
- AERC read model: `properties`, `personal_accounts`.
- Survey definition: `surveys`, `survey_questions`, `survey_targets`.
- Eligibility/voting: `survey_participants`, `vote_sessions`, `votes`, `vote_answers`.
- Signing/documents: `signature_requests`, `documents`, `document_versions`.
- Traceability: `audit_logs`, `integration_requests`.

`properties` и `personal_accounts` — локальная read model/cache, не authoritative ownership registry. После интеграции источником истины остаётся Астана-ЕРЦ; локальные строки получают source, external IDs и `last_verified_at`.

## Инварианты

- `external_identities(provider, provider_subject)` уникален.
- Membership уникален по user/organization.
- Survey question position уникальна в рамках survey.
- Participant уникален по survey/user/property.
- Partial unique index на `votes(survey_id, user_id, property_id) WHERE status='submitted'` запрещает второй итоговый голос.
- Idempotency keys уникальны в `vote_sessions` и `votes`.
- Target check constraint требует ссылку, соответствующую типу building/property/organization/personal account.
- Server validation дополнительно проверяет active survey/time window, participant eligibility и полный набор required answers.

## Trusted HTTP boundaries

| Endpoint | Назначение | Trust rules |
|---|---|---|
| `POST /api/personal-accounts/resolve` | разрешить счёт и проверить связь identity/property | user берётся только из HttpOnly session; body содержит только account reference |
| `POST /api/surveys/:surveyId/votes` | идемпотентно записать итоговый голос | user/property/status игнорировать невозможно: strict Zod schema их не принимает |
| `DELETE /api/session` | revoke server session | session ID читается из cookie |
| `POST /api/dev/session` | development mock login | недоступен при `NODE_ENV=production`, требует mock identity и seed |

Все payloads проходят Zod validation. Request ID создаётся сервером либо принимается только в ограниченном безопасном формате. Ошибки не возвращают stack/provider payload.

## Development seed

Seed идемпотентно создаёт ТОО «ОСИ-КСК», дом Астана/Геодезическая/12, квартиру 52, счёт 1911, Protocol №12, шесть вопросов, mock identity, eligible participant и development auth session. BIN и identity относятся только к development fixtures.

## Команды

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Миграции требуют `DATABASE_URL`. CI tests дополнительно применяют SQL migration к изолированному embedded PostgreSQL/PGlite и проверяют database constraints.

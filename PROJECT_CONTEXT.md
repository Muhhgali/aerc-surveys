# PROJECT_CONTEXT — aerc-surveys

Фактическая память проекта. Обновляйте после существенных изменений. Секреты и содержимое `.env` сюда не помещать.

**Последнее обновление:** 2026-08-21  
**Текущая ветка:** `stage-5-voting-workflow`  
**Remote:** `origin` → https://github.com/Muhhgali/aerc-surveys.git

---

## Назначение продукта

Веб-система электронных опросов собственников жилья для **Астана-ЕРЦ** (Protocol-style голосования по дому/квартире). Пользовательский сценарий: вход через identity provider → выбор опроса → привязка лицевого счёта → ответы → визуальная подпись → server-side signing → immutable PDF → архив и публичная верификация документа.

Административный контур: создание/публикация опросов, таргетинг, результаты, участники, документы, аудит, управление platform roles.

**Текущий статус:** demo UI сохранён + backend foundation stages 2–4 + полный цикл голосования (stage 5 workflow) на mock-провайдерах. Production pilot **не готов** без real integrations и Stage 5 hardening (CI/WAF).

---

## Стек

| Категория | Технология |
|-----------|------------|
| Runtime | Node.js, npm |
| Framework | Next.js 16.3.1 (App Router, Turbopack) |
| UI | React 19.2.8, TypeScript 5 strict |
| Styling | Custom CSS (+ Tailwind 4 подключён) |
| Icons | lucide-react |
| Database | PostgreSQL 16+ via postgres.js |
| ORM / migrations | Drizzle ORM, drizzle-kit (0000–0008) |
| Validation | Zod 4 |
| PDF | PDFKit + Noto Sans Latin/Cyrillic TTF |
| QR | qrcode |
| Unit tests | Vitest 4 |
| E2E | Playwright (voting, admin, organization accounts, official documents) |
| Migration tests | @electric-sql/pglite |

---

## Архитектура

**Hexagonal / clean architecture** в монолитном Next.js приложении:

```text
app/                          Route handlers + React UI
  api/                        REST-like server endpoints
  admin/                      Admin console (desktop-first)
  survey-app.tsx              Owner mobile flow (client routing)
src/
  domain/                     Entities, enums, invariants
  application/                Services + port interfaces
  infrastructure/
    composition-root.ts       Wiring (server-only)
    database/                 Drizzle schema, repositories
    providers/                Mock + database adapters
    session/                  Cookie policy, PostgreSQL sessions
    documents/                PDFKit renderer
docs/                         Architecture, security, ADR
drizzle/                      SQL migrations
e2e/                          Playwright tests
scripts/                      Seed, smoke, e2e runner
tests/                        Vitest unit/integration tests
```

**Composition root:** `createApplication()` собирает все сервисы. Runtime требует `SESSION_STORE=database`.

**Provider ports:** Identity, Property, Signing, Notification, DocumentStorage, ResidentAuth — выбор через env, реализация mock или `ProviderNotInstalledError`.

---

## Реализованные модули

### Owner application (Stage 2.5 + 3 + 5 OTP)

- Mock auth flow (dev/test): `/api/dev/session`, Digital ID / eGov UX simulation
- Resident OTP: `/api/auth/otp/request` + `/api/auth/otp/verify` (hashed code, generic errors, fail-closed mock)
- Server sessions: HttpOnly cookie, SHA-256 hash in `auth_sessions`; holdings returned from `/api/session`
- Property resolution: `/api/personal-accounts/resolve` (mock account `1911` in seed); identity of ownership is `property_holdings`
- Survey listing: `/api/surveys`; owner archive: `GET /api/documents`
- Vote lifecycle: start/resume, per-answer autosave, contacts, idempotent submit
- Visual signature upload; vote contacts (phone/email) before freeze
- Signing lifecycle + canonical SHA-256 snapshot
- Server-generated portrait A4 voting sheet + protocol PDF, database document storage
- PDF download (owner session) + public `/verify/[documentId]`
- Health: `/api/health`

### Admin console (Stage 4 + 5 workflow)

- Dev admin login: `/admin/login` → `/api/dev/admin-session`
- Nav: Обзор, Опросы, Пользователи, Организации, Документы, Журнал, Настройки
- Dashboard + «требует внимания» (unsigned closed surveys)
- Survey wizard: meeting form, targeting, voting rules, signatories, signature policy
- Targeting (building/property/account/organization), CSV account import preview
- Publish / auto-activate / auto-close / archive with deterministic snapshots
- Progress while active; results breakdown only after close
- Official signatures + protocol generation after policy; named signatories (role + FIO) can share one demo account; after required signatures the protocol and voting-sheet v2 are generated without mutating vote v1
- Invitations (no self-elevate to super_admin)
- CSV exports (formula-neutralized)
- Document registry, audit viewer (read-only, paginated)
- Scoped RBAC: platform roles + organization grants; `POST /api/admin/organizations` (`org.manage`) creates org + chairman grant
- Voting sheet / protocol PDF fill the Word sample field structure (лист опросник, протокол общего собрания); paper totals stay 0 for electronic voting
- Optimistic concurrency (`lock_version`) on draft saves
- PostgreSQL triggers: last super_admin protection, immutability after signing / published signatories

### Data layer

- ~25 tables: users, identities, sessions, organizations, properties, accounts, surveys, votes, answers, documents, audit, platform RBAC, etc.
- Migrations: `0000`–`0009` (`0004` = Stage 4 RBAC/admin, `0005` = `property_holdings`, `0006` = voting workflow, `0007` = organization accounts, `0008` = named signatories + `official_signatures.signatory_id`, `0009` = admin list/dashboard indexes)
- Hosted online Postgres (Vercel production, Supabase session pooler) has `0000`–`0009` applied. Demo public alias: https://aerc-surveys.vercel.app. Development/hosted seed **does not create surveys**; E2E (`APP_ENV=test`) still fixtures protocols №12 and №41. Chairman console: `chairman@geodez12.kz` / `Chairman26` for ОСИ «ЖК Геодезическая, 12». This is the existing demo hosting, not legal eGov production.

### Tests & tooling

- Unit: vote lifecycle, admin domain, PDF renderer, application services, postgres migrations (PGlite)
- E2E: full voting happy path + security cases; admin publish→vote→close cycle; official post-close signing + protocol/sheet PDFs (`e2e/official-documents.e2e.ts`)
- Seed: no surveys in development/preview; E2E (`APP_ENV=test`) still uses protocols **№12** and **№41**. Chairman account `chairman@geodez12.kz` / `Chairman26` for ОСИ «ЖК Геодезическая, 12».
- Scripts: `db:check`, `db:smoke`, `db:seed`, `db:seed:preview`, `db:reset:development`, `test:restart`

---

## Что выглядит завершённым

- [x] Approved demo UI (tag `demo-approved`)
- [x] Architecture foundation + ADR 0001–0004
- [x] PostgreSQL schema, repositories, seed fixtures
- [x] Persistent sessions and full owner voting workflow
- [x] Signing + immutable documents + verification page
- [x] Admin console with scoped RBAC, survey wizard, progress/results gate
- [x] Resident OTP, auto-close, signature policy, protocol PDF
- [x] Fail-closed config, same-origin mutations, object-level auth

---

## Что не готово / в процессе

### Stage 5 — production hardening (не начат; не путать с voting workflow)

- CI/CD pipeline (`.github/` отсутствует)
- Staging deployment (Vercel + Supabase описаны в docs, не настроены в repo)
- Observability, SLOs, alerting
- WAF, rate limits, CSP/security headers
- Backup/restore drills, secret rotation runbooks
- SAST/DAST, dependency policy in CI

### Real integrations (адаптеры не реализованы)

- `IdentityProvider`: egov, digital_id
- `PropertyProvider`: aerc
- `SigningProvider`: egov_qr, digital_id
- `DocumentStorageProvider`: object_storage
- Official API contracts и legal signing requirements — **открыты**

### Известные архитектурные долги

- Owner UI — один крупный `SurveyApp` с client-side History API routing (не отдельные server pages)
- `app/survey-data.ts` — демо-листы 8 и 5 остаются примерами; реальные отправленные листы приходят из `GET /api/documents`
- Online Preview (ветка `stage-4-online-preview`, `APP_ENV=staging` + Supabase PostgreSQL) описан в `docs/online-preview.md`
- Targeting резолвится из `property_holdings`; building registry отсутствует до подключения AERC Billing
- `app/survey-app.tsx` определяет большинство экранов как inline-компоненты (тост во время подписи может перемонтировать Sign). Экраны лицевого счёта и голосования вынесены в стабильные `OwnerAccountScreen` / `OwnerVoteScreen`. Ответы применяются сразу, autosave идёт в фоне и не блокирует «Далее». После входа сначала `/property` (счёт → адрес), затем список опросов; при «Пройти» подтверждаются адрес, квартира и ФИО.
- `docs/production-roadmap.md` содержит устаревший абзац «Stage 4 не начат» в конце — противоречит фактическому состоянию
- `vercel.json` `buildCommand` runs `scripts/migrate-hosted.mjs` only when `VERCEL_ENV=production`, then `next build`. The script picks the env URL that already has `surveys` (not the empty Neon `neondb`) and applies pending `0007`/`0008`.
- Notification provider — mock only, не wired to real delivery
- E2E требует PostgreSQL `aerc_surveys_test` в том же Docker-контейнере, что и local dev (`127.0.0.1:55432`)

---

## Окружения (разделение)

| Среда | App | PostgreSQL | `APP_ENV` | `DATABASE_URL` |
|-------|-----|------------|-----------|----------------|
| Local development | `npm run dev` | Docker `aerc-surveys-stage25` → `127.0.0.1:55432`, база `aerc_surveys` | `development` | только loopback, см. `.env.local` |
| Local E2E | `npm run test:e2e` | тот же контейнер, база `aerc_surveys_test` | `test` | loopback, имя базы строго `aerc_surveys_test` |
| Vercel Preview | Vercel | hosted PostgreSQL (Supabase/Neon), **не** localhost | `staging` | Preview env only, pooler `:6543` |
| Production | не трогать без явного разрешения | hosted | `production` | production env only |

`.env.local` не должен содержать remote host. Preview seed — `ALLOW_PREVIEW_SEED=true` только в локальном one-shot, не в Vercel.

---

## Переменные окружения (без значений секретов)

См. `.env.example`. Ключевые:

| Variable | Назначение |
|----------|------------|
| `APP_ENV` | development / test / staging / production |
| `DATABASE_URL` | PostgreSQL connection (обязателен для runtime) |
| `IDENTITY_PROVIDER` | mock \| egov \| digital_id |
| `PROPERTY_PROVIDER` | mock \| aerc |
| `SIGNING_PROVIDER` | mock \| egov_qr \| digital_id |
| `NOTIFICATION_PROVIDER` | mock \| disabled |
| `DOCUMENT_STORAGE_PROVIDER` | mock \| database \| object_storage |
| `SESSION_STORE` | database (runtime требует database) |
| `ENABLE_MOCK_AUTH` | dev/test mock login endpoints |
| `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION` | explicit escape hatch |
| `ALLOW_DEVELOPMENT_SEED` | guard for seed |
| `DEVELOPMENT_DATABASE_NAME` | must match DB name in URL for seed/reset |

---

## API surface (кратко)

**Owner:** `/api/session`, `/api/surveys`, `/api/surveys/:id/votes`, `/api/votes/:id/answers`, `/api/votes/:id/submit`, `/api/votes/:id/visual-signature`, `/api/personal-accounts/resolve`, `/api/documents`, `/api/documents/:id/pdf`, `/api/health`

**Dev only:** `/api/dev/session`, `/api/dev/admin-session`

**Admin:** `/api/admin/*` (catch-all: dashboard, surveys, results, participants, documents, audit, users, roles, imports)

---

## Внешние сервисы

| Сервис | Статус |
|--------|--------|
| PostgreSQL | **Обязателен** локально; Supabase planned for staging |
| eGov / Digital ID | Не подключены |
| Астана-ЕРЦ property API | Не подключён |
| Object storage (S3-compatible) | Не подключён |
| Notification service | Не определён |
| Vercel (hosting) | Исторически использовался; конфиг не в repo |

---

## Deployment

**Сейчас:** нет автоматизированного deploy в репозитории.

**Документированный target (staging):**

1. Supabase project для PostgreSQL
2. Vercel (или аналог) для Next.js runtime
3. Release: `npm ci` → `db:migrate` → `db:check` → `db:smoke` → `build`
4. Staging env: real provider names, `DOCUMENT_STORAGE_PROVIDER=object_storage`, mock forbidden

---

## Git history (логические этапы)

| Commit / tag | Этап |
|--------------|------|
| `demo-approved` | Утверждённый demo UI |
| `2d9f5e6` | Production architecture foundation |
| `6a325c0` | PostgreSQL voting backend |
| `dd5f76a` | Persistent voting workflow (Stage 2.5) |
| `8f68ad8` | Signing + documents (Stage 3) |
| `2d8580d` | Admin console (Stage 4) — **HEAD** |

---

## Важные архитектурные решения

1. **ADR 0001:** внешние системы только через ports; no vendor DTO in domain
2. **ADR 0002:** trusted server state; browser untrusted
3. **ADR 0003:** preserve approved demo UI; evolve backend underneath
4. Vote immutability enforced in PostgreSQL triggers after signing
5. Platform RBAC separate from organization membership roles
6. Development seed/reset fail-closed with triple guards

---

## Команды

### Локальный запуск

```bash
npm install
npx playwright install chromium   # для E2E
copy .env.example .env.local
npm run db:migrate
npm run dev
```

Seed (PowerShell, пример):

```powershell
$env:APP_ENV='development'
$env:ALLOW_DEVELOPMENT_SEED='true'
$env:DEVELOPMENT_DATABASE_NAME='aerc_surveys_dev'
npm run db:seed
```

### Проверки

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run db:check
npm run db:smoke          # нужен PostgreSQL
npm run test:e2e          # нужен aerc_surveys_test + build
npm run test:restart      # smoke restart persistence
```

---

## Рекомендуемые следующие этапы

1. **Stage 5 kickoff:** GitHub Actions (typecheck, lint, test, build, migration check)
2. **Staging environment:** Supabase project + Vercel preview с fail-closed env
3. **Integration spike:** один real provider adapter (напр. property/AERC) с contract tests
4. **Object storage adapter** для documents в staging
5. **Security hardening:** CSP, rate limits, operational runbooks перед pilot

---

## Документация в репозитории

- `docs/architecture.md` — целевая архитектура
- `docs/data-model.md` — схема и инварианты
- `docs/security-model.md` — trust boundaries
- `docs/local-development.md` — setup
- `docs/staging-database.md` — Supabase staging
- `docs/admin-console.md`, `docs/rbac.md` — Stage 4
- `docs/production-roadmap.md` — этапы (частично устарел в конце)
- `docs/adr/` — architecture decision records

# Online Stage 4 Preview (Vercel + Supabase PostgreSQL)

Runs the approved Stage 4 build against one shared managed PostgreSQL so the admin console and the
owner application see the same data. Everything outside PostgreSQL stays on mock providers; this is
not a production contour and must never be promoted to one without Stage 5.

```text
Vercel Preview (branch stage-4-online-preview)
        ↓ DATABASE_URL
Supabase PostgreSQL (application-owned tables only)
```

Supabase is used strictly as managed PostgreSQL. Identity, sessions, RBAC, voting, documents and
audit remain application tables; Supabase Auth, RLS policies and the Supabase client are not used.

## 1. Connection strings

Supabase Dashboard → **Project Settings → Database → Connection string**:

| Purpose | Mode | Port | Notes |
|---------|------|------|-------|
| Application runtime (`DATABASE_URL` on Vercel) | Transaction pooler | `6543` | Serverless-safe. `postgres.js` already runs with `prepare: false`, which this mode requires. |
| Migrations and preview seed (local shell) | Session pooler or direct connection | `5432` | DDL and advisory locks need a session-scoped connection. |

Append `?sslmode=require` to both URLs. Never commit either string, and never paste the password
into an issue, log or chat.

## 2. Vercel environment variables (Preview scope only)

`Vercel → Project → Settings → Environment Variables → Preview`:

| Name | Value |
|------|-------|
| `APP_ENV` | `staging` |
| `DATABASE_URL` | Supabase transaction pooler URL (secret) |
| `DATABASE_POOL_MAX` | `5` |
| `IDENTITY_PROVIDER` | `mock` |
| `PROPERTY_PROVIDER` | `mock` |
| `SIGNING_PROVIDER` | `mock` |
| `NOTIFICATION_PROVIDER` | `mock` |
| `DOCUMENT_STORAGE_PROVIDER` | `database` |
| `SESSION_STORE` | `database` |
| `ENABLE_MOCK_AUTH` | `true` |
| `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION` | `false` |
| `PROVIDER_TIMEOUT_MS` | `5000` |
| `PROVIDER_MAX_RETRIES` | `0` |
| `SESSION_COOKIE_NAME` | `aerc_session` |
| `SESSION_TTL_SECONDS` | `1800` |

`staging` is the safest environment the real config parser supports for a hosted non-production
deployment: it forbids in-memory sessions and mock document storage, requires `DATABASE_URL`, and
marks the session cookie `Secure`. Do not add `ALLOW_PREVIEW_SEED` to Vercel — it is a local
one-shot bootstrap flag only.

## 3. Database initialisation

Run once from a local shell against the migration connection string:

```powershell
$env:APP_ENV = "staging"
$env:DATABASE_URL = "<supabase session pooler url with sslmode=require>"
npm run db:migrate
npm run db:check

$env:ALLOW_PREVIEW_SEED = "true"
npm run db:seed:preview
Remove-Item Env:ALLOW_PREVIEW_SEED
```

`db:seed:preview` prints the target host and database name (never the password), refuses
`APP_ENV=production` and any unrecognised environment, requires `ALLOW_PREVIEW_SEED=true`, and is
idempotent. It reuses the same fixtures as the development seed: demo owner, admin with
`super_admin`, organisation, property, personal account `1911` and Protocol №12.

## 4. Signing in

- Owner: `/` → eGov or Digital ID → mock authentication → resolve account `1911`.
- Admin: `/admin` → **Войти как development admin** (`POST /api/dev/admin-session`).

Both create a server session row in PostgreSQL. The development endpoints return `404` when
`APP_ENV=production` or `ENABLE_MOCK_AUTH` is not `true`, and the config parser refuses to boot a
production deployment with mock authentication at all.

## 5. Targeting limitations before AERC Billing

Eligibility is resolved from `property_holdings`, the local read model of who holds a property or
personal account. It is filled by fixtures today and will be filled by `AercPropertyProvider` once
the billing contract exists. Consequences for the Preview:

- `personal_account` and `property` targets reach exactly the holders recorded locally.
- `building` targets match on `city`/`street`/`building` of known properties. There is no separate
  building registry, so an owner unknown to the local read model is not reachable.
- `organization` targets require an `organization_members` row for the identity.

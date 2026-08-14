# Server session model

## Flow

`MockIdentityProvider → external_identities → users → auth_sessions → HttpOnly cookie → GET /api/session`.

Mock endpoint существует только для development/test при `ENABLE_MOCK_AUTH=true` и `IDENTITY_PROVIDER=mock`. Production configuration с mock login завершается ошибкой.

## Token contract

- Сервер генерирует 32 random bytes и кодирует их base64url.
- Raw opaque token существует только в cookie и не логируется.
- PostgreSQL хранит только SHA-256 token hash.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` обязателен в staging/production.
- `expires_at` проверяется на каждом protected request.
- Logout записывает `revoked_at`, после чего удаляет cookie.
- Expired/revoked/unknown token возвращает 401 и не восстанавливает identity из React state.

`GET /api/session` возвращает минимальный current-user DTO. После restart Next.js новый процесс валидирует тот же cookie по PostgreSQL, поэтому session не зависит от памяти процесса.

LocalStorage хранит только безопасные navigation/UI preferences. User ID, property, eligibility, answers, vote status и session token никогда не считаются доверенными данными из браузера.

## Environment policy

- `development`: memory session допустима только при явном выборе; для полного flow рекомендуется database.
- `test`: отдельная test database; никакого автоматического PGlite fallback в runtime.
- `staging`, `production`: только database session и обязательный `DATABASE_URL`.
- `production`: mock auth запрещён даже при ошибочной комбинации flags.

Same-origin mutation validation сравнивает `Origin` с реальным `Host`/trusted forwarded host и отклоняет malformed/cross-site requests. Перед internet production нужны rate limiting, CSP и proxy/header allowlist на платформе.

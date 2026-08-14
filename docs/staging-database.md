# Supabase PostgreSQL для staging

## Создание и credentials

1. Создайте отдельный Supabase project для staging, не production.
2. В Supabase Dashboard откройте Project Settings → Database (либо кнопку Connect в текущем UI) → Connection string.
3. Скопируйте PostgreSQL URI и замените placeholder пароля реальным Database Password. Не коммитьте URI.
4. Для release migrations используйте direct/session connection, доступную из вашей сети. Для Vercel runtime обычно выбирают Supavisor pooled connection; runtime использует `prepare: false` и ограниченный `DATABASE_POOL_MAX`.
5. Если direct endpoint IPv6 недоступен из CI, используйте рекомендованный Supabase session pooler для migrations. Не применяйте schema вручную в SQL editor.

Required variables:

```dotenv
APP_ENV=staging
DATABASE_URL=postgresql://...
DATABASE_POOL_MAX=5
SESSION_STORE=database
IDENTITY_PROVIDER=...
PROPERTY_PROVIDER=...
SIGNING_PROVIDER=...
NOTIFICATION_PROVIDER=...
DOCUMENT_STORAGE_PROVIDER=object_storage
ENABLE_MOCK_AUTH=false
ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=false
SESSION_COOKIE_NAME=aerc_session
SESSION_TTL_SECONDS=1800
```

Stage 2.5 не содержит production providers/object storage, поэтому staging с полностью fail-closed конфигурацией может требовать отдельного pre-production adapter этапа. Никогда не ослабляйте guards переключением на memory или неявный mock.

## Release procedure

Из защищённой CI/release environment:

```bash
npm ci
npm run db:migrate
npm run db:check
npm run db:smoke
npm run build
```

`db:seed` предназначен только для development и при `APP_ENV=staging|production` завершится ошибкой. Для staging test fixtures должен быть отдельный контролируемый provisioning process, а не ослабление development seed guard.

До pilot включите backups/PITR, connection limits, TLS verification, least-privilege runtime/migration roles, secret rotation и выполните restore rehearsal. Health endpoint сообщает только `healthy/unhealthy`, не SQL errors или credentials.

# Локальная разработка

## Требования

Node.js/npm и persistent PostgreSQL 16+. Создайте отдельную базу, например `aerc_surveys_dev`; не используйте production database.

`.env.local` (не коммитить):

```dotenv
APP_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/aerc_surveys_dev
DATABASE_POOL_MAX=5
IDENTITY_PROVIDER=mock
PROPERTY_PROVIDER=mock
SIGNING_PROVIDER=mock
NOTIFICATION_PROVIDER=mock
DOCUMENT_STORAGE_PROVIDER=database
SESSION_STORE=database
ENABLE_MOCK_AUTH=true
ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=false
SESSION_COOKIE_NAME=aerc_session
SESSION_TTL_SECONDS=1800
```

## Первый запуск

```bash
npm install
npx playwright install chromium
npm run db:migrate
npm run db:check
```

Development fixtures запускаются только с тремя явными guards:

```powershell
$env:APP_ENV='development'
$env:ALLOW_DEVELOPMENT_SEED='true'
$env:DEVELOPMENT_DATABASE_NAME='aerc_surveys_dev'
npm run db:seed
```

Reset ещё опаснее и требует точного подтверждения:

```powershell
$env:APP_ENV='development'
$env:ALLOW_DEVELOPMENT_SEED='true'
$env:DEVELOPMENT_DATABASE_NAME='aerc_surveys_dev'
$env:CONFIRM_DEVELOPMENT_RESET='RESET_DEVELOPMENT_DATA'
npm run db:reset:development
```

Затем `npm run dev`. Для verification: `npm run db:smoke`, `npm test`, `npm run test:e2e`, `npm run build`.

E2E обязан использовать отдельную базу с точным именем `aerc_surveys_test` и `APP_ENV=test`; test harness откажется очищать другую базу.

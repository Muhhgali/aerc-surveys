# Локальная разработка

## Требования

Node.js/npm и PostgreSQL 16+ в Docker. Не используйте production/Supabase database в `.env.local`.

```bash
docker compose up -d
```

Контейнер `aerc-surveys-stage25` слушает только `127.0.0.1:55432`. В нём две базы: `aerc_surveys` (dev) и `aerc_surveys_test` (E2E). Локальный Supabase stack другого проекта на `54322` к этому приложению не относится.

`.env.local` (не коммитить):

```dotenv
APP_ENV=development
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/aerc_surveys
DATABASE_POOL_MAX=10
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
$env:DEVELOPMENT_DATABASE_NAME='aerc_surveys'
npm run db:seed
```

После seed в консоли:

- Платформа: `admin@aerc.kz` / `DemoAdmin26`
- Председатель ОСИ «ЖК Геодезическая, 12»: `chairman@geodez12.kz` / `Chairman26` (создаёт опросы своей организации, без super_admin)
- Опросы и журнал аудита пустые; председатель создаёт опросники сам.

Reset ещё опаснее и требует точного подтверждения:

```powershell
$env:APP_ENV='development'
$env:ALLOW_DEVELOPMENT_SEED='true'
$env:DEVELOPMENT_DATABASE_NAME='aerc_surveys'
$env:CONFIRM_DEVELOPMENT_RESET='RESET_DEVELOPMENT_DATA'
npm run db:reset:development
```

Затем `npm run dev`. Для verification: `npm run db:smoke`, `npm test`, `npm run test:e2e`, `npm run build`.

E2E обязан использовать отдельную базу с точным именем `aerc_surveys_test` и `APP_ENV=test`; test harness откажется очищать другую базу.

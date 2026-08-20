<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AI agent instructions — aerc-surveys

Постоянная инструкция для любых AI-агентов, работающих с репозиторием. Фактическое состояние продукта — в `PROJECT_CONTEXT.md`; поддерживайте оба файла актуальными после существенных изменений.

## Что это за проект

Информационная система электронных опросов собственников для **Астана-ЕРЦ**. Сейчас это **рабочий demo + production foundation**: утверждённый UI сохранён, backend, PostgreSQL, сессии, голосование, подписание, документы и админ-консоль реализованы на mock-провайдерах. Юридически значимый production-контур (eGov, Digital ID, Астана-ЕРЦ, object storage) **намеренно не подключён**.

## Архитектурные правила (обязательны)

### Слои и зависимости

```text
app/                     Next.js UI + route handlers (тонкий HTTP-слой)
src/domain/              Чистые типы и правила, без Next.js/DB/SDK
src/application/         Use cases и порты (interfaces)
src/infrastructure/      PostgreSQL, провайдеры, сессии, логирование
```

- Зависимости направлены **внутрь**: domain не импортирует infrastructure или `app/`.
- Композиция только в `src/infrastructure/composition-root.ts` (`server-only`).
- Клиент **никогда** не является источником истины для identity, property, eligibility, answers, vote status, timestamps или signing evidence.
- Внешние системы — только через порты в `src/application/ports/providers.ts`; vendor DTO не проходят в domain.
- Новые интеграции — отдельные адаптеры в `src/infrastructure/providers/`, не правки use cases «под API».

### Два UI-контура

| Контур | Путь | Назначение |
|--------|------|------------|
| Owner app | `/`, catch-all `app/[...path]` | Мобильный сценарий голосования |
| Admin console | `/admin` | Управление опросами, RBAC, результаты, аудит |

Админка вызывает только `/api/admin/*`. Голосование — только server API routes. Не дублировать бизнес-логику во frontend.

### База данных

- Источник истины схемы: `src/infrastructure/database/schema.ts` + `drizzle/*.sql`.
- **Не создавать таблицы вручную** в Supabase Dashboard или SQL editor.
- Миграции: `npm run db:generate` → review SQL → `npm run db:migrate`.
- Seed/reset — только development с явными guards (`scripts/database-safety.ts`).

### Безопасность (fail-closed)

- Конфигурация: `src/infrastructure/config/provider-config.ts` — staging/production без mock fallback.
- Сессии: opaque token в HttpOnly cookie, SHA-256 hash в PostgreSQL.
- Мутации: same-origin check (`assertSameOrigin`), Zod-валидация, object-level authorization.
- Админка: capability-based RBAC через `requireAdminPermission()` на **каждом** endpoint.
- **Не ослаблять** guards для «удобства» demo/staging.
- **Не коммитить** секреты, `.env.local`, connection strings.

## Conventions проекта

- TypeScript **strict**; path alias `@/*` → корень репозитория.
- API errors через `ApplicationError` + `errorResponse()`; не возвращать stack traces клиенту.
- Audit events append-only; нет delete/edit route для аудита.
- Optimistic concurrency для draft surveys через `lock_version`.
- Именование: domain types в `src/domain/`, сервисы в `src/application/<area>/`.
- UI owner app — крупный client component `app/survey-app.tsx` с client-side routing; **не переписывать визуально** без явного запроса.
- Tailwind подключён, но основной UI — custom CSS (`globals.css`, `secondary.css`, `admin.css`).
- Документация в `docs/`; ADR в `docs/adr/`. При архитектурных решениях — новый ADR.

## Git и ветки

- **Не делать commit, push, production deploy или изменения production DB** без явного указания владельца продукта.
- Основная линия разработки: `production-foundation*` / `stage-5-voting-workflow` (полный цикл голосования).
- Утверждённое demo зафиксировано тегом `demo-approved`.
- Remote: `origin` → `https://github.com/Muhhgali/aerc-surveys.git`.
- Следуйте стилю commit messages из истории (`feat:`, `fix:`, imperative mood).

## Обязательные проверки после изменений

Минимум перед завершением задачи:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

При изменениях схемы или persistence:

```bash
npm run db:migrate    # на dev/test DB
npm run db:check
npm run db:smoke      # если доступен PostgreSQL
```

При изменениях voting/admin flow:

```bash
npm run test:e2e      # требует PostgreSQL `aerc_surveys_test`, Playwright chromium
```

E2E база — **строго** `aerc_surveys_test`, `APP_ENV=test`; harness откажется чистить другую базу.

## Локальный запуск (кратко)

```bash
npm install
copy .env.example .env.local   # Windows
npm run db:migrate
# seed только с guards — см. docs/local-development.md
npm run dev
```

PostgreSQL 16+ обязателен. `DATABASE_URL` в `.env.local`.

## Критические ограничения

1. **Mock ≠ production.** Canvas-подпись — UX-изображение, не ЭЦП. Mock signing — lifecycle без юридической силы.
2. **Real providers не установлены.** Выбор `egov`, `digital_id`, `aerc`, `object_storage` в registry бросает `ProviderNotInstalledError` — это ожидаемо.
3. **Не принимать из клиента:** userId, propertyId, vote status, canonical hash, document content, admin role.
4. **Не использовать localStorage** для бизнес-состояния (только UI preferences).
5. **Не добавлять** `/api/dev/*` routes в production paths без fail-closed guard.
6. **Stage 5 hardening (CI/WAF/observability) не начат.** Полный цикл голосования (RBAC scopes, OTP, auto-close, protocol) — в работе на `stage-5-voting-workflow`; не предполагать CI/CD, staging deploy или WAF.
7. **Минимальный diff:** не рефакторить unrelated код; не over-engineer.

## Куда смотреть при типовых задачах

| Задача | Файлы |
|--------|-------|
| Новый API route | `app/api/`, `src/infrastructure/http/responses.ts`, composition root |
| Голосование | `src/application/voting/`, `app/api/votes/` |
| Документы/PDF | `src/application/documents/`, `src/infrastructure/documents/`, `src/domain/official-document-template.ts`, `GET /api/documents` |
| Подписанты / протокол | `src/domain/signature-policy.ts`, `POST /api/admin/surveys/:id/signatures`, `POST /api/admin/surveys/:id/protocol` |
| Админка | `app/admin/`, `src/application/admin/`, `app/api/admin/` |
| RBAC | `src/domain/admin-rbac.ts`, `src/infrastructure/session/admin-authorization.ts` |
| Resident OTP | `src/application/resident-auth/`, `/api/auth/otp/*` |
| Схема БД | `src/infrastructure/database/schema.ts`, `drizzle/` |
| Провайдер | `src/infrastructure/providers/registry.ts`, mock в `mock/` |
| E2E | `e2e/`, `scripts/run-e2e.ts` |

## Обновление этой памяти

Обновляйте `AGENTS.md` и `PROJECT_CONTEXT.md`, когда:

- завершён новый stage roadmap;
- добавлены/изменены порты или env vars;
- появился CI, staging или production deploy;
- изменились обязательные проверки или git workflow.

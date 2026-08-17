# Production roadmap

## Завершённые этапы

- Demo: утверждённый UI сохранён в `demo-approved`.
- Foundation: domain/application/infrastructure boundaries, provider ports, fail-closed configuration и ADR.
- Stage 2: PostgreSQL schema, repositories, property/eligibility resolution и базовый voting backend.
- Stage 2.5: persistent PostgreSQL runtime, hash-based server sessions, full Protocol №12 UI integration, start/resume, per-answer autosave, transactional idempotent submit, health/smoke commands и Playwright security smoke.

## Stage 3 — integrated foundation завершён

- формальная vote state machine для signing lifecycle;
- deterministic canonical representation и SHA-256;
- MockSigningProvider lifecycle без выдумывания eGov/Digital ID API;
- server-side immutable portrait A4 PDF snapshot;
- document storage, verification page и QR как verification link;
- tests целостности и запрета изменений после signing.

## До staging/pilot

- создать отдельный Supabase staging project и least-privilege runtime role;
- настроить migrations as release step, backups/PITR, monitoring и alerting;
- добавить CI gates, CSP/security headers, rate limits и audit retention/export;
- выполнить restart/restore rehearsal в staging и документировать RTO/RPO;
- получить официальные API contracts и юридические требования к ЭЦП до production adapters;
- провести privacy/security/legal review и controlled pilot.

Stage 4 самостоятельно не начат. Перед pilot всё ещё требуются staging infrastructure, официальные integration contracts и security/legal review.

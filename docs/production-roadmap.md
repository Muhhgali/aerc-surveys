# Production roadmap

## Этап 0 — выполненный фундамент

- одобренное демо сохранено тегом `demo-approved`;
- введены domain/application/infrastructure boundaries;
- добавлены provider ports, mock adapters, typed errors, request IDs, timeout/log/retry runtime;
- добавлена fail-closed env-конфигурация и server session contract;
- business state удалён из localStorage;
- зафиксированы аудит, security gaps и интеграционные вопросы.

## Этап 1 — можно выполнить без внешних API

- выбрать PostgreSQL-платформу и добавить migrations/repositories/transactions;
- спроектировать versioned survey schema, eligibility snapshot, idempotency и outbox;
- реализовать server routes/actions, secure cookie session, CSRF/origin validation;
- разделить `SurveyApp` на route-level UI без визуальной переработки;
- серверная генерация portrait A4 PDF, hash, verification page и mock object storage;
- admin RBAC, survey lifecycle и append-only audit;
- unit/integration/e2e/contract tests, CI, observability, backups;
- accessibility, localization и browser support acceptance criteria.

## Этап 2 — требуется официальная интеграция

- получить договоры, sandbox, data schemas и security profiles eGov/Digital ID;
- получить официальный Астана-ЕРЦ API и правила разрешения собственности/представительства;
- утвердить юридически значимый signing flow, certificate/timestamp/revocation requirements;
- реализовать адаптеры и contract/conformance tests, не меняя domain/use cases;
- выполнить privacy/legal/security review и нагрузочные испытания.

## Этап 3 — pilot и ввод

- миграция/сверка данных, controlled pilot, support и incident runbooks;
- disaster recovery rehearsal, monitoring/SLO, audit export;
- staged rollout с явными feature flags и rollback plan;
- production readiness review и формальное разрешение на переключение провайдеров.

## Следующее решение

Следующий этап не запускается автоматически. Сначала требуется выбрать database/session infrastructure и утвердить внутреннюю модель survey/version/vote, а также владельцев security и юридических требований.

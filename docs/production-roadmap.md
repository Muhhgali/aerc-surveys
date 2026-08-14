# Production roadmap

## Этап 0 — выполненный фундамент

- одобренное демо сохранено тегом `demo-approved`;
- введены domain/application/infrastructure boundaries;
- добавлены provider ports, mock adapters, typed errors, request IDs, timeout/log/retry runtime;
- добавлена fail-closed env-конфигурация и server session contract;
- business state удалён из localStorage;
- зафиксированы аудит, security gaps и интеграционные вопросы.

## Этап 1 — backend data model (выполнено в текущей ветке)

- добавлены PostgreSQL schema, migration и development seed;
- добавлены users/external identities/organizations/property read model/survey participants/votes/signatures/documents/audit;
- добавлены database и server validation для one-person/one-property/one-survey vote;
- добавлены strict Zod server endpoints, database session adapter и application services;
- mock account 1911 перенесён из UI в `MockPropertyProvider` с явной identity/property relation;
- добавлены application и PostgreSQL constraint tests.

## Этап 2 — можно выполнить без внешних API

- выбрать managed PostgreSQL-платформу и настроить production connection/pooling/backups;
- добавить outbox и фоновые workers;
- расширить server routes/actions, CSRF/origin validation и rate limiting;
- разделить `SurveyApp` на route-level UI без визуальной переработки;
- серверная генерация portrait A4 PDF, hash, verification page и mock object storage;
- admin RBAC, survey lifecycle и append-only audit;
- unit/integration/e2e/contract tests, CI, observability, backups;
- accessibility, localization и browser support acceptance criteria.

## Этап 3 — требуется официальная интеграция

- получить договоры, sandbox, data schemas и security profiles eGov/Digital ID;
- получить официальный Астана-ЕРЦ API и правила разрешения собственности/представительства;
- утвердить юридически значимый signing flow, certificate/timestamp/revocation requirements;
- реализовать адаптеры и contract/conformance tests, не меняя domain/use cases;
- выполнить privacy/legal/security review и нагрузочные испытания.

## Этап 4 — pilot и ввод

- миграция/сверка данных, controlled pilot, support и incident runbooks;
- disaster recovery rehearsal, monitoring/SLO, audit export;
- staged rollout с явными feature flags и rollback plan;
- production readiness review и формальное разрешение на переключение провайдеров.

## Следующее решение

Следующий этап не запускается автоматически. Сначала требуется выбрать database/session infrastructure и утвердить внутреннюю модель survey/version/vote, а также владельцев security и юридических требований.

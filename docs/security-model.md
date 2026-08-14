# Модель безопасности

## Trust boundaries

Браузер, URL, React state, localStorage, canvas и request payload недоверенные. Доверенный state создаётся только server session, provider adapters после typed validation и транзакционными PostgreSQL records.

## Реализовано к Stage 2.5

- high-entropy opaque session token; raw value только в HttpOnly cookie, SHA-256 hash в `auth_sessions`;
- expiry, revocation, logout и server-side current-user restore;
- fail-closed staging/production config без memory/mock fallback;
- strict Zod payloads и same-origin mutation check;
- object-level authorization: vote читается/изменяется только владельцем, чужой ID выглядит как not found;
- property/user/participant вычисляются сервером и не принимаются из UI;
- question обязан принадлежать survey голосования;
- idempotency replay с изменённым payload отклоняется;
- final completeness, eligibility и survey state проверяются в transaction;
- safe public health response не раскрывает connection string или exception;
- structured audit содержит request IDs и entity references, но не tokens, passwords, signature images или raw provider payload.

## Проверяемые атаки

| Попытка | Ожидаемый результат |
|---|---|
| чужой/подменённый vote ID | 404 |
| property ID injection | 400 strict payload |
| неизвестный/подменённый survey ID | 404 |
| question не из survey | 422 |
| submit чужого vote | 404 |
| старый idempotency key с другим payload | 409 |
| expired/revoked session | 401 |
| cross-origin mutation | 401 |
| incomplete/closed survey submit | 422/409 |

## Оставшиеся production risks

До public pilot нужны: официальный threat model/DPIA, legal signing decision, platform WAF/rate limits, CSP и security headers, trusted proxy policy, RBAC/admin boundary, append-only/tamper-evident audit, least-privilege DB roles, secret rotation, encryption/residency policy, backups + restore rehearsal, SAST/DAST/dependency policy, monitoring/SLO и incident response runbooks.

Canvas-росчерк не является юридической ЭЦП и на этом этапе не сохраняется на сервере. Зарезервированные signing/document tables не означают реализованный signing lifecycle.

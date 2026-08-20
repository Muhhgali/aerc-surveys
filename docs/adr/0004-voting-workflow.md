# ADR 0004: Полный цикл голосования — scopes, derived signing, resident OTP

- Статус: принято
- Дата: 2026-08-20

## Контекст

Stage 4 дал platform RBAC, publish snapshot и immutable vote documents, но доступ был только платформенным, результаты утекали до close, закрытие и активация по срокам не переводили `surveys.status`, протокол и подписанты отсутствовали, а вход собственника опирался на mock eGov и знание лицевого счёта.

## Решение

1. **RBAC = role + permission + scope.** `super_admin` — единственный platform-wide principal. Organization grants (`organization_access_grants`) ограничивают председателя своей организацией. Survey staff/signatories назначаются на конкретный опрос и не меняют глобальную роль. Self-elevate до `super_admin` запрещён на сервере. Последний `super_admin` по-прежнему защищён триггером 0004.

2. **`surveys.status` не расширяется.** Остаётся `draft | scheduled | active | closed | archived`. Подписи и протокол — derived `signing_state` из `official_signatures` и snapshot signature policy.

3. **Окно опроса закрывает сервер.** `ensureSurveyWindow` идемпотентно переводит `scheduled → active` и `active → closed` по `starts_at`/`closes_at`, фиксирует eligibility/result snapshots и hashes.

4. **Результаты до close скрыты.** Progress (eligible / voted / %) доступен; FOR/AGAINST/ABSTAIN и решение — только после `closed`, даже по прямому API. Технический permission `survey.results.read_live` не включается в UI по умолчанию.

5. **ResidentAuthProvider** — отдельный порт от будущего eGov `IdentityProvider`. Mock OTP запрещён в production. После OTP собственность читается только из `property_holdings`.

6. **Документы.** Visual signature остаётся UX-изображением, не ЭЦП. Vote document v1 фиксирует решение собственника; поздние подписи должностных лиц пишутся новыми `document_versions` и `official_signatures` без мутации vote. Для электронного голосования подпись ответственного лица на листе не ставится (сноска бланка). Final protocol — только после signature policy.

## Последствия

Новые forward-only миграции, scoped `requirePermission`, OTP challenges, voting rules в published snapshot, admin wizard и отдельный owner OTP UX. Существующие сессии, canonical hash, QR verify и append-only audit сохраняются.

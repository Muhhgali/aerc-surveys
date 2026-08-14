# Модель безопасности

## Доверительные границы

Браузер, URL, localStorage, canvas и любые поля формы недоверенные. Доверенными могут стать только серверная session, транзакционно сохранённые записи и ответы проверенных provider adapters. Внешний провайдер также остаётся отдельной trust boundary: его ответ валидируется и нормализуется.

## Найденные риски

1. Исходное демо не имеет реальной authentication/authorization и server session.
2. Пользователь мог изменить account, ответы, подпись, время, document ID и статус через DevTools/localStorage.
3. Нет защиты от повторного голосования, гонок и повторной отправки.
4. Canvas-изображение не является ЭЦП; связи с digest документа и проверяемого evidence нет.
5. Архив и print-лист не неизменяемы, QR не верифицирует документ.
6. Нет CSRF/origin checks, rate limits, CSP/security headers, schema validation и контроля загрузок.
7. Нет RBAC/admin boundary, append-only audit, мониторинга security events и процедур incident response.
8. Нет классификации ПДн, retention/deletion policy, data residency, backup/restore и управления ключами.
9. Static routes публичны; session/authorization не проверяются на сервере.
10. Тесты, CI security gates и dependency policy отсутствуют. `npm audit --omit=dev` на момент аудита не нашёл известных production vulnerabilities, но это не заменяет SAST/DAST/lockfile review.

## Session architecture

- После подтверждения identity adapter сервер создаёт случайный opaque session ID и хранит state server-side.
- Браузер получает только cookie `HttpOnly`, `Secure` в production, `SameSite=Lax`, `Path=/`; срок короткий, ID rotating после authentication/privilege change.
- Logout/revocation меняет серверную запись. Expiry проверяется на каждом защищённом use case.
- Для state-changing запросов обязательны Origin/Host validation и CSRF strategy; для sensitive signing — re-authentication/step-up.
- In-memory store существует только для dev/test. Production configuration с ним завершается ошибкой.
- LocalStorage хранит только экран и выбранные UI-элементы; ответы, identity, account, signature и submission туда больше не записываются.

## Голос и подпись

Сервер формирует канонический snapshot версии опроса и ответов, вычисляет digest, запускает подпись и проверяет evidence у провайдера. Submission содержит idempotency key и фиксируется транзакционно только один раз для применимого правила уникальности. Audit хранит outcome и ссылки на сущности, но не чувствительные payloads.

Canvas-росчерк может сохраниться как необязательный визуальный атрибут только после юридической оценки. Он не заменяет provider evidence и должен быть явно так обозначен.

## Документ и архив

PDF/A или согласованный формат генерируется на сервере из сохранённого snapshot, получает SHA-256, timestamp и immutable storage version. QR ведёт на серверную verification page с минимальным раскрытием. Доступ к полному документу проверяет владельца/роль; signed URLs короткоживущие.

## Логи и аудит

Diagnostic logs структурированы и несут request ID, но редактируют token/secret/signature/ИИН/credentials. Audit — отдельный append-only store с контролем доступа, синхронизацией времени, retention и экспортом для расследования. Ошибка клиенту не раскрывает provider payload или stack trace.

## До production обязательно

Threat modeling, DPIA/юридическая экспертиза, secure headers/CSP, schema validation, rate limiting, RBAC, database RLS/least privilege, encryption/key rotation, secret scanning, SAST/DAST, penetration test, backup restore exercise и incident runbooks.

# Внешние интеграции

## Принцип

Наш код определяет внутренние порты и use cases. Внешние сервисы реализуются изолированными адаптерами с mapping vendor DTO → domain. До получения официальных спецификаций никакие endpoints, payloads или гарантии eGov/Digital ID/Астана-ЕРЦ не предполагаются.

## Порты

| Порт | Назначение | Mock сейчас | Возможные адаптеры позже |
|---|---|---|---|
| `IdentityProvider` | начать и завершить проверку личности | `mock` | `egov`, `digital_id` |
| `PropertyProvider` | разрешить лицевой счёт/объект и право голоса | `mock` | `aerc` |
| `SigningProvider` | запросить и проверить evidence подписи digest | `mock` | `egov_qr`, `digital_id` |
| `NotificationProvider` | отправить служебное уведомление | `mock` | определяется после выбора сервиса |
| `DocumentStorageProvider` | сохранить/получить versioned документ с hash | in-memory mock | `object_storage` |

Все ответы и ошибки типизированы. Ошибка содержит `code`, безопасное сообщение, `requestId` и `retryable`. Runtime ставит timeout, пишет структурированные события и делает ограниченный exponential backoff только для явно idempotent операций. Начало аутентификации, подписи, отправка уведомления и запись документа не повторяются автоматически.

## Конфигурация и fail-closed

Локальные значения приведены в `.env.example`. В production каждая настройка провайдера обязательна. Mock-адаптеры запрещены, пока оператор явно не установит `ALLOW_MOCK_PROVIDERS_IN_PRODUCTION=true`; это исключение предназначено только для изолированного preview, не реального production. Выбор адаптера, код которого ещё не установлен, завершает запуск ошибкой — fallback на mock отсутствует.

## Границы данных

### Identity provider

Ожидаемый внутренний результат: непрозрачный subject ID, display name, уровень assurance, время проверки и минимально необходимые атрибуты. Реальный состав, consent, срок жизни и способ проверки определяются официальным договором. ИИН не должен становиться публичным идентификатором или попадать в логи.

### Астана-ЕРЦ

Ожидаемый внутренний результат: непрозрачные account/property IDs, нормализованное отображаемое помещение, тип объекта и решение eligibility. Кто является авторитетным источником собственности, как учитывать совладельцев/представителей и историческую дату права — открытые интеграционные вопросы.

### Signing provider

Наш код передаёт hash канонического документа и subject context, затем получает проверяемое signing evidence. Формат сертификата, QR/polling/callback, OCSP/CRL, timestamp authority и юридический профиль должны прийти из официальной спецификации.

### Documents и notifications

Хранилище получает bytes, content type, SHA-256 и immutable key/version. Notification получает template ID и минимальные переменные; секреты и полный документ в сообщения не включаются.

## Требования к production-адаптеру

- официальный контракт и sandbox; mutual auth/OAuth/keys согласно контракту;
- mapping и contract tests на зафиксированных обезличенных fixtures;
- request/correlation ID, timeout и circuit-breaker policy;
- секреты только в server-side secret store с rotation;
- webhook authenticity, replay protection и idempotency;
- redaction, data residency, retention и SLA зафиксированы до допуска.

# Астана-ЕРЦ — Опросы

Рабочий demo-интерфейс и первый архитектурный фундамент будущей информационной системы электронных опросов собственников.

> Текущий UI остаётся демонстрационным. Canvas-подпись, локальные данные и mock-провайдеры не являются юридически значимым production-контуром.

## Запуск

```bash
npm install
copy .env.example .env.local
npm run dev
```

Проверки: `npm run typecheck`, `npm run lint`, `npm run build`.

## Документация

- [Архитектура](docs/architecture.md)
- [Интеграции](docs/integrations.md)
- [Модель безопасности](docs/security-model.md)
- [Production roadmap](docs/production-roadmap.md)
- [ADR](docs/adr/)

Одобренное демо сохранено git-тегом `demo-approved`. Работы над фундаментом ведутся в ветке `production-foundation`.

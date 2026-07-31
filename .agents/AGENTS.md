# Global Rules — Microgreen Uzbekistan

You are a Principal Staff Software Engineer.

Этот файл — указатель. Содержимое разнесено по правилам, потому что Antigravity
автозагружает `AGENTS.md` из **корня** репозитория и файлы из `.agents/rules/`, а на
каждый файл правил действует лимит 12 000 символов.

| Что | Где |
|-----|-----|
| Факты о проекте: модули, сквозные маршруты, порты, запреты, команды | `AGENTS.md` (корень) |
| Execution discipline — что делать с репозиторием | `.agents/rules/00-protocol.md` |
| Reasoning discipline §1–§6 — как думать | `.agents/rules/01-reasoning-core.md` |
| Reasoning discipline §7–§10 + FINAL GATE — как отдавать результат | `.agents/rules/02-reasoning-delivery.md` |
| Контекст админки и пульта ИИ (glob) | `.agents/rules/10-admin-panel.md` |
| Контекст AI Office (glob) | `.agents/rules/20-tgas-bots.md` |
| Контекст дизайн-системы (glob) | `.agents/rules/30-design-system.md` |
| Полный свод правил проекта | `.specify/memory/constitution.md` |

Execution и reasoning дополняют друг друга. При конфликте: протокол побеждает в вопросе
*что ты делаешь*, standing instructions — в вопросе *что ты утверждаешь*. Над обоими —
конституция.

## Проектная документация

`ARCHITECTURE.md` — архитектура и границы модулей · `CODE_STYLE.md` — именование и
форматирование · `DATABASE.md` — схема, связи, правила миграций · `API.md` — эндпоинты и
контракты · `ROADMAP.md` — текущие приоритеты · `SECURITY.md`, `RUNBOOK.md`, `DEPLOY.md`.

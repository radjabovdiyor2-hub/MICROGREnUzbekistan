# Админка и пульт ИИ

Активация: **Glob** — `apps/web/src/components/admin/**`, `apps/web/src/app/api/admin/**`, `apps/tgas/web_office/**`.

## Цепочка целиком

Запрос из админки пересекает границу модулей. Обе стороны читать обязательно — половина правки на одной стороне не работает.

```
apps/web/src/components/admin/AdminBotControl.tsx
    BOT_ACTIONS: BotActionConfig[]      что показано владельцу (bot, name, action, description, icon, color)
    triggerAction()  строка 88          fetch('/api/admin/bot-action', credentials: 'same-origin')
          ↓  POST {action, bot}
apps/web/src/app/api/admin/bot-action/route.ts
    isAuthorized(request)               @/lib/adminAuth — иначе 401
    audit({action:'bot.action', ...})   @/lib/audit — пишется до отправки
    TIMEOUT_MS = 100_000                AbortController
    заголовок X-Ingest-Secret           из process.env.INGEST_SECRET
          ↓  fetch(`${TGAS_OFFICE_URL}/api/admin/bot-action`)   TGAS_OFFICE_URL ?? WEB_OFFICE_URL ?? http://localhost:8050
apps/tgas/web_office/main.py:1456
    _check_ingest_secret(request)       иначе 401
    ADMIN_BOT_ACTIONS  main.py:1438     белый список: action -> бот-исполнитель
    bot_bus.send_task(from_bot="web_admin", to_bot=target, action, params)
    bot_bus.get_result(task_id, timeout=90)
          ↓
apps/tgas/bots/<bot>/main.py            обработчик действия в bot_bus listener
```

## Контракт

Запрос: `{action: string, bot: string, params?: object}`
Ответ: `{status: "ok" | "pending" | "error", error?, message?, result?, bot?}`

- `pending` — **не ошибка**. Задача осталась в очереди; бекап БД и синк каталога штатно дольше 90 с. UI обязан показывать это отдельным состоянием, а не как провал.
- Поле `bot` из UI — подсказка. Исполнителя выбирает `ADMIN_BOT_ACTIONS` на стороне офиса; при расхождении офис пишет warning и шлёт профильному боту.
- Действия нет в белом списке → 400 «действие не разрешено». Белый список, а не свободный ввод: `/api/admin/*` закрыт сессией, но шина ботами не перепроверяется.
- Офис ответил не-2xx → роут возвращает его статус как есть (401 маппится в 502). Таймаут или недоступность → 504.

## Правила правок

- **Добавил кнопку в `BOT_ACTIONS` — добавь действие в `ADMIN_BOT_ACTIONS`.** Иначе кнопка гарантированно вернёт 400. Это парная правка в двух модулях, всегда.
- **Никогда не возвращать `{status:'ok'}` в ветке отказа.** Ровно этот баг год держал «Пульт ИИ» мёртвым: роут глотал ошибку, владелец не мог отличить работающий бекап от неработающего. Комментарий-предупреждение — в шапке `route.ts`, не удалять.
- Новое действие бота требует обработчика в `bot_bus` listener целевого бота — иначе `get_result` вернёт `None` и владелец увидит вечный `pending`.
- Цвета кнопок — только CSS-переменные (`var(--brand-primary)`, `var(--info)`, `var(--cat-2)` и т. д.), см. `.agents/rules/30-design-system.md`.
- Аудит (`audit()`) пишется до обращения к офису и снимать его нельзя: это журнал действий владельца.

## Секреты

`INGEST_SECRET` — общий секрет витрины и офиса, тот же, что для `/ingest/*`. В коде не хардкодить, в логи не печатать. Если его нет в окружении — заголовок не отправляется и офис ответит 401; это диагностический признак, а не повод убрать проверку.

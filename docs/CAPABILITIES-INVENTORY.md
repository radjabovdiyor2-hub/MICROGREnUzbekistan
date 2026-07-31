# Инвентаризация и целевая схема инструментов ассистента Стёпана

Дата: 31 июля 2026 г.  
Статус: **ВОРОТА** — ожидает решения владельца по слиянию промптов (Этап 3).

> **Актуальность.** Разделы «Этап 1» и «Этап 2» описывают состояние ДО коммита
> `8d2daad`. Фаза 3a из плана ниже с тех пор реализована, поэтому двух реестров
> объявлений больше нет — см. «Что уже сделано». Сам разбор оставлен как есть:
> он объясняет, почему схема стала такой.

---

## Что уже сделано (по состоянию на `a19a924`)

Реестр инструментов **единый**. Источник — [apps/web/src/lib/stepan/tools.ts](../apps/web/src/lib/stepan/tools.ts),
24 инструмента, у каждого поле `runtimes: ToolRuntime[]`:

| Доступность | Инструментов |
|---|---|
| `['web', 'tg']` — обе среды | 21 |
| `['tg']` — только Telegram: `roll_call`, `get_report`, `query_db` | 3 |
| только веб | 0 |

Доставка в Telegram: `GET /api/admin/stepan/tools` → [shared/stepan_tools.py](../apps/tgas/shared/stepan_tools.py)
(`load_registry("tg")`, кеш 10 минут) → [assistant.py:1019](../apps/tgas/bots/stepan_bot/handlers/assistant.py#L1019).
Инструменты, реализованные на витрине, исполняются удалённо через
`POST /api/admin/stepan/tools/execute` ([assistant.py:1151](../apps/tgas/bots/stepan_bot/handlers/assistant.py#L1151)).
Собственных словарей function-calling в `assistant.py` не осталось ни одного.

Третий источник — [shared/capabilities.py](../apps/tgas/shared/capabilities.py) — остался
отдельным намеренно, обоснование в разделе «Судьба capabilities.py» ниже.

---

## Этап 1. Инвентаризация (состояние до `8d2daad`)

### Три источника объявлений

| # | Источник | Файл | Форма | Потребитель | Инструментов |
|---|---|---|---|---|---|
| 1 | Веб-админка | `apps/web/src/lib/stepan/tools.ts` | `ReadTool` / `WriteTool` (risky) | `brain.ts:1` → `toolSchemas()` | 17 |
| 2 | Telegram-ассистент | `assistant.py` (словари в теле обработчика) | Словари OpenAI function-calling | `ai.chat_with_tools()` | 8 |
| 3 | Движок планов | `apps/tgas/shared/capabilities.py:341-381` | `@dataclass Capability` (outward) | `team_meeting.py:1004` → `run_capability()` | 10 |

**Всего уникальных имён: 31** (после вычета дублей `create_task` присутствует в двух источниках).

---

### Сводная таблица

#### Реестр 1: `apps/web/src/lib/stepan/tools.ts` — 17 инструментов (веб-админка)

| Инструмент | Строки | Тип | Что делает (по коду `run`) | risky | Может ли Python-сторона |
|---|---|---|---|---|---|
| `get_business_summary` | `tools.ts:58-86` | Read | Prisma: `order.count`, `order.aggregate._sum.total`, `stockMovement.aggregate`, `user.count` за сегодня. | — | **уже есть, называется иначе** → `get_report("daily")` и `_get_db_context()` (см. ниже) |
| `get_inventory_status` | `tools.ts:89-114` | Read | Prisma: `product.findMany` с `orderBy: stock asc`, маркировка CRITICAL/LOW/OK по порогу из `settings.stock.criticalLevel`. | — | **да** — SQL `SELECT * FROM products ORDER BY stock ASC` |
| `get_finance_summary` | `tools.ts:117-143` | Read | Prisma: `finance.groupBy({ by: ['type','category'] })` за N дней, суммы, маржа. | — | **уже есть, называется иначе** → `get_report("finance")` и `_query_db("finance_report")` |
| `get_bot_health` | `tools.ts:146-153` | Read | HTTP: `officeFetch('/api/admin/bots')` → пульс ботов из Redis. | — | **нет, привязан к рантайму** — но в обратную сторону: Python-сторона **сама живёт** внутри ИИ-офиса и может читать Redis напрямую. Реализация тривиальна, но это не HTTP-вызов, а прямое чтение. |
| `get_active_learnings` | `tools.ts:156-170` | Read | Prisma: `botLearning.findMany({ isActive: true })`, последние 20. | — | **да** — SQL `SELECT FROM bot_learnings WHERE is_active = TRUE` |
| `get_ai_spend` | `tools.ts:172-195` | Read | Prisma: `aiUsage.groupBy({ by: ['bot'] })` за месяц + бюджет из `settings`. | — | **да** — SQL к `ai_usage` + `system_settings` |
| `get_orders` | `tools.ts:198-229` | Read | Prisma: `order.findMany` с фильтром по статусу, join к `user` для имени. | — | **да** — SQL к `orders JOIN users` |
| `get_settings` | `tools.ts:231-236` | Read | Вызов `getSettings()` → все пары из `system_settings`. | — | **да** — SQL `SELECT FROM system_settings` |
| `get_tasks` | `tools.ts:237-257` | Read | Prisma: `task.findMany({ status not in done/cancelled })`, флаг `overdue`. | — | **да** — уже частично в `_get_db_context():1376-1385` и `_query_db("tasks_status"):1854-1860` |
| `find_product` | `tools.ts:259-278` | Read | Prisma: `product.findMany` по ILIKE nameRu/nameUz. | — | **да** — SQL `SELECT FROM products WHERE name_ru ILIKE ...` |
| `set_setting` | `tools.ts:286-310` | Write | `setSettings({ key: value }, 'stepan')`. Валидация по реестру `SETTINGS`. | ✓ (delivery, bonus, payment) | **да** — Python может вызвать HTTP PATCH к `/api/admin/settings` или SQL UPDATE |
| `change_product_price` | `tools.ts:313-346` | Write | `product.update({ price })`. Показывает diff в процентах. | ✓ (всегда) | **да** — SQL UPDATE или HTTP |
| `create_task` | `tools.ts:349-388` | Write | Prisma: `task.create` + `officeFetch('/api/admin/dispatch-task')` через event bus. | карточка | **уже есть** — `assistant.py:1250-1253` → `_handle_task():1542-1840` |
| `dispatch_bot_action` | `tools.ts:390-415` | Write | `officeFetch('/api/admin/bot-action')` — запускает действие бота (backup, KPI, sync). | карточка | **да** — Python может вызвать `bot_bus.send_task()` напрямую |
| `toggle_bot_job` | `tools.ts:417-439` | Write | `officeFetch('/api/admin/bot-jobs')` — вкл/выкл расписание. | карточка | **да** — Python ходит через тот же HTTP |
| `update_order_status` | `tools.ts:442-476` | Write | `order.update({ status })` + `syncOrderStatus()` → уведомление клиенту в Telegram. | ✓ (всегда) | **да** — Python может SQL UPDATE + Telegram notify |
| `deactivate_learning` | `tools.ts:478-498` | Write | `botLearning.update({ isActive: false })`. | карточка | **да** — SQL UPDATE |

#### Реестр 2: `apps/tgas/bots/stepan_bot/handlers/assistant.py` — 8 инструментов (Telegram)

| Инструмент | Объявление | Обработчик | Что делает (по коду) | Подтверждение | Может ли TypeScript-сторона |
|---|---|---|---|---|---|
| `create_task` | `assistant.py:1018-1034` | `assistant.py:1250-1253` → `_handle_task():1542-1840` | Создаёт задачу в БД (raw SQL INSERT INTO tasks), публикует `TASK_CREATED` в event bus, для контент/продажных задач — делегирует через bot_bus. | Нет (сразу) | **уже есть** — `tools.ts:349` (с подтверждением) |
| `roll_call` | `assistant.py:1036-1047` | `assistant.py:1275-1279` | `event_bus.publish("ROLL_CALL", {chat_id})` → боты отвечают **в текущий Telegram-чат**. | Нет | **нет, привязан к рантайму** — требует `message.chat.id` группового чата в Telegram; боты отвечают через aiogram `bot.send_message(chat_id)`. В веб-админке физически некуда писать. |
| `get_report` | `assistant.py:1048-1061` | `assistant.py:1281-1284` → `_generate_report():1911-1953` | SQL: заказы сегодня (orders), финансы за день (finances), задачи по статусам (tasks), новые клиенты (customers). Формирует текстовую сводку. | Нет | **уже есть, называется иначе** — покрывается комбинацией `get_business_summary` + `get_finance_summary` + `get_tasks` в TypeScript. Разница: Python возвращает одну текстовую сводку, TypeScript — структурированные JSON-объекты из отдельных вызовов. |
| `query_db` | `assistant.py:1062-1074` | `assistant.py:1286-1289` → `_query_db():1842-1908` | SQL по заранее заданным видам: `sales_summary`, `tasks_status`, `finance_report`, `orders_today`, `customers_count`, `employees`. **Не произвольный SQL** несмотря на имя. | Нет | **уже есть, называется иначе** — в TypeScript тот же набор данных доступен через `get_orders`, `get_tasks`, `get_finance_summary`. Однако `customers_count` и `employees` не имеют прямых аналогов в TypeScript. |
| `show_published_post` | `assistant.py:1076-1096` | `assistant.py:1291-1298` → `_show_publications():691-744` | Запрашивает у `content_bot` через bot_bus действие `get_last_post`, получает файл публикации, **отправляет фото в Telegram-чат** через `FSInputFile`. Фолбэк — Instagram Graph API. | Нет | **нет, привязан к рантайму** — отправляет медиафайлы через `message.answer_photo()` / `FSInputFile` (aiogram). В вебе можно вернуть URL картинки, но это другая реализация (не порт). |
| `get_content_status` | `assistant.py:1098-1108` | `assistant.py:1300-1303` → `_content_status():747-760` | Спрашивает `content_bot` через bot_bus действие `get_status`. Чисто текстовый ответ. | Нет | **да** — TypeScript может вызвать `officeFetch('/api/admin/bot-action', {action: 'get_status', bot: 'content_bot'})` |
| `register_sale` | `assistant.py:1109-1149` | `assistant.py:1255-1266` → `_register_sale():1468-1504` | Делегирует `sales_bot` через `bot_bus.send_task("register_sale")`. Ожидает результат 60 с. Сложная UI-логика с кнопками подтверждения товара. | Нет (в ТГ) | **да, но** — данные пишутся через `sales_bot` и bot_bus. TypeScript может вызвать тот же bot_bus через HTTP: `officeFetch('/api/admin/bot-action', {action: 'register_sale', bot: 'sales_bot', params: ...})`. Потребуется карточка подтверждения (risky: true). |
| `add_product` | `assistant.py:1150-1177` | `assistant.py:1268-1273` → `_add_product():1507-1539` | Делегирует `sales_bot` через `bot_bus.send_task("add_product")`. Добавляет и в CRM, и в витрину. | Голосом (промпт требует «да, добавь») | **да** — TypeScript может вызвать bot_bus через HTTP. Но также может Prisma `product.create` напрямую (витрина — владелец каталога). |

#### Реестр 3: `apps/tgas/shared/capabilities.py` — 10 возможностей (исполнение планов)

| Возможность | Строки | Что делает (по коду `run`) | outward | Привязка к рантайму |
|---|---|---|---|---|
| `notify_customers` | `capabilities.py:169-231` | Лестница каналов: Telegram `bot.send_message` → `send_email` → `_create_human_task` (звонок). Требует `Bot(token=sales_bot_token)`. | ✓ | **Привязан**: создаёт экземпляр `aiogram.Bot` для отправки сообщений. |
| `push_stale_orders` | `capabilities.py:234-241` | Обёртка над `notify_customers(segment="stale_orders")`. | ✓ | Привязан (через `notify_customers`). |
| `broadcast` | `capabilities.py:256-266` | `bot_bus → marketing_bot.send_broadcast`. | ✓ | Не привязан — bot_bus доступен через HTTP. |
| `b2b_offer` | `capabilities.py:269-280` | `bot_bus → marketing_bot.b2b_outreach`. Генерирует КП с PDF, шлёт на одобрение. | ✓ | Не привязан — bot_bus через HTTP. |
| `collect_leads` | `capabilities.py:283-290` | `bot_bus → marketing_bot.collect_leads`. Парсит 2ГИС/Google/Яндекс. | — | Не привязан — bot_bus через HTTP. |
| `publish_content` | `capabilities.py:292-298` | `bot_bus → content_bot.publish_post`. | ✓ | Не привязан — bot_bus через HTTP. |
| `build_report` | `capabilities.py:301-306` | `bot_bus → analytics_bot.get_report`. | — | Не привязан — bot_bus через HTTP. |
| `instagram_stats` | `capabilities.py:309-314` | `bot_bus → analytics_bot.get_instagram_stats`. | — | Не привязан — bot_bus через HTTP. |
| `check_dm` | `capabilities.py:317-322` | `bot_bus → support_bot.check_instagram_dm`. | — | Не привязан — bot_bus через HTTP. |
| `human_task` | `capabilities.py:325-335` | SQL INSERT INTO tasks. Честно говорит «бот не может». | — | Не привязан. |

---

### Пары-синонимы (скрытое дублирование)

| # | Python | TypeScript | Совпадение по реализации |
|---|---|---|---|
| 1 | `get_report("daily")` (`assistant.py:1911-1953`) | `get_business_summary` (`tools.ts:61-86`) | **Частичное.** Оба агрегируют заказы, финансы, задачи за сегодня. Python возвращает одну текстовую сводку, TypeScript — структурированный JSON. Python ещё считает новых клиентов, TypeScript — нет (считает новых пользователей отдельно). |
| 2 | `get_report("finance")` | `get_finance_summary` (`tools.ts:120-143`) | **Близкое.** Оба читают `finances`. Python — за день, TypeScript — за N дней с группировкой по категориям. TypeScript богаче. |
| 3 | `_query_db("tasks_status")` (`assistant.py:1854-1860`) | `get_tasks` (`tools.ts:241-257`) | **Разное.** Python — `GROUP BY status` (агрегация), TypeScript — полный список задач с дедлайнами и флагом `overdue`. |
| 4 | `_query_db("orders_today")` (`assistant.py:1871-1882`) | `get_orders` (`tools.ts:207-229`) | **Близкое.** Оба возвращают список заказов. TypeScript богаче — включает фильтр по статусу и данные клиента. |
| 5 | `human_task` (`capabilities.py:325-335`) | `create_task` (`tools.ts:349-388`) | **Частичное.** Оба создают строку в `tasks`. `create_task` ещё уведомляет бот-отдел через event bus. `human_task` — специально для задач, которые бот выполнить физически не может. |
| 6 | `build_report` (`capabilities.py:301-306`) | `get_business_summary` / `get_finance_summary` | **Частичное.** `build_report` делегирует в `analytics_bot`, TypeScript-инструменты читают Prisma напрямую. Разный механизм, пересекающийся результат. |
| 7 | `publish_content` (`capabilities.py:292-298`) | `dispatch_bot_action` (`tools.ts:390-415`) | **Частичное.** `dispatch_bot_action` может запустить `content_bot` через `bot-action`, а `publish_content` делает то же через `bot_bus` напрямую. |

---

### Итог инвентаризации

- **Инструментов только в веб-админке (16):** `get_business_summary`, `get_inventory_status`, `get_finance_summary`, `get_bot_health`, `get_active_learnings`, `get_ai_spend`, `get_orders`, `get_settings`, `get_tasks`, `find_product`, `set_setting`, `change_product_price`, `dispatch_bot_action`, `toggle_bot_job`, `update_order_status`, `deactivate_learning`.
- **Инструментов только в Telegram (7):** `roll_call`, `get_report`, `query_db`, `show_published_post`, `get_content_status`, `register_sale`, `add_product`.
- **Общий инструмент (1):** `create_task`.
- **Привязаны к рантайму намертво (2):** `roll_call` (Telegram-чат), `show_published_post` (отправка медиа через aiogram).
- **Возможности только для планов (10):** все в `capabilities.py` — потребляются `team_meeting.py`, а не диалогом.

---

## Этап 2. Предложение целевой схемы

### Существующие паттерны связи (прочитаны)

1. **`shared/assistant_memory.py:31-69`** — Python ходит в витрину по HTTP `GET/POST ${STOREFRONT_URL}/admin/stepan/memory` с заголовком `x-bot-secret`. При недоступности возвращает пустой список и предупреждает вызывающего.
2. **`shared/owner_alerts.py:29-86`** — тот же паттерн: `POST ${STOREFRONT_URL}/admin/alerts`. Неудача не роняет вызывающего, но логируется.
3. **Адрес:** `STOREFRONT_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")` — единый для всех клиентов.

### Ответы на четыре вопроса

#### 1. Где живёт единый список объявлений и в каком формате

**Мастер-каталог объявлений живёт в `apps/web/src/lib/stepan/tools.ts`** — там, где он уже есть. Это расширение, а не переписывание.

Каждый инструмент получает дополнительное поле `runtimes: ('web' | 'tg')[]`:
- `['web']` — реализован только в веб-рантайме.
- `['tg']` — реализован только в Telegram-рантайме.
- `['web', 'tg']` — реализован в обоих.

Экспорт для внешних потребителей — новый HTTP-эндпоинт:

```
GET /api/admin/stepan/tools   →   { tools: ToolDefinition[] }
```

Защита: `x-bot-secret` (как `/admin/stepan/memory`). Формат ответа — массив JSON Schema-деклараций с метаданными `name`, `description`, `parameters`, `risky`, `runtimes`.

#### 2. Как каждая сторона получает каталог и что делает при недоступности

**Веб-админка (`brain.ts`):** Импортирует `tools.ts` напрямую. Перед вызовом модели фильтрует: `tools.filter(t => t.runtimes.includes('web'))`. Ничего не меняется в поведении — все 17 инструментов остаются `web`.

**Telegram-ассистент (`assistant.py`):** Новый клиент `shared/stepan_tools.py` (по образцу `assistant_memory.py`):
- При старте бота и каждые 10 минут: `GET ${STOREFRONT_URL}/admin/stepan/tools`.
- Фильтрует `runtimes.includes('tg')`.
- Кеширует в переменной модуля.
- **Фолбэк при недоступности:** бот продолжает работать с закешированной версией. Если кеш пуст (первый старт, витрина лежит) — работает с текущим хардкодом (как сейчас). Предупреждение в лог.

#### 3. Что происходит с инструментом, не реализованным в текущем рантайме

**Модели его не показывают.** Фильтрация по `runtimes` происходит *до* формирования промпта. Модель физически не может вызвать `roll_call` в вебе или `change_product_price` в Telegram, потому что не знает об их существовании.

**Честный отказ при явном запросе.** Если владелец в веб-админке прямо скажет «перекличка», Стёпан ответит на основании системного промпта, который включает список инструментов, недоступных в текущем рантайме:

```
Эти действия доступны только в Telegram: roll_call, show_published_post.
Если владелец о них спросит — скажи, что это работает в Telegram, и объясни почему.
```

Модель не галлюцинирует вызов; она знает об ограничении и объясняет его человеку.

#### 4. Судьба `capabilities.py`

**Оставить отдельным.** Причины:

1. **Другой потребитель.** `capabilities.py` используется `team_meeting.py:852-1004` для исполнения многошаговых планов. Это не диалоговый function calling, а пакетное выполнение со сбором доказательств (`Result.evidence`). Протокол другой: `catalog_for_ai()` даёт AI-маршрутизатору текстовое описание, `run_capability()` исполняет, `is_outward()` проверяет необходимость подтверждения.

2. **Другая семантика.** Диалоговый инструмент вызывается моделью в рамках `chat_with_tools()` и возвращает данные модели. Возможность (`Capability`) вызывается планировщиком, возвращает `Result` со структурированными доказательствами и необязательным `human_task`.

3. **Пересечение управляемо.** Некоторые возможности (`broadcast`, `collect_leads`, `publish_content`) могут быть также оформлены как диалоговые инструменты с `runtimes: ['tg']` — через обёртку, вызывающую `run_capability`. Но сливать реестры в один список нет причин: это два интерфейса к одному бэкенду.

**Связывание:** Когда диалоговый инструмент и возможность делают одно и то же (`dispatch_bot_action` ↔ `publish_content`), диалоговый инструмент должен вызывать `run_capability` внутри, а не дублировать логику. Но это этап 3.

---

### Рекомендуемый порядок реализации (Этап 3, после одобрения)

**Фаза 3a — единый каталог и честный отказ — ✅ СДЕЛАНА (коммит `8d2daad`):**
1. ✅ Поле `runtimes` у `ReadTool` / `WriteTool` в `tools.ts`.
2. ✅ Эндпоинт `GET /api/admin/stepan/tools`.
3. ✅ Клиент `shared/stepan_tools.py` по образцу `assistant_memory.py`.
4. ✅ В `assistant.py` хардкод инструментов заменён на `load_registry("tg")`.
5. ✅ В `brain.ts` фильтрация по `runtimes.includes('web')` и строка в промпт о недоступных инструментах.

**Фаза 3b — реализация недостающих инструментов (по одному, каждый с проверкой):**
- Приоритет определяет владелец на ВОРОТАХ.
- Каждый инструмент — отдельный коммит с проверкой `lint + build + py_compile`.

---

---

## Этап 3. Анализ системных промптов и личности ассистента

### Исследованные файлы и промпты

1. **`apps/tgas/shared/ai_engine.py:36-86`** (`MICROGREEN_SYSTEM_PROMPT`)  
   *Контекст:* Дефолтный промпт `mg_ai` по умолчанию.  
   *Личность:* Профессиональный менеджер по продажам Microgreen Uzbekistan.  
   *Собеседник:* Клиенты / Покупатели (витрина).  

2. **`apps/web/src/lib/stepan/brain.ts:42-56`** (`SYSTEM_PROMPT`)  
   *Контекст:* Мозг ассистента в веб-админке.  
   *Личность:* Стёпан, операционный директор (COO).  
   *Собеседник:* Владелец бизнеса (веб-интерфейс админки).  

3. **`apps/tgas/bots/stepan_bot/handlers/assistant.py:38-86`** (`STEPAN_PERSONA`)  
   *Контекст:* Telegram-бот Стёпана.  
   *Личность:* Стёпан, Генеральный Управляющий (General Manager / COO).  
   *Собеседник:* Руководитель / Владелец бизнеса (Telegram-чат).  

---

### Ответы на три вопроса

#### 1. Это одна личность в двух экземплярах или две разные роли?
**Это РАЗНЫЕ роли для РАЗНЫХ собеседников.**

- `MICROGREEN_SYSTEM_PROMPT` (`ai_engine.py:36`) — это **менеджер по продажам**, ориентированный на покупателей и клиентов (ассортимент, цены, гидропоника, доставка, способы оплаты).
- `SYSTEM_PROMPT` (`brain.ts:42`) — это **операционный директор (COO) / GM**, ориентированный на владельца бизнеса.

**Вывод:** Сливать `MICROGREEN_SYSTEM_PROMPT` с промптом Стёпана **НЕЛЬЗЯ**. Промпт менеджера по продажам остаётся витринным/клиентским промптом по умолчанию для ботов продающего контура.

#### 2. Есть ли у Стёпана-в-Telegram собственный третий промпт?
**ДА. Настоящее дублирование именно здесь.**

- `STEPAN_PERSONA` (`assistant.py:38-86`) в Telegram и `SYSTEM_PROMPT` (`brain.ts:42-56`) в Вебе описывают **ОДНОГО И ТОГО ЖЕ человека (Стёпана, COO/GM)**, общающегося с **ОДНИМ И ТЕМ ЖЕ пользователем (владельцем бизнеса)**.
- Различие:
  - В Вебе (`brain.ts`): лаконичный 15-строчный промпт о вызове веб-инструментов чтения/записи и подготовке карточек подтверждения.
  - В Telegram (`assistant.py`): развёрнутый 50-строчный промпт с описанием подчиненных AI-директоров отделов (@sales, @marketing, @finance, @hr и др.), правил регистрации продаж, регламента контента и созыва совещаний.

**Вывод:** Один и тот же диалог с владельцем в разных каналах сейчас ведётся от имени одной личности, но с разным уровнем деталей и тона.

#### 3. Где должен жить единый источник и как доставляться?
**Единый источник должен жить на стороне `apps/web` и отдаваться в `apps/tgas` по HTTP.**

- *Архитектурное ограничение:* `apps/tgas` и `apps/web` не импортируют код друг друга (Turborepo boundary rule), связь только по HTTP с заголовком `x-bot-secret`.
- *Паттерн:* Единый промпт хранится на витрине (`apps/web/src/lib/stepan/persona.ts` или API) и запрашивается ботом при старте / кешируется в памяти по аналогии с `/api/admin/stepan/tools` (`shared/stepan_tools.py`) и `/api/admin/stepan/memory` (`shared/assistant_memory.py`).
- *Структура:* 
  - **Базовое ядро (Shared Identity):** Описание личности Стёпана (COO/GM), цели, тон общения, бизнес-контекст компании и отделов.
  - **Специфика рантайма (Runtime Extensions):**
    - Для Telegram: подмешиваются правила взаимодействия с ботами отделов, командами и aiogram-инструментами.
    - Для Web: подмешиваются правила работы с веб-карточками подтверждения и инструментами Prisma.

---

## 🛑 ВОРОТА ПО ЗАДАЧЕ 2

Анализ и документация завершены. Код ассистентов НЕ менялся (согласно ограничениям). Ожидаем решения владельца по слиянию промптов Стёпана (Telegram ↔ Web).


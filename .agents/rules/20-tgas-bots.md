# AI Office — 13 ботов (apps/tgas)

Активация: **Glob** — `apps/tgas/**`.

## Реестр и порты (фиксированы)

Единый источник — `apps/tgas/shared/bot_registry.py` (`BotInfo`). Порт менять нельзя: он захардкожен в `docker-compose.prod.yml` и в nginx.

| Бот | Порт | Telegram | Отдел |
|-----|------|----------|-------|
| stepan_bot | 8081 | да | pm |
| sales_bot | 8082 | да | sales |
| support_bot | 8083 | да | support |
| hr_bot | 8084 | да | hr |
| finance_bot | 8085 | да | finance |
| marketing_bot | 8086 | да | marketing |
| — | 8087 | — | резерв pm_bot |
| analytics_bot | 8088 | да | analytics |
| content_bot | 8089 | да | content |
| qa_bot | 8090 | нет | qa |
| rnd_bot | 8091 | нет | rnd |
| devops_bot | 8092 | нет | devops |
| franchise_bot | 8093 | нет | — |
| n8n_bridge | — | нет | — |

Веб-дашборд офиса (`web_office/main.py`, FastAPI) слушает 8050 — это не бот.

## Две шины, разные задачи

**Event Bus** (`shared/event_bus.py`) — широковещательные события. Redis Pub/Sub основной, HTTP broadcast — фоллбэк.

```python
await event_bus.connect()
event_bus.on("EVENT_NAME", handler)
await event_bus.start_listening(port, app)
```

**Bot Bus** (`shared/bot_bus.py`) — адресные задачи, файловая очередь с результатом.

```python
task_id = await bot_bus.send_task(from_bot=..., to_bot=..., action=..., params=...)
result = await bot_bus.get_result(task_id, timeout=90)      # None = не успел
await bot_bus.start_listener(bot_name, handlers_dict)        # на стороне исполнителя
```

Внутренние стадии: `send_task` → `get_pending_tasks` → `claim_task` → `complete_task`. Руками файлы очереди не трогать.

**Прямые вызовы бот→бот запрещены.** Только через одну из шин.

## Обязательный каркас бота

Каждый бот при старте: `start_heartbeat(name)`, `scheduler.start()`, bot_bus listener. Пропустишь heartbeat — бот считается мёртвым в дашборде.

`ROLL_CALL` обрабатывается общим `shared/roll_call.py` → `handle_roll_call(bot_name, payload)`. Раньше этот код был скопирован в 7 файлов — не копировать снова, импортировать.

## Жёсткие правила Python

- Type hints на всех сигнатурах. `async`/`await` везде.
- SQL — только через `sqlalchemy.text()`. ORM-модели (`Base`) запрещены.
- **AI-вызовы — только через `shared/ai_engine.py` (AIEngine).** Прямые клиенты OpenAI/Gemini запрещены.
- Все env-переменные — через `shared/config.py` (Pydantic Settings). `os.getenv` мимо конфига — дефект.
- Логирование через `logging`, не `print`. Докстринги, комментарии и логи — на русском.
- f-strings для форматирования.

## Проверка

Автотестов, линтера и CI в `apps/tgas` нет. `pytest`/`black`/`ruff` лежат в `requirements.txt`, но не используются. Файлы `test_*.py` в корне — ручные скрипты, которые шлют реальные сообщения в Telegram настоящими токенами из `.env`; это не тесты, наугад их не запускать.

Проверять так:

```bash
python -m py_compile apps/tgas/bots/<bot>/main.py apps/tgas/shared/<module>.py
docker compose up -d postgres redis      # инфраструктура, нужна каждому боту
python -m bots.<name>.main               # запуск одного бота из apps/tgas
```

Подробности запуска и архитектуры — `apps/tgas/CLAUDE.md`.

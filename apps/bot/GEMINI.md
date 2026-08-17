# apps/bot — Telegram Storefront Bot

## What this is
Customer-facing Telegram bot for ordering microgreens.

## Tech
- Python 3.11+, aiogram 3
- OpenAI (mg_ai) for the AI seller chat
- HTTP calls to `apps/web/api/*`

## 🚫 CRITICAL CONSTRAINTS (Never do this)
- NEVER use `bot.send_message` without explicitly defining `parse_mode="HTML"`.
- NEVER write business logic or API calls directly inside `handlers/`. Move logic to `services/`.
- NEVER use raw strings for inline keyboard callbacks. ALWAYS use aiogram's `CallbackData` classes.
- NEVER create a separate `Bot()` instance. ALWAYS import the singleton from `main.py` or pass it via context.
- NEVER block the event loop. Use `async/await` for all I/O operations (HTTP, DB).

## Handling Mistakes
- If routing fails, check the router registration order in `main.py`. Priority MUST be: admin → start → shop → unified → orders → ai_seller → group.
- If the bot throws an HTML parse error, ensure user inputs are escaped before inserting them into `<b>` or `<i>` tags.

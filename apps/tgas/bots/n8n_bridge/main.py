"""
🌉 n8n_bridge — мост между Bot Bus и n8n (Ultimate Assistant)
============================================================
Слушает Bot Bus ТОЧНО ТАК ЖЕ, как остальные боты (через shared.bot_bus.start_listener),
получает от Степана действия для личной почты / календаря / контактов
и выполняет их, вызывая n8n-workflow "Ultimate Assistant" по webhook.

Это НЕ полноценный aiogram-бот с Telegram — у него нет своего чата.
Он существует только как исполнитель задач в общей шине, наравне с sales_bot и др.
Результат возвращается Степану через стандартный механизм complete_task().

Почему так, а не через Redis Pub/Sub:
ваш Bot Bus реализован на файловой очереди JSON (shared/bot_bus.py),
а Степан диспетчеризует задачи по департаментам через send_task(to_bot=...).
Мост встраивается в этот же паттерн — ничего нового в архитектуру не вносится.
"""

import asyncio
import logging
import os

import aiohttp

from shared.bot_bus import start_listener, cleanup_old_tasks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [n8n_bridge] %(levelname)s: %(message)s",
)
logger = logging.getLogger("n8n_bridge")

# URL вебхука n8n. Локально n8n поднят из docker-compose.n8n.yml на 5678.
# Если мост запускается в том же docker-стеке, используйте имя сервиса вместо localhost.
N8N_WEBHOOK_URL = os.getenv(
    "N8N_ASSISTANT_WEBHOOK", "http://localhost:5678/webhook/assistant"
)
N8N_TIMEOUT = int(os.getenv("N8N_TIMEOUT", "120"))


async def _call_n8n(query: str, session_id: str) -> dict:
    """Отправляет запрос в n8n Ultimate Assistant и возвращает {message: ...}."""
    payload = {"query": query, "session_id": session_id}
    timeout = aiohttp.ClientTimeout(total=N8N_TIMEOUT)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(N8N_WEBHOOK_URL, json=payload) as resp:
                if resp.status not in (200, 201):
                    text = await resp.text()
                    logger.warning("n8n HTTP %s: %s", resp.status, text[:200])
                    return {"message": f"n8n вернул ошибку (HTTP {resp.status})."}
                data = await resp.json(content_type=None)
    except asyncio.TimeoutError:
        logger.error("Таймаут ожидания ответа n8n (%ss)", N8N_TIMEOUT)
        return {"message": "n8n не ответил вовремя, попробуйте ещё раз."}
    except Exception as e:  # noqa: BLE001
        logger.exception("Ошибка вызова n8n: %s", e)
        return {"message": f"Ошибка связи с n8n: {e}"}

    # Нода Respond to Webhook возвращает {"status": "done", "msg": "..."}
    msg = data.get("msg") if isinstance(data, dict) else str(data)
    if msg == "None" or not msg:
        msg = "Задача передана в n8n (нет подробного ответа)."
    return {"message": msg}


# ── Обработчики действий (Степан вызывает их через департамент assistant) ──
# Каждый handler принимает params (dict) и возвращает result (dict).
# Формат result совпадает с остальными ботами: Степан читает result["message"].


async def handle_email(params: dict) -> dict:
    query = params.get("description") or params.get("topic") or params.get("title", "")
    session_id = str(params.get("chat_id", "default"))
    logger.info("Email → n8n: %s", query)
    return await _call_n8n(query, session_id)


async def handle_calendar(params: dict) -> dict:
    query = params.get("description") or params.get("topic") or params.get("title", "")
    session_id = str(params.get("chat_id", "default"))
    logger.info("Calendar → n8n: %s", query)
    return await _call_n8n(query, session_id)


async def handle_contacts(params: dict) -> dict:
    query = params.get("description") or params.get("topic") or params.get("title", "")
    session_id = str(params.get("chat_id", "default"))
    logger.info("Contacts → n8n: %s", query)
    return await _call_n8n(query, session_id)


async def handle_assistant(params: dict) -> dict:
    """Универсальное действие: просто передать запрос ассистенту n8n как есть."""
    query = params.get("description") or params.get("topic") or params.get("title", "")
    session_id = str(params.get("chat_id", "default"))
    logger.info("Assistant → n8n: %s", query)
    return await _call_n8n(query, session_id)


async def _periodic_cleanup():
    while True:
        await asyncio.sleep(3600)
        try:
            await cleanup_old_tasks()
        except Exception:  # noqa: BLE001
            pass


async def main():
    logger.info("n8n_bridge запускается. Webhook: %s", N8N_WEBHOOK_URL)

    # Слушаем Bot Bus как бот "n8n_bridge" — тот же паттерн, что content_bot.
    listener = start_listener(
        "n8n_bridge",
        {
            "email": handle_email,
            "calendar": handle_calendar,
            "contacts": handle_contacts,
            "assistant": handle_assistant,
        },
    )

    from shared.health import start_heartbeat

    await asyncio.gather(listener, _periodic_cleanup(), start_heartbeat("n8n_bridge"))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("n8n_bridge остановлен.")

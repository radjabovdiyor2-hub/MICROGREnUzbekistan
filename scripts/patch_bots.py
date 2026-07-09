import os

bots = [
    "analytics_bot", "content_bot", "finance_bot", "hr_bot", 
    "marketing_bot", "sales_bot", "support_bot"
]

patch_func = """
async def handle_roll_call(payload: dict):
    from shared.config import settings
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode
    chat_id = payload.get("data", {}).get("chat_id")
    if not chat_id:
        return
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"ROLL_CALL received for chat {chat_id}")
    
    bot_name = "{BOT_NAME}"
    token_attr = f"{bot_name}_token"
    token = getattr(settings, token_attr, None)
    if not token:
        logger.error(f"No token found for {bot_name}")
        return
        
    bot_display_names = {
        "sales_bot": "Отдел Продаж (Sales)",
        "marketing_bot": "Отдел Маркетинга",
        "support_bot": "Отдел Поддержки",
        "hr_bot": "Отдел HR",
        "finance_bot": "Отдел Финансов",
        "analytics_bot": "Отдел Аналитики",
        "content_bot": "Отдел Контента"
    }
    display_name = bot_display_names.get(bot_name, bot_name)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        await bot.send_message(chat_id, f"🟢 {display_name} на связи!")
    except Exception as e:
        logger.error(f"Failed to respond to roll_call: {e}")
    finally:
        await bot.session.close()
"""

for bot_name in bots:
    main_py_path = f"apps/tgas/bots/{bot_name}/main.py"
    if not os.path.exists(main_py_path):
        continue
        
    with open(main_py_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if "handle_roll_call" in content:
        continue
        
    # Append the function
    func_code = patch_func.replace("{BOT_NAME}", bot_name)
    content = content.replace("async def main():", func_code + "\n\nasync def main():")
    
    # Add the event_bus listener inside main()
    # Find event_bus.start_listening
    if "event_bus.start_listening" in content:
        content = content.replace(
            "await event_bus.start_listening(", 
            "event_bus.on(\"ROLL_CALL\", handle_roll_call)\n    await event_bus.start_listening("
        )
    else:
        # Just append it before the polling starts
        content = content.replace(
            "await dp.start_polling",
            "event_bus.on(\"ROLL_CALL\", handle_roll_call)\n    await dp.start_polling"
        )
        
    with open(main_py_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Bots patched successfully.")

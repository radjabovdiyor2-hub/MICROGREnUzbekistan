import os

depts = ["content", "sales", "pm", "marketing", "finance", "analytics", "support"]

for dept in depts:
    handler_code = f"""

async def handle_task_created(payload: dict):
    data = payload.get("data", {{}})
    if str(data.get("department", "")).lower() != "{dept}":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return
    
    bot = Bot(token=settings.{dept}_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        prompt = f"Пожалуйста, выполни задачу от руководителя:\\nНазвание: {{data.get('title')}}\\nОписание: {{data.get('description')}}\\nСделай результат и верни его."
        logging.info(f"{dept.upper()} BOT Generating AI answer...")
        answer = await ai.chat_completion("Ты профессионал отдела {dept}. Ответь на задачу сразу результатом, без лишних слов приветствия.", prompt)
        
        logging.info(f"{dept.upper()} BOT sending message to {{chat_id}}")
        await bot.send_message(chat_id, f"📝 <b>Результат от отдела {dept.upper()}:</b>\\n\\n{{answer}}")
        logging.info(f"{dept.upper()} BOT successfully sent message.")
        
        if task_id:
            from shared.event_bus import event_bus
            await event_bus.publish("TASK_COMPLETED", {{
                "task_id": task_id,
                "completed_by": "{dept}", "chat_id": chat_id
            }}, "{dept}_bot")
            
    except Exception as e:
        logging.error(f"Error handling task: {{repr(e)}}", exc_info=True)
    finally:
        await bot.session.close()
"""

    main_py_path = f"bots/{dept}_bot/main.py"
    if not os.path.exists(main_py_path):
        print(f"Not found: {main_py_path}")
        continue

    with open(main_py_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "handle_task_created" in content:
        print(f"Skipping {dept}, already patched.")
        continue

    content = content.replace("async def main():", handler_code + "\nasync def main():")

    patch = """    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    await event_bus.start_listening()"""

    content = content.replace("await event_bus.connect()", patch)

    with open(main_py_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Patched {dept}")

import re
import json

with open('apps/tgas/bots/stepan_bot/handlers/assistant.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new tools
tools_definition = """
    # ── Достаем историю ──
    history = []
    if state:
        state_data = await state.get_data()
        history = state_data.get("history", [])

    tools = [
        {
            "type": "function",
            "function": {
                "name": "create_task",
                "description": "Создать и делегировать задачу одному из отделов (sales, marketing, support, hr, finance, pm, analytics, content)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "department": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]}
                    },
                    "required": ["department", "title", "description", "priority"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "roll_call",
                "description": "Провести перекличку: отправить всем ботам команду отозваться в общем чате",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string", "description": "Текст сообщения для переклички"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_report",
                "description": "Сформировать отчет (ежедневный, финансовый и т.д.)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "report_kind": {"type": "string", "enum": ["daily", "finance", "sales", "tasks", "full"]}
                    },
                    "required": ["report_kind"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "query_db",
                "description": "Запросить данные из БД (не отчет, а сырые данные)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "db_query": {"type": "string"}
                    }
                }
            }
        }
    ]

    try:
        response_msg = await ai.chat_with_tools(
            system_prompt=prompt,
            user_message=user_text,
            tools=tools,
            conversation_history=history
        )
    except Exception as e:
        logger.error(f"AI error: {e}")
        await message.answer("😔 Извините, не смог обработать. Попробуйте ещё раз.")
        await set_reaction(message, "🤷‍♂️")
        return

    # Функция для отправки ответа (текст + опционально голос)
    async def send_response(text_resp: str):
        if not text_resp: return
        await message.answer(text_resp)
        await set_reaction(message, "👍")
        if message.voice:
            try:
                import os
                from aiogram.types import FSInputFile
                voice_path = await ai.generate_speech(text_resp)
                if voice_path and os.path.exists(voice_path):
                    voice_file = FSInputFile(voice_path)
                    await message.answer_voice(voice_file)
                    os.remove(voice_path)
            except Exception as e:
                logger.error(f"Voice generation failed: {e}")

    # Process tools if called
    if response_msg.tool_calls:
        tool_results_text = []
        for tool_call in response_msg.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments)
            
            if name == "create_task":
                fake_data = {
                    "department": args.get("department"),
                    "title": args.get("title"),
                    "description": args.get("description"),
                    "priority": args.get("priority", "medium")
                }
                await _handle_task(message, fake_data)
                tool_results_text.append(f"Задача '{args.get('title')}' создана.")
                
            elif name == "roll_call":
                from shared.event_bus import event_bus
                await event_bus.publish("ROLL_CALL", {"chat_id": message.chat.id, "message": args.get("message", "Перекличка!")})
                tool_results_text.append("Перекличка запущена.")
                await send_response("📢 Я запросил все отделы отозваться в этом чате. Ожидайте подтверждений.")
                
            elif name == "get_report":
                report = await _generate_report(args.get("report_kind", "daily"))
                await message.answer(f"📊 Отчет:\\n\\n{report}")
                tool_results_text.append("Отчет отправлен.")
                
            elif name == "query_db":
                db_ans = await _query_db(args.get("db_query", ""))
                await message.answer(f"🔍 Данные из БД:\\n\\n{db_ans}")
                tool_results_text.append("Данные отправлены.")
                
        # Update history with tool execution result
        if state:
            history.append({"role": "user", "content": user_text})
            history.append({"role": "assistant", "content": f"[TOOLS CALLED: {', '.join(tool_results_text)}] {response_msg.content or ''}"})
            if len(history) > 10: history = history[-10:]
            await state.update_data(history=history)
            
        if response_msg.content:
            await send_response(response_msg.content)
            
        await set_reaction(message, "👍")
        return
        
    # If no tools called, just send the text
    response_text = response_msg.content or ""
    if state:
        history.append({"role": "user", "content": user_text})
        history.append({"role": "assistant", "content": response_text})
        if len(history) > 10: history = history[-10:]
        await state.update_data(history=history)

    await send_response(response_text)
"""

start_idx = content.find("    # ── Достаем историю ──")
end_idx = content.find("# ═══════════════════════════════════════════════════════\n# Внутренние функции")

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + tools_definition + "\n\n" + content[end_idx:]
    
    # We must also remove the old JSON output from STEPAN_PERSONA prompt
    # and update the prompt to tell it to use tools.
    persona_start = new_content.find("Формат ответа для ЗАДАЧ — верни JSON:")
    persona_end = new_content.find('"""', persona_start)
    
    if persona_start != -1 and persona_end != -1:
        new_prompt = """
Используй ВЫЗОВЫ ФУНКЦИЙ (Function Calling) для действий:
- Если нужно создать задачу, вызови create_task
- Если нужна перекличка, вызови roll_call
- Если нужен отчет, вызови get_report
- Если нужны сырые данные, вызови query_db
- Если это просто вопрос или личное общение, отвечай текстом.
"""
        new_content = new_content[:persona_start] + new_prompt + new_content[persona_end:]

    with open('apps/tgas/bots/stepan_bot/handlers/assistant.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Patch applied successfully.")
else:
    print("Could not find boundaries for patching.")

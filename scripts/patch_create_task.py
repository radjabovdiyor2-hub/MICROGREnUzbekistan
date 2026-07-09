import os
import re

file_path = 'apps/tgas/bots/stepan_bot/handlers/assistant.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """
            if name == "create_task":
                fake_data = {
                    "department": args.get("department"),
                    "title": args.get("title"),
                    "description": args.get("description"),
                    "priority": args.get("priority", "medium")
                }
                await _handle_task(message, fake_data)
                tool_results_text.append(f"Задача '{args.get('title')}' создана.")
"""

new_logic = """
            if name == "create_task":
                dept = args.get("department", "pm")
                title = args.get("title", "Новая задача")
                desc = args.get("description", "")
                priority = args.get("priority", "medium")
                
                # 1. Сохраняем задачу в БД
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(
                        text("INSERT INTO tasks (title, assignee, department, status, priority, description) "
                        "VALUES (:p1, :p2, :p3, 'todo', :p4, :p5) RETURNING id"),
                        {"p1": title, "p2": dept, "p3": dept, "p4": priority, "p5": desc}
                    )
                    task_id = res.scalar()
                    await session.commit()
                
                # 2. Публикуем событие для "оживления" отдела
                from shared.event_bus import event_bus
                await event_bus.publish("TASK_CREATED", {
                    "task_id": task_id,
                    "department": dept,
                    "title": title,
                    "description": desc,
                    "chat_id": message.chat.id
                }, "stepan_bot")
                
                tool_results_text.append(f"Задача '{title}' передана отделу {dept}. Ожидайте ответа от руководителя отдела в чате.")
                
                # Степан сообщает, что передал задачу
                await send_response(f"📋 Я поручил задачу «{title}» отделу {dept}. Сейчас руководитель отдела подключится и ответит вам здесь!")
"""

if old_logic.strip() in content:
    content = content.replace(old_logic.strip(), new_logic.strip())
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patch applied successfully.")
else:
    print("Could not find the old logic block.")

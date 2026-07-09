import re

with open('apps/tgas/bots/stepan_bot/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add PM handlers before handle_task_completed
pm_handlers = '''
    async def handle_pm_task_created(payload: dict):
        data = payload.get("data", {})
        if str(data.get("department", "")).lower() not in ("pm", "operations", "production", "logistics"):
            return
        chat_id = data.get("chat_id")
        task_id = data.get("task_id")
        if not chat_id:
            return
        
        try:
            from shared.ai_engine import AIEngine
            ai = AIEngine()
            from shared.prompts import TEAM_CONTEXT
            sys_prompt = f"{TEAM_CONTEXT}\\n\\nТы — Операционный Директор (COO) и главный Project Manager. Твоя задача: не просто выполнять поручения, а структурно планировать их выполнение по Agile/Lean. Оцени узкие места (bottlenecks), предложи пошаговый Action Plan, укажи риски."
            user_prompt = f"Руководитель поставил задачу:\\nНазвание: {data.get('title')}\\nОписание: {data.get('description')}\\nПроанализируй задачу и выдай структурный план действий."
            logger.info("PM BOT Generating AI answer...")
            answer = await ai.chat_completion(sys_prompt, user_prompt)
            
            # Интеграция со складом (автоматическое списание при посеве/сборке)
            title_lower = str(data.get('title', '')).lower()
            if "посад" in title_lower or "посев" in title_lower:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                try:
                    async with get_session_ctx() as session:
                        await session.execute(text("UPDATE inventory SET quantity = quantity - 1 WHERE category = 'seeds' AND quantity >= 1"))
                        await session.execute(text("UPDATE inventory SET quantity = quantity - 5 WHERE category = 'substrate' AND quantity >= 5"))
                        await session.commit()
                    answer += "\\n\\n📦 <b>Складской учёт:</b>\\nАвтоматически списано: 1 кг семян, 5 кокосовых субстратов."
                except Exception as e:
                    logger.error(f"Error deducting inventory: {e}")
            
            await bot.send_message(chat_id, f"📝 <b>Результат от отдела PM:</b>\\n\\n{answer}")
            
            if task_id:
                await event_bus.publish("TASK_COMPLETED", {
                    "task_id": task_id,
                    "completed_by": "pm", "chat_id": chat_id
                }, "stepan_bot")
                
        except Exception as e:
            logger.error(f"Error handling PM task: {repr(e)}", exc_info=True)

'''
content = content.replace('    async def handle_task_completed(payload: dict):', pm_handlers + '\n    async def handle_task_completed(payload: dict):')

# Add order_created delivery task logic to on_any_event
order_logic = '''        elif event_type == "order_created":
            order_number = data.get("order_number", "Unknown")
            amount = data.get("total_amount", 0)
            items = data.get("items_summary", "")
            try:
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    await session.execute(text(
                        "INSERT INTO tasks (title, description, status, department, priority, deadline) "
                        "VALUES (:title, :desc, 'todo', 'delivery', 'high', CURRENT_DATE)"
                    ), {
                        "title": f"Доставить заказ {order_number}",
                        "desc": f"Новый заказ на сумму {amount} UZS.\\nДетали: {items}"
                    })
                    await session.commit()
                logger.info(f"Степан: Auto-created delivery task for order {order_number}")
            except Exception as e:
                logger.error(f"Степан order handling error: {e}")
'''
content = content.replace('        else:\n            # Всё остальное', order_logic + '\n        else:\n            # Всё остальное')

# Subscribe to TASK_CREATED
content = content.replace('event_bus.on("TASK_COMPLETED", handle_task_completed)', 'event_bus.on("TASK_COMPLETED", handle_task_completed)\n    event_bus.on("TASK_CREATED", handle_pm_task_created)')

# Update n8n_webhook_handler for bot_bus
bus_endpoints = '''
            elif action == "bus_get_tasks":
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "SELECT id, title, department, status, priority, deadline "
                        "FROM tasks WHERE status NOT IN ('done', 'cancelled') "
                        "ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 "
                        "WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"
                    ))
                    rows = res.fetchall()
                    res2 = await session.execute(text("SELECT status, COUNT(*) FROM tasks GROUP BY status"))
                    stats = {r[0]: r[1] for r in res2.fetchall()}
                tasks_list = [
                    {"id": r[0], "title": r[1], "department": r[2], "status": r[3],
                     "priority": r[4], "deadline": str(r[5]) if r[5] else None}
                    for r in rows
                ]
                return web.json_response({"status": "ok", "message": f"Активных задач: {len(tasks_list)}", "data": {"tasks": tasks_list, "stats": stats}})
            elif action == "bus_get_deadlines":
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "SELECT id, title, deadline, priority, department FROM tasks "
                        "WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 "
                        "AND status NOT IN ('done', 'cancelled') "
                        "ORDER BY deadline ASC"
                    ))
                    rows = res.fetchall()
                deadlines = [
                    {"id": r[0], "title": r[1], "deadline": str(r[2]), "priority": r[3], "department": r[4]}
                    for r in rows
                ]
                return web.json_response({"status": "ok", "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}", "data": deadlines})
'''
content = content.replace('            else:\n                return web.json_response({"status": "error", "message": "Unknown action"}, status=400)', bus_endpoints + '            else:\n                return web.json_response({"status": "error", "message": "Unknown action"}, status=400)')

with open('apps/tgas/bots/stepan_bot/main.py', 'w', encoding='utf-8') as f:
    f.write(content)


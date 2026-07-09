with open('apps/tgas/bots/stepan_bot/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

bus_listener = '''    from shared.bot_bus import start_listener as bus_listen
    async def bus_get_tasks(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT id, title, department, status, priority, deadline FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"))
                rows = res.fetchall()
                res2 = await session.execute(text("SELECT status, COUNT(*) FROM tasks GROUP BY status"))
                stats = {r[0]: r[1] for r in res2.fetchall()}
            tasks_list = [{"id": r[0], "title": r[1], "department": r[2], "status": r[3], "priority": r[4], "deadline": str(r[5]) if r[5] else None} for r in rows]
            return {"status": "ok", "message": f"Активных задач: {len(tasks_list)}", "data": {"tasks": tasks_list, "stats": stats}}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def bus_get_deadlines(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT id, title, deadline, priority, department FROM tasks WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status NOT IN ('done', 'cancelled') ORDER BY deadline ASC"))
                rows = res.fetchall()
            deadlines = [{"id": r[0], "title": r[1], "deadline": str(r[2]), "priority": r[3], "department": r[4]} for r in rows]
            return {"status": "ok", "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}", "data": deadlines}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    asyncio.create_task(bus_listen("pm_bot", {
        "get_tasks": bus_get_tasks,
        "get_deadlines": bus_get_deadlines,
    }))
'''
content = content.replace('    asyncio.create_task(start_heartbeat("stepan_bot"))', '    asyncio.create_task(start_heartbeat("stepan_bot"))\n' + bus_listener)

with open('apps/tgas/bots/stepan_bot/main.py', 'w', encoding='utf-8') as f:
    f.write(content)

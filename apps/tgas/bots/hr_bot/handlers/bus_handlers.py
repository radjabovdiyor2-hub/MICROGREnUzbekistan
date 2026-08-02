import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def bus_get_employees(params: dict) -> dict:
    """Список и количество сотрудников."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as session:
            res = await session.execute(
                text("SELECT status, COUNT(*) FROM employees GROUP BY status")
            )
            status_map = {r[0]: r[1] for r in res.fetchall()}
            res = await session.execute(
                text(
                    "SELECT id, name, role, status, salary FROM employees ORDER BY name"
                )
            )
            rows = res.fetchall()
        employees = [
            {
                "id": r[0],
                "name": r[1],
                "role": r[2],
                "status": r[3],
                "salary": float(r[4] or 0),
            }
            for r in rows
        ]
        total = sum(status_map.values())
        return {
            "status": "ok",
            "message": f"Сотрудников: {total} (активных: {status_map.get('active', 0)})",
            "data": {"total": total, "by_status": status_map, "employees": employees},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def bus_employee_kpi(params: dict) -> dict:
    """Расчёт KPI сотрудника."""
    employee_id = params.get("employee_id")
    month = params.get("month") # YYYY-MM
    if not employee_id or not month:
        return {"status": "error", "message": "Missing employee_id or month"}

    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        import datetime
        import calendar
        
        y, m = map(int, month.split("-"))
        _, last_day = calendar.monthrange(y, m)
        start_date = datetime.date(y, m, 1)
        end_date = datetime.date(y, m, last_day)

        async with get_session_ctx() as session:
            # Check employee
            res = await session.execute(text("SELECT id FROM employees WHERE id = :eid"), {"eid": employee_id})
            if not res.scalar():
                return {"status": "error", "message": "Employee not found"}

            # Calculate shifts
            res = await session.execute(
                text("SELECT count(id), sum(EXTRACT(EPOCH FROM (end_time - start_time))/3600) FROM shifts WHERE employee_id = :eid AND type='work' AND date >= :s AND date <= :e"),
                {"eid": employee_id, "s": start_date, "e": end_date}
            )
            shift_count, hours = res.fetchone()
            
            # Orders count (dummy mapping to crm_orders or stock_movements)
            res = await session.execute(
                text("SELECT count(*) FROM stock_movements WHERE performed_by = (SELECT name FROM employees WHERE id = :eid) AND type='OUT' AND created_at >= :s AND created_at < :e_next"),
                {"eid": employee_id, "s": start_date, "e_next": end_date + datetime.timedelta(days=1)}
            )
            orders_count = res.scalar() or 0

            return {
                "status": "ok",
                "message": "KPI Calculated",
                "data": {
                    "shifts": int(shift_count or 0),
                    "hours": float(hours or 0),
                    "orders_processed": int(orders_count)
                }
            }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def handle_task_created(payload: dict) -> None:
    logger.info(f"HR BOT RECEIVED TASK: {payload}")
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "hr":
        return
    chat_id = data.get("chat_id")
    if not chat_id:
        return
    task_id = data.get("task_id")

    bot = Bot(
        token=settings.hr_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from bots.hr_bot.handlers.start import ai
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Директор по персоналу (HR Director). Фокусируйся на мотивации, KPI, удержании талантов (Employee Retention) и развитии корпоративной культуры. Давай структурные ответы и планы развития."
        user_prompt = f"Руководитель поставил задачу для HR-отдела:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("HR_BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

        logger.info(f"HR_BOT sending message to {chat_id}")
        from shared.task_ui import get_task_keyboard

        await bot.send_message(
            chat_id,
            f"✅ <b>HR-отдел — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
        logger.info("HR_BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling HR task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def bus_send_route(params: dict) -> dict:
    """Отправка маршрутного листа курьеру (доставка)."""
    driver_id = params.get("driver_id")
    route_text = params.get("route_text", "")
    
    if not driver_id or not route_text:
        return {"status": "error", "message": "Missing driver_id or route_text"}
        
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        
        async with get_session_ctx() as session:
            res = await session.execute(
                text("SELECT telegram_id, name FROM employees WHERE id = :eid"), 
                {"eid": driver_id}
            )
            row = res.fetchone()
            
        if not row or not row[0]:
            return {"status": "error", "message": "Driver telegram_id not found"}
            
        telegram_id = row[0]
        name = row[1]
        
        bot = Bot(
            token=settings.hr_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        
        try:
            await bot.send_message(
                telegram_id,
                f"🚚 <b>Маршрутный лист для {name}</b>\n\n{route_text}\n\n"
                f"<i>Пожалуйста, будьте внимательны на дорогах.</i>",
                parse_mode="HTML"
            )
            return {"status": "ok", "message": "Route sent successfully"}
        finally:
            await bot.session.close()
            
    except Exception as e:
        logger.error(f"bus_send_route error: {e}")
        return {"status": "error", "message": str(e)}

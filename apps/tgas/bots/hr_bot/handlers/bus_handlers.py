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

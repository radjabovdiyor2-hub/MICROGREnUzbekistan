import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def bus_handle_complaint(params: dict) -> dict:
    """Зарегистрировать жалобу."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        customer_id = params.get("customer_id")
        complaint_text = params.get("text", "Жалоба через Bot Bus")
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, interaction_type, channel, summary, created_at) "
                    "VALUES (:cid, 'complaint', 'bus', :summary, NOW())"
                ),
                {"cid": customer_id, "summary": complaint_text},
            )
            await session.commit()
        return {
            "status": "ok",
            "message": f"Жалоба зарегистрирована: {complaint_text[:80]}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def bus_check_instagram_dm(params: dict) -> dict:
    """Проверить и ответить на DM в Instagram."""
    try:
        from shared.instagram_dm import auto_reply_to_new_messages

        await auto_reply_to_new_messages()
        return {
            "status": "ok",
            "message": "Instagram Direct проверен, автоответы отправлены",
            "data": {},
        }
    except ImportError:
        return {
            "status": "ok",
            "message": "Модуль instagram_dm не настроен. Функция недоступна.",
            "data": {},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def handle_task_created(payload: dict) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "support":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    bot = Bot(
        token=settings.support_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.ai_engine import AIEngine

        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Руководитель отдела клиентского сервиса (Head of Customer Success). Твоя главная задача — повышать CSAT (удовлетворенность) и NPS. При решении конфликтов используй эмпатию и предлагай системные решения, чтобы жалоба не повторилась."
        user_prompt = f"Руководитель поставил задачу по клиентскому сервису:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("SUPPORT BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

        logger.info(f"SUPPORT BOT sending message to {chat_id}")
        from shared.task_ui import get_task_keyboard

        await bot.send_message(
            chat_id,
            f"✅ <b>Отдел поддержки — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
        logger.info("SUPPORT BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

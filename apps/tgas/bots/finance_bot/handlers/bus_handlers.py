import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def bus_get_balance(params: dict) -> dict:
    """P&L за текущий месяц."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT "
                    "  COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income, "
                    "  COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense "
                    "FROM finances "
                    "WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                    "AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)"
                )
            )
            row = res.fetchone()
        income = float(row[0]) if row else 0
        expense = float(row[1]) if row else 0
        profit = income - expense
        return {
            "status": "ok",
            "message": f"Доход: {income:,.0f}, Расход: {expense:,.0f}, Прибыль: {profit:,.0f}",
            "data": {"income": income, "expense": expense, "profit": profit},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def bus_add_expense(params: dict) -> dict:
    """Записать расход в базу."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        amount = params.get("amount")
        category = params.get("category", "other")
        description = params.get("description", "")
        if not amount:
            return {"status": "error", "message": "Не указана сумма (amount)"}
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO finances (type, category, amount, description, date, created_at) "
                    "VALUES ('expense', :cat, :amt, :desc, CURRENT_DATE, NOW())"
                ),
                {"cat": category, "amt": float(amount), "desc": description},
            )
            await session.commit()
        return {"status": "ok", "message": f"Расход {amount} сум ({category}) записан"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def handle_task_created(payload: dict) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "finance":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    bot = Bot(
        token=settings.finance_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.ai_engine import AIEngine

        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Финансовый Директор (CFO) и главный Finance Bot. Мысли категориями P&L, Cash Flow, ROI, Unit Economics. Не будь простым калькулятором, давай стратегические советы по оптимизации костов и увеличению чистой прибыли."
        user_prompt = f"Руководитель поручил финансовую задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("FINANCE BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

        logger.info(f"FINANCE BOT sending message to {chat_id}")
        from shared.task_ui import get_task_keyboard

        await bot.send_message(
            chat_id,
            f"✅ <b>Финансовый отдел — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
        logger.info("FINANCE BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def handle_payment_received(payload: dict) -> None:
    """Регистрируем оплату в таблице finances"""
    data = payload.get("data", {})
    order_id = data.get("order_id")
    amount = data.get("amount", 0)

    if not order_id or not amount:
        return

    logger.info(
        f"FINANCE BOT: оплата заказа {order_id}: {amount} UZS (доход уже учтён при создании заказа)"
    )
    
    try:
        bot = Bot(
            token=settings.finance_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        admin_id = settings.admin_telegram_ids[0]
        try:
            await bot.send_message(
                admin_id,
                f"✅ <b>Поступление оплаты!</b>\n\nСумма: {amount:,.0f} UZS\nЗаказ ID: {order_id}",
            )
        except Exception:
            pass
        finally:
            await bot.session.close()
    except Exception as e:
        logger.error(f"Error handling payment_received: {e}")

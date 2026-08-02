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
            
        if category == "other" and description:
            try:
                from shared.ai_engine import AIEngine
                ai = AIEngine()
                sys_prompt = "Ты — классификатор расходов. Доступные категории: salary, raw_materials, logistics, marketing, rent, equipment, other. Верни ТОЛЬКО ОДНО слово из списка категорий, которое лучше всего подходит под описание расхода."
                predicted = await ai.chat_completion(sys_prompt, f"Описание расхода: {description}", max_tokens=10)
                predicted = predicted.strip().lower()
                valid_cats = ["salary", "raw_materials", "logistics", "marketing", "rent", "equipment", "other"]
                if predicted in valid_cats:
                    category = predicted
            except Exception as ai_e:
                logger.warning(f"Failed to auto-classify expense: {ai_e}")

        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO finances (type, category, amount, description, date, created_at) "
                    "VALUES ('expense', :cat, :amt, :desc, CURRENT_DATE, NOW())"
                ),
                {"cat": category, "amt": float(amount), "desc": description},
            )
            await session.commit()
        return {"status": "ok", "message": f"Расход {amount} сум (Категория: {category}) записан"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def bus_cashflow_forecast(params: dict) -> dict:
    """Cash-flow прогноз на 30 дней на основе последних 90 дней (orders + finances)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine
        import json

        async with get_session_ctx() as session:
            # Income from orders
            orders_res = await session.execute(
                text(
                    "SELECT DATE(created_at) as date, SUM(total) as income "
                    "FROM orders WHERE created_at >= NOW() - INTERVAL '90 days' "
                    "GROUP BY DATE(created_at) ORDER BY date"
                )
            )
            orders_data = {str(row[0]): float(row[1]) for row in orders_res.fetchall()}

            # Expenses from finances
            finances_res = await session.execute(
                text(
                    "SELECT date, SUM(amount) as expense "
                    "FROM finances WHERE type = 'expense' AND date >= CURRENT_DATE - INTERVAL '90 days' "
                    "GROUP BY date ORDER BY date"
                )
            )
            finances_data = {str(row[0]): float(row[1]) for row in finances_res.fetchall()}

        # Prepare for AI
        historical_data = {
            "daily_income_last_90d": orders_data,
            "daily_expense_last_90d": finances_data,
        }

        ai = AIEngine()
        sys_prompt = "Ты — CFO (Финансовый Директор). Твоя задача — проанализировать 90-дневную историю cash flow (доходы и расходы) сити-фермы и выдать прогноз на следующие 30 дней. Учти тренды, выходные дни и сезонность, если она заметна. Напиши 4-5 предложений с главными инсайтами, плюс конкретные цифры ожидаемого дохода и расхода на месяц вперёд."
        user_prompt = f"Данные за последние 90 дней в формате JSON (дата: сумма):\n{json.dumps(historical_data, ensure_ascii=False)}\nСделай прогноз Cash Flow на следующие 30 дней."
        
        forecast = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=400)
        
        return {
            "status": "ok",
            "message": forecast,
            "data": historical_data
        }
    except Exception as e:
        logger.error(f"bus_cashflow_forecast error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def bus_calculate_payroll(params: dict) -> dict:
    """Расчёт зарплаты всем сотрудникам (фикс + бонус за KPI) и запись в расходы."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        import datetime
        import calendar

        month = params.get("month")
        if not month:
            # default to previous month
            today = datetime.date.today()
            first = today.replace(day=1)
            last_month = first - datetime.timedelta(days=1)
            month = last_month.strftime("%Y-%m")

        y, m = map(int, month.split("-"))
        _, last_day = calendar.monthrange(y, m)
        start_date = datetime.date(y, m, 1)
        end_date = datetime.date(y, m, last_day)

        total_payroll = 0
        details = []

        async with get_session_ctx() as session:
            # get all active employees
            res = await session.execute(text("SELECT id, name, base_salary, role FROM employees WHERE is_active=true"))
            employees = res.fetchall()

            for emp in employees:
                eid = emp.id
                name = emp.name
                base = float(emp.base_salary or 0)

                # Calculate shifts
                res = await session.execute(
                    text("SELECT sum(EXTRACT(EPOCH FROM (end_time - start_time))/3600) FROM shifts WHERE employee_id = :eid AND type='work' AND date >= :s AND date <= :e"),
                    {"eid": eid, "s": start_date, "e": end_date}
                )
                hours = float(res.scalar() or 0)

                # Bonus calculation (example: 10,000 UZS per hour worked)
                bonus = hours * 10000 
                salary = base + bonus

                if salary > 0:
                    total_payroll += salary
                    details.append(f"{name}: {salary:,.0f} UZS (База: {base:,.0f}, Бонус: {bonus:,.0f} за {hours:.1f} ч.)")
                    
                    # Record expense
                    await session.execute(
                        text("INSERT INTO finances (type, category, amount, description, date, created_at) VALUES ('expense', 'salary', :amt, :desc, CURRENT_DATE, NOW())"),
                        {"amt": salary, "desc": f"Зарплата {month} - {name}"}
                    )
            
            await session.commit()

        message = f"Начислена зарплата за {month}: {total_payroll:,.0f} UZS\n\n" + "\n".join(details)
        return {"status": "ok", "message": message, "data": {"total": total_payroll, "details": details}}
    except Exception as e:
        logger.error(f"Payroll error: {e}", exc_info=True)
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

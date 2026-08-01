import logging
from aiogram import Bot
from sqlalchemy import text as sa_text

from shared.config import settings
from shared.database import get_session_ctx
from shared.event_bus import event_bus

logger = logging.getLogger(__name__)


async def on_any_event(payload: dict, bot: Bot) -> None:
    """Степан обрабатывает события — только важные уведомляет."""
    event_type = payload.get("event")
    data = payload.get("data", {})
    source = payload.get("source", "unknown")

    if event_type == "order_created" and source in ("stepan_bot", "instagram_bot"):
        logger.info(f"Степан: событие {event_type} от {source} — обработано")
        return

    admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None

    if event_type == "complaint_received" and admin_id:
        summary = data.get("summary", "Без описания")
        customer = data.get("customer_name", "Клиент")
        await bot.send_message(
            admin_id,
            f"⚠️ <b>ЖАЛОБА</b> от {customer}\n{summary}",
            parse_mode="HTML"
        )
    elif event_type == "large_expense_alert" and admin_id:
        await bot.send_message(
            admin_id,
            f"💸 <b>Крупный расход!</b>\n{data.get('summary', '')}",
            parse_mode="HTML"
        )
    elif event_type == "franchise_report_generated" and admin_id:
        city = data.get("city", "Unknown")
        report_text = data.get("content", "")
        await bot.send_message(
            admin_id,
            f"🏢 <b>Журнал Франчайзи ({city.capitalize()})</b>\n\n{report_text}",
            parse_mode="HTML",
        )
    elif event_type == "DELIVERY_STATUS_REPORT":
        sales_group = getattr(settings, "sales_group_id", 0)
        target_chat = sales_group if sales_group else admin_id
        if target_chat:
            from shared.ai_engine import AIEngine

            ai = AIEngine()
            prompt = (
                "Сформируй понятный, живой и мотивирующий отчёт для группы продаж о текущем статусе заказов. "
                f"Данные: {data}. "
                "Не используй слишком формальный язык. Опиши ситуацию с курьерами и сборкой."
            )
            try:
                ai_report = await ai.chat_completion(
                    "Ты руководитель Степан. Отправь отчёт о доставке для команды.",
                    prompt,
                )
                await bot.send_message(
                    target_chat,
                    f"📦 <b>Сводка по логистике от Степана:</b>\n\n{ai_report}",
                    parse_mode="HTML",
                )
            except Exception as e:
                logger.error(f"Error generating delivery report: {e}")
    elif event_type == "new_message" and admin_id:
        pass
    elif event_type == "order_created":
        order_number = data.get("order_number", "Unknown")
        amount = data.get("total_amount", 0)
        items = data.get("items_summary", "")
        try:
            async with get_session_ctx() as session:
                res = await session.execute(
                    sa_text(
                        "INSERT INTO tasks (title, description, status, department, priority, deadline) "
                        "VALUES (:title, :desc, 'todo', 'delivery', 'high', CURRENT_DATE) RETURNING id"
                    ),
                    {
                        "title": f"Доставить заказ {order_number}",
                        "desc": f"Новый заказ на сумму {amount} UZS.\nДетали: {items}",
                    },
                )
                task_id = res.scalar()
                await session.commit()

            await event_bus.publish(
                "TASK_CREATED",
                {
                    "task_id": task_id,
                    "title": f"Доставить заказ {order_number}",
                    "department": "delivery",
                    "description": f"Новый заказ на сумму {amount} UZS.\nДетали: {items}",
                    "chat_id": getattr(settings, "sales_group_id", 0) or admin_id,
                },
                "stepan_bot",
            )
            logger.info(f"Степан: Auto-created delivery task for order {order_number}")
        except Exception as e:
            logger.error(f"Степан order handling error: {e}")
    else:
        logger.info(f"Степан: событие {event_type} от {source} — записано")


async def handle_pm_task_created(payload: dict, bot: Bot) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() not in (
        "pm",
        "operations",
        "production",
        "logistics",
    ):
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Операционный Директор (COO) и главный Project Manager. Твоя задача: не просто выполнять поручения, а структурно планировать их выполнение по Agile/Lean. Оцени узкие места (bottlenecks), предложи пошаговый Action Plan, укажи риски."
        user_prompt = f"Руководитель поставил задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("Степан (Менеджер) Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=380)

        title_lower = str(data.get("title", "")).lower()
        if "посад" in title_lower or "посев" in title_lower:
            try:
                async with get_session_ctx() as session:
                    await session.execute(
                        sa_text("UPDATE inventory SET quantity = quantity - 1 WHERE category = 'seeds' AND quantity >= 1")
                    )
                    await session.execute(
                        sa_text("UPDATE inventory SET quantity = quantity - 5 WHERE category = 'substrate' AND quantity >= 5")
                    )
                    await session.commit()
                answer += "\n\n📦 <b>Складской учёт:</b>\nАвтоматически списано: 1 кг семян, 5 кокосовых субстратов."
            except Exception as e:
                logger.error(f"Error deducting inventory: {e}")

        from shared.task_ui import get_task_keyboard

        await bot.send_message(
            chat_id,
            f"✅ <b>Операции (PM) — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
    except Exception as e:
        logger.error(f"Error handling PM task: {repr(e)}", exc_info=True)


async def handle_task_completed(payload: dict, bot: Bot) -> None:
    data = payload.get("data", {})
    task_id = data.get("task_id")
    completed_by = data.get("completed_by", "unknown")
    chat_id = data.get("chat_id")
    if task_id:
        try:
            async with get_session_ctx() as session:
                res = await session.execute(
                    sa_text("SELECT message_id FROM tasks WHERE id=:tid"),
                    {"tid": task_id},
                )
                row = res.fetchone()
                msg_id = row[0] if row else None

                if msg_id and chat_id:
                    try:
                        await bot.delete_message(chat_id=chat_id, message_id=msg_id)
                    except Exception as e:
                        logger.warning(f"Could not delete original message: {e}")

                await session.execute(
                    sa_text("UPDATE tasks SET status='done' WHERE id=:tid"),
                    {"tid": task_id},
                )
                await session.commit()
            logger.info(f"TASK {task_id} MARKED AS DONE by {completed_by}")

            report_text = data.get("text", "")
            if chat_id:
                msg = f"✅ <b>Задача #{task_id} успешно выполнена отделом {completed_by.upper()}!</b>"
                if report_text:
                    msg += f"\n\n{report_text}"
                await bot.send_message(chat_id, msg, parse_mode="HTML")
        except Exception as e:
            logger.error(f"Error marking task {task_id} as done: {e}")


async def handle_ig_dm(payload: dict, bot: Bot) -> None:
    data = payload.get("data", {})
    text_msg = data.get("text", "")
    from_name = data.get("from_name", "Unknown")
    order = data.get("order")

    if not text_msg:
        return

    admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None

    try:
        if order:
            product = order.get("product", "?")
            quantity = order.get("quantity", "?")
            phone = order.get("phone", "?")
            address = order.get("address", "?")
            total = order.get("total", "?")

            async with get_session_ctx() as session:
                result = await session.execute(
                    sa_text(
                        "INSERT INTO tasks (title, description, status, department, priority, deadline, created_at) "
                        "VALUES (:title, :desc, 'todo', 'sales', 'high', CURRENT_DATE, NOW()) RETURNING id"
                    ),
                    {
                        "title": f"📦 IG заказ от {from_name}: {product}",
                        "desc": (
                            f"ЗАКАЗ ИЗ INSTAGRAM DM\n"
                            f"══════════════════════\n"
                            f"👤 Клиент: {from_name}\n"
                            f"📦 Товар: {product}\n"
                            f"📊 Количество: {quantity}\n"
                            f"📱 Телефон: {phone}\n"
                            f"📍 Адрес: {address}\n"
                            f"💰 Сумма: {total}\n"
                            f"══════════════════════\n"
                            f"Источник: Instagram Direct Message"
                        ),
                    },
                )
                task_row = result.fetchone()
                task_id = task_row[0] if task_row else None
                await session.commit()

            logger.info(f"Степан: Задача #{task_id} создана для Sales по IG заказу от {from_name}")

            try:
                from shared.bot_bus import send_task
                bus_task_id = await send_task(
                    from_bot="stepan_bot",
                    to_bot="sales_bot",
                    action="process_ig_order",
                    params={
                        "task_id": task_id,
                        "customer_name": from_name,
                        "product": product,
                        "quantity": quantity,
                        "phone": phone,
                        "address": address,
                        "total": total,
                        "source": "instagram",
                    },
                )
                logger.info(f"Степан → Sales: делегирована задача {bus_task_id} (IG заказ)")
            except Exception as bus_err:
                logger.warning(f"Bot Bus delegation error: {bus_err}")

            sales_group = getattr(settings, "sales_group_id", 0)
            target_chat = sales_group if sales_group else admin_id
            if target_chat:
                await bot.send_message(
                    target_chat,
                    f"📦 <b>ЗАКАЗ #{task_id} из Instagram</b>\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"👤 Клиент: <b>{from_name}</b>\n"
                    f"🛒 Товар: <b>{product}</b>\n"
                    f"📊 Количество: <b>{quantity}</b>\n"
                    f"📱 Телефон: <b>{phone}</b>\n"
                    f"💰 Сумма: <b>{total}</b>\n"
                    f"━━━━━━━━━━━━━━━━━━\n"
                    f"✅ Задача создана → отдел продаж\n"
                    f"🤖 Клиенту уже ответили в DM",
                    parse_mode="HTML"
                )

            await event_bus.publish(
                "order_created",
                {
                    "source": "instagram",
                    "customer_name": from_name,
                    "product": product,
                    "quantity": quantity,
                    "phone": phone,
                    "address": address,
                    "total_amount": total,
                    "items_summary": f"{product} x {quantity}",
                    "order_number": f"IG-{task_id or '?'}",
                    "summary": f"IG заказ от {from_name}: {product} x {quantity} = {total}",
                },
                "stepan_bot",
            )
            logger.info("Степан: ORDER_CREATED → PM, Finance, Analytics")
    except Exception as e:
        logger.error(f"Ошибка при обработке IG DM Степаном: {e}", exc_info=True)

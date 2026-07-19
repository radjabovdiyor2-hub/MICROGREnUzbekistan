"""Sales Bot — main.py с EventBus интеграцией"""
import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from bots.sales_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.sales_bot.handlers.ai_chat import ai_fallback
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("sales_bot")


async def check_pending_payments():
    """Найти заказы с ожидающей оплатой более 24 часов."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT id, created_at, "
                    "EXTRACT(EPOCH FROM (NOW() - created_at))/3600 AS hours_waiting "
                    "FROM orders "
                    "WHERE payment_status = 'pending' "
                    "AND created_at < NOW() - INTERVAL '24 hours' "
                    "ORDER BY created_at"
                ))
                rows = result.fetchall()
            if rows:
                for row in rows:
                    order_id = row[0]
                    hours = int(row[2])
                    await bot.send_message(
                        admin_id,
                        f"⏳ Заказ #MG-{order_id:04d} — ожидает оплату уже {hours} часов",
                        parse_mode="HTML",
                    )
                logger.info("check_pending_payments: отправлено %d уведомлений", len(rows))
            else:
                logger.info("check_pending_payments: нет просроченных заказов")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("check_pending_payments error: %s", e)


async def reactivate_inactive():
    """Найти неактивных клиентов (14+ дней без заказов)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT name, phone, last_order_date "
                    "FROM customers "
                    "WHERE last_order_date < NOW() - INTERVAL '14 days' "
                    "AND status = 'active' "
                    "ORDER BY last_order_date"
                ))
                rows = result.fetchall()
            if rows:
                lines = ["📋 <b>Неактивные клиенты (14+ дней):</b>\n"]
                for i, row in enumerate(rows[:20], 1):
                    name = row[0] or "—"
                    phone = row[1] or "—"
                    last_date = row[2].strftime("%d.%m.%Y") if row[2] else "—"
                    lines.append(f"{i}. {name} ({phone}) — посл. заказ: {last_date}")
                if len(rows) > 20:
                    lines.append(f"\n... и ещё {len(rows) - 20} клиентов")
                lines.append(f"\nВсего: {len(rows)} клиентов требуют реактивации")
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
                logger.info("reactivate_inactive: найдено %d клиентов", len(rows))
            else:
                logger.info("reactivate_inactive: все клиенты активны")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("reactivate_inactive error: %s", e)

async def handle_payment_received(payload: dict):
    """Обработка успешной оплаты от Click/Payme (через n8n)."""
    data = payload.get("data", {})
    order_number = data.get("order_number")
    amount = data.get("amount", 0)
    provider = data.get("provider", "unknown")
    
    if not order_number:
        logger.error("handle_payment_received: Missing order_number")
        return
        
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        chat_id = settings.sales_group_id
        
        async with get_session_ctx() as session:
            # Обновляем статус оплаты заказа
            result = await session.execute(
                text("UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE order_number = :on RETURNING id"),
                {"on": order_number}
            )
            row = result.fetchone()
            if not row:
                logger.warning(f"handle_payment_received: Order {order_number} not found")
                return
            
            await session.commit()
            
        logger.info(f"Payment processed for order {order_number} via {provider}")
        
        # Уведомляем группу продаж
        if chat_id:
            try:
                await bot.send_message(chat_id, f"💰 <b>Заказ {order_number} оплачен!</b>\nПровайдер: {provider}\nСумма: {amount} UZS", parse_mode="HTML")
            except Exception:
                pass
                
        # Событие для PM/Степана. Доход в таблицу finances пишет Finance по PAYMENT_RECEIVED,
        # поэтому отдельное income_recorded не публикуем (был дубль без потребителя).
        await event_bus.publish("order_status_changed", {"order_number": order_number, "status": "paid"}, "sales_bot")
        
    except Exception as e:
        logger.error(f"handle_payment_received error: {e}", exc_info=True)
    finally:
        await bot.session.close()

async def handle_magazine_published(payload: dict):
    """Обработка публикации журнала (Content Bot) — генерируем тёплый лид."""
    data = payload.get("data", {})
    rubric = data.get("rubric")
    restaurant_name = data.get("restaurant_name")
    
    if rubric == "restaurant_of_week" and restaurant_name:
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        chat_id = settings.admin_telegram_ids[0]
        try:
            from shared.ai_engine import AIEngine
            ai = AIEngine()
            prompt = (
                f"Ресторан {restaurant_name} только что попал в нашу рубрику 'Ресторан недели' в журнале! "
                f"Напиши очень короткое (2-3 предложения) приветственное сообщение для Sales-менеджера, "
                f"которое он отправит шеф-повару этого ресторана вместе со ссылкой на журнал. "
                f"Цель — похвалить их и предложить тестовый набор микрозелени."
            )
            msg = await ai.chat_completion("Ты B2B менеджер.", prompt)
            
            report = (
                f"🎯 <b>Новый тёплый инфоповод!</b>\n\n"
                f"Ресторан <b>{restaurant_name}</b> опубликован в нашем журнале!\n"
                f"Идеальный момент для касания. Предлагаемый текст для отправки шефу:\n\n"
                f"<i>{msg}</i>\n\n"
                f"👉 <i>Свяжитесь с ними прямо сейчас.</i>"
            )
            await bot.send_message(chat_id, report, parse_mode="HTML")
            logger.info(f"Сгенерирован инфоповод для продаж: {restaurant_name}")
        except Exception as e:
            logger.error(f"handle_magazine_published error: {e}", exc_info=True)
        finally:
            await bot.session.close()


async def stock_alerts():
    """Проверить товары с низким запасом (< 5)."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT name_ru, stock_qty, unit "
                    "FROM products "
                    "WHERE stock_qty < 5 AND is_active = true "
                    "ORDER BY stock_qty"
                ))
                rows = result.fetchall()
            if rows:
                lines = ["⚠️ <b>Низкий запас товаров:</b>\n"]
                for row in rows:
                    name = row[0]
                    qty = row[1]
                    unit = row[2] or "шт"
                    lines.append(f"⚠️ Низкий запас: {name} — {qty} {unit}")
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
                logger.info("stock_alerts: найдено %d товаров", len(rows))
            else:
                logger.info("stock_alerts: запасы в норме")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("stock_alerts error: %s", e)


async def new_lead_welcome():
    """Найти новых лидов за последние 24 часа и зафиксировать в CRM."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        admin_id = settings.admin_telegram_ids[0]
        try:
            async with get_session_ctx() as session:
                result = await session.execute(text(
                    "SELECT c.id, c.name, c.phone "
                    "FROM customers c "
                    "WHERE c.status = 'lead' "
                    "AND c.created_at > NOW() - INTERVAL '24 hours' "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM interactions i "
                    "  WHERE i.customer_id = c.id AND i.interaction_type = 'lead_welcome'"
                    ") "
                    "ORDER BY c.created_at"
                ))
                rows = result.fetchall()
                if rows:
                    for row in rows:
                        cust_id = row[0]
                        await session.execute(text(
                            "INSERT INTO interactions (customer_id, interaction_type, channel, summary, created_at) "
                            "VALUES (:cid, 'lead_welcome', 'bot', 'Автоматическая фиксация нового лида', NOW())"
                        ), {"cid": cust_id})
                    await session.commit()
                    names = [r[1] or "Без имени" for r in rows]
                    await bot.send_message(
                        admin_id,
                        f"🆕 <b>Новые лиды (24ч):</b> {len(rows)}\n" + "\n".join(f"• {n}" for n in names[:15]),
                        parse_mode="HTML",
                    )
                    logger.info("new_lead_welcome: зафиксировано %d лидов", len(rows))
                else:
                    logger.info("new_lead_welcome: новых лидов нет")
        finally:
            await bot.session.close()
    except Exception as e:
        logger.exception("new_lead_welcome error: %s", e)


scheduler.add_interval(name="check_pending_payments", func=check_pending_payments, seconds=6 * 3600)
scheduler.add_cron(name="reactivate_inactive", func=reactivate_inactive, hour=11, minute=0)
scheduler.add_interval(name="stock_alerts", func=stock_alerts, seconds=4 * 3600)
scheduler.add_interval(name="new_lead_welcome", func=new_lead_welcome, seconds=2 * 3600)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════

async def bus_get_orders(params: dict) -> dict:
    """Сводка последних заказов."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        limit = params.get("limit", 10)
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, "
                "c.name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id "
                "ORDER BY o.created_at DESC LIMIT :lim"
            ), {"lim": limit})
            rows = res.fetchall()
        orders = [
            {"id": r[0], "number": r[1], "amount": float(r[2] or 0),
             "status": r[3], "payment": r[4], "client": r[5] or "—"}
            for r in rows
        ]
        return {"status": "ok", "message": f"Последние {len(orders)} заказов", "data": orders}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ═══════════════════════════════════════════════════════════════════════════
# 🎯 ОТБОР РЕСТОРАНОВ ДЛЯ ЕЖЕДНЕВНОГО КП
# ═══════════════════════════════════════════════════════════════════════════
# Кого атаковать — решает отдел продаж (он владеет клиентами и историей заказов),
# а КП с PDF готовит маркетинг. Разделение как в жизни: продажи выбирают цель,
# маркетинг делает материал.
#
# Три сегмента (по приоритету):
#   1. new_lead — новый ресторан, КП ещё ни разу не отправляли
#   2. churn    — заказывал, но замолчал больше 30 дней → вернуть
#   3. no_reply — КП отправляли, ответа нет → второй заход, другим предложением
#
# Защита от спама: повторное касание не раньше чем через 10 дней и не более
# 3 раз на ресторан; недавно получившие КП в выборку не попадают.

_SEG_SQL = {
    "new_lead": """
        SELECT c.id, c.name, c.company_name, c.email, c.phone, c.review_summary, c.address, 0
        FROM customers c
        WHERE c.customer_type = 'b2b' AND c.status = 'lead'
          AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM interactions i
                          WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent')
        ORDER BY c.review_score DESC NULLS LAST, c.created_at ASC
        LIMIT :lim
    """,
    "churn": """
        SELECT c.id, c.name, c.company_name, c.email, c.phone, c.review_summary, c.address,
               (SELECT COUNT(*) FROM interactions i
                WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent')
        FROM customers c
        WHERE c.customer_type = 'b2b'
          AND COALESCE(c.orders_count, 0) > 0
          AND (c.last_order_date IS NULL OR c.last_order_date < CURRENT_DATE - INTERVAL '30 days')
          AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM interactions i
                          WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent'
                            AND i.created_at > NOW() - INTERVAL '14 days')
        ORDER BY c.total_spent DESC NULLS LAST
        LIMIT :lim
    """,
    "no_reply": """
        SELECT c.id, c.name, c.company_name, c.email, c.phone, c.review_summary, c.address,
               (SELECT COUNT(*) FROM interactions i
                WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent')
        FROM customers c
        WHERE c.customer_type = 'b2b'
          AND COALESCE(c.orders_count, 0) = 0
          AND (c.email IS NOT NULL OR c.phone IS NOT NULL)
          AND EXISTS (SELECT 1 FROM interactions i
                      WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent')
          AND NOT EXISTS (SELECT 1 FROM interactions i
                          WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent'
                            AND i.created_at > NOW() - INTERVAL '10 days')
          AND (SELECT COUNT(*) FROM interactions i
               WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent') < 3
        ORDER BY (SELECT MAX(i.created_at) FROM interactions i
                  WHERE i.customer_id = c.id AND i.interaction_type = 'b2b_offer_sent') ASC
        LIMIT :lim
    """,
}

SEGMENT_REASON = {
    "new_lead": "новый ресторан — КП ещё не отправляли",
    "churn": "заказывал раньше, но молчит больше 30 дней",
    "no_reply": "КП отправляли, ответа не было",
}


async def bus_get_b2b_targets(params: dict) -> dict:
    """
    Отдел продаж отдаёт список ресторанов на сегодня — маркетинг сделает им КП.
    params.limit — сколько всего нужно (по умолчанию B2B_DAILY_LIMIT).
    """
    from shared.database import get_session_ctx
    from sqlalchemy import text

    try:
        limit = int(params.get("limit") or getattr(settings, "b2b_daily_limit", 15))
    except (TypeError, ValueError):
        limit = 15

    targets, seen = [], set()
    try:
        async with get_session_ctx() as session:
            # Приоритет: сначала новые, потом вернуть отвалившихся, потом дожать молчунов
            for segment in ("new_lead", "churn", "no_reply"):
                if len(targets) >= limit:
                    break
                res = await session.execute(
                    text(_SEG_SQL[segment]), {"lim": limit - len(targets)}
                )
                for row in res.fetchall():
                    cid = row[0]
                    if cid in seen:
                        continue
                    seen.add(cid)
                    targets.append({
                        "id": cid,
                        "name": row[1],
                        "company_name": row[2],
                        "email": row[3],
                        "phone": row[4],
                        "review_summary": row[5],
                        "address": row[6],
                        "touches": int(row[7] or 0),
                        "segment": segment,
                        "reason": SEGMENT_REASON[segment],
                    })
                    if len(targets) >= limit:
                        break
    except Exception as e:
        logger.error(f"bus_get_b2b_targets error: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "data": {"targets": []}}

    by_seg = {}
    for t in targets:
        by_seg[t["segment"]] = by_seg.get(t["segment"], 0) + 1
    breakdown = ", ".join(f"{SEGMENT_REASON[s]}: {n}" for s, n in by_seg.items()) or "нет"

    return {
        "status": "ok",
        "message": f"Отобрано ресторанов: {len(targets)} ({breakdown})",
        "data": {"targets": targets},
    }


async def bus_get_clients(params: dict) -> dict:
    """Количество и список клиентов."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT COUNT(*) FROM customers"
            ))
            total = res.scalar() or 0
            res = await session.execute(text(
                "SELECT id, name, phone, status FROM customers "
                "ORDER BY created_at DESC LIMIT 20"
            ))
            rows = res.fetchall()
        clients = [
            {"id": r[0], "name": r[1] or "—", "phone": r[2] or "—", "status": r[3]}
            for r in rows
        ]
        return {"status": "ok", "message": f"Всего клиентов: {total}", "data": {"total": total, "clients": clients}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_register_sale(params: dict) -> dict:
    """
    Регистрация состоявшейся продажи — должностная обязанность отдела продаж.

    Вызывается Степаном через bot_bus, когда руководитель сообщает о продаже
    («продали 23 штуки ресторану Zarra Resort»). Здесь именно ДЕЙСТВИЕ: клиент,
    заказ, позиции, событие в шину. Никакого текста «свяжусь с клиентом».
    """
    from shared.sales_ops import register_sale
    params = dict(params or {})
    params.setdefault("registered_by", "sales_bot")
    return await register_sale(params)


async def bus_add_product(params: dict) -> dict:
    """
    Завести новый товар в каталоге: витрина (магазин) + зеркало в CRM.

    Степан вызывает это только после одобрения руководителя — сам отдел товары
    не придумывает.
    """
    from shared.catalog_ops import add_product
    return await add_product(dict(params or {}))


async def _extract_sale_params(ai, title: str, description: str) -> dict:
    """Вытаскиваем параметры продажи из формулировки руководителя (без домыслов)."""
    import json
    schema = (
        '{"customer_name": str|null, "phone": str|null, '
        '"items": [{"product": str, "quantity": number, "unit_price": number|null}], '
        '"customer_type": "b2b"|"b2c"|null, "payment_status": "paid"|"pending"|null}'
    )
    sys_prompt = (
        "Ты — парсер продаж. Верни ТОЛЬКО JSON по схеме, без пояснений.\n"
        f"Схема: {schema}\n"
        "Правила: если чего-то нет в тексте — ставь null, НИЧЕГО не выдумывай "
        "(особенно цену и сумму). Ресторан/кафе/отель — это customer_type='b2b'."
    )
    raw = await ai.chat_completion(
        sys_prompt, f"{title}\n{description}", temperature=0, max_tokens=300
    )
    raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logging.warning("SALES_BOT: не смог распарсить параметры продажи: %r", raw)
        return {}
    return {k: v for k, v in parsed.items() if v is not None} if isinstance(parsed, dict) else {}


def _is_sale_registration(title: str, description: str) -> bool:
    """
    Задача про регистрацию уже СОСТОЯВШЕЙСЯ продажи?

    Прямые формулировки ловим как есть. Голое «продали» — только вместе с числом
    (иначе «почему мало продали» уехало бы в регистрацию вместо анализа).
    """
    import re as _re
    blob = f"{title} {description}".lower()
    explicit = ("зарегистрируй продаж", "регистрация продаж", "зарегистрировать продаж",
                "оформи продаж", "запиши продаж", "фиксация продаж", "учти продаж")
    if any(m in blob for m in explicit):
        return True
    return bool(_re.search(r"\bпродал[иа]?\b", blob)) and bool(_re.search(r"\d", blob))


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "sales":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return
    
    bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        
        # Проверяем, не запрашивается ли Коммерческое Предложение (КП)
        title = str(data.get('title', '')).lower()
        desc = str(data.get('description', '')).lower()
        
        if _is_sale_registration(title, desc):
            # Реальная работа отдела: продажа записывается в CRM, а не «берётся в работу».
            logging.info("SALES_BOT: регистрация продажи по задаче #%s", task_id)
            from shared.sales_ops import register_sale, format_sale_report
            sale_params = await _extract_sale_params(ai, data.get("title", ""), data.get("description", ""))
            sale_params["notes"] = f"{data.get('title', '')}. {data.get('description', '')}"[:500]
            sale_params["registered_by"] = "sales_bot"
            result = await register_sale(sale_params)

            if result["status"] == "ok":
                await bot.send_message(chat_id, format_sale_report(result), parse_mode="HTML")
                from shared.database import get_session_ctx
                from sqlalchemy import text
                async with get_session_ctx() as session:
                    await session.execute(
                        text("UPDATE tasks SET status = 'done' WHERE id = :tid"), {"tid": task_id}
                    )
                    await session.commit()
            elif result["status"] == "duplicate":
                await bot.send_message(chat_id, f"ℹ️ {result['message']}")
            else:
                # Не хватает данных или ошибка — честно спрашиваем, а не имитируем работу.
                await bot.send_message(chat_id, f"❓ <b>Отдел продаж:</b> {result['message']}", parse_mode="HTML")

        elif "кп" in title or "коммерческое" in title or "кп" in desc or "коммерческ" in desc:
            logging.info("SALES_BOT: Requested commercial offer PDF.")
            from shared.prompts import TEAM_CONTEXT
            prompt = f"Составь продающий текст коммерческого предложения для клиента. Задача: {data.get('title')} - {data.get('description')}. Укажи преимущества микрозелени."
            answer = await ai.chat_completion(f"{TEAM_CONTEXT}\n\nТы B2B менеджер по продажам. Напиши профессиональный и убедительный текст.", prompt)
            
            # Получим цены из базы для КП
            from shared.database import get_session_ctx
            from sqlalchemy import text
            async with get_session_ctx() as session:
                res = await session.execute(text("SELECT name_ru, price FROM products WHERE is_active=true LIMIT 5"))
                products = [{"name": r[0], "price": f"{r[1]} сум"} for r in res.fetchall()]
                
            from shared.pdf_generator import generate_commercial_offer_pdf
            from aiogram.types import FSInputFile
            import os
            
            # Генерируем PDF
            pdf_path = generate_commercial_offer_pdf(
                client_name=data.get('title'),
                ai_text=answer,
                prices=products,
                output_filename=f"КП_Microgreen_{task_id}.pdf"
            )
            
            await bot.send_document(
                chat_id, 
                document=FSInputFile(pdf_path),
                caption="📝 <b>Коммерческое предложение готово!</b>\nОтдел SALES выполнил задачу.",
                parse_mode="HTML"
            )
            try:
                os.remove(pdf_path)
            except:
                pass
                
        elif "ig заказ" in title:
            logging.info("SALES_BOT: Processing auto-delegated IG order from Stepan.")
            
            # Парсим сумму и детали через ИИ
            prompt = f"Извлеки примерную сумму заказа (числом, если не указано, напиши 50000) и детали из текста: {desc}"
            ai_parse = await ai.chat_completion("Ты парсер заказов.", prompt)
            
            import re
            amount_match = re.search(r'\d+', ai_parse.replace(' ', ''))
            amount = int(amount_match.group()) if amount_match else 50000
            
            from shared.database import get_session_ctx
            from shared.order_utils import generate_order_number
            from sqlalchemy import text
            async with get_session_ctx() as session:
                order_number = await generate_order_number()
                
                await session.execute(text(
                    "INSERT INTO orders (order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                    "VALUES (:onum, :amount, 'new', 'pending', :notes, NOW(), NOW())"
                ), {"onum": order_number, "amount": amount, "notes": desc[:200]})
                
                await session.commit()
                
            # Генерация ссылок на оплату
            click_url = f"https://my.click.uz/services/pay?merchant_id={settings.click_merchant_id}&amount={amount}&transaction_param={order_number}"
            payme_url = f"https://checkout.paycom.uz/{settings.payme_merchant_id}?amount={amount*100}&order_id={order_number}"
            
            # Сообщаем об успехе
            await bot.send_message(chat_id, f"✅ <b>Заказ {order_number} оформлен!</b>\nСумма: {amount} UZS\nСобытие order_created отправлено в PM-отдел.\n\n💳 <b>Оплатить онлайн:</b>\n<a href='{click_url}'>Оплатить через Click</a>\n<a href='{payme_url}'>Оплатить через Payme</a>", parse_mode="HTML")
            
            # ОПОВЕЩАЕМ PM БОТ ЧЕРЕЗ ШИНУ!
            from shared.event_bus import event_bus, Events
            await event_bus.publish(Events.ORDER_CREATED, {
                "order_number": order_number,
                "total_amount": amount,
                "items_summary": desc[:100]
            }, "sales_bot")
            
        else:
            from shared.prompts import TEAM_CONTEXT
            sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Коммерческий Директор (Chief Revenue Officer) и главный Sales Bot. Сфокусируйся на LTV, конверсиях, дожимах и B2B/B2C воронках. Не пиши банальности, предлагай стратегию продаж и тактики закрытия сделок."
            user_prompt = (
                f"Руководитель поручил коммерческую задачу:\nНазвание: {data.get('title')}\n"
                f"Описание: {data.get('description')}\n\n"
                "Ответь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь "
                "задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, "
                "без длинных списков и без markdown-заголовков.\n"
                "ЗАПРЕЩЕНО описывать действия как уже сделанные или обещать то, чего система не делает "
                "автоматически (звонки, счета, доставку). Ты пока только принял задачу — так и говори."
            )
            logging.info("SALES_BOT Generating AI answer...")
            answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

            logging.info(f"SALES_BOT sending message to {chat_id}")
            from shared.task_ui import get_task_keyboard
            await bot.send_message(chat_id, f"✅ <b>Отдел продаж — принял в работу:</b>\n\n{answer}", parse_mode="HTML", reply_markup=get_task_keyboard(task_id))
            logging.info("SALES_BOT successfully sent message.")
            
    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def bus_process_ig_order(params: dict) -> dict:
    """Оформление заказа из Instagram."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode
        from shared.config import settings
        
        customer_name = params.get("customer_name", "Unknown")
        product = params.get("product", "Товар")
        quantity = params.get("quantity", 1)
        phone = params.get("phone", "")
        address = params.get("address", "")
        amount = params.get("total", 50000)
        task_id = params.get("task_id")
        
        # Конвертация amount в int
        try:
            if isinstance(amount, str):
                import re
                amt_str = re.sub(r'[^\d]', '', str(amount))
                amount = int(amt_str) if amt_str else 50000
            else:
                amount = int(amount)
        except Exception:
            amount = 50000

        from shared.order_utils import generate_order_number
        async with get_session_ctx() as session:
            order_number = await generate_order_number()
            
            notes = f"IG: {product} x {quantity}, Phone: {phone}, Address: {address}"
            await session.execute(text(
                "INSERT INTO orders (order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                "VALUES (:onum, :amount, 'new', 'pending', :notes, NOW(), NOW())"
            ), {"onum": order_number, "amount": amount, "notes": notes[:200]})
            
            await session.commit()
            
        # Отправляем уведомление
        click_url = f"https://my.click.uz/services/pay?merchant_id={settings.click_merchant_id}&amount={amount}&transaction_param={order_number}"
        payme_url = f"https://checkout.paycom.uz/{settings.payme_merchant_id}?amount={amount*100}&order_id={order_number}"
        
        bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        chat_id = getattr(settings, 'sales_group_id', None) or settings.admin_telegram_ids[0]
        
        msg_text = (
            f"✅ <b>Заказ {order_number} оформлен!</b>\n"
            f"Клиент: {customer_name}\n"
            f"Товар: {product} x {quantity}\n"
            f"Сумма: {amount} UZS\n\n"
            f"💳 <b>Ссылки на оплату:</b>\n"
            f"<a href='{click_url}'>Оплатить через Click</a>\n"
            f"<a href='{payme_url}'>Оплатить через Payme</a>"
        )
        await bot.send_message(chat_id, msg_text, parse_mode="HTML")
        await bot.session.close()
            
        return {"status": "ok", "message": f"Заказ {order_number} оформлен"}
        
    except Exception as e:
        logger.error(f"bus_process_ig_order error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def _sell_magazine_ads(params: dict) -> list:
    """Генерация рекламных блоков для журнала."""
    # В реальной жизни бот бы связывался с клиентами из CRM. 
    # Пока мы генерируем 1-2 рекламные вставки.
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        async with get_session_ctx() as session:
            res = await session.execute(text(
                "SELECT name_ru FROM products WHERE is_active = true ORDER BY random() LIMIT 2"
            ))
            products = [r[0] for r in res.fetchall()]
            
        ads = []
        if products:
            ads.append({
                "type": "internal_promo",
                "content": f"🌱 Специальное предложение: Скидка 15% на {products[0]} по промокоду FRESHWEEK!",
                "cta_url": f"/catalog?search={products[0]}"
            })
        return ads
    except Exception as e:
        logger.error(f"Error generating ads: {e}")
        return []

async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call
    await _shared_roll_call("sales_bot", payload)


async def main():
    if not settings.sales_bot_token:
        logger.error(f"FATAL: SALES_BOT_TOKEN is missing!")
        import sys
        sys.exit(1)

    await init_db()
    bot = Bot(token=settings.sales_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.task_ui import task_ui_router
    dp.include_router(task_ui_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, ai_fallback, wake_words=["отдел продаж", "продажи", "sales", "сейлз"])
    dp.include_router(group_router)

    # EventBus: Sales публикует события, но не слушает (Redis)
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("PAYMENT_RECEIVED", handle_payment_received)
    event_bus.on("ROLL_CALL", handle_roll_call)
    event_bus.on("MAGAZINE_PUBLISHED", handle_magazine_published)
    await event_bus.start_listening(8082)  # mg_sales — порт из карты доставки event_bus

    # Heartbeat + Scheduler
    asyncio.create_task(start_heartbeat("sales_bot"))
    await scheduler.start()

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions
    asyncio.create_task(bus_listen("sales_bot", {
        "get_orders": bus_get_orders,
        "get_clients": bus_get_clients,
        "process_ig_order": bus_process_ig_order,
        "get_b2b_targets": bus_get_b2b_targets,  # кому сегодня готовить КП
        "register_sale": bus_register_sale,      # менеджер сообщил о продаже → заказ в CRM
        "add_product": bus_add_product,          # новый товар → каталог витрины + CRM
        BotBusActions.SELL_MAGAZINE_ADS: _sell_magazine_ads,
    }))

    logger.info("Starting Sales Bot...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())

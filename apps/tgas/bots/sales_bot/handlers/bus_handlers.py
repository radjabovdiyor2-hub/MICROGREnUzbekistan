import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.event_bus import event_bus

logger = logging.getLogger(__name__)

PAYMENT_METHODS_HINT = "💳 Оплата: наличные, карта или банковский перевод"

async def handle_payment_received(payload: dict) -> None:
    data = payload.get("data", {})
    order_number = data.get("order_number")
    amount = data.get("amount", 0)
    provider = data.get("provider", "unknown")

    if not order_number:
        logger.error("handle_payment_received: Missing order_number")
        return

    try:
        bot = Bot(
            token=settings.sales_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        chat_id = settings.sales_group_id

        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE order_number = :on RETURNING id"
                ),
                {"on": order_number},
            )
            row = result.fetchone()
            if not row:
                logger.warning(
                    f"handle_payment_received: Order {order_number} not found"
                )
                return

            await session.commit()

        logger.info(f"Payment processed for order {order_number} via {provider}")

        if chat_id:
            try:
                await bot.send_message(
                    chat_id,
                    f"💰 <b>Заказ {order_number} оплачен!</b>\nПровайдер: {provider}\nСумма: {amount} UZS",
                    parse_mode="HTML",
                )
            except Exception:
                pass

        await event_bus.publish(
            "order_status_changed",
            {"order_number": order_number, "status": "paid"},
            "sales_bot",
        )

    except Exception as e:
        logger.error(f"handle_payment_received error: {e}", exc_info=True)
    finally:
        await bot.session.close()

async def handle_magazine_published(payload: dict) -> None:
    data = payload.get("data", {})
    rubric = data.get("rubric")
    restaurant_name = data.get("restaurant_name")

    if rubric == "restaurant_of_week" and restaurant_name:
        bot = Bot(
            token=settings.sales_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
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

async def bus_get_orders(params: dict) -> dict:
    try:
        limit = params.get("limit", 10)
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, "
                    "c.name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id "
                    "ORDER BY o.created_at DESC LIMIT :lim"
                ),
                {"lim": limit},
            )
            rows = res.fetchall()
        orders = [
            {
                "id": r[0],
                "number": r[1],
                "amount": float(r[2] or 0),
                "status": r[3],
                "payment": r[4],
                "client": r[5] or "—",
            }
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Последние {len(orders)} заказов",
            "data": orders,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

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
    try:
        limit = int(params.get("limit") or getattr(settings, "b2b_daily_limit", 15))
    except (TypeError, ValueError):
        limit = 15

    targets, seen = [], set()
    try:
        async with get_session_ctx() as session:
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
                    targets.append(
                        {
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
                        }
                    )
                    if len(targets) >= limit:
                        break
    except Exception as e:
        logger.error(f"bus_get_b2b_targets error: {e}", exc_info=True)
        return {"status": "error", "message": str(e), "data": {"targets": []}}

    by_seg = {}
    for t in targets:
        by_seg[t["segment"]] = by_seg.get(t["segment"], 0) + 1
    breakdown = (
        ", ".join(f"{SEGMENT_REASON[s]}: {n}" for s, n in by_seg.items()) or "нет"
    )

    return {
        "status": "ok",
        "message": f"Отобрано ресторанов: {len(targets)} ({breakdown})",
        "data": {"targets": targets},
    }

async def bus_get_clients(params: dict) -> dict:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(text("SELECT COUNT(*) FROM customers"))
            total = res.scalar() or 0
            res = await session.execute(
                text(
                    "SELECT id, name, phone, status FROM customers "
                    "ORDER BY created_at DESC LIMIT 20"
                )
            )
            rows = res.fetchall()
        clients = [
            {"id": r[0], "name": r[1] or "—", "phone": r[2] or "—", "status": r[3]}
            for r in rows
        ]
        return {
            "status": "ok",
            "message": f"Всего клиентов: {total}",
            "data": {"total": total, "clients": clients},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

async def bus_register_sale(params: dict) -> dict:
    from shared.sales_ops import register_sale

    params = dict(params or {})
    params.setdefault("registered_by", "sales_bot")
    return await register_sale(params)

async def bus_add_product(params: dict) -> dict:
    from shared.catalog_ops import add_product
    return await add_product(dict(params or {}))

async def bus_sync_catalog(params: dict) -> dict:
    from shared.catalog_sync import sync_catalog_from_storefront
    return await sync_catalog_from_storefront()

async def _sell_magazine_ads(params: dict) -> list:
    import aiohttp
    import os

    storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
    bot_secret = os.getenv("BOT_SECRET", "")

    url = f"{storefront_url}/admin/magazine/advertisers"
    headers = {"x-bot-secret": bot_secret, "Content-Type": "application/json"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=5) as response:
                if response.status == 200:
                    advertisers = await response.json()
                    if isinstance(advertisers, list):
                        ads = []
                        active_advs = [
                            a
                            for a in advertisers
                            if isinstance(a, dict) and a.get("status") == "active"
                        ]
                        for adv in active_advs:
                            company = (
                                adv.get("companyName")
                                or adv.get("company_name")
                                or "Рекламодатель"
                            )
                            notes = (
                                adv.get("notes")
                                or "Специальные предложения для наших клиентов"
                            )
                            ads.append(
                                {
                                    "type": "paid_ad",
                                    "content": f"📢 {company}: {notes}",
                                    "cta_url": None,
                                }
                            )
                        return ads
                else:
                    logger.warning(
                        f"Failed to fetch advertisers: HTTP status {response.status}"
                    )
    except Exception as e:
        logger.error(f"Error fetching advertisers from storefront: {e}")

    return []

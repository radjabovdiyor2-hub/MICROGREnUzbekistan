"""Sales Bot — main.py с EventBus интеграцией"""

import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared import catalog_repo, customer_repo, storefront_orders
from shared.utils import format_price
from shared.prompts import role_prompt
from shared.config import settings
from shared.database import init_db
from shared.event_bus import event_bus
from bots.sales_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.sales_bot.handlers.ai_chat import ai_fallback
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# ── Scheduler ────────────────────────────────────────────────────────────
scheduler = BotScheduler("sales_bot")


# Ссылки на онлайн-оплату (Click/Payme) убраны намеренно.
# Они собирались из settings.click_merchant_id / payme_merchant_id, у которых
# в конфиге стояли заглушки «12345» и «1234567890», а в .env их никто не задавал.
# То есть клиент получал кликабельную кнопку «Оплатить», которая никуда не ведёт.
# Онлайн-оплата в системе не используется: наличные, карта, банковский перевод.
# Приём события PAYMENT_RECEIVED от n8n ниже оставлен — это другой механизм.
PAYMENT_METHODS_HINT = "💳 Оплата: наличные, карта или банковский перевод"


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

        bot = Bot(
            token=settings.sales_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        chat_id = settings.sales_group_id

        async with get_session_ctx() as session:
            # Обновляем статус оплаты заказа
            result = await session.execute(
                text(
                    "UPDATE crm_orders SET payment_status = 'paid', updated_at = NOW() WHERE order_number = :on RETURNING id"
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

        # Уведомляем группу продаж
        if chat_id:
            try:
                await bot.send_message(
                    chat_id,
                    f"💰 <b>Заказ {order_number} оплачен!</b>\nПровайдер: {provider}\nСумма: {amount} UZS",
                    parse_mode="HTML",
                )
            except Exception:
                pass

        # Событие для PM/Степана. Доход в таблицу finances пишет Finance по PAYMENT_RECEIVED,
        # поэтому отдельное income_recorded не публикуем (был дубль без потребителя).
        await event_bus.publish(
            "order_status_changed",
            {"order_number": order_number, "status": "paid"},
            "sales_bot",
        )

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
            msg = await ai.chat_completion(role_prompt("Ты B2B менеджер."), prompt)

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


# Фоновые проверки отключены для исключения лишнего спама админу


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
            res = await session.execute(
                text(
                    "SELECT o.id, o.order_number, o.total_amount, o.status, o.payment_status, "
                    "c.name FROM crm_orders o LEFT JOIN customers c ON o.customer_id = c.id "
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
    """Количество и список клиентов."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

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


async def bus_sync_catalog(params: dict) -> dict:
    """Принудительная синхронизация каталога: витрина -> CRM."""
    from shared.catalog_sync import sync_catalog_from_storefront

    return await sync_catalog_from_storefront()


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
    raw = (
        raw.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logging.warning("SALES_BOT: не смог распарсить параметры продажи: %r", raw)
        return {}
    return (
        {k: v for k, v in parsed.items() if v is not None}
        if isinstance(parsed, dict)
        else {}
    )


def _is_sale_registration(title: str, description: str) -> bool:
    """
    Задача про регистрацию уже СОСТОЯВШЕЙСЯ продажи?

    Прямые формулировки ловим как есть. Голое «продали» — только вместе с числом
    (иначе «почему мало продали» уехало бы в регистрацию вместо анализа).
    """
    import re as _re

    blob = f"{title} {description}".lower()
    explicit = (
        "зарегистрируй продаж",
        "регистрация продаж",
        "зарегистрировать продаж",
        "оформи продаж",
        "запиши продаж",
        "фиксация продаж",
        "учти продаж",
    )
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

    bot = Bot(
        token=settings.sales_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.ai_engine import AIEngine

        ai = AIEngine()

        # Проверяем, не запрашивается ли Коммерческое Предложение (КП)
        title = str(data.get("title", "")).lower()
        desc = str(data.get("description", "")).lower()

        if _is_sale_registration(title, desc):
            # Реальная работа отдела: продажа записывается в CRM, а не «берётся в работу».
            logging.info("SALES_BOT: регистрация продажи по задаче #%s", task_id)
            from shared.sales_ops import register_sale, format_sale_report

            sale_params = await _extract_sale_params(
                ai, data.get("title", ""), data.get("description", "")
            )
            sale_params["notes"] = (
                f"{data.get('title', '')}. {data.get('description', '')}"[:500]
            )
            sale_params["registered_by"] = "sales_bot"
            result = await register_sale(sale_params)

            if result["status"] == "ok":
                await bot.send_message(
                    chat_id, format_sale_report(result), parse_mode="HTML"
                )
                from shared import tasks_repo

                await tasks_repo.set_status(task_id, "done")
            elif result["status"] == "duplicate":
                await bot.send_message(chat_id, f"ℹ️ {result['message']}")
            else:
                # Не хватает данных или ошибка — честно спрашиваем, а не имитируем работу.
                await bot.send_message(
                    chat_id,
                    f"❓ <b>Отдел продаж:</b> {result['message']}",
                    parse_mode="HTML",
                )

        elif (
            "кп" in title
            or "коммерческое" in title
            or "кп" in desc
            or "коммерческ" in desc
        ):
            logging.info("SALES_BOT: Requested commercial offer PDF.")
            from shared.prompts import TEAM_CONTEXT, role_prompt

            prompt = f"Составь продающий текст коммерческого предложения для клиента. Задача: {data.get('title')} - {data.get('description')}. Укажи преимущества микрозелени."
            answer = await ai.chat_completion(
                f"{TEAM_CONTEXT}\n\nТы B2B менеджер по продажам. Напиши профессиональный и убедительный текст.",
                prompt,
            )

            # Получим цены из базы для КП
            from shared.database import get_session_ctx
            from sqlalchemy import text

            products = [
                {"name": item["name"], "price": format_price(item["price"])}
                for item in (await catalog_repo.list_active())[:5]
            ]

            from shared.pdf_generator import generate_commercial_offer_pdf
            from aiogram.types import FSInputFile
            import os

            # Генерируем PDF
            pdf_path = generate_commercial_offer_pdf(
                client_name=data.get("title"),
                ai_text=answer,
                prices=products,
                output_filename=f"КП_Microgreen_{task_id}.pdf",
            )

            await bot.send_document(
                chat_id,
                document=FSInputFile(pdf_path),
                caption="📝 <b>Коммерческое предложение готово!</b>\nОтдел SALES выполнил задачу.",
                parse_mode="HTML",
            )
            try:
                os.remove(pdf_path)
            except OSError as exc:
                logging.warning("Failed to remove temporary PDF %s: %s", pdf_path, exc)

        elif "ig заказ" in title:
            logging.info("SALES_BOT: Processing auto-delegated IG order from Stepan.")

            # Просим ИИ вытащить детали
            parser_prompt = (
                "Проанализируй текст заказа из Instagram и извлеки следующие параметры:\n"
                f"Текст заказа: {desc}\n\n"
                "Ответь строго в формате JSON без разметки markdown и без каких-либо пояснений:\n"
                "{\n"
                '  "customer_name": "имя или юзернейм клиента (строка, или null)",\n'
                '  "product": "конкретное название товара/зелени на русском, например: Базилик, Рукола (строка, или null)",\n'
                '  "quantity": число_или_null,\n'
                '  "phone": "номер телефона (строка, или null)",\n'
                '  "address": "адрес доставки (строка, или null)"\n'
                "}\n"
            )
            ai_parse = await ai.chat_completion(
                role_prompt("Ты профессиональный парсер заказов."), parser_prompt, effort="high"
            )
            ai_parse = (
                ai_parse.strip()
                .removeprefix("```json")
                .removeprefix("```")
                .removesuffix("```")
                .strip()
            )

            parsed = {}
            try:
                import json

                parsed = json.loads(ai_parse)
            except Exception as e:
                logger.warning(f"Failed to parse IG order details: {e}")

            customer_name = parsed.get("customer_name") or "Instagram Client"
            product = parsed.get("product")

            try:
                quantity = int(parsed.get("quantity") or 1)
            except (ValueError, TypeError):
                quantity = 1

            phone = parsed.get("phone")
            address = parsed.get("address")

            db_id = None
            storefront_id = None
            price = None
            amount = None
            if product:
                from shared.database import get_session_ctx
                from sqlalchemy import text

                async with get_session_ctx() as session:
                    res = await session.execute(
                        text(
                            "SELECT id, storefront_id, price FROM crm_products WHERE is_active = true AND name_ru ILIKE :p LIMIT 1"
                        ),
                        {"p": f"%{product}%"},
                    )
                    row = res.fetchone()
                    if row:
                        db_id = row[0]
                        storefront_id = row[1]
                        price = float(row[2])
                        amount = int(price * quantity)

            from shared.database import get_session_ctx
            from shared.order_utils import generate_order_number
            from sqlalchemy import text

            async with get_session_ctx() as session:
                # Клиент — через shared/customer_repo: он один на весь офис.
                # Здесь была своя копия поиска, сравнивавшая имя точным
                # `ILIKE :n` без процентов, поэтому IG-заказ от постоянного
                # клиента заводил ему очередную карточку.
                customer_id = (
                    await customer_repo.upsert(
                        session=session,
                        name=customer_name,
                        raw_phone=phone,
                        status="lead",
                        source="instagram",
                        notes=f"Заведен при обработке IG-заказа по задаче #{task_id}",
                    )
                )["id"]

                # Пытаемся отправить заказ в реальный магазин storefront
                storefront_success = False
                real_order_number = None

                # Заказ создаёт витрина — через общий клиент shared/storefront_orders.
                # Здесь была рукописная копия POST: без заголовка Authorization,
                # с timeout числом вместо ClientTimeout и с целочисленным id CRM
                # в productId, если у товара не было storefront_id — витрина
                # отклоняла такой заказ по внешнему ключу, и путь всегда уходил
                # в локальный черновик.
                if amount is not None and storefront_id:
                    created = await storefront_orders.create_order(
                        customer_name=customer_name,
                        phone=phone or "",
                        address=address or "Самарканд",
                        items=[
                            {
                                "id": storefront_id,
                                "price": int(price),
                                "quantity": int(quantity),
                            }
                        ],
                        note=f"Instagram-заказ от {customer_name}",
                    )
                    if created["ok"]:
                        real_order_number = created["order"].get("orderNumber")
                        storefront_success = bool(real_order_number)
                    else:
                        logger.warning(
                            "task_created: витрина не приняла заказ (%s) — пишу черновик",
                            created["error"],
                        )
                elif amount is not None:
                    logger.warning(
                        "task_created: у товара нет storefront_id — заказ в магазин не уйдёт"
                    )

                if storefront_success:
                    # Сообщаем об успехе в чат задачи
                    await bot.send_message(
                        chat_id,
                        f"✅ <b>Заказ {real_order_number} успешно оформлен в магазине!</b>\nСумма: {amount} UZS\n"
                        f"Склад зарезервирован.\n\n"
                        f"{PAYMENT_METHODS_HINT}",
                        parse_mode="HTML",
                    )
                else:
                    # Фолбек на локальный черновик/зеркало
                    order_number = await generate_order_number()

                    if amount is not None:
                        # Локальный черновик (storefront упал). Пишем вместе с
                        # позицией: без строки в crm_order_items заказ невидим
                        # для топа товаров, ABC-анализа и выручки по позициям —
                        # они считаются джойном именно этой таблицы.
                        draft_id = (
                            await session.execute(
                                text(
                                    "INSERT INTO crm_orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                                    "VALUES (:cid, :onum, :amount, 'new', 'pending', :notes, NOW(), NOW()) RETURNING id"
                                ),
                                {
                                    "cid": customer_id,
                                    "onum": order_number,
                                    "amount": amount,
                                    "notes": f"[ОШИБКА МАГАЗИНА] {desc}"[:200],
                                },
                            )
                        ).scalar()
                        if draft_id and db_id and price is not None:
                            await session.execute(
                                text(
                                    "INSERT INTO crm_order_items (order_id, product_id, quantity, "
                                    "unit, unit_price, total_price) "
                                    "VALUES (:oid, :pid, :qty, 'piece', :price, :total)"
                                ),
                                {
                                    "oid": draft_id,
                                    "pid": db_id,
                                    "qty": quantity,
                                    "price": price,
                                    "total": price * quantity,
                                },
                            )
                        await session.commit()

                        await bot.send_message(
                            chat_id,
                            f"⚠️ <b>Магазин недоступен, заказ {order_number} оформлен локально!</b>\nСумма: {amount} UZS\n\n"
                            f"{PAYMENT_METHODS_HINT}",
                            parse_mode="HTML",
                        )
                    else:
                        # Сумма неизвестна
                        notes_lead = f"LEAD/manual: {desc}"[:200]
                        await session.execute(
                            text(
                                "INSERT INTO crm_orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                                "VALUES (:cid, :onum, 0, 'new', 'pending', :notes, NOW(), NOW())"
                            ),
                            {
                                "cid": customer_id,
                                "onum": order_number,
                                "notes": notes_lead,
                            },
                        )
                        await session.commit()

                        # Сообщаем в чат задачи
                        await bot.send_message(
                            chat_id,
                            f"⚠️ <b>Внимание:</b> Сумма заказа {order_number} не определена, так как товар или цена не найдены в каталоге.\n"
                            f"Заказ сохранен как черновик (LEAD/manual) без ссылок на оплату.",
                            parse_mode="HTML",
                        )

                        # Отправляем уведомление в группу продаж
                        sales_group = (
                            getattr(settings, "sales_group_id", None) or chat_id
                        )
                        if sales_group:
                            await bot.send_message(
                                sales_group,
                                f"🔔 Новый IG-заказ, сумма не определена — уточните у клиента и оформите вручную:\n"
                                f"Заказ: {order_number}\nКлиент: {customer_name}\nДетали: {desc}",
                                parse_mode="HTML",
                            )

        else:
            from shared.task_executor import execute_bot_task
            from shared.prompts import TEAM_CONTEXT

            sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Коммерческий Директор (Chief Revenue Officer) и главный Sales Bot. Сфокусируйся на LTV, конверсиях, дожимах и B2B/B2C воронках. Не пиши банальности, предлагай стратегию продаж и тактики закрытия сделок."
            
            logging.info("SALES_BOT passing task to TaskExecutor...")
            await execute_bot_task(
                bot=bot,
                bot_name="sales_bot",
                department="sales",
                task_data=data,
                team_context=sys_prompt
            )
            logging.info("SALES_BOT successfully handled task.")

    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


async def bus_process_ig_order(params: dict) -> dict:
    """Оформление заказа из Instagram c отправкой в storefront API."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode
        from shared.config import settings

        customer_name = params.get("customer_name") or "Instagram Client"
        product = params.get("product")
        try:
            quantity = int(params.get("quantity") or 1)
        except (ValueError, TypeError):
            quantity = 1
        phone = params.get("phone", "")
        address = params.get("address", "")

        # Пытаемся получить сумму из параметров
        amount_param = params.get("total") or params.get("amount")
        amount = None
        if amount_param:
            try:
                import re

                amt_str = re.sub(r"[^\d]", "", str(amount_param))
                if amt_str:
                    amount = int(amt_str)
            except Exception:
                pass

        # Товар ищем ВСЕГДА, когда он назван, — не только ради цены.
        #
        # Раньше поиск шёл лишь при неизвестной сумме (`if amount is None`), и
        # если сумма пришла параметром, `storefront_id` оставался пустым. Заказ
        # тогда не мог уйти на витрину вовсе: она принимает позицию только по
        # cuid товара. Каждый такой IG-заказ молча падал в локальный черновик.
        # Цену из каталога при этом не навязываем: назвали сумму — считаем по ней.
        db_id = None
        storefront_id = None
        price = None
        if product:
            try:
                async with get_session_ctx() as session:
                    res = await session.execute(
                        text(
                            "SELECT id, storefront_id, price FROM crm_products WHERE is_active = true AND name_ru ILIKE :p LIMIT 1"
                        ),
                        {"p": f"%{product}%"},
                    )
                    row = res.fetchone()
                    if row:
                        db_id = row[0]
                        storefront_id = row[1]
                        catalog_price = float(row[2])
                        if amount is None:
                            price = catalog_price
                            amount = int(price * quantity)
                        else:
                            # Сумму назвал менеджер — цену позиции выводим из неё,
                            # иначе итог заказа разойдётся с тем, что он сказал.
                            price = amount / quantity if quantity else catalog_price
            except Exception as e:
                logger.error(
                    f"Error fetching product price in bus_process_ig_order: {e}"
                )

        async with get_session_ctx() as session:
            # Тот же общий upsert, что и в ручной обработке IG-заказа выше.
            customer_id = (
                await customer_repo.upsert(
                    session=session,
                    name=customer_name,
                    raw_phone=phone,
                    status="lead",
                    source="instagram",
                    notes="Заведен авто-процессом IG-заказа",
                )
            )["id"]

            # Пытаемся отправить в реальный магазин
            storefront_success = False
            real_order_number = None

            # Заказ создаёт витрина — через общий клиент shared/storefront_orders.
            # Здесь была рукописная копия POST: без заголовка Authorization,
            # с timeout числом вместо ClientTimeout и с целочисленным id CRM
            # в productId, если у товара не было storefront_id — витрина
            # отклоняла такой заказ по внешнему ключу, и путь всегда уходил
            # в локальный черновик.
            if amount is not None and storefront_id:
                created = await storefront_orders.create_order(
                    customer_name=customer_name,
                    phone=phone or "",
                    address=address or "Самарканд",
                    items=[
                        {
                            "id": storefront_id,
                            "price": int(price),
                            "quantity": int(quantity),
                        }
                    ],
                    note=f"Instagram-заказ от {customer_name}",
                )
                if created["ok"]:
                    real_order_number = created["order"].get("orderNumber")
                    storefront_success = bool(real_order_number)
                else:
                    logger.warning(
                        "bus_process_ig_order: витрина не приняла заказ (%s) — пишу черновик",
                        created["error"],
                    )
            elif amount is not None:
                logger.warning(
                    "bus_process_ig_order: у товара нет storefront_id — заказ в магазин не уйдёт"
                )

            notes = (
                f"IG: {product or '—'} x {quantity}, Phone: {phone}, Address: {address}"
            )

            if storefront_success:
                msg_text = (
                    f"✅ <b>Заказ {real_order_number} оформлен в магазине!</b>\n"
                    f"Клиент: {customer_name}\n"
                    f"Товар: {product or '—'} x {quantity}\n"
                    f"Сумма: {amount} UZS\n\n"
                    f"{PAYMENT_METHODS_HINT}"
                )
                order_number = real_order_number
            else:
                # Фолбек на локальный черновик/зеркало
                from shared.order_utils import generate_order_number

                order_number = await generate_order_number()

                if amount is not None:
                    # Локальный черновик (storefront упал) — вместе с позицией,
                    # иначе заказ не попадёт ни в один отчёт по товарам.
                    draft_id = (
                        await session.execute(
                            text(
                                "INSERT INTO crm_orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                                "VALUES (:cid, :onum, :amount, 'new', 'pending', :notes, NOW(), NOW()) RETURNING id"
                            ),
                            {
                                "cid": customer_id,
                                "onum": order_number,
                                "amount": amount,
                                "notes": f"[ОШИБКА] {notes}"[:200],
                            },
                        )
                    ).scalar()
                    if draft_id and db_id and price is not None:
                        await session.execute(
                            text(
                                "INSERT INTO crm_order_items (order_id, product_id, quantity, "
                                "unit, unit_price, total_price) "
                                "VALUES (:oid, :pid, :qty, 'piece', :price, :total)"
                            ),
                            {
                                "oid": draft_id,
                                "pid": db_id,
                                "qty": quantity,
                                "price": price,
                                "total": price * quantity,
                            },
                        )
                    await session.commit()

                    msg_text = (
                        f"⚠️ <b>Магазин недоступен, заказ {order_number} оформлен локально!</b>\n"
                        f"Клиент: {customer_name}\n"
                        f"Товар: {product or '—'} x {quantity}\n"
                        f"Сумма: {amount} UZS\n\n"
                        f"{PAYMENT_METHODS_HINT}"
                    )
                else:
                    # Оформляем как LEAD/manual заказ с 0 суммой
                    notes_lead = f"LEAD/manual: {notes}"
                    await session.execute(
                        text(
                            "INSERT INTO crm_orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                            "VALUES (:cid, :onum, 0, 'new', 'pending', :notes, NOW(), NOW())"
                        ),
                        {
                            "cid": customer_id,
                            "onum": order_number,
                            "notes": notes_lead[:200],
                        },
                    )
                    await session.commit()

                    msg_text = (
                        f"🔔 Новый IG-заказ, сумма не определена — уточните у клиента и оформите вручную:\n"
                        f"Заказ: {order_number}\n"
                        f"Клиент: {customer_name}\n"
                        f"Детали: {notes}"
                    )

            bot = Bot(
                token=settings.sales_bot_token,
                default=DefaultBotProperties(parse_mode=ParseMode.HTML),
            )
            chat_id = (
                getattr(settings, "sales_group_id", None)
                or settings.admin_telegram_ids[0]
            )
            await bot.send_message(chat_id, msg_text, parse_mode="HTML")
            await bot.session.close()

        return {"status": "ok", "message": f"Заказ {order_number} оформлен"}

    except Exception as e:
        logger.error(f"bus_process_ig_order error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def _sell_magazine_ads(params: dict) -> list:
    """Генерация рекламных блоков для журнала из реального CRM рекламодателей."""
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
                        # Фильтруем только активных рекламодателей
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
                            # Добавляем рекламный блок
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


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("sales_bot", payload)


async def main():
    if not settings.sales_bot_token:
        logger.error("FATAL: SALES_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.sales_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.approvals import approvals_router
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    # Кнопки ✅/❌ под рискованными действиями отдела. Без этого роутера
    # карточка подтверждения показывается, а нажатие ничего не делает.
    dp.include_router(approvals_router)
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        ai_fallback,
        wake_words=["отдел продаж", "продажи", "sales", "сейлз"],
    )
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

    asyncio.create_task(
        bus_listen(
            "sales_bot",
            {
                "get_orders": bus_get_orders,
                "get_clients": bus_get_clients,
                "process_ig_order": bus_process_ig_order,
                "get_b2b_targets": bus_get_b2b_targets,  # кому сегодня готовить КП
                "register_sale": bus_register_sale,  # менеджер сообщил о продаже → заказ в CRM
                "add_product": bus_add_product,  # новый товар → каталог витрины + CRM
                "sync_catalog_from_storefront": bus_sync_catalog,  # принудительный синк каталога
                BotBusActions.SELL_MAGAZINE_ADS: _sell_magazine_ads,
            },
        )
    )

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

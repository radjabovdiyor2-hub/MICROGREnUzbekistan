import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

PAYMENT_METHODS_HINT = "💳 Оплата: наличные, карта или банковский перевод"

async def _extract_sale_params(ai, title: str, description: str) -> dict:
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
        logger.warning("SALES_BOT: не смог распарсить параметры продажи: %r", raw)
        return {}
    return (
        {k: v for k, v in parsed.items() if v is not None}
        if isinstance(parsed, dict)
        else {}
    )

def _is_sale_registration(title: str, description: str) -> bool:
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

async def handle_task_created(payload: dict) -> None:
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

        title = str(data.get("title", "")).lower()
        desc = str(data.get("description", "")).lower()

        if _is_sale_registration(title, desc):
            logger.info("SALES_BOT: регистрация продажи по задаче #%s", task_id)
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
                async with get_session_ctx() as session:
                    await session.execute(
                        text("UPDATE tasks SET status = 'done' WHERE id = :tid"),
                        {"tid": task_id},
                    )
                    await session.commit()
            elif result["status"] == "duplicate":
                await bot.send_message(chat_id, f"ℹ️ {result['message']}")
            else:
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
            logger.info("SALES_BOT: Requested commercial offer PDF.")
            from shared.prompts import TEAM_CONTEXT

            prompt = f"Составь продающий текст коммерческого предложения для клиента. Задача: {data.get('title')} - {data.get('description')}. Укажи преимущества микрозелени."
            answer = await ai.chat_completion(
                f"{TEAM_CONTEXT}\n\nТы B2B менеджер по продажам. Напиши профессиональный и убедительный текст.",
                prompt,
            )

            async with get_session_ctx() as session:
                res = await session.execute(
                    text(
                        "SELECT name_ru, price FROM products WHERE is_active=true LIMIT 5"
                    )
                )
                products = [
                    {"name": r[0], "price": f"{r[1]} сум"} for r in res.fetchall()
                ]

            from shared.pdf_generator import generate_commercial_offer_pdf
            from aiogram.types import FSInputFile
            import os

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
                logger.warning("Failed to remove temporary PDF %s: %s", pdf_path, exc)

        elif "ig заказ" in title:
            logger.info("SALES_BOT: Processing auto-delegated IG order from Stepan.")

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
                "Ты профессиональный парсер заказов.", parser_prompt, effort="high"
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
                async with get_session_ctx() as session:
                    res = await session.execute(
                        text(
                            "SELECT id, storefront_id, price FROM products WHERE is_active = true AND name_ru ILIKE :p LIMIT 1"
                        ),
                        {"p": f"%{product}%"},
                    )
                    row = res.fetchone()
                    if row:
                        db_id = row[0]
                        storefront_id = row[1]
                        price = float(row[2])
                        amount = int(price * quantity)

            from shared.order_utils import generate_order_number

            async with get_session_ctx() as session:
                customer_id = None
                if phone:
                    customer_id = (
                        await session.execute(
                            text(
                                "SELECT id FROM customers WHERE phone = :p ORDER BY id LIMIT 1"
                            ),
                            {"p": phone},
                        )
                    ).scalar()
                if not customer_id and customer_name:
                    customer_id = (
                        await session.execute(
                            text(
                                "SELECT id FROM customers WHERE name ILIKE :n OR company_name ILIKE :n ORDER BY id LIMIT 1"
                            ),
                            {"n": customer_name},
                        )
                    ).scalar()

                if not customer_id:
                    customer_id = (
                        await session.execute(
                            text(
                                "INSERT INTO customers (name, phone, customer_type, status, source, notes, created_at, updated_at) "
                                "VALUES (:n, :p, 'b2c', 'lead', 'instagram', :notes, NOW(), NOW()) RETURNING id"
                            ),
                            {
                                "n": customer_name,
                                "p": phone,
                                "notes": f"Заведен при обработке IG-заказа по задаче #{task_id}",
                            },
                        )
                    ).scalar()

                storefront_success = False
                real_order_number = None

                if amount is not None:
                    import aiohttp
                    import os

                    storefront_url = os.getenv(
                        "STOREFRONT_API_URL", "http://web:3000/api"
                    )
                    bot_secret = os.getenv("BOT_SECRET", "")

                    payload = {
                        "name": customer_name,
                        "phone": phone or "нет телефона",
                        "address": address or "Самарканд",
                        "items": [
                            {
                                "productId": storefront_id or str(db_id),
                                "price": int(price),
                                "quantity": int(quantity),
                            }
                        ],
                        "paymentMethod": "cash",
                        "telegramId": None,
                    }
                    try:
                        async with aiohttp.ClientSession() as http_sess:
                            async with http_sess.post(
                                f"{storefront_url}/orders",
                                json=payload,
                                headers={
                                    "x-bot-secret": bot_secret,
                                    "Content-Type": "application/json",
                                },
                                timeout=10,
                            ) as response:
                                if response.status in (200, 201):
                                    resp_data = await response.json()
                                    order_data = resp_data.get("order", {})
                                    real_order_number = order_data.get(
                                        "orderNumber"
                                    ) or order_data.get("order_number")
                                    if real_order_number:
                                        storefront_success = True
                    except Exception as e:
                        logger.error(
                            f"Failed to post order to storefront in task_created: {e}"
                        )

                if storefront_success:
                    await bot.send_message(
                        chat_id,
                        f"✅ <b>Заказ {real_order_number} успешно оформлен в магазине!</b>\nСумма: {amount} UZS\n"
                        f"Склад зарезервирован.\n\n"
                        f"{PAYMENT_METHODS_HINT}",
                        parse_mode="HTML",
                    )
                else:
                    order_number = await generate_order_number()

                    if amount is not None:
                        await session.execute(
                            text(
                                "INSERT INTO orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                                "VALUES (:cid, :onum, :amount, 'new', 'pending', :notes, NOW(), NOW())"
                            ),
                            {
                                "cid": customer_id,
                                "onum": order_number,
                                "amount": amount,
                                "notes": f"[ОШИБКА МАГАЗИНА] {desc}"[:200],
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
                        notes_lead = f"LEAD/manual: {desc}"[:200]
                        await session.execute(
                            text(
                                "INSERT INTO orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                                "VALUES (:cid, :onum, 0, 'new', 'pending', :notes, NOW(), NOW())"
                            ),
                            {
                                "cid": customer_id,
                                "onum": order_number,
                                "notes": notes_lead,
                            },
                        )
                        await session.commit()

                        await bot.send_message(
                            chat_id,
                            f"⚠️ <b>Внимание:</b> Сумма заказа {order_number} не определена, так как товар или цена не найдены в каталоге.\n"
                            f"Заказ сохранен как черновик (LEAD/manual) без ссылок на оплату.",
                            parse_mode="HTML",
                        )

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
            from shared.prompts import TEAM_CONTEXT
            from shared.task_ui import get_task_keyboard

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
            logger.info("SALES_BOT Generating AI answer...")
            answer = await ai.chat_completion(sys_prompt, user_prompt, max_tokens=350)

            logger.info(f"SALES_BOT sending message to {chat_id}")
            
            await bot.send_message(
                chat_id,
                f"✅ <b>Отдел продаж — принял в работу:</b>\n\n{answer}",
                parse_mode="HTML",
                reply_markup=get_task_keyboard(task_id),
            )
            logger.info("SALES_BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def bus_process_ig_order(params: dict) -> dict:
    try:
        customer_name = params.get("customer_name") or "Instagram Client"
        product = params.get("product")
        try:
            quantity = int(params.get("quantity") or 1)
        except (ValueError, TypeError):
            quantity = 1
        phone = params.get("phone", "")
        address = params.get("address", "")

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

        db_id = None
        storefront_id = None
        price = None
        if amount is None and product:
            try:
                async with get_session_ctx() as session:
                    res = await session.execute(
                        text(
                            "SELECT id, storefront_id, price FROM products WHERE is_active = true AND name_ru ILIKE :p LIMIT 1"
                        ),
                        {"p": f"%{product}%"},
                    )
                    row = res.fetchone()
                    if row:
                        db_id = row[0]
                        storefront_id = row[1]
                        price = float(row[2])
                        amount = int(price * quantity)
            except Exception as e:
                logger.error(
                    f"Error fetching product price in bus_process_ig_order: {e}"
                )

        async with get_session_ctx() as session:
            customer_id = None
            if phone:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE phone = :p ORDER BY id LIMIT 1"
                        ),
                        {"p": phone},
                    )
                ).scalar()
            if not customer_id and customer_name:
                customer_id = (
                    await session.execute(
                        text(
                            "SELECT id FROM customers WHERE name ILIKE :n OR company_name ILIKE :n ORDER BY id LIMIT 1"
                        ),
                        {"n": customer_name},
                    )
                ).scalar()

            if not customer_id:
                customer_id = (
                    await session.execute(
                        text(
                            "INSERT INTO customers (name, phone, customer_type, status, source, notes, created_at, updated_at) "
                            "VALUES (:n, :p, 'b2c', 'lead', 'instagram', :notes, NOW(), NOW()) RETURNING id"
                        ),
                        {
                            "n": customer_name,
                            "p": phone,
                            "notes": "Заведен авто-процессом IG-заказа",
                        },
                    )
                ).scalar()

            storefront_success = False
            real_order_number = None

            if amount is not None:
                import aiohttp
                import os

                storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
                bot_secret = os.getenv("BOT_SECRET", "")

                payload = {
                    "name": customer_name,
                    "phone": phone or "нет телефона",
                    "address": address or "Самарканд",
                    "items": [
                        {
                            "productId": storefront_id or str(db_id),
                            "price": int(price),
                            "quantity": int(quantity),
                        }
                    ],
                    "paymentMethod": "cash",
                    "telegramId": None,
                }
                try:
                    async with aiohttp.ClientSession() as http_sess:
                        async with http_sess.post(
                            f"{storefront_url}/orders",
                            json=payload,
                            headers={
                                "x-bot-secret": bot_secret,
                                "Content-Type": "application/json",
                            },
                            timeout=10,
                        ) as response:
                            if response.status in (200, 201):
                                resp_data = await response.json()
                                order_data = resp_data.get("order", {})
                                real_order_number = order_data.get(
                                    "orderNumber"
                                ) or order_data.get("order_number")
                                if real_order_number:
                                    storefront_success = True
                except Exception as e:
                    logger.error(
                        f"Failed to post order to storefront in bus_process_ig_order: {e}"
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
                from shared.order_utils import generate_order_number

                order_number = await generate_order_number()

                if amount is not None:
                    await session.execute(
                        text(
                            "INSERT INTO orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
                            "VALUES (:cid, :onum, :amount, 'new', 'pending', :notes, NOW(), NOW())"
                        ),
                        {
                            "cid": customer_id,
                            "onum": order_number,
                            "amount": amount,
                            "notes": f"[ОШИБКА] {notes}"[:200],
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
                    notes_lead = f"LEAD/manual: {notes}"
                    await session.execute(
                        text(
                            "INSERT INTO orders (customer_id, order_number, total_amount, status, payment_status, notes, created_at, updated_at) "
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

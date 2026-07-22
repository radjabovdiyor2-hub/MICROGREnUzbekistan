"""
Microgreen Uzbekistan — Instagram DM Sales Bot
===============================================
Полноценный менеджер по продажам в Instagram Direct.
Ведёт многоэтапный диалог с клиентом, собирает заказ,
оформляет его и передаёт Степану для распределения по отделам.

Использует Messenger API для чтения/отправки сообщений.
"""

import logging
import aiohttp
from typing import List, Dict, Optional
from datetime import datetime, timezone, timedelta
from shared.config import settings
from shared.ai_engine import AIEngine

logger = logging.getLogger(__name__)

API_VERSION = "v19.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

# Хранилище уже обработанных сообщений (в рамках одного процесса)
_processed_message_ids: set = set()

# Хранилище истории диалогов по каждому клиенту (IGSID -> history)
_conversation_histories: Dict[str, List[Dict[str, str]]] = {}

# Хранилище информации о собранных заказах
_pending_orders: Dict[str, Dict] = {}

# Блокировка параллельных запусков
_is_processing: bool = False

# Максимум сообщений в истории (чтобы не раздуть контекст)
MAX_HISTORY_LENGTH = 20

# Системный промпт для Instagram-менеджера
IG_SALES_SYSTEM_PROMPT = """Ты — менеджер по продажам компании Microgreen Uzbekistan в Instagram Direct.
Ты ведёшь живой разговор с клиентом и САМОСТОЯТЕЛЬНО оформляешь заказ.

🏢 О КОМПАНИИ:
- Microgreen Uzbekistan — производитель микрозелени, салатов и съедобных цветов в Самарканде
- Доставка по Самарканду, бесплатно от 500 000 сум

🌱 НАША ПРОДУКЦИЯ:
- Микрозелень (руккола, базилик, шпинат, брокколи, редис, горох, подсолнечник, кресс-салат, кинза, свёкла)
- Бейби-лиф (руккола, шпинат, мангольд)
- Салатные миксы (микс, руккола, витаминный)
- Съедобные цветы (микс, настурция, бораго)
- Витграсс (wheatgrass)

Актуальные цены и наличие уточнит менеджер при подтверждении заказа.

💳 ОПЛАТА: наличные, карта, Click, Payme
📞 Телефон: +998 94 999 95 99

═══════════════════════════════════════════
ТВОЯ ГЛАВНАЯ ЗАДАЧА — БЫСТРО ОФОРМИТЬ ЗАКАЗ!
═══════════════════════════════════════════

Тебе нужно собрать ТОЛЬКО 3 вещи:
1. 📦 Что хочет клиент? (название продукта)
2. 📊 Сколько? (количество)
3. 📱 Номер телефона

Адрес доставки НЕ спрашивай — менеджер сам уточнит.

Как только получил товар + количество + телефон — СРАЗУ оформляй заказ!

Если клиент написал всё в одном сообщении (например "Горох 20шт +998949999599") — сразу оформляй!

Когда информация собрана, ОБЯЗАТЕЛЬНО напиши блок:
===ЗАКАЗ===
Товар: [название]
Количество: [кол-во]
Телефон: [номер]
Адрес: уточнит менеджер
===КОНЕЦ===

После блока напиши клиенту: "Заказ принят! Менеджер свяжется с вами для подтверждения. 😊"

ПРАВИЛА:
- Отвечай на языке клиента (русский, узбекский, таджикский)
- Будь кратким — 1-2 предложения максимум
- НЕ упоминай что ты бот/AI
- Если клиент просто здоровается — поприветствуй и спроси что хочет заказать
- Если спрашивает о продуктах — расскажи кратко и предложи заказать
- Если сомневается — предложи попробовать наш стартовый набор
"""


async def check_new_messages() -> list:
    """
    Проверяет новые входящие сообщения в Instagram DM через Messenger API.
    
    Uses: GET /{page_id}/conversations?platform=instagram
    Then:  GET /{conv_id}?fields=messages{message,from,created_time}
    
    Returns:
        Список новых сообщений с данными отправителя.
    """
    ig_account_id = getattr(settings, "instagram_account_id", "").strip("'\"")
    access_token = getattr(settings, "instagram_access_token", "").strip("'\"")
    page_id = getattr(settings, "facebook_page_id", "").strip("'\"")
    
    if not ig_account_id or not access_token or not page_id:
        logger.warning("Instagram Graph API не настроен. Невозможно проверить DM.")
        return []
    
    try:
        async with aiohttp.ClientSession() as session:
            # Получаем список бесед
            url = f"{GRAPH_BASE_URL}/{page_id}/conversations"
            params = {
                "platform": "instagram",
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                
                if "error" in data:
                    error = data["error"]
                    logger.error(
                        f"Ошибка получения DM (conversations): {error.get('message', data)}"
                    )
                    return []
                
                conversations = data.get("data", [])
                new_messages = []
                
                for conversation in conversations:
                    conv_id = conversation.get("id", "")
                    if not conv_id:
                        continue
                    
                    # Получаем сообщения для каждой беседы
                    msg_url = f"{GRAPH_BASE_URL}/{conv_id}"
                    msg_params = {
                        "fields": "messages{message,from,created_time}",
                        "access_token": access_token
                    }
                    async with session.get(msg_url, params=msg_params) as msg_resp:
                        msg_data = await msg_resp.json()
                        messages_data = msg_data.get("messages", {}).get("data", [])
                        
                        for msg in messages_data:
                            msg_id = msg.get("id", "")
                            
                            # Пропускаем уже обработанные сообщения
                            if msg_id in _processed_message_ids:
                                continue
                            
                            from_data = msg.get("from", {})
                            from_username = from_data.get("username", "")
                            from_id = from_data.get("id", "")
                            
                            # Пропускаем собственные сообщения
                            if from_username == "microgreenuzbekistan" or from_id == ig_account_id:
                                continue
                            
                            new_messages.append({
                                "conversation_id": conv_id,
                                "message_id": msg_id,
                                "text": msg.get("message", ""),
                                "from_name": from_username or "Пользователь",
                                "from_id": from_id,
                                "created_time": msg.get("created_time", ""),
                            })
                
                if new_messages:
                    logger.info(f"📨 Найдено {len(new_messages)} новых DM в Instagram.")
                
                return new_messages
    except Exception as e:
        logger.error(f"Ошибка при проверке DM: {e}", exc_info=True)
        return []


async def send_dm_reply(recipient_id: str, message: str) -> bool:
    """
    Отправляет ответное сообщение в Instagram DM через Messenger API.
    
    Args:
        recipient_id: IGSID пользователя
        message: Текст ответного сообщения
        
    Returns:
        True если сообщение успешно отправлено, False иначе
    """
    access_token = getattr(settings, "instagram_access_token", "").strip("'\"")
    page_id = getattr(settings, "facebook_page_id", "").strip("'\"")
    
    if not access_token or not page_id:
        logger.error("INSTAGRAM_ACCESS_TOKEN или FACEBOOK_PAGE_ID не установлен.")
        return False
        
    if not recipient_id:
        logger.error("Не указан recipient_id (IGSID) для отправки ответа.")
        return False
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{page_id}/messages"
            payload = {
                "recipient": {"id": recipient_id},
                "message": {"text": message},
                "messaging_type": "RESPONSE",
                "access_token": access_token,
            }
            async with session.post(url, json=payload) as resp:
                data = await resp.json()
                
                if "error" in data:
                    error = data["error"]
                    logger.error(
                        f"Ошибка отправки DM: {error.get('message', data)}"
                    )
                    return False
                
                logger.info(
                    f"✅ Ответ отправлен в DM (recipient: {recipient_id})"
                )
                return True
    except Exception as e:
        logger.error(f"Ошибка при отправке DM: {e}", exc_info=True)
        return False


def _get_conversation_history(igsid: str) -> List[Dict[str, str]]:
    """Получить историю диалога для клиента."""
    if igsid not in _conversation_histories:
        _conversation_histories[igsid] = []
    return _conversation_histories[igsid]


def _add_to_history(igsid: str, role: str, content: str):
    """Добавить сообщение в историю диалога."""
    history = _get_conversation_history(igsid)
    history.append({"role": role, "content": content})
    # Обрезаем историю если слишком длинная
    if len(history) > MAX_HISTORY_LENGTH:
        _conversation_histories[igsid] = history[-MAX_HISTORY_LENGTH:]


def _extract_order(reply_text: str) -> Optional[Dict]:
    """
    Извлекает данные заказа из ответа AI.
    Ищет блок ===ЗАКАЗ=== ... ===КОНЕЦ===
    """
    if "===ЗАКАЗ===" not in reply_text or "===КОНЕЦ===" not in reply_text:
        return None
    
    try:
        order_block = reply_text.split("===ЗАКАЗ===")[1].split("===КОНЕЦ===")[0].strip()
        order = {}
        for line in order_block.split("\n"):
            line = line.strip()
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip().lower()
                value = value.strip()
                if "товар" in key or "продукт" in key:
                    order["product"] = value
                elif "колич" in key:
                    order["quantity"] = value
                elif "телефон" in key or "номер" in key:
                    order["phone"] = value
                elif "адрес" in key:
                    order["address"] = value
                elif "сумм" in key:
                    order["total"] = value
        
        if order.get("product") and order.get("quantity"):
            return order
    except Exception as e:
        logger.error(f"Ошибка парсинга заказа: {e}")
    
    return None


async def _publish_order_to_stepan(order: Dict, from_name: str, from_id: str):
    """Публикуем оформленный заказ: отправляем в storefront API с локальным фолбеком."""
    order_number = None
    order_id = None
    total_amount = 0
    
    try:
        # 1. Создаём/находим клиента в БД
        from shared.database import get_session_ctx
        from sqlalchemy import text as sa_text
        
        async with get_session_ctx() as session:
            # Извлечем и нормализуем телефон
            phone = order.get("phone", "")
            import re
            norm_phone = None
            if phone:
                digits = re.sub(r'[^\d]', '', str(phone))
                if digits:
                    if len(digits) == 9:
                        norm_phone = f"+998{digits}"
                    elif len(digits) == 12 and digits.startswith("998"):
                        norm_phone = f"+{digits}"
                    else:
                        norm_phone = f"+{digits}" if not str(phone).startswith("+") else str(phone)
                        
            customer_id = None
            if norm_phone:
                res = await session.execute(sa_text(
                    "SELECT id FROM customers WHERE phone = :phone LIMIT 1"
                ), {"phone": norm_phone})
                row = res.fetchone()
                if row:
                    customer_id = row[0]
            
            if not customer_id:
                res = await session.execute(sa_text(
                    "SELECT id FROM customers WHERE name = :name LIMIT 1"
                ), {"name": from_name})
                row = res.fetchone()
                if row:
                    customer_id = row[0]
                    
            if customer_id:
                if norm_phone:
                    await session.execute(sa_text(
                        "UPDATE customers SET phone = COALESCE(phone, :phone) WHERE id = :cid"
                    ), {"phone": norm_phone, "cid": customer_id})
            else:
                res = await session.execute(sa_text(
                    "INSERT INTO customers (name, phone, status, notes, source, created_at) "
                    "VALUES (:name, :phone, 'active', 'Instagram DM', 'instagram', NOW()) RETURNING id"
                ), {"name": from_name, "phone": norm_phone or phone})
                customer_id = res.fetchone()[0]
            
            # Вычисляем сумму по каталогу
            product_name = order.get("product")
            quantity_str = order.get("quantity") or "1"
            
            # Извлечем цифры количества (например "2 шт" -> 2)
            qty_match = re.search(r'\d+', str(quantity_str))
            quantity = int(qty_match.group()) if qty_match else 1
            
            db_id = None
            storefront_id = None
            price = None
            if product_name:
                price_row = (await session.execute(sa_text(
                    "SELECT id, storefront_id, price FROM products WHERE is_active=true AND name_ru ILIKE :p LIMIT 1"
                ), {"p": f"%{product_name}%"})).fetchone()
                if price_row:
                    db_id = price_row[0]
                    storefront_id = price_row[1]
                    price = float(price_row[2])
                    total_amount = int(price * quantity)
                    
            # Пытаемся отправить заказ в реальный магазин
            storefront_success = False
            real_order_number = None
            
            if total_amount > 0:
                import aiohttp
                import os
                storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
                bot_secret = os.getenv("BOT_SECRET", "")
                
                payload = {
                    "name": from_name,
                    "phone": norm_phone or phone or "нет телефона",
                    "address": order.get("address", "") or "Самарканд",
                    "items": [
                        {
                            "productId": storefront_id or str(db_id),
                            "price": int(price),
                            "quantity": int(quantity)
                        }
                    ],
                    "paymentMethod": "cash",
                    "telegramId": None
                }
                try:
                    async with aiohttp.ClientSession() as http_sess:
                        async with http_sess.post(
                            f"{storefront_url}/orders",
                            json=payload,
                            headers={"x-bot-secret": bot_secret, "Content-Type": "application/json"},
                            timeout=10
                        ) as response:
                            if response.status in (200, 201):
                                resp_data = await response.json()
                                order_data = resp_data.get("order", {})
                                real_order_number = order_data.get("orderNumber") or order_data.get("order_number")
                                if real_order_number:
                                    storefront_success = True
                except Exception as e:
                    logger.error(f"Failed to post order to storefront in instagram_dm: {e}")
                    
            if storefront_success:
                order_number = real_order_number
                order["total"] = f"{total_amount} UZS"
                
                # Ищем ID зеркалированного заказа в локальной БД (поскольку notifyOffice происходит при создании заказа)
                try:
                    res_local = await session.execute(sa_text(
                        "SELECT id FROM orders WHERE order_number = :onum LIMIT 1"
                    ), {"onum": order_number})
                    row_local = res_local.fetchone()
                    if row_local:
                        order_id = row_local[0]
                except Exception:
                    pass
                
                logger.info(f"📦 Заказ {order_number} (ID: {order_id}) успешно оформлен в реальном магазине для {from_name}")
            else:
                # Фолбек на локальный черновик/зеркало
                from shared.order_utils import generate_order_number
                order_num = await generate_order_number()
                
                order_notes = f"Instagram DM от {from_name}. Товар: {product_name} x {quantity_str}. Тел: {phone}"
                if price is None:
                    total_amount = 0
                    order_notes = "[СУММУ УТОЧНИТЬ] " + order_notes
                
                order["total"] = f"{total_amount} UZS" if total_amount > 0 else "уточнить (СУММУ УТОЧНИТЬ)"
                
                res = await session.execute(sa_text(
                    "INSERT INTO orders (customer_id, order_number, total_amount, status, "
                    "payment_status, delivery_address, notes, created_at, updated_at) "
                    "VALUES (:cid, :onum, :total, 'new', 'pending', :addr, :notes, NOW(), NOW()) "
                    "RETURNING id"
                ), {
                    "cid": customer_id,
                    "onum": order_num,
                    "total": total_amount,
                    "addr": order.get("address", ""),
                    "notes": order_notes[:200],
                })
                order_row = res.fetchone()
                order_id = order_row[0] if order_row else None
                order_number = order_num
                await session.commit()
                
                logger.info(f"📦 Магазин недоступен, локальный черновик заказа {order_number} (ID: {order_id}) создан в БД для {from_name}")
    except Exception as db_err:
        logger.error(f"Ошибка создания заказа в БД: {db_err}")
    
    # 3. Публикуем событие для Степана
    try:
        from shared.event_bus import event_bus, Events
        await event_bus.publish(
            Events.ORDER_CREATED,
            {
                "source": "instagram_dm",
                "customer_name": from_name,
                "customer_ig_id": from_id,
                "product": order.get("product", ""),
                "quantity": order.get("quantity", ""),
                "phone": order.get("phone", ""),
                "address": order.get("address", ""),
                "total": order.get("total", ""),
                "total_amount": total_amount,
                "order_number": order_number or "IG-???",
                "order_id": order_id,
                "timestamp": datetime.now().isoformat(),
            },
            "support_bot"
        )
        logger.info(f"📦 Заказ {order_number} от {from_name} передан Степану (от Support Bot)!")
    except Exception as e:
        logger.error(f"Ошибка публикации заказа в event bus: {e}")


async def _notify_admin_telegram(from_name: str, msg_text: str, reply_text: str, order: Optional[Dict] = None):
    """Отправляем уведомление о заказе в группу Продажа."""
    if not order:
        return  # Обычные сообщения не пересылаем
    
    try:
        from aiogram import Bot as _Bot
        from aiogram.client.default import DefaultBotProperties as _DBP
        from aiogram.enums import ParseMode as _PM
        
        # Определяем куда отправлять: группа Продажа или админ
        sales_group = getattr(settings, 'sales_group_id', 0)
        target_id = sales_group if sales_group else (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        
        if not target_id:
            return
        
        _tg_bot = _Bot(token=settings.stepan_bot_token, default=_DBP(parse_mode=_PM.HTML))
        
        text = (
            f"📦 <b>НОВЫЙ ЗАКАЗ из Instagram</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"👤 Клиент: <b>{from_name}</b>\n"
            f"🛒 Товар: <b>{order.get('product', '?')}</b>\n"
            f"📊 Количество: <b>{order.get('quantity', '?')}</b>\n"
            f"📱 Телефон: <b>{order.get('phone', '?')}</b>\n"
            f"💰 Сумма: <b>{order.get('total', '?')}</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"⏳ Статус: ожидает обработки"
        )
        
        await _tg_bot.send_message(target_id, text)
        await _tg_bot.session.close()
        logger.info(f"📨 Заказ от {from_name} отправлен в группу Продажа")
    except Exception as tg_err:
        logger.error(f"Не удалось отправить уведомление: {tg_err}")


async def auto_reply_to_new_messages():
    """
    Автоматически проверяет новые DM и ведёт диалог с клиентом.
    
    Защита от дублей:
    - Только сообщения за последние 10 минут
    - Группировка по отправителю
    - ID помечаются ДО ответа
    - Блокировка параллельных запусков
    """
    global _is_processing
    
    # Блокировка параллельных запусков
    if _is_processing:
        logger.debug("Instagram DM: уже обрабатывается, пропускаю...")
        return
    _is_processing = True
    
    try:
        new_messages = await check_new_messages()
        
        if not new_messages:
            return
        
        # Фильтр: только сообщения за последние 10 минут
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent_messages = []
        for msg in new_messages:
            created_str = msg.get("created_time", "")
            if created_str:
                try:
                    created = datetime.fromisoformat(created_str.replace("+0000", "+00:00"))
                    if created < cutoff:
                        _processed_message_ids.add(msg.get("message_id", ""))
                        continue
                except (ValueError, TypeError):
                    pass
            recent_messages.append(msg)
        
        if not recent_messages:
            return
        
        # Группируем сообщения по отправителю (чтобы не отвечать дважды)
        grouped: Dict[str, list] = {}
        for msg in recent_messages:
            from_id = msg.get("from_id", "")
            if from_id not in grouped:
                grouped[from_id] = []
            grouped[from_id].append(msg)
        
        ai = AIEngine()
        
        for from_id, msgs in grouped.items():
            try:
                # Помечаем ВСЕ ID как обработанные СРАЗУ (чтобы следующий цикл не подхватил)
                for m in msgs:
                    _processed_message_ids.add(m.get("message_id", ""))
                
                # Берём данные из последнего сообщения
                last_msg = msgs[-1]
                from_name = last_msg.get("from_name", "Пользователь")
                conv_id = last_msg.get("conversation_id", "")
                
                # Объединяем все тексты от этого клиента
                all_texts = [m.get("text", "").strip() for m in msgs if m.get("text", "").strip()]
                if not all_texts:
                    continue
                combined_text = "\n".join(all_texts)
                
                logger.info(f"📩 DM от {from_name} ({len(msgs)} сообщ.): {combined_text[:80]}...")
                
                # Добавляем сообщение клиента в историю
                _add_to_history(from_id, "user", combined_text)
                
                # Получаем полную историю для AI
                history = _get_conversation_history(from_id)
                
                # Генерируем ответ через AI с историей диалога
                reply_text = await ai.chat_completion(
                    system_prompt=IG_SALES_SYSTEM_PROMPT,
                    user_message="",  # Пусто, т.к. последнее сообщение уже в history
                    conversation_history=history,
                    temperature=0.6,
                    max_tokens=500,
                )
                
                # Проверяем, не содержит ли ответ оформленный заказ
                order = _extract_order(reply_text)
                
                # Убираем блок заказа из текста ответа клиенту
                reply_for_customer = reply_text
                if "===ЗАКАЗ===" in reply_for_customer:
                    reply_for_customer = reply_for_customer.split("===ЗАКАЗ===")[0].strip()
                    if "===КОНЕЦ===" in reply_text:
                        after = reply_text.split("===КОНЕЦ===")[1].strip()
                        if after:
                            reply_for_customer += "\n" + after
                
                if not reply_for_customer:
                    reply_for_customer = "Заказ оформлен! Наш менеджер свяжется с вами для подтверждения. 😊"
                
                # Отправляем ОДИН ответ клиенту
                success = await send_dm_reply(from_id, reply_for_customer)
                
                if success:
                    logger.info(f"✅ Автоответ отправлен {from_name}: {reply_for_customer[:60]}...")
                    _add_to_history(from_id, "assistant", reply_for_customer)
                else:
                    logger.warning(f"⚠️ Не удалось отправить автоответ {from_name}.")
                
                # Если заказ оформлен — передаём Степану и уведомляем
                if order:
                    await _publish_order_to_stepan(order, from_name, from_id)
                    await _notify_admin_telegram(from_name, combined_text, reply_for_customer, order=order)
                    logger.info(f"📦 Заказ от {from_name} оформлен и передан!")
                    
                    # НЕ публикуем IG_DM_RECEIVED: заказ уже полностью обработан выше
                    # (_publish_order_to_stepan создал заказ в БД, отправил ORDER_CREATED
                    # в Finance/PM/Analytics и уведомил группу продаж). Раньше публикация
                    # здесь приводила к тому, что Степан по IG_DM_RECEIVED создавал заказ
                    # ПОВТОРНО — задвоение дохода, задач и уведомлений.
                
            except Exception as e:
                logger.error(f"Ошибка обработки DM от {from_id}: {e}", exc_info=True)
        
        logger.info(
            f"📬 Обработано {len(recent_messages)} DM от {len(grouped)} клиентов. "
            f"Всего обработано: {len(_processed_message_ids)}."
        )
    finally:
        _is_processing = False


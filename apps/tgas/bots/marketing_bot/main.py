"""Marketing Bot — main.py с EventBus интеграцией"""
import asyncio, logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from bots.marketing_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.marketing_bot.handlers.campaigns import ai_mkt
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from shared.ai_engine import AIEngine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)

# ── Планировщик ──────────────────────────────────────────────────────────
scheduler = BotScheduler("marketing_bot")


async def _get_bot():
    return Bot(token=settings.marketing_bot_token,
               default=DefaultBotProperties(parse_mode=ParseMode.HTML))


async def churn_detection():
    """Ежедневно 12:00 — обнаружение оттока клиентов."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "UPDATE customers SET status = 'churned' "
                "WHERE last_order_date < NOW() - INTERVAL '21 days' "
                "AND status != 'churned' "
                "RETURNING id"
            ))
            churned = result.fetchall()
            count = len(churned)
        if count > 0:
            await bot.send_message(admin_id,
                f"⚠️ <b>Обнаружен отток клиентов</b>\n\n"
                f"🔴 {count} клиент(ов) переведены в статус <b>churned</b>\n"
                f"(без заказов более 21 дня)",
                parse_mode="HTML")
        else:
            await bot.send_message(admin_id,
                "✅ Отток: все клиенты активны, новых churned нет.",
                parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"churn_detection error: {e}", exc_info=True)


async def welcome_series_check():
    """Каждые 2ч — проверка новых лидов без заказов."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(text(
                "SELECT COUNT(*) FROM customers "
                "WHERE created_at > NOW() - INTERVAL '7 days' "
                "AND orders_count = 0"
            ))
            count = result.scalar() or 0
        if count > 0:
            await bot.send_message(admin_id,
                f"🆕 {count} новых лидов без заказов — "
                f"рекомендуется welcome-кампания",
                parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"welcome_series_check error: {e}", exc_info=True)


async def campaign_ideas():
    """Понедельник 9:00 — AI генерирует 3 маркетинговые идеи на неделю."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        ai = AIEngine()
        prompt = (
            "Сгенерируй 3 маркетинговые идеи на эту неделю для компании "
            "по продаже микрозелени в Узбекистане. "
            "Учитывай сезонность, B2B (HoReCa) и B2C сегменты. "
            "Формат: номер, название идеи, краткое описание (2-3 предложения)."
        )
        ideas = await ai.chat_completion(
            "Ты креативный маркетолог компании микрозелени в Узбекистане.",
            prompt
        )
        await bot.send_message(admin_id,
            f"💡 <b>Маркетинговые идеи на неделю:</b>\n\n{ideas}",
            parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"campaign_ideas error: {e}", exc_info=True)


async def audience_report():
    """Воскресенье 20:00 — отчёт по аудитории."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            total = (await session.execute(text(
                "SELECT COUNT(*) FROM customers"))).scalar() or 0
            b2b = (await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE segment = 'b2b'"))).scalar() or 0
            b2c = (await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE segment = 'b2c'"))).scalar() or 0
            active = (await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE status = 'active'"))).scalar() or 0
            vip = (await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE segment = 'vip'"))).scalar() or 0
            churned = (await session.execute(text(
                "SELECT COUNT(*) FROM customers WHERE status = 'churned'"))).scalar() or 0
        report = (
            f"📊 <b>Аудитория — еженедельный отчёт</b>\n\n"
            f"👥 Всего клиентов: <b>{total}</b>\n"
            f"🏢 B2B: <b>{b2b}</b>\n"
            f"🛒 B2C: <b>{b2c}</b>\n"
            f"✅ Активных: <b>{active}</b>\n"
            f"⭐ VIP: <b>{vip}</b>\n"
            f"🔴 Churned: <b>{churned}</b>"
        )
        await bot.send_message(admin_id, report, parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logging.error(f"audience_report error: {e}", exc_info=True)


# Регистрация задач
scheduler.add_cron(name="churn_detection", func=churn_detection, hour=12, minute=0)
scheduler.add_interval(name="welcome_series_check", func=welcome_series_check, seconds=7200)
scheduler.add_cron(name="campaign_ideas", func=campaign_ideas, hour=9, minute=0, day_of_week=0)
scheduler.add_cron(name="audience_report", func=audience_report, hour=20, minute=0, day_of_week=6)


# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════

async def bus_send_broadcast(params: dict) -> dict:
    """Реальная рассылка по базе клиентов Telegram."""
    target = params.get("target", "all").lower()
    message_text = params.get("message", "")
    
    if not message_text:
        return {"status": "error", "message": "Текст рассылки пуст."}

    from shared.database import get_session_ctx
    from sqlalchemy import text
    
    try:
        async with get_session_ctx() as session:
            query = "SELECT telegram_id FROM customers WHERE telegram_id IS NOT NULL"
            if target == "b2b":
                query += " AND customer_type = 'b2b'"
            elif target == "b2c":
                query += " AND customer_type = 'b2c'"
            elif target == "vip":
                query += " AND status = 'vip'"
                
            res = await session.execute(text(query))
            user_ids = [row[0] for row in res.fetchall()]
    except Exception as e:
        logging.error(f"Error fetching users for broadcast: {e}")
        return {"status": "error", "message": "Ошибка БД при выборке аудитории"}

    if not user_ids:
        return {"status": "error", "message": f"Не найдено клиентов для таргета: {target}"}

    bot = await _get_bot()
    success_count = 0
    fail_count = 0
    
    # Отправляем в фоне, чтобы не блокировать шину
    async def send_loop():
        nonlocal success_count, fail_count
        for uid in user_ids:
            try:
                await bot.send_message(uid, message_text, parse_mode="HTML")
                success_count += 1
            except Exception:
                fail_count += 1
            await asyncio.sleep(0.05)  # Защита от спам-лимитов Telegram (не более 30 в сек)
        
        # Отчет админу по завершении
        admin_id = settings.admin_telegram_ids[0]
        report = (
            f"📢 <b>Рассылка завершена</b>\n"
            f"Аудитория: {target}\n"
            f"Успешно: {success_count}\n"
            f"Ошибок: {fail_count}"
        )
        try:
            await bot.send_message(admin_id, report, parse_mode="HTML")
        except:
            pass
        await bot.session.close()

    asyncio.create_task(send_loop())

    return {
        "status": "ok",
        "message": f"Запущена рассылка на {len(user_ids)} человек (Таргет: {target}).",
        "data": {"target": target, "count": len(user_ids)}
    }

async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "marketing":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return
    
    bot = Bot(token=settings.marketing_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()
        from shared.prompts import TEAM_CONTEXT
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Директор по Маркетингу (CMO) и Marketing Bot. Твой фокус: CAC, LTV, Churn Rate, омниканальные стратегии. Предлагай нестандартные маркетинговые ходы для B2B и B2C, анализируй сегменты аудитории."
        user_prompt = f"Руководитель поручил задачу по маркетингу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\nРазработай Action Plan, рекламную кампанию или аналитику."
        logging.info(f"MARKETING BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt)
        
        logging.info(f"MARKETING BOT sending message to {chat_id}")
        await bot.send_message(chat_id, f"📝 <b>Результат от отдела MARKETING:</b>\n\n{answer}")
        logging.info(f"MARKETING BOT successfully sent message.")
        
        if task_id:
            from shared.event_bus import event_bus
            await event_bus.publish("TASK_COMPLETED", {
                "task_id": task_id,
                "completed_by": "marketing", "chat_id": chat_id
            }, "marketing_bot")
            
    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def handle_ig_message(payload: dict):
    data = payload.get("data", {})
    sender_id = data.get("sender_id")
    text_content = data.get("text", "")
    if not sender_id or not text_content:
        return
        
    logging.info(f"MARKETING BOT handling IG message from {sender_id}: {text_content}")
    
    from shared.database import get_session_ctx
    from sqlalchemy import text
    from shared.ai_engine import AIEngine
    from shared.instagram import send_ig_message
    from shared.event_bus import event_bus
    import json
    import re
    
    # 1. Сохраняем входящее сообщение
    try:
        async with get_session_ctx() as session:
            await session.execute(text(
                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                "VALUES ((SELECT id FROM customers LIMIT 1), 'instagram', 'inquiry', 'marketing_bot', :s, NOW())"
            ), {"s": f"IG Message from {sender_id}: {text_content}"})
    except Exception as e:
        logging.error(f"Error saving IG message: {e}")

    # 2. Генерируем ответ и классифицируем заказ через ИИ
    try:
        ai = AIEngine()
        system_prompt = (
            "Ты дружелюбный менеджер Microgreen Uzbekistan. Общаешься с клиентом в Direct (Instagram).\n"
            "Тебе нужно сделать 2 вещи:\n"
            "1. Ответить клиенту коротко, живо, с эмодзи (на русском или узбекском).\n"
            "2. Если клиент четко хочет сделать ЗАКАЗ (пишет 'хочу заказать', 'доставьте мне', 'заказ на'), "
            "извлечь детали заказа: товар, количество, телефон, адрес (если не указано, пиши 'не указан').\n\n"
            "ТВОЙ ОТВЕТ ДОЛЖЕН БЫТЬ СТРОГО В ФОРМАТЕ JSON:\n"
            "{\n"
            '  "reply_text": "твой ответ клиенту",\n'
            '  "is_order": true/false,\n'
            '  "product": "что заказывает",\n'
            '  "quantity": 1,\n'
            '  "phone": "+998...",\n'
            '  "address": "адрес",\n'
            '  "total_amount": 50000\n'
            "}"
        )
        
        json_resp = await ai.chat_completion(system_prompt=system_prompt, user_message=text_content)
        
        # Очистка JSON-ответа (иногда ИИ оборачивает в ```json ... ```)
        json_resp = re.sub(r'```json\n?|```', '', json_resp).strip()
        
        parsed = {}
        try:
            parsed = json.loads(json_resp)
        except json.JSONDecodeError:
            # Fallback, если ИИ вернул просто текст вместо JSON
            parsed = {"reply_text": json_resp, "is_order": False}
            
        reply_text = parsed.get("reply_text", "")
        is_order = parsed.get("is_order", False)
        
        # 3. Отправляем ответ в Instagram
        if reply_text:
            logging.info(f"Generated AI reply for {sender_id}: {reply_text[:100]}")
            success = await send_ig_message(sender_id, reply_text)
            if success:
                logging.info("AI reply successfully sent to Instagram.")
            else:
                logging.error("Failed to send AI reply to Instagram.")
                
        # 4. Если это заказ, публикуем событие ig_dm_received для Степана!
        if is_order:
            order_data = {
                "product": parsed.get("product", "Микрозелень"),
                "quantity": parsed.get("quantity", 1),
                "phone": parsed.get("phone", "Не указан"),
                "address": parsed.get("address", "Не указан"),
                "total": parsed.get("total_amount", 50000)
            }
            logging.info(f"MARKETING BOT: Заказ обнаружен! Делегируем Степану: {order_data}")
            
            await event_bus.publish("ig_dm_received", {
                "text": text_content,
                "from_name": f"IG Client {sender_id}",
                "order": order_data
            }, "marketing_bot")
            
    except Exception as e:
        logging.error(f"Error generating/sending AI reply: {e}", exc_info=True)

async def b2b_outreach():
    """Ежедневная B2B-рассылка: ровно N (B2B_DAILY_LIMIT) свежих ресторанов-лидов.

    Мультиканально:
      • есть email  → КП с PDF на почту (interaction channel='email');
      • нет email, но есть телефон → задача отделу Sales на обзвон
        (TASK_CREATED department='sales', channel='phone_task');
      • нет ни email, ни телефона → пропускаем (не помечаем, ждём обогащения).

    Приоритет — рестораны с лучшим рейтингом (review_score DESC).
    Персонализация КП использует отзывы (review_summary).
    """
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine
        from shared.pdf_generator import generate_commercial_offer_pdf
        from shared.email_sender import send_b2b_offer_email
        from shared.event_bus import event_bus
        import os

        limit = settings.b2b_daily_limit
        admin_id = settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        sent_email = sent_phone = 0

        async with get_session_ctx() as session:
            # Свежие B2B-лиды, которым ещё не отправляли КП. Лучшие по рейтингу — первыми.
            res = await session.execute(text(
                "SELECT id, name, company_name, email, phone, review_summary, address "
                "FROM customers "
                "WHERE customer_type = 'b2b' AND status = 'lead' "
                "AND NOT EXISTS (SELECT 1 FROM interactions i "
                "                WHERE i.customer_id = customers.id AND i.interaction_type = 'b2b_offer_sent') "
                "ORDER BY review_score DESC NULLS LAST, created_at ASC "
                "LIMIT :lim"
            ), {"lim": limit})
            leads = res.fetchall()

            if not leads:
                logging.info("b2b_outreach: свежих B2B-лидов нет.")
                return

            ai = AIEngine()
            res_prices = await session.execute(text("SELECT name_ru, price FROM products WHERE is_active = true LIMIT 5"))
            products = [{"name": r[0], "price": f"{r[1]} сум"} for r in res_prices.fetchall()]

            for cid, name, company, email, phone, review_summary, address in leads:
                chef_name = name or "Шеф-повар"
                comp_name = company or "Ресторан"
                review_hint = f"\nИзвестное о заведении: {review_summary}." if review_summary else ""

                # ── Канал 1: EMAIL ──
                if email:
                    logging.info(f"B2B email → {comp_name} ({email})")
                    prompt = (
                        f"Напиши профессиональный и продающий текст Коммерческого предложения "
                        f"от Microgreen Uzbekistan. Адресат: {chef_name}, ресторан: {comp_name}. "
                        f"Расскажи о пользе микрозелени для подачи и вкуса блюд.{review_hint} "
                        f"2-3 абзаца, тёплый деловой тон."
                    )
                    ai_text = await ai.chat_completion(system_prompt="Ты эксперт по B2B продажам HoReCa.", user_message=prompt)
                    pdf_path = generate_commercial_offer_pdf(
                        client_name=comp_name, ai_text=ai_text, prices=products,
                        output_filename=f"КП_Microgreen_{cid}.pdf",
                    )
                    subject = f"Свежая микрозелень для {comp_name} от Microgreen Uzbekistan"
                    email_text = (
                        f"Здравствуйте, {chef_name}!\n\nНаправляем коммерческое предложение "
                        f"с нашими ценами. Будем рады сотрудничеству!\n\n"
                        f"С уважением, ИИ-менеджер Microgreen Uzbekistan."
                    )
                    ok = await send_b2b_offer_email(email, subject, email_text, pdf_path)
                    if ok:
                        await session.execute(text(
                            "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                            "VALUES (:cid, 'email', 'b2b_offer_sent', 'marketing_bot', 'КП отправлено на email', NOW())"
                        ), {"cid": cid})
                        await session.commit()
                        sent_email += 1
                        await event_bus.publish("b2b_outreach_completed",
                                                {"company": comp_name, "channel": "email", "status": "success"}, "marketing_bot")
                    try:
                        os.remove(pdf_path)
                    except Exception:
                        pass

                # ── Канал 2: ТЕЛЕФОН → задача Sales на обзвон ──
                elif phone:
                    logging.info(f"B2B phone task → {comp_name} ({phone})")
                    title = f"Обзвонить ресторан: {comp_name}"
                    desc = (
                        f"Холодный B2B-контакт. Ресторан: {comp_name}. Тел: {phone}. "
                        f"Адрес: {address or '—'}.{review_hint} "
                        f"Цель: предложить свежую микрозелень/салаты, договориться о пробной поставке."
                    )
                    res_t = await session.execute(text(
                        "INSERT INTO tasks (title, description, department, status, priority, created_at) "
                        "VALUES (:t, :d, 'sales', 'todo', 'high', NOW()) RETURNING id"
                    ), {"t": title, "d": desc})
                    task_id = res_t.scalar()
                    await session.execute(text(
                        "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                        "VALUES (:cid, 'phone_task', 'b2b_offer_sent', 'marketing_bot', :s, NOW())"
                    ), {"cid": cid, "s": f"Создана задача обзвона #{task_id}"})
                    await session.commit()
                    sent_phone += 1
                    if admin_id:
                        await event_bus.publish("TASK_CREATED", {
                            "task_id": task_id, "title": title, "description": desc,
                            "department": "sales", "chat_id": admin_id, "priority": "high",
                        }, "marketing_bot")

                # ── Нет канала — пропускаем без пометки (обработаем после обогащения) ──
                else:
                    logging.info(f"B2B пропуск (нет email/телефона): {comp_name}")

        logging.info("b2b_outreach: email=%d, обзвон=%d (лимит %d)", sent_email, sent_phone, limit)
        if admin_id and (sent_email or sent_phone):
            try:
                from aiogram import Bot
                from aiogram.client.default import DefaultBotProperties
                from aiogram.enums import ParseMode
                b = Bot(token=settings.marketing_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
                try:
                    await b.send_message(admin_id,
                        f"📣 <b>B2B-рассылка за сегодня:</b>\n"
                        f"📧 КП на email: {sent_email}\n"
                        f"📞 Задач на обзвон: {sent_phone}")
                finally:
                    await b.session.close()
            except Exception:
                pass

    except Exception as e:
        logging.error(f"b2b_outreach error: {e}", exc_info=True)


async def collect_leads_nightly():
    """Ночной сбор новых ресторанов из 2ГИС в лид-базу (no-op без DGIS_API_KEY)."""
    try:
        from shared.lead_gen import collect_and_import_2gis
        result = await collect_and_import_2gis()
        logging.info("collect_leads_nightly: +%d новых лидов, %d дублей",
                     result["inserted"], result["skipped"])
    except Exception as e:
        logging.error(f"collect_leads_nightly error: {e}", exc_info=True)


async def main():
    await init_db()
    bot = Bot(token=settings.marketing_bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    for r in all_routers:
        dp.include_router(r)

    bot_info = await bot.me()
    group_router = create_group_router(bot_info.username, ai_mkt)
    dp.include_router(group_router)

    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    # Входящие IG DM marketing обрабатывает своим поллингом и публикует 'ig_dm_received'
    # (его слушает Степан). Подписки на несуществующее 'IG_MESSAGE_RECEIVED' больше нет.
    # B2B-лиды идут через TASK_CREATED(dept=sales), отдельного b2b_lead_created нет.
    await event_bus.start_listening(8086)

    # Запуск планировщика и heartbeat
    # Ночью собираем новых лидов (2ГИС), утром рассылаем КП по свежим 15.
    scheduler.add_cron(name="collect_leads_nightly", func=collect_leads_nightly, hour=3, minute=0)
    scheduler.add_cron(name="b2b_outreach", func=b2b_outreach, hour=10, minute=0)
    await scheduler.start()
    asyncio.create_task(start_heartbeat("marketing_bot"))

    async def followups_worker(bot: Bot):
        """Фоновый воркер для проверки таблицы followups и рассылки уведомлений."""
        from shared.database import get_session_ctx
        from sqlalchemy import text
        while True:
            try:
                async with get_session_ctx() as session:
                    res = await session.execute(text(
                        "SELECT f.id, c.telegram_id, f.message FROM followups f "
                        "JOIN customers c ON f.customer_id = c.id "
                        "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() AND c.telegram_id IS NOT NULL"
                    ))
                    rows = res.fetchall()
                    for row in rows:
                        fid, tid, msg = row
                        try:
                            await bot.send_message(tid, f"🔔 <b>Напоминание от Microgreen Uzbekistan:</b>\n\n{msg}", parse_mode="HTML")
                            await session.execute(text("UPDATE followups SET status='sent' WHERE id=:id"), {"id": fid})
                            logging.info(f"Sent followup {fid} to {tid}")
                        except Exception as e:
                            logging.error(f"Failed to send followup {fid}: {e}")
                    if rows:
                        await session.commit()
            except Exception as e:
                logging.error(f"Followups worker error: {e}")
            await asyncio.sleep(60)

    asyncio.create_task(followups_worker(bot))

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    asyncio.create_task(bus_listen("marketing_bot", {
        "send_broadcast": bus_send_broadcast,
    }))

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(main())

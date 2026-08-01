import logging
import asyncio
from sqlalchemy import text
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def _get_bot() -> Bot:
    return Bot(
        token=settings.marketing_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

async def bus_send_broadcast(params: dict) -> dict:
    """Реальная рассылка по базе клиентов Telegram."""
    target = params.get("target", "all").lower()
    message_text = params.get("message", "")

    if not message_text:
        return {"status": "error", "message": "Текст рассылки пуст."}

    try:
        async with get_session_ctx() as session:
            query = "SELECT telegram_id FROM customers WHERE telegram_id IS NOT NULL AND COALESCE(status, '') NOT IN ('unsubscribed', 'blocked', 'do_not_contact')"
            if target == "b2b":
                query += " AND customer_type = 'b2b'"
            elif target == "b2c":
                query += " AND customer_type = 'b2c'"
            elif target == "vip":
                query += " AND status = 'vip'"

            res = await session.execute(text(query))
            user_ids = [row[0] for row in res.fetchall()]
    except Exception as e:
        logger.error(f"Error fetching users for broadcast: {e}")
        return {"status": "error", "message": "Ошибка БД при выборке аудитории"}

    if not user_ids:
        return {
            "status": "error",
            "message": f"Не найдено клиентов для таргета: {target}",
        }

    bot = await _get_bot()
    success_count = 0
    fail_count = 0

    logger.warning("BROADCAST: %d получателей, target=%s", len(user_ids), target)

    async def send_loop() -> None:
        nonlocal success_count, fail_count
        for uid in user_ids:
            try:
                await bot.send_message(uid, message_text, parse_mode="HTML")
                success_count += 1
            except Exception:
                fail_count += 1
            await asyncio.sleep(0.05)

        admin_id = settings.admin_telegram_ids[0]
        report = (
            f"📢 <b>Рассылка завершена</b>\n"
            f"Аудитория: {target}\n"
            f"Успешно: {success_count}\n"
            f"Ошибок: {fail_count}"
        )
        try:
            await bot.send_message(admin_id, report, parse_mode="HTML")
            from shared.feedback_loop import feedback_loop

            await feedback_loop.evaluate_and_adapt(
                bot="marketing_bot",
                metric="broadcast_conversion",
                current_data={
                    "target": target,
                    "success_count": success_count,
                    "fail_count": fail_count,
                },
                benchmark_data={"min_success_rate": 0.90},
            )
        except Exception as fe:
            logger.warning(f"Marketing feedback loop error: {fe}")
        await bot.session.close()

    asyncio.create_task(send_loop())

    return {
        "status": "ok",
        "message": f"Запущена рассылка на {len(user_ids)} человек (Таргет: {target}).",
        "data": {"target": target, "count": len(user_ids)},
    }

async def handle_task_created(payload: dict) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "marketing":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    bot = await _get_bot()
    try:
        from shared.ai_engine import AIEngine
        from shared.prompts import TEAM_CONTEXT
        from shared.task_ui import get_task_keyboard

        ai = AIEngine()
        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Директор по Маркетингу (CMO) и Marketing Bot. Твой фокус: CAC, LTV, Churn Rate, омниканальные стратегии. Предлагай нестандартные маркетинговые ходы для B2B и B2C, анализируй сегменты аудитории."
        user_prompt = f"Руководитель поручил задачу по маркетингу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\n\nОтветь как ЖИВОЙ сотрудник, а не пиши стену анализа: коротко подтверди, что берёшь задачу в работу, дай суть по делу и первый конкретный шаг. Максимум 4–5 предложений, без длинных списков и без markdown-заголовков."
        logger.info("MARKETING BOT Generating AI answer...")
        answer = await ai.chat_completion(
            sys_prompt, user_prompt, max_tokens=350, effort="medium"
        )

        logger.info(f"MARKETING BOT sending message to {chat_id}")
        await bot.send_message(
            chat_id,
            f"✅ <b>Отдел маркетинга — принял в работу:</b>\n\n{answer}",
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
        logger.info("MARKETING BOT successfully sent message.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

async def bus_b2b_outreach(params: dict) -> dict:
    try:
        from bots.marketing_bot.handlers.b2b import b2b_outreach
        await b2b_outreach()
        limit = settings.b2b_daily_limit
        return {
            "status": "ok",
            "message": f"Подготовлены КП для B2B-лидов (до {limit} шт.) — "
            f"ждут вашего одобрения",
        }
    except Exception as e:
        logger.error(f"bus_b2b_outreach error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def bus_trigger_lead_audit(params: dict) -> dict:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT LOWER(COALESCE(status, 'unknown')) AS st, COUNT(*) "
                    "FROM customers WHERE customer_type = 'b2b' GROUP BY st"
                )
            )
            by_status = {row[0]: row[1] for row in res.fetchall()}

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE customer_type = 'b2b' AND created_at >= NOW() - INTERVAL '7 days'"
                )
            )
            fresh_week = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                    "WHERE interaction_type = 'b2b_offer_sent' "
                    "AND created_at >= NOW() - INTERVAL '7 days'"
                )
            )
            contacted_week = res.scalar() or 0

        total = sum(by_status.values())
        leads = by_status.get("lead", 0)
        converted = total - leads
        conversion = round(converted / total * 100, 1) if total else 0.0

        lines = [
            "📊 <b>Аудит B2B-воронки</b>",
            f"Всего компаний в базе: {total}",
            f"Из них ещё лиды: {leads}",
            f"Квалифицированы/клиенты: {converted} ({conversion}%)",
            f"Новых за 7 дней: +{fresh_week}",
            f"Контактов за 7 дней: {contacted_week}",
        ]
        summary = "\n".join(lines)

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id:
            bot = await _get_bot()
            try:
                await bot.send_message(admin_id, summary, parse_mode="HTML")
            finally:
                await bot.session.close()

        try:
            from shared.feedback_loop import feedback_loop
            await feedback_loop.record_measurement(
                bot="marketing_bot",
                metric="lead_conversion",
                value=conversion,
                target=20.0,
                context={"total": total, "leads": leads, "fresh_week": fresh_week},
            )
        except Exception as fe:
            logger.warning(f"lead audit feedback error: {fe}")

        return {
            "status": "ok",
            "message": summary,
            "conversion_pct": conversion,
            "total": total,
            "fresh_week": fresh_week,
        }
    except Exception as e:
        logger.error(f"bus_trigger_lead_audit error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def bus_collect_leads(params: dict) -> dict:
    try:
        from shared.lead_gen import collect_and_import_all
        limit = params.get("limit")
        result = await collect_and_import_all(limit=int(limit) if limit else None)
        return {
            "status": "ok",
            "message": f"Собрано лидов: +{result['inserted']} новых, "
            f"{result['skipped']} дублей пропущено",
        }
    except Exception as e:
        logger.error(f"bus_collect_leads error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

async def get_pick_restaurant(params: dict) -> str:
    """Выбор 'Ресторана недели' для журнала."""
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT name, review_score, review_summary "
                    "FROM customers "
                    "WHERE customer_type = 'b2b' AND review_score >= 4.5 "
                    "ORDER BY random() LIMIT 1"
                )
            )
            row = res.fetchone()

        if not row:
            return "Не удалось найти подходящий ресторан в базе лидов."

        name, score, summary = row
        return f"Ресторан недели: {name} (Рейтинг {score} ⭐)\n\nОтзывы:\n{summary}"
    except Exception as e:
        logger.error(f"Error picking restaurant: {e}")
        return "Ошибка выбора ресторана"

async def handle_magazine_published(payload: dict) -> None:
    """Обрабатывает публикацию журнала и делает пост в Telegram-канал."""
    try:
        channel_id = getattr(settings, "telegram_channel_id", None)
        if not channel_id:
            logger.warning(
                "Telegram channel ID is not set. Cannot auto-post magazine."
            )
            return

        issue_id = payload.get("issue_id", "?")
        title = payload.get("title", "Новый выпуск")
        url = payload.get(
            "url", f"https://microgreenuzbekistan.com/magazine/{issue_id}"
        )
        cover = payload.get("cover", "")

        post_text = (
            f"🔥 <b>Вышел новый FRESH WEEKLY №{issue_id}!</b>\n\n"
            f"В этом выпуске: <b>{title}</b>\n\n"
            f"📖 <a href='{url}'>Читать выпуск онлайн</a>\n\n"
            f"<i>Автоматически опубликовано через Microgreen AI Office</i>"
        )

        bot = await _get_bot()
        try:
            if cover and cover.startswith("http"):
                await bot.send_photo(
                    chat_id=channel_id,
                    photo=cover,
                    caption=post_text,
                    parse_mode="HTML",
                )
            else:
                await bot.send_message(
                    chat_id=channel_id, text=post_text, parse_mode="HTML"
                )
        finally:
            await bot.session.close()

        logger.info(
            f"Successfully auto-posted magazine #{issue_id} to {channel_id}"
        )
    except Exception as e:
        logger.error(f"Error auto-posting magazine: {e}")

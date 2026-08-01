import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from sqlalchemy import text
from shared.config import settings
from shared.database import get_session_ctx
from shared.scheduler import BotScheduler

logger = logging.getLogger(__name__)

async def _get_bot() -> Bot:
    return Bot(
        token=settings.support_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )

async def csat_survey_check() -> None:
    """Каждые 2ч — заказы без обратной связи."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT COUNT(*) FROM orders o "
                    "WHERE o.status = 'delivered' "
                    "AND o.created_at < NOW() - INTERVAL '24 hours' "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM interactions i "
                    "  WHERE i.order_id = o.id AND i.interaction_type = 'feedback'"
                    ")"
                )
            )
            count = result.scalar() or 0
        if count > 0:
            await bot.send_message(
                admin_id,
                f"📊 {count} заказов без обратной связи\n(доставлены более 24ч назад)",
                parse_mode="HTML",
            )
        try:
            from shared.feedback_loop import feedback_loop
            await feedback_loop.evaluate_and_adapt(
                bot="support_bot",
                metric="ticket_sla",
                current_data={"orders_without_feedback": count},
                benchmark_data={"max_unanswered": 5},
            )
        except Exception as fe:
            logger.warning(f"Support feedback loop error: {fe}")
        await bot.session.close()
    except Exception as e:
        logger.error(f"csat_survey_check error: {e}", exc_info=True)

async def complaint_followup() -> None:
    """Каждые 12ч — нерешённые жалобы старше 48ч."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT id, customer_id, created_at FROM interactions "
                    "WHERE interaction_type = 'complaint' "
                    "AND created_at < NOW() - INTERVAL '48 hours' "
                    "AND resolved = false"
                )
            )
            unresolved = result.fetchall()
        if unresolved:
            lines = ["🚨 <b>Нерешённые жалобы (>48ч):</b>\n"]
            for c in unresolved:
                lines.append(
                    f"  🔴 #{c.id} — клиент #{c.customer_id} "
                    f"(от {c.created_at.strftime('%d.%m %H:%M')})"
                )
            lines.append(f"\nВсего: <b>{len(unresolved)}</b> — требуется внимание!")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        await bot.session.close()
    except Exception as e:
        logger.error(f"complaint_followup error: {e}", exc_info=True)

async def delivery_status_report() -> None:
    """Каждые 30 мин — статус доставок."""
    try:
        bot = await _get_bot()
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT status, COUNT(*) as cnt FROM orders "
                    "WHERE status IN ('new','confirmed','preparing','ready','delivering','delivered') "
                    "GROUP BY status ORDER BY status"
                )
            )
            rows = result.fetchall()
            stuck = await session.execute(
                text(
                    "SELECT COUNT(*) FROM orders "
                    "WHERE status = 'delivering' "
                    "AND updated_at < NOW() - INTERVAL '2 hours'"
                )
            )
            stuck_count = stuck.scalar() or 0
        if rows:
            status_emoji = {
                "new": "🆕",
                "confirmed": "✅",
                "preparing": "🔧",
                "ready": "📦",
                "delivering": "🚚",
                "delivered": "✔️",
            }
            report_data = {
                "orders_by_status": [
                    {
                        "status": r.status,
                        "count": r.cnt,
                        "emoji": status_emoji.get(r.status, "📋"),
                    }
                    for r in rows
                ],
                "stuck_deliveries": stuck_count,
            }
            from shared.event_bus import event_bus
            await event_bus.publish(
                "DELIVERY_STATUS_REPORT", report_data, "support_bot"
            )

        await bot.session.close()
    except Exception as e:
        logger.error(f"delivery_status_report error: {e}", exc_info=True)

async def faq_analysis() -> None:
    """Понедельник 10:00 — анализ обращений за неделю."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT interaction_type, COUNT(*) as cnt FROM interactions "
                    "WHERE created_at > NOW() - INTERVAL '7 days' "
                    "GROUP BY interaction_type ORDER BY cnt DESC"
                )
            )
            rows = result.fetchall()
            total = (
                await session.execute(
                    text(
                        "SELECT COUNT(*) FROM interactions "
                        "WHERE created_at > NOW() - INTERVAL '7 days'"
                    )
                )
            ).scalar() or 0
        if rows:
            type_emoji = {
                "inquiry": "❓",
                "complaint": "😤",
                "feedback": "💬",
                "order": "🛒",
                "followup": "🔁",
                "b2b_lead": "🤝",
                "lead_welcome": "👋",
                "b2b_offer_sent": "📧",
            }
            lines = [f"📈 <b>Анализ обращений за неделю</b>\n\nВсего: <b>{total}</b>\n"]
            for r in rows:
                emoji = type_emoji.get(r.interaction_type, "📋")
                pct = round(r.cnt / total * 100) if total else 0
                lines.append(f"  {emoji} {r.interaction_type}: <b>{r.cnt}</b> ({pct}%)")
            await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        else:
            await bot.send_message(
                admin_id, "📈 Обращений за неделю: 0", parse_mode="HTML"
            )
        await bot.session.close()
    except Exception as e:
        logger.error(f"faq_analysis error: {e}", exc_info=True)

async def auto_poll_instagram_dms() -> None:
    """Фоновая задача: проверяет и отвечает на сообщения в Instagram Direct каждые 3 минуты."""
    try:
        from shared.instagram_dm import auto_reply_to_new_messages
        logger.info("Starting background check of Instagram DMs...")
        await auto_reply_to_new_messages()
        logger.info("Finished background check of Instagram DMs.")
    except Exception as e:
        logger.error(f"auto_poll_instagram_dms error: {e}", exc_info=True)

async def auto_poll_instagram_comments() -> None:
    """Фоновая задача: авто-ответ на комментарии-вопросы под постами Instagram."""
    try:
        from shared.instagram_comments import auto_reply_to_comments
        await auto_reply_to_comments()
    except Exception as e:
        logger.error(f"auto_poll_instagram_comments error: {e}", exc_info=True)

def register_support_tasks(scheduler: BotScheduler) -> None:
    scheduler.add_interval(name="csat_survey_check", func=csat_survey_check, seconds=7200)
    scheduler.add_interval(name="complaint_followup", func=complaint_followup, seconds=43200)
    scheduler.add_interval(name="delivery_status_report", func=delivery_status_report, seconds=14400)
    scheduler.add_cron(name="faq_analysis", func=faq_analysis, hour=10, minute=0, day_of_week=0)
    scheduler.add_interval(name="auto_poll_instagram_dms", func=auto_poll_instagram_dms, seconds=180)
    scheduler.add_interval(name="auto_poll_instagram_comments", func=auto_poll_instagram_comments, seconds=600)

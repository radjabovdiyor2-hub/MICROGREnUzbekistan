import logging
import asyncio
from sqlalchemy import text
from aiogram import Bot
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

async def collect_leads_nightly() -> None:
    """Ночной сбор новых ресторанов из всех источников (Google, Yandex, 2ГИС)."""
    try:
        from shared.lead_gen import collect_and_import_all

        result = await collect_and_import_all()
        logger.info(
            "collect_leads_nightly: +%d новых лидов, %d дублей",
            result["inserted"],
            result["skipped"],
        )
    except Exception as e:
        logger.error(f"collect_leads_nightly error: {e}", exc_info=True)


async def followups_worker(bot: Bot) -> None:
    """Фоновый воркер для проверки таблицы followups и рассылки уведомлений."""
    while True:
        try:
            async with get_session_ctx() as session:
                res = await session.execute(
                    text(
                        "SELECT f.id, c.telegram_id, f.message FROM followups f "
                        "JOIN customers c ON f.customer_id = c.id "
                        "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() AND c.telegram_id IS NOT NULL "
                        "AND COALESCE(c.status, '') NOT IN ('unsubscribed', 'blocked', 'do_not_contact')"
                    )
                )
                rows = res.fetchall()
                for row in rows:
                    fid, tid, msg = row
                    try:
                        await bot.send_message(
                            tid,
                            f"🔔 <b>Напоминание от Microgreen Uzbekistan:</b>\n\n{msg}",
                            parse_mode="HTML",
                        )
                        await session.execute(
                            text("UPDATE followups SET status='sent' WHERE id=:id"),
                            {"id": fid},
                        )
                        logger.info(f"Sent followup {fid} to {tid}")
                    except Exception as e:
                        logger.error(f"Failed to send followup {fid}: {e}")
                if rows:
                    await session.commit()
        except Exception as e:
            logger.error(f"Followups worker error: {e}")
        await asyncio.sleep(60)

def register_marketing_tasks(scheduler) -> None:
    from bots.marketing_bot.handlers.b2b import b2b_outreach
    
    # Ночью собираем новых лидов (2ГИС)
    scheduler.add_cron(
        name="collect_leads_nightly", func=collect_leads_nightly, hour=3, minute=0
    )
    # B2B outreach: подготавливает КП и отправляет карточку на одобрение в 10:00
    scheduler.add_cron(name="b2b_outreach", func=b2b_outreach, hour=10, minute=0)

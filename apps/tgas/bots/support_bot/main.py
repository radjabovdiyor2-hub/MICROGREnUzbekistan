"""Support Bot — main.py с EventBus интеграцией"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared import alert_once
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from bots.support_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from bots.support_bot.handlers.faq import ai_chat
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from sqlalchemy import text

async def get_dynamic_support_policy(base_sys: str) -> str:
    try:
        from shared.feedback_loop import feedback_loop
        active = await feedback_loop.get_active_behavior("support_bot", "ticket_sla")
        directives = [str(v) for v in active.values() if isinstance(v, str)]
        if directives:
            # Обычная строка, а не raw: с "\\n" в промпт уходили литералы \n.
            return base_sys + "\n\n[ДИРЕКТИВА ИИ-ПОДДЕРЖКИ: " + " ".join(directives) + "]"
    except Exception:
        pass
    return base_sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Планировщик ──────────────────────────────────────────────────────────
scheduler = BotScheduler("support_bot")


async def _get_bot():
    return Bot(
        token=settings.support_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


async def csat_survey_check():
    """Каждые 2ч — заказы без обратной связи."""
    try:
        bot = await _get_bot()
        admin_id = settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT COUNT(*) FROM crm_orders o "
                    "WHERE o.status = 'delivered' "
                    "AND o.created_at < NOW() - INTERVAL '24 hours' "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM interactions i "
                    "  WHERE i.order_id = o.id AND i.interaction_type = 'feedback'"
                    ")"
                )
            )
            count = result.scalar() or 0
        # Проверка идёт каждые 2 часа, а сообщение уходит только когда число
        # ИЗМЕНИЛОСЬ (плюс напоминание раз в сутки). Раньше одно и то же
        # «7 заказов без обратной связи» приходило владельцу 12 раз за день.
        if count > 0:
            if alert_once.should_send("support.csat", str(count)):
                await bot.send_message(
                    admin_id,
                    f"📊 {count} заказов без обратной связи\n(доставлены более 24ч назад)",
                    parse_mode="HTML",
                )
        else:
            alert_once.resolved("support.csat")
        # Замыкаем петлю: Поддержка (замер CSAT / заказов без фидбека -> вывод -> пополнение базы знаний)
        try:
            from shared.feedback_loop import feedback_loop

            await feedback_loop.evaluate_and_adapt(
                bot="support_bot",
                metric="ticket_sla",
                current_data={"orders_without_feedback": count},
                benchmark_data={"max_unanswered": 5},
            )
        except Exception as fe:
            logging.warning(f"Support feedback loop error: {fe}")
        await bot.session.close()
    except Exception as e:
        logging.error(f"csat_survey_check error: {e}", exc_info=True)


async def complaint_followup():
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
            # Отпечаток — номера самих жалоб, а не их количество: если одну
            # закрыли, а другая появилась, число то же, а список другой.
            ids = ",".join(str(c.id) for c in unresolved)
            if alert_once.should_send("support.complaints", ids):
                lines = ["🚨 <b>Нерешённые жалобы (>48ч):</b>\n"]
                for c in unresolved:
                    lines.append(
                        f"  🔴 #{c.id} — клиент #{c.customer_id} "
                        f"(от {c.created_at.strftime('%d.%m %H:%M')})"
                    )
                lines.append(f"\nВсего: <b>{len(unresolved)}</b> — требуется внимание!")
                await bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        else:
            alert_once.resolved("support.complaints")
        await bot.session.close()
    except Exception as e:
        logging.error(f"complaint_followup error: {e}", exc_info=True)


async def delivery_status_report():
    """Каждые 30 мин — статус доставок."""
    try:
        bot = await _get_bot()
        settings.admin_telegram_ids[0]
        async with get_session_ctx() as session:
            result = await session.execute(
                text(
                    "SELECT status, COUNT(*) as cnt FROM crm_orders "
                    "WHERE status IN ('new','confirmed','preparing','ready','delivering','delivered') "
                    "GROUP BY status ORDER BY status"
                )
            )
            rows = result.fetchall()
            # Проверяем доставки дольше 2ч
            stuck = await session.execute(
                text(
                    "SELECT COUNT(*) FROM crm_orders "
                    "WHERE status = 'delivering' "
                    "AND updated_at < NOW() - INTERVAL '2 hours'"
                )
            )
            stuck_count = stuck.scalar() or 0
        # Сводка по логистике идёт Стёпану, а он генерирует по ней текст
        # моделью и шлёт в группу продаж. Раньше — каждые 4 часа независимо от
        # того, изменилось ли хоть что-то: шесть одинаковых сводок и шесть
        # оплаченных генераций в сутки. Отпечаток из статусов обрывает это в
        # источнике, до вызова модели.
        fingerprint = ";".join(f"{r.status}:{r.cnt}" for r in rows) + f"|{stuck_count}"
        if rows and alert_once.should_send("support.delivery_status", fingerprint):
            status_emoji = {
                "new": "🆕",
                "confirmed": "✅",
                "preparing": "🔧",
                "ready": "📦",
                "delivering": "🚚",
                "delivered": "✔️",
            }
            # Собираем сырые данные для отправки Степану
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

            # Отправляем в Event Bus для Степана (вместо прямой отправки в чат)
            from shared.event_bus import event_bus

            await event_bus.publish(
                "DELIVERY_STATUS_REPORT", report_data, "support_bot"
            )

        await bot.session.close()
    except Exception as e:
        logging.error(f"delivery_status_report error: {e}", exc_info=True)


async def faq_analysis():
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
        logging.error(f"faq_analysis error: {e}", exc_info=True)


async def auto_poll_instagram_dms():
    """Фоновая задача: проверяет и отвечает на сообщения в Instagram Direct каждые 3 минуты."""
    try:
        from shared.instagram_dm import auto_reply_to_new_messages

        logging.info("Starting background check of Instagram DMs...")
        await auto_reply_to_new_messages()
        logging.info("Finished background check of Instagram DMs.")
    except Exception as e:
        logging.error(f"auto_poll_instagram_dms error: {e}", exc_info=True)


async def auto_poll_instagram_comments():
    """Фоновая задача: авто-ответ на комментарии-вопросы под постами Instagram."""
    try:
        from shared.instagram_comments import auto_reply_to_comments

        await auto_reply_to_comments()
    except Exception as e:
        logging.error(f"auto_poll_instagram_comments error: {e}", exc_info=True)


# ── Регистрация задач поддержки ───────────────────────────────────────────
scheduler.add_interval(name="csat_survey_check", func=csat_survey_check, seconds=7200)
scheduler.add_interval(
    name="complaint_followup", func=complaint_followup, seconds=43200
)
scheduler.add_interval(
    name="delivery_status_report", func=delivery_status_report, seconds=14400
)
scheduler.add_cron(
    name="faq_analysis", func=faq_analysis, hour=10, minute=0, day_of_week=0
)
# Instagram polling оставлен — обслуживает клиентов, не шлёт спам админу
scheduler.add_interval(
    name="auto_poll_instagram_dms", func=auto_poll_instagram_dms, seconds=180
)
scheduler.add_interval(
    name="auto_poll_instagram_comments", func=auto_poll_instagram_comments, seconds=600
)

# ═══════════════════════════════════════════════════════════════════════════
# BOT BUS HANDLERS — задачи от Степана
# ═══════════════════════════════════════════════════════════════════════════


async def bus_handle_complaint(params: dict) -> dict:
    """Зарегистрировать жалобу."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text

        customer_id = params.get(
            "customer_id"
        )  # может быть None — жалоба без привязки к клиенту
        complaint_text = params.get("text", "Жалоба через Bot Bus")
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, interaction_type, channel, summary, created_at) "
                    "VALUES (:cid, 'complaint', 'bus', :summary, NOW())"
                ),
                {"cid": customer_id, "summary": complaint_text},
            )
            await session.commit()
        return {
            "status": "ok",
            "message": f"Жалоба зарегистрирована: {complaint_text[:80]}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def bus_check_instagram_dm(params: dict) -> dict:
    """Проверить и ответить на DM в Instagram (ручной запуск того же движка автоответа)."""
    try:
        from shared.instagram_dm import auto_reply_to_new_messages

        await auto_reply_to_new_messages()
        return {
            "status": "ok",
            "message": "Instagram Direct проверен, автоответы отправлены",
            "data": {},
        }
    except ImportError:
        return {
            "status": "ok",
            "message": "Модуль instagram_dm не настроен. Функция недоступна.",
            "data": {},
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "support":
        return
    # Гарда `if not chat_id: return` здесь больше нет. Она отбрасывала
    # задачу раньше, чем исполнитель успевал её спасти: task_executor
    # сам делает `chat_id or _admin_chat_id()`, а _notify без чата —
    # пустая операция. Из-за гарды задача из офисной панели создавалась,
    # событие уходило, и шесть отделов из десяти молча его выбрасывали.
    # Отдельная переменная не нужна: исполнитель берёт chat_id из data.

    bot = Bot(
        token=settings.support_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.task_executor import execute_bot_task
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Руководитель отдела клиентского сервиса (Head of Customer Success). Твоя главная задача — повышать CSAT (удовлетворенность) и NPS. При решении конфликтов используй эмпатию и предлагай системные решения, чтобы жалоба не повторилась."
        
        logging.info("SUPPORT BOT passing task to TaskExecutor...")
        await execute_bot_task(
            bot=bot,
            bot_name="support_bot",
            department="support",
            task_data=data,
            team_context=sys_prompt,
            policy=await get_dynamic_support_policy("")
        )
        logging.info("SUPPORT BOT successfully handled task.")

    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("support_bot", payload)


async def main():
    if not settings.support_bot_token:
        logger.error("FATAL: SUPPORT_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.support_bot_token,
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
        ai_chat,
        wake_words=["отдел поддержк", "поддержка", "support", "жалоба", "клиент"],
    )
    dp.include_router(group_router)

    # Support публикует события (жалобы), но не слушает Redis
    await event_bus.connect()
    event_bus.on("TASK_CREATED", handle_task_created)
    # EventBus теперь слушает через встроенный aiohttp сервер ниже

    # Запуск планировщика и heartbeat
    await scheduler.start()
    asyncio.create_task(start_heartbeat("support_bot"))

    # ── Webhook Server для n8n ──
    from aiohttp import web

    async def n8n_webhook_handler(request):
        try:
            data = await request.json()
            action = data.get("action")
            if action == "csat_survey_check":
                asyncio.create_task(csat_survey_check())
            elif action == "complaint_followup":
                asyncio.create_task(complaint_followup())
            elif action == "delivery_status_report":
                asyncio.create_task(delivery_status_report())
            elif action == "faq_analysis":
                asyncio.create_task(faq_analysis())
            elif action == "auto_poll_instagram_dms":
                asyncio.create_task(auto_poll_instagram_dms())
            else:
                return web.json_response(
                    {"status": "error", "message": "Unknown action"}, status=400
                )
            return web.json_response({"status": "ok", "action": action})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    app = web.Application()
    app.router.add_post("/n8n-webhook", n8n_webhook_handler)
    await event_bus.start_listening(
        8083, app
    )  # mg_support — порт из карты доставки event_bus

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen

    asyncio.create_task(
        bus_listen(
            "support_bot",
            {
                "handle_complaint": bus_handle_complaint,
                "check_instagram_dm": bus_check_instagram_dm,
            },
        )
    )

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        event_bus.on("ROLL_CALL", handle_roll_call)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())

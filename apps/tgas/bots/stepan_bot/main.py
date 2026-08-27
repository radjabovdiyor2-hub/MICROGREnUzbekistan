# ruff: noqa: E402
"""
🤖 СТЕПАН — Личный AI-помощник руководителя
=============================================
Главный координатор. Распределяет задачи между отделами,
контролирует выполнение, проверяет результаты.
Помимо управления — личный помощник: ответы на вопросы,
аналитика, напоминания, советы.
"""

import asyncio
import logging
import sys
from pathlib import Path

# Добавляем корень проекта в sys.path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.redis import RedisStorage

from shared.prompts import role_prompt
from shared.config import settings
from shared.database import get_session_ctx
# Одна формула выручки на весь офис: отменённый заказ не продажа.
from shared.tools.crm import NOT_A_SALE
from shared.event_bus import event_bus
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat, check_all_bots, format_health_report
from shared.notifications import alert_admins, send_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [СТЕПАН] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Глобальные ссылки для задач ──────────────────────────────────────────
_bot: Bot = None
scheduler = BotScheduler("stepan_bot")


# ═══════════════════════════════════════════════════════════════════════════
# ФОНОВЫЕ ЗАДАЧИ — Мигрированные из старых asyncio.create_task
# ═══════════════════════════════════════════════════════════════════════════


async def check_deadlines():
    """Раз в сутки показываем владельцу просроченные задачи.

    Раньше это был interval-job раз в час: одни и те же строки приходили
    24 раза за сутки, а закрыть их было нечем — из чата не было ни одного
    пути к задаче. Теперь дайджест ежедневный и с кнопкой на экран, где
    задачу можно удалить.
    """
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return
        from shared import tasks_repo

        shown = 10
        overdue = await tasks_repo.list_overdue(limit=shown)
        # Считаем отдельным COUNT(*): раньше печатали len() выборки с LIMIT 10
        # и при любом числе просрочки рапортовали ровно «10».
        total = await tasks_repo.count_overdue()

        if overdue:
            lines = ["⏰ <b>Просроченные задачи:</b>\n"]
            for task in overdue:
                dept_str = f" ({task['department']})" if task["department"] else ""
                dl = task["deadline"] or "?"
                lines.append(
                    f"• <b>#{task['id']}</b>{dept_str}: {task['title'][:80]} "
                    f"— дедлайн был {dl}"
                )
            lines.append(f"\n🔴 Всего просрочено: {total}")
            if total > len(overdue):
                lines.append(f"<i>Показаны первые {len(overdue)}.</i>")

            from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

            kb = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text="📋 Разобрать задачи", callback_data="st:tasks"
                        )
                    ],
                ]
            )
            await _bot.send_message(
                admin_id, "\n".join(lines), parse_mode="HTML", reply_markup=kb
            )
            logger.info(f"Отправлено уведомление о {total} просроченных задачах")

            # Второй канал — админка: владелец мог не смотреть в Telegram.
            from shared.owner_alerts import raise_alert, SEVERITY_WARNING

            await raise_alert(
                kind="deadline",
                severity=SEVERITY_WARNING,
                title=f"Просрочено задач: {total}",
                message="\n".join(lines[1:]),
                source="stepan_bot",
            )
    except Exception as e:
        logger.warning(f"Ошибка проверки дедлайнов: {e}")


async def daily_report():
    """Каждый день в 9:00 отправляем сводку руководителю."""
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price

        async with get_session_ctx() as session:
            # Задачи: общая статистика
            res = await session.execute(
                sa_text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
            )
            task_stats = dict(res.fetchall())

            # Незавершённые задачи со вчера
            res = await session.execute(
                sa_text(
                    "SELECT id, title, department FROM tasks "
                    "WHERE status NOT IN ('done', 'cancelled') "
                    "AND created_at < CURRENT_DATE "
                    "ORDER BY created_at ASC LIMIT 10"
                )
            )
            yesterday_tasks = res.fetchall()

            # Просроченные
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE deadline < CURRENT_DATE AND status NOT IN ('done', 'cancelled')"
                )
            )
            overdue_count = res.scalar() or 0

            # Заказы на сегодня
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                )
            )
            today_orders, today_revenue = res.fetchone()

            # Заказы за вчера
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day' "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                )
            )
            yesterday_orders, yesterday_revenue = res.fetchone()

            # Финансы за месяц
            res = await session.execute(
                sa_text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) "
                    "GROUP BY type"
                )
            )
            fin = dict(res.fetchall())
            income = fin.get("income", 0)
            expense = fin.get("expense", 0)

        # Формируем отчёт
        todo = task_stats.get("todo", 0)
        in_progress = task_stats.get("in_progress", 0)
        done = task_stats.get("done", 0)

        lines = [
            "☀️ <b>Доброе утро! Утренняя сводка:</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━",
            "\n📋 <b>Задачи:</b>",
            f"  ⬜ Ожидают: {todo}",
            f"  🔄 В работе: {in_progress}",
            f"  ✅ Выполнено: {done}",
        ]

        if overdue_count > 0:
            lines.append(f"  🔴 Просрочено: {overdue_count}")

        if yesterday_tasks:
            lines.append(f"\n⚠️ <b>Незавершённые со вчера ({len(yesterday_tasks)}):</b>")
            for tid, title, dept in yesterday_tasks:
                dept_str = f" [{dept}]" if dept else ""
                lines.append(f"  • #{tid}{dept_str}: {title[:60]}")

        lines.extend(
            [
                "\n━━━━━━━━━━━━━━━━━━━━━━",
                "\n📦 <b>Заказы:</b>",
                f"  Сегодня: {today_orders or 0} заказов на {format_price(today_revenue or 0)}",
                f"  Вчера: {yesterday_orders or 0} заказов на {format_price(yesterday_revenue or 0)}",
                "\n━━━━━━━━━━━━━━━━━━━━━━",
                "\n💰 <b>Финансы за месяц:</b>",
                f"  📈 Доход: {format_price(income)}",
                f"  📉 Расход: {format_price(expense)}",
                f"  💵 Баланс: {format_price(income - expense)}",
                "\n━━━━━━━━━━━━━━━━━━━━━━",
                "\n🤖 Степан на связи. Жду ваших указаний!",
            ]
        )

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
        logger.info("Утренний отчёт отправлен!")
    except Exception as e:
        logger.warning(f"Ошибка отправки утреннего отчёта: {e}")


async def check_followups():
    """Каждые 30 минут: довести до клиента запланированное касание.

    Раньше здесь создавался второй Bot(token=sales_bot_token) — это приводило
    к конфликту polling («terminated by other getUpdates request»).
    Теперь follow-ups отправляются самим Стёпаном (это его задача как координатора).

    ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ ЧИНИЛОСЬ. Строка `if not tg_id: continue` означала,
    что клиент без Telegram не получает НИЧЕГО и никогда: запись остаётся
    `pending`, выбирается каждые полчаса вечно, и никто об этом не узнаёт.
    При этом `create_followup` ищет клиента по ТЕЛЕФОНУ — то есть штатно
    заводит касания тем, у кого Telegram и нет.

    Теперь путь тот же, что у рассылок: лестница `capabilities._reach`
    (Telegram → email → задача живому человеку на звонок). Недостижимый
    клиент — это не «пропустить», а «позвонить»: касание либо случилось,
    либо стало чьей-то работой, и в обоих случаях перестало быть `pending`.
    """
    try:
        from sqlalchemy import text as sa_text

        from shared.capabilities import _create_human_task, _reach

        async with get_session_ctx() as session:
            res = await session.execute(
                sa_text(
                    "SELECT f.id, f.message, f.customer_id, c.telegram_id, c.email, "
                    "       c.name, c.phone "
                    "FROM followups f "
                    "JOIN customers c ON f.customer_id = c.id AND c.deleted_at IS NULL "
                    "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() "
                    "LIMIT 10"
                )
            )
            followups = res.fetchall()

        if not followups:
            return

        for fid, msg, cust_id, tg_id, email, name, phone in followups:
            cust = {
                "id": cust_id,
                "telegram_id": tg_id,
                "email": email,
                "name": name,
                "phone": phone,
            }
            try:
                channel = await _reach(_bot, cust, f"🌱 {msg}")

                if channel == "need_call":
                    # Ни Telegram, ни почты. Это остаток для человека, а не
                    # повод молча выбрать ту же строку через полчаса.
                    await _create_human_task(
                        f"Позвонить клиенту {name or phone or cust_id}",
                        f"Написать не получилось (ни Telegram, ни email). Текст касания: {msg}",
                    )
                    status = "need_call"
                else:
                    status = "sent"

                async with get_session_ctx() as session:
                    await session.execute(
                        sa_text("UPDATE followups SET status = :st WHERE id = :fid"),
                        {"fid": fid, "st": status},
                    )
                    # Запись о самом касании ведёт `_reach`; здесь остаётся
                    # только пометка типа «followup», по которой его отличают
                    # от рассылки в истории клиента.
                    if status == "sent":
                        await session.execute(
                            sa_text(
                                "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                                "VALUES (:cid, :ch, 'followup', 'stepan_bot', :summary)"
                            ),
                            {"cid": cust_id, "ch": channel, "summary": msg[:200]},
                        )
                logger.info("Follow-up #%s: %s (клиент %s)", fid, status, cust_id)
            except Exception as e:
                logger.warning(f"Follow-up #{fid} ошибка: {e}")
    except Exception as e:
        logger.warning(f"Ошибка проверки follow-ups: {e}")


# ═══════════════════════════════════════════════════════════════════════════
# НОВЫЕ ФОНОВЫЕ ЗАДАЧИ
# ═══════════════════════════════════════════════════════════════════════════


async def evening_summary():
    """Ежедневно в 20:00: итоги дня."""
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price

        async with get_session_ctx() as session:
            # Задачи завершённые сегодня
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE status = 'done' AND DATE(updated_at) = CURRENT_DATE"
                )
            )
            tasks_completed = res.scalar() or 0

            # Задачи оставшиеся
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM tasks "
                    "WHERE status NOT IN ('done', 'cancelled')"
                )
            )
            tasks_remaining = res.scalar() or 0

            # Новые заказы сегодня.
            #
            # Фильтр отмен здесь отсутствовал, и вечерняя сводка была
            # единственным местом в офисе, где отменённый заказ считался
            # выручкой: `get_business_summary`, `get_pnl`, `top_products` и
            # `get_sales_trend` исключают его через тот же `NOT_A_SALE`.
            # Владелец в 20:00 получал одно число, а отчёт аналитики в тот же
            # час — другое, и расхождение выглядело ошибкой аналитики.
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                )
            )
            new_orders, revenue = res.fetchone()

            # Задачи на завтра (с дедлайном завтра)
            res = await session.execute(
                sa_text(
                    "SELECT id, title, department FROM tasks "
                    "WHERE deadline = CURRENT_DATE + INTERVAL '1 day' "
                    "AND status NOT IN ('done', 'cancelled') "
                    "ORDER BY id LIMIT 5"
                )
            )
            tomorrow_tasks = res.fetchall()

        lines = [
            "🌆 <b>Итоги дня</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━\n",
            f"✅ Задач завершено: <b>{tasks_completed}</b>",
            f"📦 Новых заказов: <b>{new_orders or 0}</b>",
            f"💰 Выручка: <b>{format_price(revenue or 0)}</b>",
            f"📋 Осталось задач: <b>{tasks_remaining}</b>",
        ]

        if tomorrow_tasks:
            lines.append(f"\n📅 <b>На завтра ({len(tomorrow_tasks)}):</b>")
            for tid, title, dept in tomorrow_tasks:
                dept_str = f" [{dept}]" if dept else ""
                lines.append(f"  • #{tid}{dept_str}: {title[:60]}")

        lines.extend(
            [
                "\n━━━━━━━━━━━━━━━━━━━━━━",
                "\n🌙 Хорошего вечера! Степан всё контролирует.",
            ]
        )

        await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка вечернего отчёта: {e}")


async def weekly_report():
    """Понедельник 9:00 (после daily_report): недельная сводка с AI-анализом."""
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return
        from sqlalchemy import text as sa_text
        from shared.utils import format_price
        from shared.ai_engine import AIEngine

        async with get_session_ctx() as session:
            # Задачи за неделю
            res = await session.execute(
                sa_text(
                    "SELECT status, COUNT(*) FROM tasks "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' "
                    "GROUP BY status"
                )
            )
            week_tasks = dict(res.fetchall())

            # Заказы за неделю
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                )
            )
            week_orders, week_revenue = res.fetchone()

            # Финансы за неделю
            res = await session.execute(
                sa_text(
                    "SELECT type, COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE date >= CURRENT_DATE - INTERVAL '7 days' "
                    "GROUP BY type"
                )
            )
            fin = dict(res.fetchall())
            income = fin.get("income", 0)
            expense = fin.get("expense", 0)

            # Новые клиенты
            res = await session.execute(
                sa_text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE deleted_at IS NULL "
                    "AND created_at >= CURRENT_DATE - INTERVAL '7 days'"
                )
            )
            new_customers = res.scalar() or 0

        data_summary = (
            f"Задачи: {week_tasks.get('done', 0)} выполнено, "
            f"{week_tasks.get('todo', 0)} ожидают, "
            f"{week_tasks.get('in_progress', 0)} в работе.\n"
            f"Заказов: {week_orders or 0}, выручка: {'{:,.0f}'.format(week_revenue or 0)} сум.\n"
            f"Доход: {'{:,.0f}'.format(income)} сум, расход: {'{:,.0f}'.format(expense)} сум.\n"
            f"Новых клиентов: {new_customers}."
        )

        ai = AIEngine()
        analysis = await ai.chat_completion(
            "Ты бизнес-помощник руководителя микрозелени в Узбекистане. "
            "Дай краткий анализ недели и 3 рекомендации.",
            f"Данные за прошлую неделю:\n{data_summary}\n\nДай анализ и рекомендации.",
        )

        lines = [
            "📊 <b>Недельный отчёт</b>\n",
            "━━━━━━━━━━━━━━━━━━━━━━\n",
            "📋 <b>Задачи:</b>",
            f"  ✅ Выполнено: {week_tasks.get('done', 0)}",
            f"  ⬜ Ожидают: {week_tasks.get('todo', 0)}",
            f"  🔄 В работе: {week_tasks.get('in_progress', 0)}",
            f"\n📦 Заказов: <b>{week_orders or 0}</b>",
            f"💰 Выручка: <b>{format_price(week_revenue or 0)}</b>",
            f"📈 Доход: {format_price(income)}",
            f"📉 Расход: {format_price(expense)}",
            f"💵 Прибыль: <b>{format_price(income - expense)}</b>",
            f"👤 Новых клиентов: <b>{new_customers}</b>",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            f"\n🤖 <b>AI-анализ:</b>\n{analysis}",
            "\n━━━━━━━━━━━━━━━━━━━━━━",
            "📊 <i>Степан — недельный отчёт</i>",
        ]

        report = "\n".join(lines)
        if len(report) > 4000:
            await _bot.send_message(
                admin_id,
                report[:4000] + "\n\n<i>...продолжение↓</i>",
                parse_mode="HTML",
            )
            await _bot.send_message(admin_id, report[4000:], parse_mode="HTML")
        else:
            await _bot.send_message(admin_id, report, parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка недельного отчёта: {e}")


async def auto_task_creation():
    """Каждые 4 часа: задачи по зависшим заказам.

    ПОЧЕМУ ЗДЕСЬ БОЛЬШЕ НЕТ ЗАДАЧ ПО ОСТАТКАМ

    Была ветка «остаток товара < 3 → завести задачу „Пополнить <товар>“».
    Задача заводилась НА КАЖДЫЙ товар, и по каждой уходило событие
    TASK_CREATED. Событие будит Стёпана, тот прогоняет полный цикл с моделью
    и шлёт два сообщения: «принял в работу» и результат. При 34 позициях
    каталога это 69 сообщений и 34 вызова модели за один прогон, четыре раза
    в сутки; метельщик зависших задач потом повторял их ещё дважды.

    И главное: такая задача невыполнима в принципе. «Пополнить Рукколу» —
    это посадить и собрать; инструмента «пополнить готовый товар» нет ни у
    одного отдела. То есть каждая из них могла только висеть в списке до
    ручного закрытия — ровно те «невыполнимые задачи», из-за которых
    владелец и начал этот разбор.

    Сигнал сохранён: заканчивающиеся позиции идут одной строкой в утренней
    сводке (`grow_morning`), где их видно рядом с посадками — то есть рядом
    с тем единственным действием, которым остаток и пополняется.
    """
    try:
        from sqlalchemy import text as sa_text
        from shared import tasks_repo

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        created_tasks = []

        async with get_session_ctx() as session:
            # Заказы 'new' более 24 часов. Их всегда единицы, и с ними
            # действительно есть что делать — позвонить и подтвердить.
            res = await session.execute(
                sa_text(
                    "SELECT o.id, o.created_at FROM crm_orders o "
                    "WHERE o.status = 'new' "
                    "AND o.created_at < NOW() - INTERVAL '24 hours' "
                    "AND NOT EXISTS ("
                    "  SELECT 1 FROM tasks t "
                    "  WHERE t.title LIKE '%Заказ #' || o.id::text || '%' "
                    "  AND t.status NOT IN ('done', 'cancelled') "
                    "  AND t.created_at > CURRENT_DATE - INTERVAL '1 day'"
                    ")"
                )
            )
            stale_orders = res.fetchall()

        # Задачу заводит tasks_repo, а не сырой INSERT.
        #
        # Прежний INSERT шёл мимо единственной двери и потому не получал ни
        # защиты от дублей, ни дедлайна. Без дедлайна задача не попадает в
        # сводку просрочки НИКОГДА: сводка ищет `deadline < CURRENT_DATE`.
        # То есть «обработать зависший заказ» тихо ложилось в базу и больше
        # нигде не всплывало.
        for oid, created_at in stale_orders:
            created = await tasks_repo.create(
                title=f"⚠️ Обработать Заказ #{oid}",
                department="sales",
                description=(
                    f"Заказ #{oid} от {created_at.strftime('%d.%m %H:%M')} "
                    f"не обработан более 24 часов."
                ),
                priority="high",
                deadline_days=1,
                chat_id=admin_id,
            )
            if created.get("ok"):
                created_tasks.append(f"📋 Обработать заказ #{oid}")

        if created_tasks and admin_id and _bot:
            lines = ["🤖 <b>Авто-задачи созданы:</b>\n"]
            lines.extend(f"  • {t}" for t in created_tasks)
            await _bot.send_message(admin_id, "\n".join(lines), parse_mode="HTML")
    except Exception as e:
        logger.warning(f"Ошибка автосоздания задач: {e}")


_last_down_bots: set[str] = set()


async def bot_health_check(force: bool = False):
    """Проверка здоровья всех ботов. Алертит при ИЗМЕНЕНИИ статуса (новый упавший /
    восстановление), а не каждый интервал — так частая проверка не спамит. `force=True`
    (ежедневная сводка) присылает полный статус всегда."""
    global _last_down_bots
    try:
        statuses = await check_all_bots()
        if not statuses:
            return

        down = {name for name, info in statuses.items() if not info["alive"]}
        newly_down = down - _last_down_bots
        recovered = _last_down_bots - down
        _last_down_bots = down

        if not settings.admin_telegram_ids:
            return

        # Рассылаем ВСЕМ администраторам, а не только первому: пока алерт
        # уходил на admin_telegram_ids[0], отпуск владельца означал, что
        # об упавшем боте не узнавал никто.
        report = format_health_report(statuses)
        if down and (force or newly_down):
            await alert_admins(
                _bot,
                f"🚨 <b>АЛЕРТ: боты не отвечают!</b>\n\n{report}\n\n⚠️ Проверьте работу ботов!",
                admin_tab="bot_health",
                button_text="🩺 Здоровье ботов",
            )
            logger.warning("Боты не отвечают: %s", ", ".join(sorted(down)))
            # Второй канал: владелец мог сидеть в админке, а не в Telegram.
            # Дублируем только НОВОЕ падение, чтобы не копить одинаковые
            # сигналы каждые пять минут, пока бот лежит.
            if newly_down:
                from shared.owner_alerts import raise_alert, SEVERITY_CRITICAL

                await raise_alert(
                    kind="bot_down",
                    severity=SEVERITY_CRITICAL,
                    title=f"Не отвечают боты: {', '.join(sorted(newly_down))}",
                    message=report,
                    source="stepan_bot",
                )
                # Тема `bots` в перечислении витрины была объявлена и не
                # публиковалась НИКЕМ: экран «Здоровье ботов» опрашивал
                # сервер раз в две минуты, потому что сказать ему было
                # некому. Падение бота — ровно тот случай, когда две минуты
                # ожидания это много.
                from shared import storefront_realtime

                storefront_realtime.notify_later("bots")
        elif recovered and not down:
            await alert_admins(
                _bot,
                f"✅ <b>Все боты снова онлайн</b>\n\n{report}",
                admin_tab="bot_health",
                button_text="🩺 Здоровье ботов",
            )
            from shared.owner_alerts import raise_alert, SEVERITY_INFO

            await raise_alert(
                kind="bot_recovered",
                severity=SEVERITY_INFO,
                title="Все боты снова онлайн",
                message=report,
                source="stepan_bot",
            )
        elif force:
            await alert_admins(_bot, report, admin_tab="bot_health", button_text="🩺 Здоровье ботов")
    except Exception as e:
        logger.warning(f"Ошибка проверки здоровья: {e}")


async def failed_jobs_report():
    """Задачи расписания, упавшие при последнем запуске.

    Планировщик пишет исход каждого запуска в `bot_jobs.last_status`, но
    ЧИТАЛ это поле только дашборд. Крон, падающий каждую ночь, давал
    тридцать строк в логе, красную ячейку на экране, который никто не
    открывал, — и ни одного сигнала. Пульс при этом оставался зелёным:
    он доказывает, что процесс жив, а не что работа делается.
    """
    from sqlalchemy import text as sa_text

    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                sa_text(
                    "SELECT bot, name, last_error, last_run_at FROM bot_jobs "
                    "WHERE last_status = 'error' AND enabled = true "
                    "AND last_run_at > NOW() - INTERVAL '2 days' "
                    "ORDER BY last_run_at DESC LIMIT 15"
                )
            )
        ).fetchall()

    if not rows:
        return ""

    lines = ["", "⚠️ <b>Упавшие задачи расписания:</b>"]
    for bot_name, job_name, err, at in rows:
        when = at.strftime("%d.%m %H:%M") if at else "?"
        lines.append(f"• {bot_name} / {job_name} ({when}): {str(err or '')[:120]}")
    return "\n".join(lines)


async def bot_health_summary():
    """Ежедневная (09:00) полная сводка статуса ботов — всегда присылается."""
    await bot_health_check(force=True)

    # Живой процесс и работающий бот — не одно и то же. Отдельной строкой
    # показываем, что из расписания реально падает.
    try:
        failed = await failed_jobs_report()
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if failed and admin_id and _bot:
            await _bot.send_message(admin_id, failed, parse_mode="HTML")
    except Exception as exc:
        logger.warning("Не смог собрать отчёт об упавших задачах: %s", exc)


async def grow_morning():
    """Утренняя сводка по посадкам: что созрело, что дозреет, что просрочено.

    Напоминаний о посадках не было вообще. Фазу партии умел считать только
    экран «Посадки» в админке — то есть узнать, что партия готова, можно было,
    лишь открыв вкладку. При сроке хранения 5–7 дней это значило, что партия
    молча протухала, а убыток теперь считается по настоящей себестоимости.

    Молчим, когда писать не о чем: ежедневное «посадок нет» приучает
    пролистывать сообщение не читая.
    """
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return

        from shared import alert_once, grow_watch

        state = await grow_watch.scan()
        text_body = grow_watch.morning_text(state)

        # Просроченные партии повторялись КАЖДОЕ утро одной и той же строкой:
        # `scan()` берёт всё, что не `harvested`, а просрочка под это подходит
        # всегда. К концу месяца владелец получал тридцать одинаковых сообщений
        # про один и тот же убыток. Это ровно то, против чего написан
        # `alert_once`: пишем, когда состав изменился, плюс напоминание раз в
        # сутки. «Созрело сегодня» и «дозреет завтра» меняются сами по себе,
        # поэтому отпечаток берём со всей сводки.
        if text_body:
            fingerprint = str(hash(text_body))
            if not alert_once.should_send("grow_morning", fingerprint):
                text_body = None
        else:
            alert_once.resolved("grow_morning")

        parts = [p for p in (text_body, await _low_stock_line()) if p]
        if parts:
            await _bot.send_message(admin_id, "\n\n".join(parts), parse_mode="HTML")
    except Exception as exc:
        logger.error(f"Ошибка утренней сводки по посадкам: {exc}")


async def _low_stock_line() -> str | None:
    """Заканчивающиеся товары — одной строкой к утренней сводке.

    Здесь, а не отдельным сообщением и не задачами: пополнить готовый товар
    можно только посадкой, и рядом с посадками этот список читается как
    «что сеять сегодня». Отдельным сообщением он был бы ещё одним уведомлением,
    а задачами — тем, чем и был: тридцатью четырьмя невыполнимыми поручениями.
    """
    from shared import catalog_repo

    try:
        items = await catalog_repo.low_stock(threshold=3)
    except Exception as exc:
        logger.warning("Не смог прочитать заканчивающиеся товары: %s", exc)
        return None
    if not items:
        return None

    shown = ", ".join(i["name"] for i in items[:5])
    tail = f" и ещё {len(items) - 5}" if len(items) > 5 else ""
    return f"📉 <b>Заканчиваются ({len(items)}):</b> {shown}{tail}"


async def grow_urgent():
    """Партии, у которых сегодня последний день продажи.

    Отдельно от утренней сводки и намеренно позже: к обеду видно, продали или
    нет, и напоминание ещё может что-то изменить.
    """
    try:
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            return

        from shared import grow_watch

        state = await grow_watch.scan()
        text_body = grow_watch.urgent_text(state["urgent"])
        if text_body:
            await _bot.send_message(admin_id, text_body, parse_mode="HTML")
    except Exception as exc:
        logger.error(f"Ошибка срочного напоминания по посадкам: {exc}")


#: Сколько заявок дайджест показывает строками и по скольким даёт кнопки.
#: Кнопок три: клавиатура на десять заявок — это двадцать кнопок, стена,
#: в которой владелец промахнётся мимо нужной. Остальное — по ссылке в админку.
_DIGEST_LINES = 10
_DIGEST_BUTTONS = 3


def _aware(moment):
    """Время из базы с поясом. Наивное считаем UTC — как и раньше."""
    from datetime import timezone

    if moment is None:
        return None
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=timezone.utc)


def _collapse_duplicates(items: list) -> list:
    """Свернуть одинаковые заявки в одну строку со счётчиком.

    Дедуп при создании (`approvals.fingerprint`) не даёт появиться новым
    дублям, но те, что уже накопились в базе, отпечатка не имеют. Свёртка по
    тексту заявки подбирает и их: владельцу незачем видеть «Удалить задачу
    #95» десятью строками подряд, чтобы понять, что отдел зациклился.

    `rows` — сколько строк очереди свернулось в эту (по ним считается хвост
    «…ещё N», иначе он посчитал бы свёрнутые заявки во второй раз).
    `repeats` — сколько раз попросили всего, включая дедуп при создании.
    """
    grouped: dict = {}
    for item in items:
        key = (item.get("summary") or "")[:120]
        first = grouped.get(key)
        if first is None:
            item["rows"] = 1
            item["repeats"] = 1 + int(item.get("duplicate_count") or 0)
            grouped[key] = item
        else:
            first["rows"] += 1
            first["repeats"] += 1 + int(item.get("duplicate_count") or 0)
    return list(grouped.values())


async def remind_pending_approvals():
    """Напомнить владельцу о заявках, которые ждут его решения.

    Раньше заявка жила 15 минут и молча исчезала: ни напоминания, ни повтора,
    ни следа. Задача при этом навсегда оставалась в `todo`, и о том, что бот
    вообще чего-то просил, узнать было негде.

    Интервал нарастает (`approvals.REMIND_AFTER_HOURS`): час, четыре, двенадцать,
    сутки. Так заявка не теряется, но и не превращается в долбёжку.

    ⚠️ Шаг отсчитывается от ПОСЛЕДНЕГО напоминания, а не от создания заявки.
    Пока сравнивали с `created_at`, лестница упиралась в 24 часа, а возраст
    висящей заявки заведомо был больше — и дайджест уходил на КАЖДОМ часовом
    прогоне. Владелец получал одно и то же полотно круглосуточно.

    Дайджест интерактивен: строка — ссылка на свой экран админки, у трёх
    старейших заявок есть ✅/❌ прямо здесь (те же `approve:`/`reject:`, что и
    на карточке), внизу — кнопка в очередь целиком.
    """
    try:
        from datetime import datetime, timedelta, timezone

        from aiogram.utils.keyboard import InlineKeyboardBuilder

        from shared import admin_links, approvals

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id or not _bot:
            return

        pending = await approvals.list_pending(limit=20)
        if not pending:
            return

        now = datetime.now(timezone.utc)
        steps = approvals.REMIND_AFTER_HOURS
        due = []
        for item in pending:
            created = _aware(item.get("created_at"))
            if not created:
                continue
            # Сколько ждать до следующего напоминания — по числу уже сделанных.
            step = steps[min(int(item.get("remind_count") or 0), len(steps) - 1)]
            since = _aware(item.get("reminded_at")) or created
            if now - since >= timedelta(hours=step):
                due.append(item)

        if not due:
            return

        # Счётчик берём отдельным запросом: `len(pending)` печатал размер
        # LIMIT'а, то есть «20» при любой длине очереди.
        total = await approvals.count_pending()
        shown = _collapse_duplicates(due)[:_DIGEST_LINES]

        lines = [f"⏳ <b>Ждут вашего решения: {total}</b>", ""]
        for number, item in enumerate(shown, start=1):
            hours = int((now - _aware(item["created_at"])).total_seconds() // 3600)
            tail = f" — {hours} ч"
            if item.get("repeats", 1) > 1:
                tail += f" (просили {item['repeats']} раз)"
            lines.append(
                f"{number}. "
                + admin_links.link(item["summary"][:120], item["kind"], item.get("payload"))
                + tail
            )

        # Свёрнутые дубли уже посчитаны в своей строке — вычитаем именно их,
        # а не число строк, иначе хвост обещал бы девять «ещё» заявок там,
        # где на самом деле одна, повторённая десять раз.
        covered = sum(int(item.get("rows") or 1) for item in shown)
        if total > covered:
            lines.append(f"…ещё {total - covered}")

        # Напоминание засчитываем ВСЕМ, о ком написали, а не первым десяти:
        # заявки из хвоста иначе никогда не двигали счётчик и переспрашивались
        # по самому короткому шагу лестницы бесконечно.
        for item in due:
            await approvals.mark_reminded(item["token"])

        builder = InlineKeyboardBuilder()
        for number, item in enumerate(shown[:_DIGEST_BUTTONS], start=1):
            builder.button(text=f"✅ {number}", callback_data=f"approve:{item['token']}")
            builder.button(text=f"❌ {number}", callback_data=f"reject:{item['token']}")
        builder.add(admin_links.tab_button(f"🏢 Все {total} заявок", "approvals", admin_id))
        builder.adjust(*([2] * min(len(shown), _DIGEST_BUTTONS) + [1]))

        await _bot.send_message(
            admin_id,
            "\n".join(lines),
            parse_mode="HTML",
            reply_markup=builder.as_markup(),
            # Иначе Telegram подцепит превью сайта к первой же ссылке и
            # растянет дайджест картинкой на пол-экрана.
            disable_web_page_preview=True,
        )
    except Exception as exc:
        logger.warning("Не смог напомнить о заявках: %s", exc)


async def retry_stuck_tasks():
    """Раз в час переотправляем задачи, которые никто не взял.

    Единственный механизм восстановления работы в офисе. `TASK_CREATED`
    доставляется через Redis Pub/Sub, а он не переигрывает: отдел, который
    в момент публикации перезапускался, задачу не получал НИКОГДА, и она
    молча оставалась в `todo`. Ни одного повтора в системе не было.

    Две попытки: после второй задача уже не «не доехала», а не выполняется
    по существу — тогда это вопрос к владельцу, а не к доставке. Счёт ведёт
    `tasks.retry_count`; до его появления «две попытки» были только здесь в
    тексте, а на деле повтор шёл вечно, каждые три часа.
    """
    try:
        from shared import tasks_repo

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        stuck = await tasks_repo.list_stuck(older_than_hours=3, limit=20)
        if not stuck:
            return

        exhausted = []
        for task in stuck:
            await event_bus.publish(
                "TASK_CREATED",
                {
                    "task_id": task["id"],
                    "title": task["title"],
                    "description": task["description"] or task["title"],
                    "department": task["department"],
                    "priority": task["priority"],
                    "chat_id": admin_id,
                    "retry": True,
                },
                "stepan_bot",
            )
            await tasks_repo.mark_retried(task["id"])
            if task["retry_count"] + 1 >= tasks_repo.MAX_RETRIES:
                exhausted.append(task)

        logger.info("Переотправлено зависших задач: %s", len(stuck))

        # Молчать нельзя: если отдел не берёт задачу и со второго раза,
        # проблема не в доставке, и владелец должен об этом узнать.
        if admin_id and _bot and len(stuck) >= 5:
            await send_report(
                _bot,
                admin_id,
                f"🔁 <b>Переотправил {len(stuck)} зависших задач.</b>\n"
                f"Если они повиснут снова — отдел их не берёт по существу, "
                f"а не из-за доставки.",
                admin_tab="tasks",
                button_text="📋 Задачи отделам",
            )

        # Исчерпавшие попытки надо назвать поимённо. Иначе задача просто
        # перестаёт переотправляться и остаётся в `todo` навсегда, никак себя
        # не обозначив: молчание тут неотличимо от «всё в порядке».
        if admin_id and _bot and exhausted:
            names = "\n".join(f"• #{t['id']} {t['title'][:60]}" for t in exhausted[:10])
            # «Решите сами или удалите» — прямое требование действия, и до
            # сих пор оно приходило без единого способа его выполнить:
            # номера задач напечатаны, а открыть их нечем.
            await send_report(
                _bot,
                admin_id,
                f"🛑 <b>Больше не переотправляю ({len(exhausted)}):</b>\n{names}\n\n"
                f"Попытки исчерпаны — отдел не берёт их по существу. "
                f"Решите сами или удалите.",
                admin_tab="tasks",
                focus=str(exhausted[0]["id"]) if len(exhausted) == 1 else None,
                button_text="📋 Разобрать задачи",
            )
    except Exception as exc:
        logger.warning("Не смог переотправить зависшие задачи: %s", exc)


# ── Регистрация задач ────────────────────────────────────────────────────
# ── Регистрация задач операционного управления ────────────────────────────
# Раз в сутки, а не раз в час: дайджест просрочки — это напоминание, а не
# монитор. Имя job'а менять нельзя — по нему админка переопределяет расписание
# (shared/settings_store.get_job_overrides).
scheduler.add_cron(name="check_deadlines", func=check_deadlines, hour=9, minute=30)
scheduler.add_interval(name="check_followups", func=check_followups, seconds=1800)
scheduler.add_cron(name="evening_summary", func=evening_summary, hour=20, minute=0)
scheduler.add_cron(
    name="weekly_report", func=weekly_report, hour=9, minute=5, day_of_week=0
)
scheduler.add_interval(
    name="auto_task_creation", func=auto_task_creation, seconds=4 * 3600
)
# Восстановление работы: задачи, до которых событие не доехало.
scheduler.add_interval(name="retry_stuck_tasks", func=retry_stuck_tasks, seconds=3600)
# Заявки, ждущие решения владельца: раньше они просто испарялись через 15 минут.
scheduler.add_interval(
    name="remind_pending_approvals", func=remind_pending_approvals, seconds=3600
)
# Частая проверка (5 мин) — теперь антиспам: алертит только при ИЗМЕНЕНИИ (упал/восстановился).
scheduler.add_interval(name="bot_health_check", func=bot_health_check, seconds=300)
# Ежедневная полная сводка в 09:00 (всегда присылается).
scheduler.add_cron(name="bot_health_summary", func=bot_health_summary, hour=9, minute=0)
# Посадки: сводка утром, отдельное напоминание по «последнему дню» в обед.
# 08:30, а не 09:00 — чтобы не слипаться со сводкой о ботах в одну простыню.
scheduler.add_cron(name="grow_morning", func=grow_morning, hour=8, minute=30)
scheduler.add_cron(name="grow_urgent", func=grow_urgent, hour=14, minute=0)


# Инфраструктура
async def _daily_backup():
    from shared.backup import daily_backup_task

    # Передаём бота, чтобы о неудачном или повреждённом бэкапе узнали все
    # администраторы, а не только логи на сервере.
    await daily_backup_task(_bot)


async def _token_refresh():
    try:
        from shared.token_refresh import auto_refresh_token

        await auto_refresh_token()
    except Exception as e:
        logger.warning(f"Token refresh error: {e}")


# Instagram Stories промо-рассылка отключена по решению пользователя
# async def _post_ig_story():
#     try:
#         from shared.instagram_stories import post_promotional_story
#         await post_promotional_story()
#     except Exception as e:
#         logger.warning(f"Instagram Story post error: {e}")
#
# scheduler.add_interval(name="instagram_story_promo", func=_post_ig_story, seconds=36*3600, initial_delay=3600)

scheduler.add_cron(name="daily_backup", func=_daily_backup, hour=3, minute=0)
scheduler.add_interval(
    name="token_refresh", func=_token_refresh, seconds=86400 * 7
)  # раз в неделю


# ── Очередь зеркала «витрина → офис» ────────────────────────────────────
#
# Витрина складывает заказы и чеки в `office_outbox` и повторяет доставку,
# но толкает очередь только НОВАЯ операция. Роут по расписанию на витрине
# написан и не вызывался никем: офис лёг под вечер, следующий чек утром —
# и заказ проваляется в очереди всю ночь, хотя чинить нечего.
#
# Планировщик в проекте один и живёт здесь, поэтому стучится офис.
async def _drain_office_queue():
    from shared.storefront_orders import drain_office_queue

    await drain_office_queue()


scheduler.add_interval(
    name="office_queue_drain", func=_drain_office_queue, seconds=900
)


# ── KPI-watchdog: при падении показателей автоматически созывает совещание отделов ──
async def _kpi_watchdog_job():
    try:
        from bots.stepan_bot.handlers.team_meeting import run_kpi_watchdog

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        chat = getattr(settings, "sales_group_id", 0) or admin_id
        if _bot and chat:
            kpi_dropped = await run_kpi_watchdog(_bot, chat)
            if kpi_dropped:
                from shared.owner_alerts import raise_alert, SEVERITY_WARNING

                await raise_alert(
                    kind="kpi_drop",
                    severity=SEVERITY_WARNING,
                    title="Зафиксировано проседание KPI отделов",
                    message="KPI-watchdog зафиксировал снижение показателей и автоматически созвал совещание отделов.",
                    source="stepan_bot",
                )
    except Exception as e:
        logger.warning(f"KPI watchdog job error: {e}")


if getattr(settings, "kpi_watchdog_enabled", True):
    scheduler.add_cron(
        name="kpi_watchdog",
        func=_kpi_watchdog_job,
        hour=getattr(settings, "kpi_watchdog_hour", 11),
        minute=0,
    )


async def run_magazine_pipeline():
    """Еженедельный запуск пайплайна создания журнала FRESH WEEKLY."""
    try:
        from shared.bot_bus import send_task, get_result
        from shared.event_bus import BotBusActions, event_bus

        admin_id = settings.admin_telegram_ids[0]

        # Информационное — не требует действий, убрано из спама
        logger.info("Magazine pipeline started")

        # Фаза 1: Сбор данных
        logger.info("Magazine Phase 1: Data Gathering")
        facts_task = await send_task(
            "stepan_bot", "rnd_bot", BotBusActions.GENERATE_MAGAZINE_FACTS
        )
        products_task = await send_task(
            "stepan_bot", "analytics_bot", BotBusActions.GET_TOP_PRODUCTS
        )
        restaurant_task = await send_task(
            "stepan_bot", "marketing_bot", BotBusActions.PICK_RESTAURANT
        )

        # Ждем результаты первой фазы
        facts_res = await get_result(facts_task, timeout=120)
        products_res = await get_result(products_task, timeout=120)
        restaurant_res = await get_result(restaurant_task, timeout=120)

        # Фаза 2: Контент и реклама
        logger.info("Magazine Phase 2: Content & Ads")
        content_task = await send_task(
            "stepan_bot",
            "content_bot",
            BotBusActions.DRAFT_MAGAZINE,
            params={
                "facts": facts_res.get("result") if facts_res else "Факты не получены",
                "products": products_res.get("result")
                if products_res
                else "Продукты не получены",
                "restaurant": restaurant_res.get("result")
                if restaurant_res
                else "Ресторан не получен",
            },
        )

        ads_task = await send_task(
            "stepan_bot", "sales_bot", BotBusActions.SELL_MAGAZINE_ADS
        )

        content_res = await get_result(content_task, timeout=300)
        ads_res = await get_result(ads_task, timeout=300)

        # Фаза 3: Деплой
        if (
            not content_res
            or content_res.get("status") != "done"
            or "error" in content_res.get("result", {})
        ):
            await _bot.send_message(
                admin_id,
                "⚠️ <b>Stepan:</b> Ошибка контента журнала, пайплайн прерван.",
                parse_mode="HTML",
            )
            return

        logger.info("Magazine Phase 3: Publishing")
        publish_task = await send_task(
            "stepan_bot",
            "devops_bot",
            BotBusActions.PUBLISH_MAGAZINE,
            params={
                "content": content_res.get("result"),
                "ads": ads_res.get("result") if ads_res else [],
            },
        )

        publish_res = await get_result(publish_task, timeout=300)

        if publish_res and publish_res.get("status") == "done":
            issue_data = publish_res.get("result", {})
            if issue_data.get("status") == "done":
                await _bot.send_message(
                    admin_id,
                    f"✅ <b>Stepan:</b> Журнал FRESH WEEKLY №{issue_data.get('issue_id', '?')} успешно опубликован!\n\n🔗 {issue_data.get('url', '')}",
                    parse_mode="HTML",
                )

                # Рассылка события о публикации
                from shared.event_bus import event_bus

                await event_bus.publish("MAGAZINE_PUBLISHED", issue_data, "stepan")
            else:
                err = issue_data.get("message", "Неизвестная ошибка")
                await _bot.send_message(
                    admin_id,
                    f"⚠️ <b>Stepan:</b> Ошибка публикации журнала: {err}",
                    parse_mode="HTML",
                )
        else:
            await _bot.send_message(
                admin_id,
                "⚠️ <b>Stepan:</b> Таймаут или критическая ошибка публикации журнала.",
                parse_mode="HTML",
            )

    except Exception as e:
        logger.error(f"run_magazine_pipeline error: {e}", exc_info=True)


# Отключён: заменён веб-кроном magazine_cron_prepare/finalize/print_run (персональные выпуски)
# scheduler.add_cron(name="magazine_pipeline", func=run_magazine_pipeline, day_of_week=2, hour=10, minute=0)


async def _cron_magazine_prepare():
    try:
        import aiohttp
        import os

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/prepare",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                # Код ответа, а не только тело: при 401 (разошёлся
                # BOT_SECRET) или 500 строка лога выглядела бы точно так
                # же, как при успехе, — «Cron Prepare: {...}». Владелец
                # узнавал, что подготовка выпуска не случилась, по отсутствию
                # готового журнала.
                if resp.status != 200:
                    logger.error(
                        "Cron Prepare: витрина ответила %s — %s",
                        resp.status,
                        str(data)[:300],
                    )
                    return
                logger.info(f"Cron Prepare: {data}")
    except Exception as e:
        logger.error(f"Cron Prepare error: {e}")


async def _cron_magazine_finalize():
    try:
        import aiohttp
        import os

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/finalize",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                # Код ответа, а не только тело: при 401 (разошёлся
                # BOT_SECRET) или 500 строка лога выглядела бы точно так
                # же, как при успехе, — «Cron Finalize: {...}». Владелец
                # узнавал, что публикация выпуска не случилась, по отсутствию
                # готового журнала.
                if resp.status != 200:
                    logger.error(
                        "Cron Finalize: витрина ответила %s — %s",
                        resp.status,
                        str(data)[:300],
                    )
                    return
                logger.info(f"Cron Finalize: {data}")
    except Exception as e:
        logger.error(f"Cron Finalize error: {e}")


async def _cron_magazine_print_run():
    try:
        import aiohttp
        import os
        import asyncio

        secret = os.environ.get("BOT_SECRET", "")
        storefront_url = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{storefront_url}/admin/magazine/cron/print-run",
                headers={"x-bot-secret": secret},
            ) as resp:
                data = await resp.json()
                # Тот же разбор, что у Prepare и Finalize. Здесь цена выше:
                # ниже по коду из ответа берутся `slugs`, и при отказе их
                # просто нет — печать тиража тихо не происходит, а в логе
                # остаётся обычная строка «Cron Print-Run: {...}».
                if resp.status != 200:
                    logger.error(
                        "Cron Print-Run: витрина ответила %s — %s",
                        resp.status,
                        str(data)[:300],
                    )
                    return
                logger.info(f"Cron Print-Run: {data}")

                slugs = data.get("slugs", [])
                if slugs:
                    if admin_id and _bot:
                        logger.info(f"Generating PDF for {len(slugs)} magazines...")

                    for slug in slugs:
                        logger.info(f"Generating PDF for {slug}...")
                        process = await asyncio.create_subprocess_exec(
                            "node",
                            "scripts/generate-magazine-pdf.js",
                            slug,
                            cwd=str(ROOT),
                        )
                        await process.communicate()

                    if admin_id and _bot:
                        logger.info(
                            f"PDF generation finished for {len(slugs)} magazines"
                        )

    except Exception as e:
        logger.error(f"Cron Print-Run error: {e}")


# ── Журнальный конвейер ОТКЛЮЧЁН по решению владельца ────────────────────
#
# FRESH WEEKLY делается вручную и выкладывается через админку: кому нужен —
# берёт с сайта. Автоматика тут не помогала, а мешала.
#
# Опаснее всего был `finalize`: он брал ПОСЛЕДНИЙ неопубликованный выпуск и
# ставил ему `isPublished = true` каждый четверг в 12:00 — в том числе номер,
# который владелец в этот момент готовил руками. То есть незаконченный журнал
# мог уехать в публикацию сам по себе.
# `prepare` каждую среду заводил пустой выпуск «Автоматический выпуск», а
# `print-run` в пятницу создавал заказы на печать по активным подпискам.
#
# Функции оставлены: конвейер вызывается вручную через POST /n8n-webhook и
# через админку журнала. Убрано только расписание.
#
# scheduler.add_cron(name="magazine_cron_prepare", func=_cron_magazine_prepare,
#                    day_of_week=2, hour=9, minute=0)
# scheduler.add_cron(name="magazine_cron_finalize", func=_cron_magazine_finalize,
#                    day_of_week=3, hour=12, minute=0)
# scheduler.add_cron(name="magazine_cron_print_run", func=_cron_magazine_print_run,
#                    day_of_week=4, hour=8, minute=0)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════


async def main():
    if not settings.stepan_bot_token:
        logger.error("FATAL: STEPAN_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    global _bot
    storage = RedisStorage.from_url(settings.redis_url)
    bot = Bot(
        token=settings.stepan_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    _bot = bot
    dp = Dispatcher(storage=storage)

    # -- Импортируем обработчики --
    from bots.stepan_bot.handlers import all_routers
    from shared.approvals import approvals_router
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    # Кнопки ✅/❌ под рискованными действиями отдела. Без этого роутера
    # карточка подтверждения показывается, а нажатие ничего не делает.
    dp.include_router(approvals_router)
    for router in all_routers:
        dp.include_router(router)

    from shared.group_orchestrator import create_group_router
    from bots.stepan_bot.handlers.assistant import brain

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        brain,
        wake_words=[
            "степан",
            "стёпа",
            "степа",
            "stepan",
            "шеф",
            "босс",
            "менеджер",
            "директор",
            "отдел devops",
            "devops",
            "девопс",
            "отдел qa",
            "тестирование",
            "качество",
            "отдел r&d",
            "r&d",
            "исследования",
            "разработка",
            "отдел логистик",
            "логистика",
            "доставка",
        ],
    )
    dp.include_router(group_router)

    # -- EventBus: слушаем ВСЕ события --
    # Uses the global singleton from shared.event_bus (imported at top)

    async def on_any_event(payload: dict):
        """Степан обрабатывает события — только важные уведомляет."""
        event_type = payload.get("event")
        data = payload.get("data", {})
        source = payload.get("source", "unknown")

        # Только критичные события отправляем админу
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )

        if event_type == "complaint_received" and admin_id:
            summary = data.get("summary", "Без описания")
            customer = data.get("customer_name", "Клиент")
            await bot.send_message(
                admin_id,
                f"⚠️ <b>ЖАЛОБА</b> от {customer}\n{summary}",
            )
        elif event_type == "large_expense_alert" and admin_id:
            await bot.send_message(
                admin_id,
                f"💸 <b>Крупный расход!</b>\n{data.get('summary', '')}",
            )
        elif event_type == "franchise_report_generated" and admin_id:
            city = data.get("city", "Unknown")
            report_text = data.get("content", "")
            await bot.send_message(
                admin_id,
                f"🏢 <b>Журнал Франчайзи ({city.capitalize()})</b>\n\n{report_text}",
                parse_mode="HTML",
            )
        elif event_type == "DELIVERY_STATUS_REPORT":
            sales_group = getattr(settings, "sales_group_id", 0)
            target_chat = sales_group if sales_group else admin_id
            if target_chat:
                from shared.ai_engine import AIEngine

                ai = AIEngine()
                prompt = (
                    "Сформируй понятный, живой и мотивирующий отчёт для группы продаж о текущем статусе заказов. "
                    f"Данные: {data}. "
                    "Не используй слишком формальный язык. Опиши ситуацию с курьерами и сборкой."
                )
                try:
                    ai_report = await ai.chat_completion(
                        role_prompt("Ты руководитель Степан. Отправь отчёт о доставке для команды."),
                        prompt,
                    )
                    await bot.send_message(
                        target_chat,
                        f"📦 <b>Сводка по логистике от Степана:</b>\n\n{ai_report}",
                        parse_mode="HTML",
                    )
                except Exception as e:
                    logger.error(f"Error generating delivery report: {e}")
        elif event_type == "new_message" and admin_id:
            # Отключено: пересылает ВСЕ служебные уведомления, спамит
            pass
        # Ветки `order_created` здесь больше нет — и подписки тоже.
        #
        # На один заказ заводились ДВЕ задачи: «🛒 Заказ N — подготовить»
        # (`notifications.pm_on_order_created`, отдел production) и «Доставить
        # заказ N» отсюда (отдел logistics). Оба отдела ведёт Стёпан, поэтому
        # один заказ стоил двух строк в `tasks`, двух полных прогонов модели со
        # всем набором инструментов и четырёх сообщений владельцу. При двадцати
        # заказах в день — сорок задач и восемьдесят сообщений.
        #
        # Осталась одна задача, в её описании есть и сборка, и доставка.

        else:
            # Всё остальное — только лог, не спамим в чат
            logger.info(f"Степан: событие {event_type} от {source} — записано")

    async def handle_pm_task_created(payload: dict):
        """Задачи отделов без своего бота: pm, operations, production, logistics.

        Сюда же попадает ВСЁ, что не взял ни один отдел, и всё, что прошло два
        делегирования (CHIEF_FALLBACK в shared/tools/common.py). То есть это
        конечная точка эскалации — и до сих пор она была единственным
        обработчиком в офисе, который ничего не умел: один вызов модели без
        инструментов плюс списание склада по подстроке «посад»/«посев» на
        одинаковые выдуманные «1 кг семян и 5 субстратов» при любом объёме.

        Теперь здесь общий исполнитель, а Стёпан как руководитель видит
        инструменты всех отделов, включая write_off_inventory с явными
        аргументами.
        """
        from shared.tools.registry import CHIEF_ALIASES

        # Список отделов без своего бота живёт в registry.CHIEF_ALIASES —
        # здесь он был пятой копией и уже успел разойтись. 'delivery' —
        # легаси: так помечены задачи, созданные до починки маршрутизации,
        # без него они остались бы сиротами навсегда.
        data = payload.get("data", {})
        if str(data.get("department", "")).lower() not in CHIEF_ALIASES | {"delivery"}:
            return

        try:
            from shared.prompts import TEAM_CONTEXT
            from shared.task_executor import execute_bot_task

            role = (
                f"{TEAM_CONTEXT}\n\nТы — Операционный Директор (COO) и главный "
                f"Project Manager. Мысли по Agile/Lean: узкие места, пошаговый "
                f"план, риски. Отвечай как живой сотрудник — коротко подтверди, "
                f"что берёшь задачу, дай суть и первый конкретный шаг. "
                f"Максимум 4-5 предложений, без markdown-заголовков.\n"
                f"Если задача про посев, сборку или упаковку — спиши расходники "
                f"инструментом write_off_inventory, назвав позицию и количество. "
                f"Не знаешь количества — спроси, не выдумывай."
            )
            logger.info("Степан (Менеджер) passing task to TaskExecutor...")
            await execute_bot_task(
                bot=bot,
                bot_name="stepan_bot",
                department="pm",
                task_data=data,
                team_context=role,
            )
        except Exception as e:
            logger.error(f"Error handling PM task: {repr(e)}", exc_info=True)

    async def handle_task_completed(payload: dict):
        data = payload.get("data", {})
        task_id = data.get("task_id")
        completed_by = data.get("completed_by", "unknown")
        chat_id = data.get("chat_id")
        if task_id:
            try:
                # Здесь стоял `SELECT message_id FROM tasks` ради удаления
                # карточки задачи в чате. Колонки message_id в схеме нет
                # (см. schema.prisma, модель Task), запрос падал, исключение
                # ловилось внизу — и UPDATE ниже не выполнялся НИКОГДА.
                # В чат уходило «задача выполнена», а в базе оставалось 'todo',
                # и дайджест просрочки показывал её вечно. Именно так у
                # владельца накопились «невыполнимые» задачи.
                from shared import tasks_repo

                if not await tasks_repo.set_status(int(task_id), "done"):
                    logger.warning(f"TASK {task_id}: статус не обновлён")
                    return
                logger.info(f"TASK {task_id} MARKED AS DONE by {completed_by}")

                report_text = data.get("text", "")
                if chat_id:
                    msg = f"✅ <b>Задача #{task_id} успешно выполнена отделом {completed_by.upper()}!</b>"
                    if report_text:
                        msg += f"\n\n{report_text}"
                    await bot.send_message(chat_id, msg, parse_mode="HTML")
            except Exception as e:
                logger.error(f"Error marking task {task_id} as done: {e}")

    # handle_ig_dm удалён. Заказ из Instagram Direct целиком оформляет
    # shared/instagram_dm.py: он заводит клиента, создаёт заказ на витрине и
    # шлёт ORDER_CREATED только для локального черновика. Этот обработчик делал
    # то же самое параллельно и публиковал СИНТЕТИЧЕСКИЙ order_created — без
    # строки в базе и со строкой «120000 UZS» вместо суммы, то есть фантомную
    # выручку в финансах и аналитике. Издателя события ig_dm_received убрали
    # ещё раньше (см. комментарий в instagram_dm.py) именно из-за задвоения
    # заказов, так что обработчик был недостижим — и вернулся бы вместе с
    # любым новым издателем.


    # Подписываемся на события
    for event_type in [
        "complaint_received",
        "application_received",
        "large_expense_alert",
        "task_created",
        "task_completed",
        "b2b_lead_created",
        "order_status_changed",
        "feedback_received",
        "DELIVERY_STATUS_REPORT",
        "new_message",
    ]:
        event_bus.on(event_type, on_any_event)

    event_bus.on("TASK_COMPLETED", handle_task_completed)
    event_bus.on("TASK_CREATED", handle_pm_task_created)
    from shared.notifications import register_pm_handlers

    register_pm_handlers(event_bus, bot)
    # Подписки на ig_dm_received нет: заказы из Instagram оформляет
    # shared/instagram_dm.py, второй обработчик заводил их повторно.

    # ── Подключение к шинам ──
    # EventBus теперь слушает через встроенный aiohttp сервер ниже
    # -- Startup / Shutdown --
    async def on_startup():
        logger.info("🤖 Степан запущен! Готов помогать.")
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id:
            try:
                await bot.send_message(
                    admin_id,
                    "🤖 <b>Степан на связи!</b>\n\n"
                    "Я ваш личный помощник. Пишите мне любые задачи,\n"
                    "вопросы или поручения — я разберусь.\n\n"
                    "💡 Примеры:\n"
                    "• <i>Подготовить 50 лотков руколы к пятнице</i>\n"
                    "• <i>Сколько мы заработали за эту неделю?</i>\n"
                    "• <i>Найди курьера на полный день</i>\n"
                    "• <i>Напиши пост для Instagram про скидку 20%</i>\n"
                    "• <i>Какой статус по всем задачам?</i>",
                )
            except Exception:
                pass

    dp.startup.register(on_startup)

    # ── Запуск планировщика и heartbeat ──
    # scheduler.add_cron(name="daily_report", func=daily_report, hour=9, minute=30)  # Убрано в пользу n8n
    await scheduler.start()
    asyncio.create_task(start_heartbeat("stepan_bot"))

    # Постоянная дверь в свой раздел админки: кнопка рядом с полем ввода.
    # Кнопки под сообщениями уезжают вверх за день переписки, эта — нет.
    from shared import menu_button

    asyncio.create_task(menu_button.install(bot, "stepan_bot"))
    from shared import self_restart
    from shared.bot_bus import start_listener as bus_listen

    async def bus_get_tasks(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text

            async with get_session_ctx() as session:
                res = await session.execute(
                    text(
                        "SELECT id, title, department, status, priority, deadline FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, deadline ASC NULLS LAST LIMIT 20"
                    )
                )
                rows = res.fetchall()
                res2 = await session.execute(
                    text("SELECT status, COUNT(*) FROM tasks GROUP BY status")
                )
                stats = {r[0]: r[1] for r in res2.fetchall()}
            tasks_list = [
                {
                    "id": r[0],
                    "title": r[1],
                    "department": r[2],
                    "status": r[3],
                    "priority": r[4],
                    "deadline": str(r[5]) if r[5] else None,
                }
                for r in rows
            ]
            return {
                "status": "ok",
                "message": f"Активных задач: {len(tasks_list)}",
                "data": {"tasks": tasks_list, "stats": stats},
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def bus_get_deadlines(params: dict) -> dict:
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text

            async with get_session_ctx() as session:
                res = await session.execute(
                    text(
                        "SELECT id, title, deadline, priority, department FROM tasks WHERE deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status NOT IN ('done', 'cancelled') ORDER BY deadline ASC"
                    )
                )
                rows = res.fetchall()
            deadlines = [
                {
                    "id": r[0],
                    "title": r[1],
                    "deadline": str(r[2]),
                    "priority": r[3],
                    "department": r[4],
                }
                for r in rows
            ]
            return {
                "status": "ok",
                "message": f"Дедлайнов в ближайшие 7 дней: {len(deadlines)}",
                "data": deadlines,
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def bus_force_learning_cycle(params: dict) -> dict:
        """Прогнать петли обучения по всем ботам сейчас — кнопка в админке.

        Обычно каждая петля срабатывает по своему расписанию (KPI в 20:00,
        P&L в 18:00 и т.д.), и увидеть эффект правки бенчмарков можно было
        только на следующий день. Здесь прогоняем их разом.
        """
        from shared.feedback_loop import feedback_loop
        from shared.database import get_session_ctx
        from sqlalchemy import text

        # Берём метрики, по которым уже есть история: так цикл сам
        # подхватывает новые петли, добавленные в другие боты.
        pairs: list[tuple[str, str]] = []
        try:
            async with get_session_ctx() as session:
                res = await session.execute(
                    text(
                        "SELECT DISTINCT bot, metric FROM bot_learnings ORDER BY bot, metric"
                    )
                )
                pairs = [(r[0], r[1]) for r in res.fetchall()]
        except Exception as exc:
            return {"status": "error", "message": f"Не удалось прочитать петли: {exc}"}

        if not pairs:
            return {
                "status": "ok",
                "message": "Петли ещё не запускались — нечего пересчитывать. "
                "Дождитесь первого планового цикла.",
            }

        # Пересчёт идёт по РЕАЛЬНЫМ замерам из bot_measurements.
        #
        # Раньше сюда передавали `current_data={"trigger": "manual"}` и пустой
        # бенчмарк: модель просили «оценить результаты относительно эталона»,
        # не дав ни результатов, ни эталона. Она честно выдумывала вывод, а
        # `evaluate_and_adapt` гасила предыдущий — добытый по данным. То есть
        # нажатие кнопки в админке ЗАМЕНЯЛО настоящее обучение галлюцинацией.
        # Нет замеров — пропускаем пару и говорим об этом вслух.
        done, failed, skipped = 0, 0, 0
        for bot_name, metric in pairs:
            try:
                history = await feedback_loop.recent_measurements(bot_name, metric, limit=10)
                if not history:
                    skipped += 1
                    continue

                latest = history[0]
                await feedback_loop.evaluate_and_adapt(
                    bot=bot_name,
                    metric=metric,
                    current_data={
                        "value": latest["value"],
                        "measured_at": latest["at"],
                        "history": [h["value"] for h in history],
                        "source": "web_admin_manual",
                    },
                    benchmark_data=(
                        {"target": latest["target"]} if latest.get("target") is not None else {}
                    ),
                )
                done += 1
            except Exception as exc:
                logger.warning(
                    "force_learning_cycle: %s/%s упал: %s", bot_name, metric, exc
                )
                failed += 1

        parts = [f"{done} пересчитано"]
        if skipped:
            parts.append(f"{skipped} без замеров — пропущено")
        if failed:
            parts.append(f"{failed} с ошибкой")
        return {
            "status": "ok",
            "message": "Петли: " + ", ".join(parts),
            "processed": done,
            "skipped": skipped,
            "failed": failed,
        }

    asyncio.create_task(
        bus_listen(
            "stepan_bot",
            {
                # Перезапуск по команде из админки. Бот выходит сам,
                # Docker поднимает его обратно (restart: unless-stopped) —
                # доступ к сокету Docker для этого не нужен.
                "restart_self": self_restart.handler("stepan_bot"),
                "get_tasks": bus_get_tasks,
                "get_deadlines": bus_get_deadlines,
                "force_learning_cycle": bus_force_learning_cycle,
            },
        )
    )

    # ── Webhook Server для n8n ──
    from aiohttp import web

    async def n8n_webhook_handler(request):
        try:
            data = await request.json()
            action = data.get("action")
            if action == "daily_report":
                asyncio.create_task(daily_report())
            elif action == "evening_summary":
                asyncio.create_task(evening_summary())
            elif action == "check_deadlines":
                asyncio.create_task(check_deadlines())
            elif action == "weekly_report":
                asyncio.create_task(weekly_report())
            elif action == "auto_task_creation":
                asyncio.create_task(auto_task_creation())
            elif action == "check_followups":
                asyncio.create_task(check_followups())

            elif action == "bus_get_tasks":
                result = await bus_get_tasks({})
                return web.json_response(result)
            elif action == "bus_get_deadlines":
                result = await bus_get_deadlines({})
                return web.json_response(result)
            else:
                return web.json_response(
                    {"status": "error", "message": "Unknown action"}, status=400
                )
            return web.json_response({"status": "ok", "action": action})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)}, status=500)

    app = web.Application()
    app.router.add_post("/n8n-webhook", n8n_webhook_handler)
    await event_bus.start_listening(8081, app)

    logger.info("🤖 Запуск Степана...")
    try:
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()


if __name__ == "__main__":
    asyncio.run(main())

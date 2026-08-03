"""
⚡ РЕАЛЬНЫЕ ДЕЙСТВИЯ ОТДЕЛОВ — что боты действительно МОГУТ сделать
====================================================================
Раньше «исполнение плана» было театром: run_execution создавал строку в tasks
и просил модель сочинить отчёт («проведён дожим клиентов по 80% заказов»).
Никакой работы за этим не стояло, а задачи закрывались по выдумке.

Возможности у ботов ЕСТЬ — они просто не были подключены к исполнению:
публикация в Instagram, рассылка в Telegram, письма с КП, IG Direct,
сбор B2B-лидов из 2ГИС, запись расходов, отчёты из БД.

Здесь — реестр этих возможностей. Каждая:
  • делает РЕАЛЬНОЕ действие;
  • возвращает ДОКАЗАТЕЛЬСТВА (кому, сколько, куда) — а не пересказ;
  • честно сообщает, что не смогла.

🪜 ГЛАВНЫЙ ПРИНЦИП — ЛЕСТНИЦА КАНАЛОВ.
Бот не умеет звонить. Но «обзвонить клиентов» ≠ «ничего не делать»: задача
спускается по доступным каналам, и человеку остаётся только настоящий остаток.

    Telegram  →  Email  →  задача человеку (звонок)

⚠️ Telegram API НЕ позволяет боту написать первым. Достучаться можно только до
клиентов, у которых есть telegram_id (то есть они сами начинали диалог).
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Callable, Awaitable, Optional

from sqlalchemy import text

from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

# Дневной предел исходящих сообщений клиентам (защита от спама/ошибки в плане)
DAILY_OUTREACH_CAP = int(getattr(settings, "outreach_daily_cap", 50) or 50)


# ═══════════════════════════════════════════════════════════════════════════
# Результат действия
# ═══════════════════════════════════════════════════════════════════════════
@dataclass
class Result:
    ok: bool
    summary: str  # что реально произошло (одной фразой)
    evidence: list = field(default_factory=list)  # факты: кому, сколько, куда
    human_task: Optional[str] = None  # остаток, который должен сделать человек


@dataclass
class Capability:
    key: str
    dept: str
    title: str
    description: str  # для AI-роутера: когда выбирать
    outward: bool  # трогает клиентов / публичный аккаунт → нужно подтверждение
    run: Callable[[dict], Awaitable[Result]]


# ═══════════════════════════════════════════════════════════════════════════
# 🪜 ЛЕСТНИЦА КАНАЛОВ — достучаться до клиента тем, что доступно
# ═══════════════════════════════════════════════════════════════════════════
_SEGMENTS = {
    "all": "TRUE",
    "b2b": "customer_type = 'b2b'",
    "b2c": "customer_type = 'b2c'",
    "vip": "status = 'vip'",
    "leads": "status = 'lead'",
    "stale_orders": (
        "id IN (SELECT customer_id FROM crm_orders "
        "WHERE status = 'new' AND created_at < NOW() - INTERVAL '24 hours')"
    ),
    "inactive": (
        "(last_order_date IS NULL OR "
        "last_order_date < CURRENT_DATE - INTERVAL '30 days')"
    ),
}


async def _pick_customers(segment: str, limit: int) -> list:
    where = _SEGMENTS.get(segment, _SEGMENTS["all"])
    async with get_session_ctx() as s:
        res = await s.execute(
            text(
                f"SELECT id, name, telegram_id, email, phone FROM customers "
                f"WHERE {where} ORDER BY COALESCE(total_spent, 0) DESC LIMIT :lim"
            ),
            {"lim": limit},
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "telegram_id": r[2],
                "email": r[3],
                "phone": r[4],
            }
            for r in res.fetchall()
        ]


async def _log_interaction(customer_id: int, channel: str, summary: str, bot_name: str):
    try:
        async with get_session_ctx() as s:
            await s.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary) "
                    "VALUES (:cid, :ch, 'outreach', :bot, :sum)"
                ),
                {
                    "cid": customer_id,
                    "ch": channel,
                    "bot": bot_name,
                    "sum": summary[:200],
                },
            )
            await s.commit()
    except Exception as e:
        logger.warning(f"не записал interaction: {e}")


async def _sent_today() -> int:
    """Сколько исходящих уже ушло сегодня — чтобы не превысить дневной лимит."""
    try:
        async with get_session_ctx() as s:
            res = await s.execute(
                text(
                    "SELECT COUNT(*) FROM interactions "
                    "WHERE interaction_type = 'outreach' AND DATE(created_at) = CURRENT_DATE"
                )
            )
            return int(res.scalar() or 0)
    except Exception:
        return 0


async def _reach(bot, cust: dict, message: str) -> str:
    """
    Достучаться до клиента ЛУЧШИМ ДОСТУПНЫМ каналом.
    Возвращает: 'telegram' | 'email' | 'need_call'.
    """
    # 1️⃣ Telegram — самый быстрый и бесплатный. Работает, только если клиент
    #    сам начинал диалог с ботом (иначе Telegram API запретит написать первым).
    if cust.get("telegram_id"):
        try:
            await bot.send_message(cust["telegram_id"], message)
            await _log_interaction(cust["id"], "telegram", message, "sales_bot")
            return "telegram"
        except Exception as e:
            # заблокировал бота / не начинал диалог → спускаемся по лестнице
            logger.info(f"telegram недоступен для {cust['id']}: {e}")

    # 2️⃣ Email
    if cust.get("email"):
        try:
            from shared.email_sender import send_email

            ok = await send_email(cust["email"], "Microgreen Uzbekistan", message)
            if ok:
                await _log_interaction(cust["id"], "email", message, "sales_bot")
                return "email"
        except Exception as e:
            logger.info(f"email недоступен для {cust['id']}: {e}")

    # 3️⃣ Голос бот не потянет — это настоящий остаток для человека.
    return "need_call"


async def _create_human_task(
    title: str, description: str, dept: str = "sales"
) -> Optional[int]:
    """Задача ЖИВОМУ сотруднику — то, что бот сделать физически не может."""
    try:
        async with get_session_ctx() as s:
            res = await s.execute(
                text(
                    "INSERT INTO tasks (title, description, department, status, priority) "
                    "VALUES (:t, :d, :dep, 'todo', 'high') RETURNING id"
                ),
                {"t": title[:100], "d": description, "dep": dept},
            )
            tid = res.scalar()
            await s.commit()
            return tid
    except Exception as e:
        logger.warning(f"не создал задачу человеку: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# ВОЗМОЖНОСТИ
# ═══════════════════════════════════════════════════════════════════════════


async def cap_notify_customers(params: dict) -> Result:
    """Написать клиентам по лестнице каналов. Здесь «обзвон» превращается в дело."""
    from aiogram import Bot
    from aiogram.client.default import DefaultBotProperties
    from aiogram.enums import ParseMode

    segment = str(params.get("segment") or "all").lower()
    message = (params.get("message") or "").strip()
    limit = min(int(params.get("limit") or DAILY_OUTREACH_CAP), DAILY_OUTREACH_CAP)

    if not message:
        return Result(False, "Не задан текст сообщения — писать нечего.")

    already = await _sent_today()
    room = max(0, DAILY_OUTREACH_CAP - already)
    if room == 0:
        return Result(
            False,
            f"Дневной лимит исходящих исчерпан ({DAILY_OUTREACH_CAP}). "
            f"Продолжу завтра.",
        )

    customers = await _pick_customers(segment, min(limit, room))
    if not customers:
        return Result(False, f"В сегменте «{segment}» нет клиентов — писать некому.")

    token = getattr(settings, "sales_bot_token", None)
    if not token:
        return Result(False, "Нет токена sales_bot — не могу писать клиентам.")

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    tg, mail, calls = [], [], []
    try:
        for c in customers:
            ch = await _reach(bot, c, message)
            (tg if ch == "telegram" else mail if ch == "email" else calls).append(c)
            await asyncio.sleep(0.2)  # не долбим Telegram API
    finally:
        try:
            await bot.session.close()
        except Exception:
            pass

    evidence, human = [], None
    if tg:
        evidence.append(f"✍️ Написал в Telegram: {len(tg)} чел.")
    if mail:
        evidence.append(f"📧 Отправил письма: {len(mail)} шт.")
    if calls:
        names = ", ".join(
            f"{c['name'] or '—'} ({c['phone'] or 'без телефона'})" for c in calls[:10]
        )
        tid = await _create_human_task(
            f"📞 Обзвонить {len(calls)} клиентов (нет Telegram и email)",
            f"Бот до них не дозвонится — нужен живой звонок.\n\nКлиенты: {names}\n\nЧто сказать:\n{message}",
        )
        human = f"📞 {len(calls)} клиентов только с телефоном → задача #{tid} менеджеру (звонок)"
        evidence.append(human)

    reached = len(tg) + len(mail)
    ok = reached > 0 or bool(calls)
    return Result(
        ok=ok,
        summary=f"Связался с {reached} из {len(customers)} клиентов сегмента «{segment}»"
        + (f"; {len(calls)} передал на звонок" if calls else ""),
        evidence=evidence,
        human_task=human,
    )


async def cap_push_stale_orders(params: dict) -> Result:
    """Догнать клиентов с необработанными заказами (>24ч)."""
    msg = params.get("message") or (
        "Здравствуйте! Мы видим ваш заказ и уже готовим его. "
        "Подтвердите, пожалуйста, удобное время доставки 🌱"
    )
    return await cap_notify_customers(
        {"segment": "stale_orders", "message": msg, "limit": params.get("limit")}
    )


async def _bus(
    to_bot: str, action: str, params: dict, timeout: int = 120
) -> Optional[dict]:
    """Вызвать действие другого бота через шину и дождаться результата."""
    from shared.bot_bus import send_task, get_result

    tid = await send_task("stepan_bot", to_bot, action, params)
    res = await get_result(tid, timeout=timeout)
    if res and res.get("status") == "done":
        return res.get("result") or {}
    if res and res.get("status") == "error":
        logger.warning(f"{to_bot}.{action} ошибка: {res.get('error')}")
    return None


async def cap_broadcast(params: dict) -> Result:
    """Рассылка по базе Telegram (через marketing_bot)."""
    message = (params.get("message") or "").strip()
    if not message:
        return Result(False, "Пустой текст рассылки.")
    target = str(params.get("target") or params.get("segment") or "all").lower()
    r = await _bus(
        "marketing_bot", "send_broadcast", {"target": target, "message": message}
    )
    if not r:
        return Result(False, "Маркетинг не смог выполнить рассылку.")
    txt = r.get("message", "Рассылка выполнена")
    return Result(True, txt, [f"📢 {txt}"])


async def cap_b2b_offer(params: dict) -> Result:
    """
    Коммерческие предложения B2B-лидам (через marketing_bot).
    Переиспользуем существующий пайплайн b2b_outreach: он генерирует КП с PDF
    и отправляет ВЛАДЕЛЬЦУ на одобрение (кнопки ✅/❌) — письмо уходит ресторану
    только после подтверждения. Ничего не дублируем и не шлём мимо этого контроля.
    """
    r = await _bus(
        "marketing_bot", "b2b_outreach", {"limit": params.get("limit")}, timeout=180
    )
    if not r:
        return Result(False, "Маркетинг не смог подготовить КП.")
    txt = r.get("message", "КП подготовлены")
    return Result(
        True,
        txt,
        [f"📧 {txt}", "⏳ Письма уйдут после вашего одобрения (кнопки под каждым КП)"],
    )


async def cap_collect_leads(params: dict) -> Result:
    """Собрать новых B2B-лидов (рестораны) из 2ГИС / Google / Яндекс."""
    r = await _bus(
        "marketing_bot", "collect_leads", {"limit": params.get("limit")}, timeout=180
    )
    if not r:
        return Result(False, "Не удалось собрать лидов.")
    txt = r.get("message", "Лиды собраны")
    return Result(True, txt, [f"🎯 {txt}"])


async def cap_publish_content(params: dict) -> Result:
    """Опубликовать пост/сторис в Instagram (через content_bot)."""
    topic = params.get("topic") or params.get("message") or "микрозелень"
    r = await _bus("content_bot", "publish_post", {"topic": topic}, timeout=180)
    if not r:
        return Result(False, "Контент-бот не смог опубликовать.")
    return Result(
        True, r.get("message", "Опубликовано"), [f"📸 {r.get('message', '')}"]
    )


async def cap_build_report(params: dict) -> Result:
    """Отчёт из БД (аналитика)."""
    r = await _bus("analytics_bot", "get_report", {"kind": params.get("kind", "full")})
    if not r:
        return Result(False, "Аналитика не отдала отчёт.")
    return Result(True, "Отчёт собран", [f"📊 {r.get('message', '')[:300]}"])


async def cap_instagram_stats(params: dict) -> Result:
    """Статистика Instagram — реальные охваты и вовлечённость."""
    r = await _bus("analytics_bot", "get_instagram_stats", {})
    if not r:
        return Result(False, "Не удалось получить статистику Instagram.")
    return Result(
        True, "Статистика Instagram получена", [f"📈 {r.get('message', '')[:300]}"]
    )


async def cap_check_dm(params: dict) -> Result:
    """Разобрать входящие Instagram Direct."""
    r = await _bus("support_bot", "check_instagram_dm", {})
    if not r:
        return Result(False, "Поддержка не смогла проверить Direct.")
    return Result(
        True, r.get("message", "Direct проверен"), [f"🎧 {r.get('message', '')}"]
    )


async def cap_human_task(params: dict) -> Result:
    """
    Действие, которое бот физически выполнить не может (встреча, переговоры,
    производство, закупка). Не врём, что сделали — заводим задачу человеку.
    """
    action = params.get("action") or params.get("message") or "Задача"
    dept = params.get("dept") or "pm"
    tid = await _create_human_task(action, params.get("details") or action, dept)
    return Result(
        True,
        f"Задача #{tid} поставлена человеку — бот это сделать не может",
        [f"🙋 Требует человека → задача #{tid}"],
        human_task=f"задача #{tid}",
    )


# ═══════════════════════════════════════════════════════════════════════════
# РЕЕСТР
# ═══════════════════════════════════════════════════════════════════════════
CAPABILITIES = {
    c.key: c
    for c in [
        Capability(
            "notify_customers",
            "sales",
            "Написать клиентам",
            "Связаться с клиентами: Telegram → email → звонок человеку. "
            "Выбирай для «обзвонить», «связаться», «дожать», «уведомить», "
            "«вернуть», «напомнить». params: segment "
            "(all|b2b|b2c|vip|leads|stale_orders|inactive), message",
            outward=True,
            run=cap_notify_customers,
        ),
        Capability(
            "push_stale_orders",
            "sales",
            "Догнать необработанные заказы",
            "Написать клиентам с заказами, висящими больше суток. params: message",
            outward=True,
            run=cap_push_stale_orders,
        ),
        Capability(
            "broadcast",
            "marketing",
            "Рассылка по базе",
            "Массовое сообщение в Telegram: акция, новость, промокод. "
            "params: target (all|b2b|b2c|vip), message",
            outward=True,
            run=cap_broadcast,
        ),
        Capability(
            "b2b_offer",
            "marketing",
            "КП ресторанам",
            "Подготовить коммерческие предложения B2B-лидам (PDF на email, "
            "уходят после вашего одобрения). params: limit",
            outward=True,
            run=cap_b2b_offer,
        ),
        Capability(
            "collect_leads",
            "marketing",
            "Собрать лидов",
            "Найти новые рестораны (B2B-лиды) через 2ГИС/Google/Яндекс. params: limit",
            outward=False,
            run=cap_collect_leads,
        ),
        Capability(
            "publish_content",
            "content",
            "Опубликовать в Instagram",
            "Сделать и выложить пост/сторис. params: topic",
            outward=True,
            run=cap_publish_content,
        ),
        Capability(
            "build_report",
            "analytics",
            "Отчёт из базы",
            "Собрать аналитический отчёт по данным. params: kind",
            outward=False,
            run=cap_build_report,
        ),
        Capability(
            "instagram_stats",
            "analytics",
            "Статистика Instagram",
            "Реальные охваты и вовлечённость. Для «проанализировать соцсети».",
            outward=False,
            run=cap_instagram_stats,
        ),
        Capability(
            "check_dm",
            "support",
            "Разобрать Direct",
            "Проверить и обработать входящие Instagram Direct.",
            outward=False,
            run=cap_check_dm,
        ),
        Capability(
            "human_task",
            "pm",
            "Передать человеку",
            "ЕСЛИ действие боту недоступно (встреча, переговоры, производство, "
            "закупка, найм) — выбирай это. Не выдумывай выполнение. "
            "params: action, dept",
            outward=False,
            run=cap_human_task,
        ),
    ]
}


def catalog_for_ai() -> str:
    """Каталог возможностей — чтобы AI выбирал реальное действие, а не фантазию."""
    return "\n".join(
        f"- {c.key} ({c.dept}): {c.description}" for c in CAPABILITIES.values()
    )


def is_outward(key: str) -> bool:
    cap = CAPABILITIES.get(key)
    return bool(cap and cap.outward)


async def run_capability(key: str, params: dict) -> Result:
    """Выполнить возможность. Неизвестный ключ → честно передаём человеку."""
    cap = CAPABILITIES.get(key)
    if not cap:
        logger.info(f"неизвестная возможность '{key}' → отдаём человеку")
        return await cap_human_task(params)
    try:
        return await cap.run(params or {})
    except Exception as e:
        logger.error(f"возможность {key} упала: {e}", exc_info=True)
        return Result(False, f"Не удалось выполнить: {e}")

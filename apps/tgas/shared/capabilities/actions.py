import asyncio
import logging
from shared.config import settings
from shared.capabilities.core import Result, DAILY_OUTREACH_CAP
from shared.capabilities.utils import (
    _sent_today,
    _pick_customers,
    _reach,
    _create_human_task,
    _bus,
)

logger = logging.getLogger(__name__)

async def cap_notify_customers(params: dict) -> Result:
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
            f"Дневной лимит исходящих исчерпан ({DAILY_OUTREACH_CAP}). Продолжу завтра.",
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
            await asyncio.sleep(0.2)
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
        names = ", ".join(f"{c['name'] or '—'} ({c['phone'] or 'без телефона'})" for c in calls[:10])
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
    msg = params.get("message") or (
        "Здравствуйте! Мы видим ваш заказ и уже готовим его. "
        "Подтвердите, пожалуйста, удобное время доставки 🌱"
    )
    return await cap_notify_customers(
        {"segment": "stale_orders", "message": msg, "limit": params.get("limit")}
    )

async def cap_broadcast(params: dict) -> Result:
    message = (params.get("message") or "").strip()
    if not message:
        return Result(False, "Пустой текст рассылки.")
    target = str(params.get("target") or params.get("segment") or "all").lower()
    r = await _bus("marketing_bot", "send_broadcast", {"target": target, "message": message})
    if not r:
        return Result(False, "Маркетинг не смог выполнить рассылку.")
    txt = r.get("message", "Рассылка выполнена")
    return Result(True, txt, [f"📢 {txt}"])

async def cap_b2b_offer(params: dict) -> Result:
    r = await _bus("marketing_bot", "b2b_outreach", {"limit": params.get("limit")}, timeout=180)
    if not r:
        return Result(False, "Маркетинг не смог подготовить КП.")
    txt = r.get("message", "КП подготовлены")
    return Result(True, txt, [f"📧 {txt}", "⏳ Письма уйдут после вашего одобрения (кнопки под каждым КП)"])

async def cap_collect_leads(params: dict) -> Result:
    r = await _bus("marketing_bot", "collect_leads", {"limit": params.get("limit")}, timeout=180)
    if not r:
        return Result(False, "Не удалось собрать лидов.")
    txt = r.get("message", "Лиды собраны")
    return Result(True, txt, [f"🎯 {txt}"])

async def cap_publish_content(params: dict) -> Result:
    topic = params.get("topic") or params.get("message") or "микрозелень"
    r = await _bus("content_bot", "publish_post", {"topic": topic}, timeout=180)
    if not r:
        return Result(False, "Контент-бот не смог опубликовать.")
    return Result(True, r.get("message", "Опубликовано"), [f"📸 {r.get('message', '')}"])

async def cap_build_report(params: dict) -> Result:
    r = await _bus("analytics_bot", "get_report", {"kind": params.get("kind", "full")})
    if not r:
        return Result(False, "Аналитика не отдала отчёт.")
    return Result(True, "Отчёт собран", [f"📊 {r.get('message', '')[:300]}"])

async def cap_instagram_stats(params: dict) -> Result:
    r = await _bus("analytics_bot", "get_instagram_stats", {})
    if not r:
        return Result(False, "Не удалось получить статистику Instagram.")
    return Result(True, "Статистика Instagram получена", [f"📈 {r.get('message', '')[:300]}"])

async def cap_check_dm(params: dict) -> Result:
    r = await _bus("support_bot", "check_instagram_dm", {})
    if not r:
        return Result(False, "Поддержка не смогла проверить Direct.")
    return Result(True, r.get("message", "Direct проверен"), [f"🎧 {r.get('message', '')}"])

async def cap_human_task(params: dict) -> Result:
    action = params.get("action") or params.get("message") or "Задача"
    dept = params.get("dept") or "pm"
    tid = await _create_human_task(action, params.get("details") or action, dept)
    return Result(
        True,
        f"Задача #{tid} поставлена человеку — бот это сделать не может",
        [f"🙋 Требует человека → задача #{tid}"],
        human_task=f"задача #{tid}",
    )

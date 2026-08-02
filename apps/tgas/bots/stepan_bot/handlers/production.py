"""Степан (Менеджер) — Производство, Логистика, Инвентаризация, Обзор"""

from aiogram import Router, F
from aiogram.types import CallbackQuery
from sqlalchemy import text
from shared.database import get_session_ctx
from bots.stepan_bot.keyboards.inline import back_kb

router = Router()


@router.callback_query(F.data == "pm:production")
async def production(cb: CallbackQuery):
    await cb.message.edit_text(
        "🌱 <b>План производства</b>\n━━━━━━━━━━━━━━━━━━\n"
        "📋 <b>Посев:</b>\n• Руккола — 5 лотков\n• Базилик — 3 лотка\n\n"
        "🌿 <b>Сбор урожая:</b>\n• Шпинат — ~3 кг\n• Горох — ~2 кг\n\n"
        "📦 <b>Упаковка:</b>\n• Заказы на сегодня — формируются",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "pm:logistics")
async def logistics(cb: CallbackQuery):
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT order_number, delivery_address, status FROM orders "
                "WHERE status IN ('confirmed','ready','delivering') ORDER BY created_at LIMIT 10"
            )
        )
        orders = res.fetchall()
    if not orders:
        await cb.message.edit_text(
            "🚚 Нет активных доставок на сегодня.", reply_markup=back_kb()
        )
    else:
        lines = [f"🚚 <b>Доставки: {len(orders)}</b>\n━━━━━━━━━━━━━━━━━━"]
        for o in orders:
            lines.append(
                f"📍 #{o.order_number} — {o.delivery_address or 'Адрес не указан'} ({o.status})"
            )
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "pm:inventory")
async def inventory(cb: CallbackQuery):
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT name_ru, stock_qty, unit, category FROM products WHERE is_active = true ORDER BY stock_qty ASC LIMIT 15"
            )
        )
        products = res.fetchall()
    lines = ["📦 <b>Инвентаризация</b>\n━━━━━━━━━━━━━━━━━━"]
    for p in products:
        icon = "⚠️" if p.stock_qty < 5 else "✅"
        lines.append(f"{icon} {p.name_ru} — {p.stock_qty} {p.unit}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "pm:overview")
async def overview(cb: CallbackQuery):
    async with get_session_ctx() as session:
        tasks_r = await session.execute(
            text(
                "SELECT COUNT(*) FILTER (WHERE status='todo') as todo, COUNT(*) FILTER (WHERE status='in_progress') as wip, COUNT(*) FILTER (WHERE status='done') as done FROM tasks"
            )
        )
        t = tasks_r.fetchone()
        orders_r = await session.execute(
            text(
                "SELECT COUNT(*) FROM orders WHERE status NOT IN ('delivered','cancelled')"
            )
        )
        active_orders = orders_r.scalar() or 0
    await cb.message.edit_text(
        f"📊 <b>Обзор проекта</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"✅ Задачи: ⬜{t.todo} | 🔄{t.wip} | ✅{t.done}\n"
        f"📦 Активные заказы: {active_orders}\n"
        f"👥 Команда: на связи",
        reply_markup=back_kb(),
    )
    await cb.answer()

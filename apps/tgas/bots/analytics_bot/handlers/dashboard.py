"""Analytics Bot — Dashboard, Top Products, Customers, ABC"""

from aiogram import Router, F
from aiogram.types import CallbackQuery
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.utils import format_price
from bots.analytics_bot.keyboards.inline import back_kb

router = Router()


@router.callback_query(F.data == "an:dashboard")
async def dashboard(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COALESCE(SUM(total_amount),0) as rev, COUNT(*) as cnt "
                "FROM orders WHERE created_at >= date_trunc('month', CURRENT_DATE)"
            )
        )
        d = r.fetchone()
        avg = int(d.rev / d.cnt) if d.cnt > 0 else 0
    await cb.message.edit_text(
        f"📊 <b>Дашборд продаж — текущий месяц</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"💰 Выручка: {format_price(d.rev)}\n"
        f"📦 Заказов: {d.cnt}\n"
        f"🧾 Средний чек: {format_price(avg)}",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "an:top")
async def top_products(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT p.name_ru, SUM(oi.total_price) as rev FROM order_items oi "
                "JOIN products p ON p.id = oi.product_id GROUP BY p.name_ru ORDER BY rev DESC LIMIT 5"
            )
        )
        products = r.fetchall()
    if not products:
        await cb.message.edit_text(
            "🏆 Пока нет данных о продажах.", reply_markup=back_kb()
        )
    else:
        medals = ["🥇", "🥈", "🥉", "4.", "5."]
        lines = ["🏆 <b>Топ товаров по выручке</b>\n━━━━━━━━━━━━━━━━━━"]
        for i, p in enumerate(products):
            lines.append(f"{medals[i]} {p.name_ru} — {format_price(p.rev)}")
        await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()


@router.callback_query(F.data == "an:customers")
async def customers(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT COUNT(*) as total, "
                "COUNT(*) FILTER (WHERE customer_type = 'b2b') as b2b, "
                "COUNT(*) FILTER (WHERE status = 'vip') as vip, "
                "COUNT(*) FILTER (WHERE status = 'active') as active, "
                "COUNT(*) FILTER (WHERE status = 'churned') as churned "
                "FROM customers"
            )
        )
        c = r.fetchone()
    await cb.message.edit_text(
        f"👥 <b>Анализ клиентов</b>\n━━━━━━━━━━━━━━━━━━\n"
        f"📊 Всего: {c.total}\n"
        f"🏢 B2B: {c.b2b}\n"
        f"⭐ VIP: {c.vip}\n"
        f"✅ Активные: {c.active}\n"
        f"❌ Отток: {c.churned}",
        reply_markup=back_kb(),
    )
    await cb.answer()


@router.callback_query(F.data == "an:abc")
async def abc_analysis(cb: CallbackQuery) -> None:
    async with get_session_ctx() as session:
        r = await session.execute(
            text(
                "SELECT p.name_ru, SUM(oi.total_price) as rev FROM order_items oi "
                "JOIN products p ON p.id = oi.product_id GROUP BY p.name_ru ORDER BY rev DESC"
            )
        )
        all_prods = r.fetchall()
    if not all_prods:
        await cb.message.edit_text(
            "📋 Нет данных для ABC-анализа.", reply_markup=back_kb()
        )
        await cb.answer()
        return
    total = sum(p.rev for p in all_prods)
    lines = ["📋 <b>ABC-анализ</b>\n━━━━━━━━━━━━━━━━━━"]
    cumulative = 0
    for p in all_prods:
        cumulative += p.rev
        pct = (cumulative / total * 100) if total > 0 else 0
        grade = "🟩 A" if pct <= 80 else ("🟨 B" if pct <= 95 else "🟥 C")
        lines.append(f"{grade} {p.name_ru} — {format_price(p.rev)}")
    await cb.message.edit_text("\n".join(lines), reply_markup=back_kb())
    await cb.answer()

"""Sales Bot — Каталог товаров."""

import logging
from aiogram import Router, F
from aiogram.types import CallbackQuery
from aiogram.fsm.context import FSMContext
from shared import catalog_repo
from shared.utils import format_price
from bots.sales_bot.keyboards.inline import categories_kb, main_menu_kb
from aiogram.utils.keyboard import InlineKeyboardBuilder

router = Router()
logger = logging.getLogger(__name__)

CATEGORY_MAP = {
    "cat:microgreens": "microgreens",
    "cat:baby-leaf": "baby-leaf",
    "cat:salads": "salads",
    "cat:flowers": "flowers",
    "cat:seeds": "seeds",
    "cat:substrate": "substrate",
    "cat:equipment": "equipment",
    "cat:sets": "sets",
}


@router.callback_query(F.data == "menu:catalog")
async def show_categories(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    title = "🛒 Выберите категорию:" if lang == "ru" else "🛒 Kategoriyani tanlang:"
    await cb.message.edit_text(title, reply_markup=categories_kb(lang))
    await cb.answer()


@router.callback_query(F.data.startswith("cat:"))
async def show_products(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    category = CATEGORY_MAP.get(cb.data, "microgreens")

    # Каталог-мастер живёт на витрине; читаем его через единую дверь, а не
    # своим SQL — иначе колонки офисного зеркала снова разойдутся со схемой.
    products = await catalog_repo.list_active(category)

    if not products:
        await cb.message.edit_text(
            "😔 В этой категории пока нет товаров."
            if lang == "ru"
            else "😔 Bu kategoriyada hozircha mahsulot yo'q.",
            reply_markup=categories_kb(lang),
        )
        await cb.answer()
        return

    lines = []
    b = InlineKeyboardBuilder()
    for p in products[:8]:
        name = (p["name_uz"] if lang == "uz" else p["name_ru"]) or p["name"]
        desc = (
            (p["description_uz"] or "") if lang == "uz" else (p["description_ru"] or "")
        )
        short_desc = desc[:60] + "..." if len(desc) > 60 else desc
        lines.append(
            f"🌱 <b>{name}</b>\n{short_desc}\n💰 {format_price(p['price'])} / {p['unit']}\n"
        )
        btn_text = f"🛒 {name}"
        b.button(text=btn_text, callback_data=f"add:{p['id']}")

    b.adjust(1)
    b.row(
        *[
            InlineKeyboardBuilder()
            .button(
                text="🛒 Корзина" if lang == "ru" else "🛒 Savat",
                callback_data="menu:cart",
            )
            .buttons[0],
            InlineKeyboardBuilder()
            .button(
                text="⬅️ Назад" if lang == "ru" else "⬅️ Orqaga",
                callback_data="menu:catalog",
            )
            .buttons[0],
        ]
    )

    text_msg = "\n".join(lines)
    await cb.message.edit_text(text_msg, reply_markup=b.as_markup())
    await cb.answer()


@router.callback_query(F.data.startswith("add:"))
async def add_to_cart(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    cart = data.get("cart", {})
    # Ключ товара витрины — cuid (строка), а не число: int(...) здесь падал
    # на каждом нажатии «в корзину» после объединения баз.
    product_id = cb.data.split(":", 1)[1]

    product = await catalog_repo.by_id(product_id)
    if not product:
        await cb.answer("Товар не найден")
        return

    name = (product["name_uz"] if lang == "uz" else product["name_ru"]) or product["name"]
    key = str(product["id"])
    if key in cart:
        cart[key]["qty"] += 1
    else:
        cart[key] = {
            "name": name,
            "price": product["price"],
            "unit": product["unit"],
            "qty": 1,
        }

    await state.update_data(cart=cart)
    await cb.answer(
        f"✅ {name} добавлен в корзину!"
        if lang == "ru"
        else f"✅ {name} savatga qo'shildi!"
    )


@router.callback_query(F.data == "menu:cart")
async def show_cart(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    cart = data.get("cart", {})

    if not cart:
        await cb.message.edit_text(
            "🛒 Ваша корзина пуста" if lang == "ru" else "🛒 Savatingiz bo'sh",
            reply_markup=categories_kb(lang),
        )
        await cb.answer()
        return

    lines = ["🛒 <b>Корзина:</b>\n" if lang == "ru" else "🛒 <b>Savat:</b>\n"]
    total = 0
    for pid, item in cart.items():
        subtotal = item["price"] * item["qty"]
        total += subtotal
        lines.append(f"• {item['name']} × {item['qty']} = {format_price(subtotal)}")

    lines.append(
        f"\n💰 <b>Итого: {format_price(total)}</b>"
        if lang == "ru"
        else f"\n💰 <b>Jami: {format_price(total)}</b>"
    )

    from bots.sales_bot.keyboards.inline import cart_confirm_kb

    await cb.message.edit_text("\n".join(lines), reply_markup=cart_confirm_kb(lang))
    await cb.answer()


@router.callback_query(F.data == "cart:clear")
async def clear_cart(cb: CallbackQuery, state: FSMContext):
    data = await state.get_data()
    lang = data.get("lang", "ru")
    await state.update_data(cart={})
    await cb.message.edit_text(
        "🗑 Корзина очищена" if lang == "ru" else "🗑 Savat tozalandi",
        reply_markup=main_menu_kb(lang),
    )
    await cb.answer()

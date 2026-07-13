"""
🆕 PRODUCT CARD — заведение товара полноценной карточкой
=========================================================
Товар в магазине — это не строка «название + цена». Это карточка: фото, название,
цена, категория, единица, описание на двух языках.

Разделение труда как в живой компании:
• руководитель даёт то, что знает только он — НАЗВАНИЕ, ЦЕНУ и ФОТО;
• контент-отдел (content_bot) пишет ОПИСАНИЕ (ru + uz) в фирменном тоне;
• отдел продаж (sales_bot) заводит карточку в магазин (витрина) и в CRM.

Мастер вызывается из уточнения продажи («товара нет в каталоге» → кнопка
«Добавить») и продолжает прерванную продажу после публикации товара.
"""

import logging
from typing import Optional

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import BufferedInputFile, CallbackQuery, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared.utils import format_price

logger = logging.getLogger(__name__)
product_card_router = Router()

CATEGORIES = [
    ("microgreens", "🌱 Микрозелень"),
    ("baby-leaf", "🍃 Бейби-листья"),
    ("salads", "🥗 Салаты"),
    ("flowers", "🌸 Цветы"),
    ("seeds", "🌾 Семена"),
    ("substrate", "🧱 Субстрат"),
    ("equipment", "⚙️ Оборудование"),
    ("sets", "🎁 Наборы"),
]
UNITS = [("piece", "шт"), ("kg", "кг"), ("g", "г"), ("pack", "упаковка"), ("set", "набор")]


class ProductCard(StatesGroup):
    name = State()
    price = State()
    category = State()
    unit = State()
    photo = State()
    confirm = State()


async def start_product_card(
    message: Message,
    state: FSMContext,
    name: Optional[str] = None,
    price: Optional[float] = None,
    sale_token: Optional[str] = None,
    sale_index: Optional[int] = None,
):
    """Запустить мастер. name/price могут прийти из незакрытой продажи."""
    await state.set_data({
        "name": name, "price": price,
        "sale_token": sale_token, "sale_index": sale_index,
    })
    await message.answer(
        "🆕 <b>Заводим карточку товара</b>\n\n"
        "От вас — название, цена и фото. Описание напишет контент-отдел, "
        "в магазин и CRM заведёт отдел продаж.",
        parse_mode="HTML",
    )
    if not name:
        await state.set_state(ProductCard.name)
        await message.answer("1/4. Как называется товар?")
        return
    if price is None:
        await state.set_state(ProductCard.price)
        await message.answer(f"1/4. Товар: <b>{name}</b>\n2/4. Цена за единицу (в сумах)?",
                             parse_mode="HTML")
        return
    await _ask_category(message, state)


def _category_kb():
    builder = InlineKeyboardBuilder()
    for slug, title in CATEGORIES:
        builder.button(text=title, callback_data=f"pc:cat:{slug}")
    builder.button(text="✖️ Отмена", callback_data="pc:cancel")
    builder.adjust(2)
    return builder.as_markup()


def _unit_kb():
    builder = InlineKeyboardBuilder()
    for slug, title in UNITS:
        builder.button(text=title, callback_data=f"pc:unit:{slug}")
    builder.button(text="✖️ Отмена", callback_data="pc:cancel")
    builder.adjust(3)
    return builder.as_markup()


def _photo_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="🚫 Без фото", callback_data="pc:nophoto")
    builder.button(text="✖️ Отмена", callback_data="pc:cancel")
    builder.adjust(1)
    return builder.as_markup()


def _confirm_kb():
    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Опубликовать", callback_data="pc:publish")
    builder.button(text="🔄 Другое описание", callback_data="pc:regen")
    builder.button(text="✖️ Отмена", callback_data="pc:cancel")
    builder.adjust(1)
    return builder.as_markup()


async def _ask_category(message: Message, state: FSMContext):
    await state.set_state(ProductCard.category)
    await message.answer("3/4. Категория товара?", reply_markup=_category_kb())


@product_card_router.message(ProductCard.name)
async def on_name(message: Message, state: FSMContext):
    name = (message.text or "").strip()
    if len(name) < 2:
        await message.answer("Название слишком короткое. Напишите, как называется товар.")
        return
    await state.update_data(name=name)
    data = await state.get_data()
    if data.get("price") is None:
        await state.set_state(ProductCard.price)
        await message.answer(f"2/4. Цена за единицу «{name}» (в сумах)?")
        return
    await _ask_category(message, state)


@product_card_router.message(ProductCard.price)
async def on_price(message: Message, state: FSMContext):
    from shared.sales_ops import _to_float

    price = _to_float(message.text)
    if not price or price <= 0:
        await message.answer("Не понял цену. Напишите числом, например: 15000")
        return
    await state.update_data(price=price)
    await _ask_category(message, state)


@product_card_router.callback_query(ProductCard.category, F.data.startswith("pc:cat:"))
async def on_category(callback: CallbackQuery, state: FSMContext):
    await state.update_data(category=callback.data.split(":")[2])
    await callback.message.edit_reply_markup(reply_markup=None)
    await state.set_state(ProductCard.unit)
    await callback.message.answer("3/4. В чём измеряем?", reply_markup=_unit_kb())
    await callback.answer()


@product_card_router.callback_query(ProductCard.unit, F.data.startswith("pc:unit:"))
async def on_unit(callback: CallbackQuery, state: FSMContext):
    await state.update_data(unit=callback.data.split(":")[2])
    await callback.message.edit_reply_markup(reply_markup=None)
    await state.set_state(ProductCard.photo)
    await callback.message.answer(
        "4/4. Пришлите <b>фото товара</b> — оно пойдёт на карточку в магазине.",
        parse_mode="HTML", reply_markup=_photo_kb(),
    )
    await callback.answer()


@product_card_router.message(ProductCard.photo, F.photo)
async def on_photo(message: Message, state: FSMContext):
    from shared.catalog_ops import upload_image

    await message.answer("📤 Загружаю фото в магазин…")
    photo = message.photo[-1]
    file = await message.bot.get_file(photo.file_id)
    buffer = await message.bot.download_file(file.file_path)
    image_url = await upload_image(buffer.read(), f"{photo.file_unique_id}.jpg")

    if not image_url:
        await message.answer("⚠️ Фото загрузить не удалось — заведу карточку без него.")
    await state.update_data(image_url=image_url)
    await _build_preview(message, state)


@product_card_router.callback_query(ProductCard.photo, F.data == "pc:nophoto")
async def on_no_photo(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_reply_markup(reply_markup=None)
    await state.update_data(image_url=None)
    await callback.answer()
    await _build_preview(callback.message, state)


async def _request_description(data: dict) -> dict:
    """Описание пишет контент-отдел (bot_bus). Молчит — заводим без описания."""
    from shared.bot_bus import send_task, get_result

    try:
        task_id = await send_task("stepan_bot", "content_bot", "product_description", {
            "name": data.get("name"), "price": data.get("price"), "category": data.get("category"),
        })
        bus_result = await get_result(task_id, timeout=90)
    except Exception as e:
        logger.error(f"Описание товара: сбой шины: {e}", exc_info=True)
        return {}

    result = (bus_result or {}).get("result") or {}
    if result.get("status") != "ok":
        return {}
    return result.get("data") or {}


async def _build_preview(message: Message, state: FSMContext):
    await message.answer("✍️ Контент-отдел пишет описание…")

    data = await state.get_data()
    description = await _request_description(data)
    await state.update_data(desc_ru=description.get("ru", ""), desc_uz=description.get("uz", ""))

    data = await state.get_data()
    category_title = dict(CATEGORIES).get(data.get("category"), data.get("category"))
    unit_title = dict(UNITS).get(data.get("unit"), data.get("unit"))

    card = [
        "🆕 <b>Карточка товара</b>",
        "",
        f"<b>{data.get('name')}</b>",
        f"💵 {format_price(data.get('price'))} / {unit_title}",
        f"📂 {category_title}",
    ]
    if data.get("desc_ru"):
        card += ["", f"📝 {data['desc_ru']}"]
    else:
        card += ["", "⚠️ Описание не получено (контент-отдел не ответил) — заведу без него."]
    if not data.get("image_url"):
        card += ["", "🚫 Без фото."]

    await state.set_state(ProductCard.confirm)
    text = "\n".join(card)

    if data.get("image_url"):
        try:
            from shared.catalog_ops import STOREFRONT_API_URL
            import aiohttp
            base = STOREFRONT_API_URL.rstrip("/").removesuffix("/api")
            async with aiohttp.ClientSession() as http:
                async with http.get(f"{base}{data['image_url']}") as resp:
                    photo_bytes = await resp.read()
            await message.answer_photo(
                BufferedInputFile(photo_bytes, filename="product.jpg"),
                caption=text, parse_mode="HTML", reply_markup=_confirm_kb(),
            )
            return
        except Exception as e:
            logger.warning(f"Превью карточки без картинки: {e}")

    await message.answer(text, parse_mode="HTML", reply_markup=_confirm_kb())


@product_card_router.callback_query(ProductCard.confirm, F.data == "pc:regen")
async def on_regen(callback: CallbackQuery, state: FSMContext):
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Прошу контент-отдел переписать…")
    await _build_preview(callback.message, state)


@product_card_router.callback_query(ProductCard.confirm, F.data == "pc:publish")
async def on_publish(callback: CallbackQuery, state: FSMContext):
    """Публикуем карточку: отдел продаж заводит товар в магазин и CRM."""
    from shared.bot_bus import send_task, get_result

    data = await state.get_data()
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Публикую…")
    await callback.message.answer("🛒 Отдел продаж заводит товар в магазин и CRM…")

    try:
        task_id = await send_task("stepan_bot", "sales_bot", "add_product", {
            "name": data.get("name"),
            "price": data.get("price"),
            "unit": data.get("unit"),
            "category": data.get("category"),
            "description_ru": data.get("desc_ru"),
            "description_uz": data.get("desc_uz"),
            "image_url": data.get("image_url"),
        })
        bus_result = await get_result(task_id, timeout=90)
    except Exception as e:
        logger.error(f"Публикация товара: сбой шины: {e}", exc_info=True)
        await callback.message.answer("😔 Отдел продаж недоступен — товар НЕ заведён.")
        await state.clear()
        return

    result = (bus_result or {}).get("result") or {}
    if result.get("status") not in ("ok", "exists"):
        await callback.message.answer(
            f"⚠️ Товар не заведён: {result.get('message', 'отдел не ответил')}"
        )
        await state.clear()
        return

    await callback.message.answer(result.get("message", "Товар заведён."))

    # Товар появился — дозаписываем прерванную продажу, если мастер пришёл из неё.
    sale_token = data.get("sale_token")
    sale_index = data.get("sale_index")
    await state.clear()

    if sale_token is None or sale_index is None:
        return

    from bots.stepan_bot.handlers.sale_ui import (
        load_pending, drop_pending, run_sale, answer_sale_result,
    )
    pending = await load_pending(sale_token)
    if not pending:
        await callback.message.answer(
            "ℹ️ Продажа, из-за которой заводили товар, уже неактуальна — запишите её заново."
        )
        return

    pending["items"][int(sale_index)]["product_id"] = (result.get("data") or {}).get("product_id")
    sale_result = await run_sale(pending)
    await drop_pending(sale_token)
    await answer_sale_result(callback.message, sale_result)


@product_card_router.callback_query(F.data == "pc:cancel")
async def on_cancel(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    try:
        await callback.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass
    await callback.message.answer("✖️ Заведение товара отменено. В магазин и CRM ничего не ушло.")
    await callback.answer()

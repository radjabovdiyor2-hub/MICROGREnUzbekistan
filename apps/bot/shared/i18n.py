"""
Двуязычие витринного бота: русский и узбекский.

ЧТО БЫЛО

Бот числился двуязычным, а переведён был ровно один экран — `/start`. Всё
остальное — каталог, карточка, корзина, оформление, подтверждение заказа,
профиль, бонусы — жило захардкоженными русскими строками. Переключатель
языка в профиле показывал тост «язык изменён» и НИЧЕГО НЕ СОХРАНЯЛ.

Хуже того: новые пользователи заводятся с `language = 'uz'`
(`schema.prisma`, `api/users/telegram`), поэтому профиль честно писал
«🇺🇿 Oʻzbekcha», а весь интерфейс вокруг оставался русским. И ИИ-продавцу
велено отвечать на языке собеседника — то есть на одном экране могли
оказаться узбекский ответ и русские кнопки под ним.

КАК УСТРОЕНО

Один словарь: ключ → (uz, ru). Пара, а не два словаря, потому что забыть
перевод при таком виде невозможно физически — тест `test_i18n.py` это
закрепляет.

Язык живёт там же, где корзина (Redis, тот же TTL), и зеркалится в
`users.language` через витрину — чтобы сайт и бот говорили с человеком
одинаково.
"""

from __future__ import annotations

LANGS = ("uz", "ru")
DEFAULT_LANG = "ru"

# ── Словарь ───────────────────────────────────────────────────────────
# Ключ построен как «экран.смысл», а не по тексту: строку правят чаще, чем
# роль строки на экране.
STRINGS: dict[str, tuple[str, str]] = {
    # ── Общее: подписи кнопок ──
    # Одно действие — ОДНА подпись. До этого «домой» называлось тремя
    # способами («🏠 Главное меню», «🏠 Меню», «« Назад»), каталог —
    # шестью, а корзина отличалась даже эмодзи.
    "btn.home": ("🏠 Bosh menyu", "🏠 Главное меню"),
    "btn.catalog": ("🛒 Katalog", "🛒 Каталог"),
    "btn.cart": ("🛍️ Savat", "🛍️ Корзина"),
    "btn.back": ("« Orqaga", "« Назад"),
    "btn.checkout": ("✅ Rasmiylashtirish", "✅ Оформить"),
    "btn.clear": ("🗑 Tozalash", "🗑 Очистить"),
    "btn.add_to_cart": ("🛒 Savatga", "🛒 В корзину"),
    "btn.on_site": ("🌐 Saytda", "🌐 На сайте"),
    "btn.favorite_add": ("🤍 Sevimlilarga", "🤍 В избранное"),
    "btn.favorite_remove": ("❤️ Sevimlilarda", "❤️ В избранном"),
    "btn.cancel": ("❌ Bekor qilish", "❌ Отмена"),
    "btn.confirm_order": ("✅ Buyurtmani tasdiqlash", "✅ Подтвердить заказ"),
    "btn.share_phone": ("📱 Raqamni yuborish", "📱 Поделиться номером"),
    "btn.orders": ("📦 Buyurtmalarim", "📦 Мои заказы"),
    "btn.bonuses": ("💰 Bonuslar", "💰 Бонусы"),
    "btn.profile": ("👤 Profil", "👤 Профиль"),
    "btn.recipes": ("🍽️ Retseptlar", "🍽️ Рецепты"),
    "btn.favorites": ("❤️ Sevimlilar", "❤️ Избранное"),
    "btn.reorder": ("🔄 Buyurtmani takrorlash", "🔄 Повторить заказ"),
    "btn.about": ("ℹ️ Biz haqimizda", "ℹ️ О нас"),
    "btn.language": ("🌐 Til / Язык", "🌐 Til / Язык"),
    "btn.game": ("🎮 Oʻynash", "🎮 Играть"),
    "btn.referral": ("👥 Doʻstni taklif qilish", "👥 Пригласить друга"),
    "btn.ai": ("🤖 AI yordamchi", "🤖 Спросить AI"),

    # ── Меню и экраны кабинета ──
    "menu.title": (
        "🌱 <b>Microgreen Uzbekistan</b>\n\nNima qilamiz?",
        "🌱 <b>Microgreen Uzbekistan</b>\n\nЧем займёмся?",
    ),
    "orders.title": ("📦 <b>Buyurtmalarim</b>", "📦 <b>Мои заказы</b>"),
    "orders.empty": (
        "Sizda hali buyurtma yoʻq.\nKatalogdan birinchi buyurtmani bering!",
        "У вас пока нет заказов.\nОформите первый заказ через каталог!",
    ),
    "orders.failed": (
        "Buyurtmalarni yuklab boʻlmadi. Birozdan soʻng urinib koʻring.",
        "Не удалось загрузить заказы. Попробуйте чуть позже.",
    ),
    "bonuses.title": ("💰 <b>Bonuslarim</b>", "💰 <b>Мои бонусы</b>"),
    "bonuses.balance": ("Balans: <b>{count}</b> ball", "Баланс: <b>{count}</b> баллов"),
    "favorites.title": ("❤️ <b>Sevimlilar</b>", "❤️ <b>Избранное</b>"),
    "favorites.empty": (
        "Sevimlilar boʻsh.\nMahsulot kartochkasidagi ❤️ tugmasini bosing.",
        "Избранное пусто.\nНажмите ❤️ на карточке товара.",
    ),
    "favorites.added": ("❤️ {title} sevimlilarga qoʻshildi", "❤️ {title} в избранном"),
    "favorites.removed": ("Sevimlilardan olib tashlandi", "Убрано из избранного"),
    "reorder.title": ("🔄 <b>Buyurtmani takrorlash</b>", "🔄 <b>Повторить заказ</b>"),
    "reorder.none": (
        "Takrorlash uchun buyurtma yoʻq.",
        "Нет предыдущих заказов, чтобы повторить.",
    ),

    # ── Каталог ──
    "shop.pick_category": (
        "🛒 Microgreen Uzbekistan doʻkoni\nKategoriyani tanlang:",
        "🛒 Магазин Microgreen Uzbekistan\nВыберите категорию:",
    ),
    "shop.empty_category": (
        "Bu kategoriyada hozircha mahsulot yoʻq",
        "В этой категории пока нет товаров",
    ),
    "shop.unavailable": (
        "Doʻkon vaqtincha javob bermayapti. Bir necha daqiqadan soʻng urinib koʻring.",
        "Магазин временно не отвечает. Попробуйте через несколько минут.",
    ),
    "shop.page": ("📄 {current}/{total}", "📄 {current}/{total}"),

    # ── Карточка товара ──
    "product.price": ("💰 {price} soʻm", "💰 {price} сум"),
    "product.out_of_stock": (
        "{title} hozir mavjud emas.\nHar kuni toʻldiramiz — ertaga kiring.",
        "{title} сейчас нет в наличии.\nМы пополняем каждый день — загляните завтра.",
    ),
    "product.not_found": ("Mahsulot topilmadi", "Товар не найден"),
    "product.added": ("✅ Savatga qoʻshildi!", "✅ Добавлено в корзину!"),

    # ── Корзина ──
    "cart.title": ("🛍️ <b>Savatingiz</b>", "🛍️ <b>Ваша корзина</b>"),
    "cart.empty": ("Savat boʻsh", "Корзина пуста"),
    "cart.empty_hint": (
        "Savat boʻsh. Katalogdan mahsulot tanlang.",
        "Корзина пуста. Выберите товар в каталоге.",
    ),
    "cart.subtotal": ("Mahsulotlar: {sum} soʻm", "Товары: {sum} сум"),
    "cart.delivery": ("Yetkazish: {sum} soʻm", "Доставка: {sum} сум"),
    "cart.delivery_free": ("Yetkazish: bepul", "Доставка: бесплатно"),
    "cart.total": ("<b>Jami: {sum} soʻm</b>", "<b>Итого: {sum} сум</b>"),
    "cart.cleared": ("Savat tozalandi", "Корзина очищена"),
    "cart.item_removed": ("Mahsulot olib tashlandi", "Товар убран"),

    # ── Оформление ──
    "checkout.confirm_title": (
        "📋 <b>Buyurtmani tasdiqlang</b>",
        "📋 <b>Подтвердите заказ</b>",
    ),
    "checkout.need_phone": (
        "📱 Buyurtma uchun telefon raqamingiz kerak.\n"
        "Pastdagi tugmani bosing — raqam avtomatik yuboriladi.",
        "📱 Для оформления заказа нужен ваш номер телефона.\n"
        "Нажмите кнопку ниже — номер отправится автоматически.",
    ),
    "checkout.cancelled": (
        "Rasmiylashtirish bekor qilindi. Savat saqlanib qoldi.",
        "Оформление отменено. Корзина сохранена.",
    ),
    "checkout.done": (
        "✅ <b>Buyurtma #{number} qabul qilindi!</b>\n\n"
        "Menejer tez orada bogʻlanadi.",
        "✅ <b>Заказ #{number} оформлен!</b>\n\n"
        "Менеджер свяжется с вами в ближайшее время.",
    ),
    "checkout.failed": (
        "⚠️ Buyurtmani saqlab boʻlmadi. Savat joyida — biroz keyin urinib koʻring "
        "yoki {phone} raqamiga qoʻngʻiroq qiling.",
        "⚠️ Не получилось сохранить заказ. Корзина на месте — попробуйте чуть "
        "позже или позвоните {phone}.",
    ),

    # ── Профиль и язык ──
    "profile.title": ("👤 <b>Profil</b>", "👤 <b>Профиль</b>"),
    "profile.phone": ("Telefon: {phone}", "Телефон: {phone}"),
    "profile.phone_unknown": ("koʻrsatilmagan", "не указан"),
    "profile.language": ("Til: {lang}", "Язык: {lang}"),
    "lang.saved": ("✅ Til oʻzgartirildi", "✅ Язык изменён"),
    "lang.uz": ("🇺🇿 Oʻzbekcha", "🇺🇿 Узбекский"),
    "lang.ru": ("🇷🇺 Ruscha", "🇷🇺 Русский"),

    # ── Заставки ИИ-продавца ──
    "ai.splash": (
        "🤖 <b>AI yordamchi tayyor!</b>\n\n"
        "Menga istalgan savolni yozing, men yordam beraman:\n\n"
        "🥗 <b>Ta'mga qarab tanlash</b> — qaysi mikro-koʻkat qaysi taomga\n"
        "🍽️ <b>Retseptlar</b> — sogʻlom ovqatlanish retseptlari\n"
        "📸 <b>Taom surati</b> — suratni yuboring, nima qoʻshishni aytaman\n"
        "🛒 <b>Buyurtma</b> — shu yerda rasmiylashtiraman\n"
        "🚚 <b>Yetkazish</b> — shartlar va muddatlarni aytaman\n"
        "🎤 <b>Ovozli xabar</b> — yuboring, tinglab javob beraman\n\n"
        "👇 <i>Yoki pastdan tanlang:</i>",
        "🤖 <b>AI-помощник готов!</b>\n\n"
        "Просто напишите мне любой вопрос, и я помогу:\n\n"
        "🥗 <b>Подбор по вкусу</b> — какая микрозелень к какому блюду\n"
        "🍽️ <b>Рецепты</b> — ПП и ЗОЖ рецепты с микрозеленью\n"
        "📸 <b>Фото еды</b> — пришлите фото блюда, подскажу чем дополнить\n"
        "🛒 <b>Заказ</b> — оформлю покупку прямо здесь\n"
        "🚚 <b>Доставка</b> — расскажу условия и сроки\n"
        "🎤 <b>Голосовые</b> — отправьте голосовое, я расшифрую и отвечу\n\n"
        "👇 <i>Или выберите действие ниже:</i>",
    ),
    "ai.ready": (
        "🤖 <b>AI yordamchi tayyor!</b>\n\n"
        "Istalgan savolni yozing!\n"
        "📸 Taom suratini yuboring — nima qoʻshishni aytaman\n"
        "🎤 Ovozli xabar yuboring — tinglab javob beraman",
        "🤖 <b>AI-помощник готов!</b>\n\n"
        "Напишите любой вопрос!\n"
        "📸 Пришлите фото еды — подскажу чем дополнить\n"
        "🎤 Отправьте голосовое — я расшифрую",
    ),
    "ai.photo_hint": (
        "📸 Taomingiz suratini shu chatga yuboring!\n"
        "Qaysi mikro-koʻkat unga mos kelishini aytaman.",
        "📸 Просто отправьте фото вашего блюда в этот чат!\n"
        "Я подскажу, какая микрозелень его дополнит.",
    ),
    "ai.shop_hint": (
        "🛒 <b>Mikro-koʻkat tanlash</b>\n\n"
        "Nima kerakligini yozing, masalan:\n\n"
        "• <i>«Qaysi mikro-koʻkat eng mazali?»</i>\n"
        "• <i>«Salatga nima qoʻshsam boʻladi?»</i>\n"
        "• <i>«Achchiqroq narsa sinab koʻrmoqchiman»</i>\n"
        "• <i>«2 lotok kungaboqar buyurtma qiling, tel +998901234567»</i>\n\n"
        "Ta'mga qarab tanlab, narxlarini aytaman! 🌱",
        "🛒 <b>Подбор микрозелени</b>\n\n"
        "Напишите мне, что вам нужно, например:\n\n"
        "• <i>«Какая микрозелень самая вкусная?»</i>\n"
        "• <i>«Что добавить в салат?»</i>\n"
        "• <i>«Хочу попробовать что-нибудь острое»</i>\n"
        "• <i>«Закажи 2 лотка подсолнечника, тел +998901234567»</i>\n\n"
        "Подберу по вкусу и назову цены! 🌱",
    ),

    # ── Игра и «о нас» ──
    "game.body": (
        "🎮 <b>Farm Simulator</b>\n\n"
        "Oʻsimliklarni bosing, GreenCoins yigʻing!\n"
        "Tangalarni chegirmaga almashtirish mumkin.",
        "🎮 <b>Farm Simulator</b>\n\n"
        "Нажимай на растения, зарабатывай GreenCoins!\n"
        "Монеты можно обменять на скидки.",
    ),
    "about.body": (
        "🌱 <b>Microgreen Uzbekistan</b>\n"
        "Yangi mikro-koʻkat • Beybi-list • Salatlar 🥗\n\n"
        "• 🌿 Mikro-koʻkat, beybi-list, salatlar\n"
        "• 🤖 Tanlash va buyurtma uchun AI yordamchi\n"
        "• 🎮 Farm Simulator — oʻynang va bonus oling!\n"
        "• 🚚 Yetkazish: Samarqand + Toshkent\n\n"
        "<b>Bizning resurslar:</b>",
        "🌱 <b>Microgreen Uzbekistan</b>\n"
        "Свежая микрозелень • Бейби-лист • Салаты 🥗\n\n"
        "• 🌿 Микрозелень, бейби-лист, салаты\n"
        "• 🤖 AI-помощник для подбора и заказа\n"
        "• 🎮 Farm Simulator — играй и получай бонусы!\n"
        "• 🚚 Доставка: Самарканд + Ташкент\n\n"
        "<b>Наши ресурсы:</b>",
    ),

    # ── ИИ-продавец ──
    "ai.thinking": ("🧠 Oʻylayapman…", "🧠 Думаю…"),
    "ai.error": (
        "AI bilan aloqa uzildi. Birozdan soʻng urinib koʻring.",
        "Связь с ИИ прервалась. Попробуйте чуть позже.",
    ),
    "ai.empty": (
        "Savolingizni boshqacha yozib koʻring — men tushunmadim.",
        "Попробуйте сформулировать иначе — я не понял вопроса.",
    ),
}


def normalize(lang: str | None) -> str:
    """Привести язык к известному. Незнакомое — к русскому."""
    value = (lang or "").strip().lower()[:2]
    return value if value in LANGS else DEFAULT_LANG


def t(key: str, lang: str | None = None, **params) -> str:
    """
    Строка на языке пользователя.

    Отсутствующий ключ возвращается как есть, а не роняет обработчик: не
    переведённая кнопка — беда, но упавший на ней бот — беда крупнее.
    """
    pair = STRINGS.get(key)
    if pair is None:
        return key
    text = pair[0] if normalize(lang) == "uz" else pair[1]
    return text.format(**params) if params else text

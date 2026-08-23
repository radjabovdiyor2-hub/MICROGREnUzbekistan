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
        "• <i>«2 lotok kungaboqar buyurtma qiling, tel +998 XX XXX XX XX»</i>\n\n"
        "Ta'mga qarab tanlab, narxlarini aytaman! 🌱",
        "🛒 <b>Подбор микрозелени</b>\n\n"
        "Напишите мне, что вам нужно, например:\n\n"
        "• <i>«Какая микрозелень самая вкусная?»</i>\n"
        "• <i>«Что добавить в салат?»</i>\n"
        "• <i>«Хочу попробовать что-нибудь острое»</i>\n"
        "• <i>«Закажи 2 лотка подсолнечника, тел +998 XX XXX XX XX»</i>\n\n"
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

    # ── Рецепты ──
    "btn.buy_ingredients": ("🛒 Masalliq sotib olish", "🛒 Купить ингредиенты"),
    "btn.all_recipes": ("📖 Barcha retseptlar", "📖 Все рецепты"),
    "btn.recipes_on_site": ("📖 Saytdagi retseptlar", "📖 Рецепты на сайте"),
    "recipes.body": (
        "🍽️ <b>Mikro-koʻkatli retseptlar</b>\n\n"
        "Sogʻlom ovqatlanish retseptlari — saytimizda!\n"
        "Salat, smuzi, sendvich — 15 daqiqada.\n\n"
        "Yoki AI dan soʻrang: «rukola bilan retsept oʻylab top» 🤖",
        "🍽️ <b>Рецепты с микрозеленью</b>\n\n"
        "ПП и ЗОЖ рецепты — на нашем сайте!\n"
        "Салаты, смузи, сэндвичи — за 15 минут.\n\n"
        "Или спросите AI: «придумай рецепт с рукколой» 🤖",
    ),
    "recipes.unavailable": (
        "🍽️ Retseptlar vaqtincha ishlamayapti.\nSaytda koʻring: {url}",
        "🍽️ Рецепты временно недоступны.\nСмотрите на сайте: {url}",
    ),

    # ── Избранное ──
    "favorites.empty_screen": (
        "❤️ <b>Sevimlilar boʻsh</b>\n\n"
        "Mahsulotlarni sevimlilarga qoʻshing — keyin tez topasiz!\n\n"
        "💡 Katalogdagi kartochkada ❤️ ni bosing.",
        "❤️ <b>Избранное пусто</b>\n\n"
        "Добавляйте товары в избранное, чтобы быстро находить их потом!\n\n"
        "💡 Нажмите ❤️ на карточке товара в каталоге.",
    ),
    "favorites.already": ("Allaqachon sevimlilarda ❤️", "Уже в избранном ❤️"),
    "favorites.cleared": ("🗑 Sevimlilar tozalandi", "🗑 Избранное очищено"),

    # ── Повтор заказа ──
    "reorder.no_orders": (
        "🔄 <b>Buyurtmani takrorlash</b>\n\n"
        "Sizda hali buyurtma yoʻq.\nBirinchi buyurtmani katalogdan bering!",
        "🔄 <b>Повторить заказ</b>\n\n"
        "У вас пока нет заказов.\nОформите первый заказ через каталог!",
    ),
    "reorder.no_previous": (
        "🔄 <b>Buyurtmani takrorlash</b>\n\nOldingi buyurtmalar yoʻq.",
        "🔄 <b>Повторить заказ</b>\n\nНет предыдущих заказов.",
    ),
    "btn.repeat_this": ("✅ Shu buyurtmani takrorlash", "✅ Повторить этот заказ"),
    "reorder.order_gone": (
        "Buyurtma topilmadi — ehtimol oʻchirilgan",
        "Заказ не найден — возможно, он уже удалён",
    ),
    "reorder.out_of_stock": (
        "Oʻsha buyurtmadagi hech bir mahsulot hozir mavjud emas.",
        "Ни одной позиции из того заказа сейчас нет в наличии.",
    ),

    # ── Поиск ──
    "search.hint": (
        "🔍 <b>Qidiruv</b>\n\n"
        "Yozing: /search <i>nima qidiryapsiz</i>\nMasalan: /search rukola",
        "🔍 <b>Поиск</b>\n\n"
        "Напишите: /search <i>что ищете</i>\nНапример: /search руккола",
    ),
    "search.not_found": (
        "🔍 «{query}» boʻyicha hech narsa topilmadi.\n\n"
        "💡 Boshqa soʻrov kiriting yoki AI dan soʻrang:\n"
        "Erkin matn yozing, masalan: «qaysi mikro-koʻkat achchiq?»",
        "🔍 По запросу «{query}» ничего не найдено.\n\n"
        "💡 Попробуйте другой запрос или спросите AI:\n"
        "Напишите свободным текстом, например: «какая микрозелень острая?»",
    ),

    # ── Отзыв ──
    "btn.skip": ("Oʻtkazib yuborish", "Пропустить"),
    "review.ask": (
        "⭐ <b>Fikringizni qoldiring!</b>\n\nMahsulotimiz yoqdimi?\nBaho tanlang:",
        "⭐ <b>Оставьте отзыв!</b>\n\nКак вам наша продукция?\nВыберите оценку:",
    ),

    # ── Приветствие, помощь, контакты ──
    "btn.open_shop": ("⚡ Doʻkonni ochish", "⚡ Открыть магазин"),
    "btn.channel": ("📢 Kanal", "📢 Канал"),
    "btn.chat": ("💬 Chat", "💬 Чат"),
    "btn.group": ("👥 Guruh", "👥 Группа"),
    "btn.call": ("📞 Qoʻngʻiroq qilish", "📞 Позвонить"),
    "btn.play_now": ("🎮 Hozir oʻynash", "🎮 Играть сейчас"),
    "start.greeting": (
        "🌱 <b>Salom! Men {title} AI yordamchisiman!</b>\n\n"
        "Sizga yangi mikro-koʻkat tanlash va buyurtma berishda yordam beraman.\n\n"
        "<b>Bizda nima bor:</b>\n"
        "• 🌿 <b>Doʻkon</b> — mikro-koʻkat, beybi-list, salatlar\n"
        "• 🤖 <b>AI yordamchi</b> — tanlash, retseptlar, buyurtma\n"
        "• 🎮 <b>Farm Simulator</b> — oʻynang va chegirma oling!\n\n"
        "🎁 <i>{threshold} soʻmdan bepul yetkazib berish!</i>\n\n"
        "👇 <b>Nimadan boshlaymiz?</b>",
        "🌱 <b>Привет! Я AI-помощник {title}!</b>\n\n"
        "Помогу выбрать свежую микрозелень и оформить заказ.\n\n"
        "<b>Что у нас есть:</b>\n"
        "• 🌿 <b>Магазин</b> — микрозелень, бейби-лист, салаты\n"
        "• 🤖 <b>AI-помощник</b> — выбор, рецепты, заказ\n"
        "• 🎮 <b>Farm Simulator</b> — играй и получай скидки!\n\n"
        "🎁 <i>Бесплатная доставка от {threshold} сум!</i>\n\n"
        "👇 <b>С чего начнём?</b>",
    ),
    "help.body": (
        "📖 <b>Bot buyruqlari:</b>\n\n"
        "/start — Bosh menyu\n"
        "/catalog — Mahsulotlar katalogi\n"
        "/search — Mahsulot qidirish\n"
        "/orders — Mening buyurtmalarim\n"
        "/ai — AI yordamchidan soʻrash\n"
        "/game — Farm Simulator\n"
        "/magazine — FRESH WEEKLY jurnali\n"
        "/delivery — Yetkazish shartlari\n"
        "/contacts — Aloqa\n"
        "/help — Yordam\n\n"
        "📞 Telefon: {phone}\n"
        "📧 Email: {email}\n\n"
        "📢 Kanal: {channel}\n"
        "👥 Guruh: {group}",
        "📖 <b>Команды бота:</b>\n\n"
        "/start — Главное меню\n"
        "/catalog — Каталог товаров\n"
        "/search — Поиск товаров\n"
        "/orders — Мои заказы\n"
        "/ai — Спросить AI-помощника\n"
        "/game — Farm Simulator\n"
        "/magazine — Журнал FRESH WEEKLY\n"
        "/delivery — Условия доставки\n"
        "/contacts — Контакты\n"
        "/help — Помощь\n\n"
        "📞 Телефон: {phone}\n"
        "📧 Email: {email}\n\n"
        "📢 Канал: {channel}\n"
        "👥 Группа: {group}",
    ),
    "contacts.body": (
        "📞 <b>{title} aloqa</b>\n\n"
        "📱 Telefon: {phone}\n"
        "📧 Email: {email}\n\n"
        "🚚 Yetkazish: {fee} soʻm\n"
        "🎁 {threshold} soʻmdan bepul",
        "📞 <b>Контакты {title}</b>\n\n"
        "📱 Телефон: {phone}\n"
        "📧 Email: {email}\n\n"
        "🚚 Доставка: {fee} сум\n"
        "🎁 Бесплатно от: {threshold} сум",
    ),
    "game.intro": (
        "🎮 <b>Farm Simulator</b>\n\n"
        "Virtual oʻsimliklar yetishtiring va GreenCoins ishlang!\n\n"
        "🔥 Streak bonusi uchun har kuni kiring!\n\n"
        "👇 Oʻynash uchun bosing:",
        "🎮 <b>Farm Simulator</b>\n\n"
        "Выращивай виртуальные растения и зарабатывай GreenCoins!\n\n"
        "🔥 Заходи каждый день для бонуса streak!\n\n"
        "👇 Нажми чтобы играть:",
    ),
    "admin.only": ("⛔ Faqat administratorlar uchun.", "⛔ Только для администраторов."),

    # ── Группа ──
    "group.photo_hint": (
        "📸 Yordam kerakmi?\n\n"
        "@Microgreenuzbekistan_bot ga yozing\n"
        "AI yordamchi mikro-koʻkat tanlab, buyurtma rasmiylashtiradi! 🌱",
        "📸 Нужна помощь?\n\n"
        "Напишите боту @Microgreenuzbekistan_bot\n"
        "AI-помощник подберёт микрозелень и оформит заказ! 🌱",
    ),
    "group.ai_reply": (
        "🤖 <b>AI yordamchi:</b>\n\n{answer}\n\n"
        "💬 Yana savol bormi? @Microgreenuzbekistan_bot",
        "🤖 <b>AI-помощник:</b>\n\n{answer}\n\n"
        "💬 Больше вопросов? @Microgreenuzbekistan_bot",
    ),
    "group.ai_unavailable": (
        "🤖 AI yordamchi vaqtincha ishlamayapti.\n"
        "Botga toʻgʻridan-toʻgʻri yozing: @Microgreenuzbekistan_bot",
        "🤖 AI-помощник временно недоступен.\n"
        "Напишите напрямую боту: @Microgreenuzbekistan_bot",
    ),

    # ── ИИ-продавец ──
    "ai.listening": (
        "🤖 <b>Sizni tinglayapman!</b>\n\n"
        "Menga istalgan narsani yozing. Men:\n"
        "• 🥗 Ta'm va taomga qarab mikro-koʻkat tanlayman\n"
        "• 🛒 Shu yerda buyurtma rasmiylashtira olaman\n"
        "• 🍽️ Mikro-koʻkatli retsept aytaman\n"
        "• 📸 Taomingiz suratini tahlil qilaman\n\n"
        "<i>Bugun nimada yordam beray?</i>",
        "🤖 <b>Слушаю вас!</b>\n\n"
        "Пишите мне всё, что угодно. Я могу:\n"
        "• 🥗 Подобрать микрозелень по вкусу и блюду\n"
        "• 🛒 Оформить заказ прямо здесь\n"
        "• 🍽️ Подсказать рецепт с микрозеленью\n"
        "• 📸 Проанализировать фото вашего блюда\n\n"
        "<i>Чем могу помочь сегодня?</i>",
    ),
    "ai.history_cleared": ("🧹 Suhbat tarixi tozalandi!", "🧹 История разговора очищена!"),
    "ai.photo_analyzing": (
        "⏳ <i>Neyroset suratingizni oʻrganyapti… Bir necha soniya</i> ✨",
        "⏳ <i>Нейросеть изучает ваше фото… Это займёт пару секунд</i> ✨",
    ),
    "ai.voice_listening": (
        "🎧 <i>Tinglayapman va matnga oʻgiryapman…</i> ⏳",
        "🎧 <i>Слушаю и перевожу в текст…</i> ⏳",
    ),
    "ai.voice_recording": (
        "🗣 <i>Ovozli javob yozyapman…</i> 🎙",
        "🗣 <i>Записываю голосовой ответ…</i> 🎙",
    ),
    "ai.photo_error": (
        "❌ Suratni tahlil qilishda xatolik. Keyinroq urinib koʻring.",
        "❌ Ошибка при анализе фото. Попробуйте позже.",
    ),
    "ai.voice_error": (
        "❌ Ovozli xabarni qayta ishlashda xatolik. Keyinroq urinib koʻring.",
        "❌ Ошибка обработки голосового. Попробуйте позже.",
    ),
    "ai.prices": (
        "💰 Dolzarb narxlar saytda:\n🌐 microgreenuzbekistan.com/catalog",
        "💰 Актуальные цены на сайте:\n🌐 microgreenuzbekistan.com/catalog",
    ),
    "ai.order_help": (
        "🛒 <b>Buyurtma berish</b>\n\n"
        "Nima buyurtma qilmoqchisiz va telefon raqamingizni yozing. Masalan:\n\n"
        "<i>«2 lotok kungaboqar va 1 no'xat kerak. Telefon: +998 XX XXX XX XX»</i>\n\n"
        "Qolganini oʻzim qilaman! Manzil va tafsilotlarni telefon orqali aniqlaymiz 📞\n\n"
        "👨‍🌾 Ro'yxatingizni kutyapman!",
        "🛒 <b>Оформление заказа</b>\n\n"
        "Просто напишите мне, что хотите заказать, и номер телефона. Например:\n\n"
        "<i>«Хочу 2 лотка подсолнечника и 1 горох. Телефон: +998 XX XXX XX XX»</i>\n\n"
        "Дальше я сделаю всё сам! Адрес и детали мы уточним по телефону 📞\n\n"
        "👨‍🌾 Жду список ваших пожеланий!",
    ),

    "ai.delivery": (
        "🚚 <b>Yetkazish</b>\n\n"
        "📍 Samarqand — <b>buyurtma kuni</b>\n"
        "📍 Toshkent — <b>ertasi kuni</b>\n"
        "⏰ Minimal buyurtma: yoʻq\n\n"
        "💳 <b>Toʻlov:</b> {payment}",
        "🚚 <b>Доставка</b>\n\n"
        "📍 Самарканд — <b>в день заказа</b>\n"
        "📍 Ташкент — <b>на следующий день</b>\n"
        "⏰ Минимальный заказ: нет\n\n"
        "💳 <b>Оплата:</b> {payment}",
    ),

    # ── Магазин: оформление ──
    "cart.cleared_screen": (
        "🛒 <b>Savat tozalandi</b>\n\nKatalogdan mahsulot qoʻshing!",
        "🛒 <b>Корзина очищена</b>\n\nДобавьте товары из каталога!",
    ),
    "cart.empty_restart": (
        "Savat boʻsh. Boshidan boshlang.",
        "Корзина пуста. Начните заново.",
    ),
    "checkout.tap_below": ("👇 Quyidagi tugmani bosing:", "👇 Нажмите кнопку ниже:"),
    "checkout.phone_saved": ("✅ Rahmat! Raqam saqlandi.", "✅ Спасибо! Номер сохранён."),
    "checkout.need_phone_screen": (
        "📱 <b>Buyurtma uchun telefon raqamingiz kerak</b>\n\n"
        "Ekran pastidagi «📱 Raqamni yuborish» tugmasini bosing 👇",
        "📱 <b>Для оформления заказа нужен ваш номер телефона</b>\n\n"
        "Нажмите кнопку «📱 Поделиться номером» внизу экрана 👇",
    ),
    "checkout.confirm": (
        "📋 <b>Buyurtmani tasdiqlang</b>\n\n"
        "<b>Mahsulotlar:</b>\n{items}\n\n"
        "{totals}\n\n"
        "👤 {name}\n"
        "📱 {contact}\n"
        "📍 Manzilni qoʻngʻiroqda aniqlaymiz\n\n"
        "🚚 Yetkazish: Samarqand — buyurtma kuni, Toshkent — ertasi kuni\n"
        "💳 Toʻlov: {payment}",
        "📋 <b>Подтвердите заказ</b>\n\n"
        "<b>Товары:</b>\n{items}\n\n"
        "{totals}\n\n"
        "👤 {name}\n"
        "📱 {contact}\n"
        "📍 Адрес уточним при звонке\n\n"
        "🚚 Доставка: Самарканд — в день заказа, Ташкент — на следующий день\n"
        "💳 Оплата: {payment}",
    ),
    "checkout.confirm_short": (
        "📋 <b>Buyurtmani tasdiqlang</b>\n\n{totals}\n({count} ta)\n\nTasdiqlash uchun ✅ bosing",
        "📋 <b>Подтвердите заказ</b>\n\n{totals}\n({count} поз.)\n\nНажмите ✅ для подтверждения",
    ),
    "checkout.failed_screen": (
        "⚠️ <b>Buyurtmani avtomatik rasmiylashtira olmadik</b>\n\n"
        "<b>Mahsulotlar:</b>\n{items}\n\n"
        "{totals}\n\n"
        "Savat saqlandi — yana urinib koʻrishingiz mumkin.\n"
        "Arizangizni koʻrdik va {phone} raqamiga qoʻngʻiroq qilamiz.\n"
        "Tezroq boʻlsa — {contact_phone}",
        "⚠️ <b>Не получилось оформить заказ автоматически</b>\n\n"
        "<b>Товары:</b>\n{items}\n\n"
        "{totals}\n\n"
        "Корзина сохранена — можно попробовать ещё раз.\n"
        "Мы уже видим вашу заявку и перезвоним на {phone}.\n"
        "Если удобнее сразу — {contact_phone}",
    ),
    "checkout.success": (
        "✅ <b>Buyurtma #{number} qabul qilindi!</b>\n\n"
        "<b>Mahsulotlar:</b>\n{items}\n\n"
        "{totals}\n\n"
        "📱 Raqam: {phone}\n"
        "⏰ 30 daqiqa ichida bogʻlanamiz\n\n"
        "🌱 Buyurtmangiz uchun rahmat!",
        "✅ <b>Заказ #{number} оформлен!</b>\n\n"
        "<b>Товары:</b>\n{items}\n\n"
        "{totals}\n\n"
        "📱 Номер: {phone}\n"
        "⏰ Мы свяжемся с вами в течение 30 минут\n\n"
        "🌱 Спасибо за заказ!",
    ),

    # ── Главное меню ──
    "catalog.empty": (
        "📦 <b>Katalog boʻsh</b>\n\nMahsulotlar tez orada paydo boʻladi!",
        "📦 <b>Каталог пуст</b>\n\nТовары скоро появятся!",
    ),
    "orders.empty_screen": (
        "📦 <b>Mening buyurtmalarim</b>\n\n"
        "Sizda hali buyurtma yoʻq.\n\n"
        "💡 Buyurtmalarni koʻrish uchun katalogdan birinchi buyurtmani bering.",
        "📦 <b>Мои заказы</b>\n\n"
        "У вас пока нет заказов.\n\n"
        "💡 Чтобы видеть заказы, оформите первый заказ через каталог.",
    ),
    "btn.send_food_photo": ("📸 Taom suratini yuborish", "📸 Отправить фото еды"),
    "btn.pick_greens": ("🛒 Mikro-koʻkat tanlash", "🛒 Подобрать микрозелень"),
    "btn.website": ("🌐 Sayt", "🌐 Сайт"),

    # ── Журнал FRESH WEEKLY ──
    "magazine.sending_pdf": ("📄 PDF yuborilyapti…", "📄 Отправляю PDF..."),
    "magazine.pdf_caption": (
        "📖 <b>FRESH WEEKLY — {number}-son</b>\n"
        "Mikro-koʻkat, restoranlar va retseptlar haqida 12 sahifa!",
        "📖 <b>FRESH WEEKLY — Выпуск #{number}</b>\n"
        "12 страниц о микрозелени, ресторанах и рецептах!",
    ),
    "magazine.pdf_failed": (
        "PDF yuborilmadi. Sonni toʻliq onlayn oʻqing: {url}",
        "PDF не отдался. Номер целиком открыт онлайн: {url}",
    ),
    "magazine.print_request": (
        "📝 <b>Bosma nusxaga ariza ({number}-son)</b>\n\n"
        "Narxi: {price} soʻm (Samarqand boʻylab yetkazish bilan).\n\n"
        "📞 Rasmiylashtirish uchun bogʻlaning:\n"
        "• Telegram: @microgreen_uz\n"
        "• Telefon: {phone}\n\n"
        "<i>Arizangiz qayd etildi. Menejerimiz tez orada bogʻlanadi! Ism: {name}</i>",
        "📝 <b>Заявка на печатную версию (Выпуск #{number})</b>\n\n"
        "Стоимость: {price} сум (включает доставку по Самарканду).\n\n"
        "📞 Для оформления свяжитесь с нами:\n"
        "• Telegram: @microgreen_uz\n"
        "• Телефон: {phone}\n\n"
        "<i>Ваша заявка зафиксирована. Наш менеджер скоро с вами свяжется! Имя: {name}</i>",
    ),

    "magazine.btn_pdf": ("📄 PDF yuklab olish", "📄 Скачать PDF"),
    "magazine.btn_online": ("📖 Onlayn oʻqish", "📖 Читать онлайн"),
    "magazine.btn_print": (
        "🖨 Bosma nusxa buyurtma qilish ({price} soʻm)",
        "🖨 Заказать печатную копию ({price} сум)",
    ),
    "magazine.btn_share": ("📤 Jurnalni doʻstga yuborish", "📤 Переслать журнал другу"),
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

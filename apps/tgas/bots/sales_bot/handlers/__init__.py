from bots.sales_bot.handlers.start import router as start_router
from bots.sales_bot.handlers.b2b import router as b2b_router
from bots.sales_bot.handlers.ai_chat import router as ai_chat_router
from bots.sales_bot.handlers.tracking import router as tracking_router
from bots.sales_bot.handlers.shift_menu import router as shift_menu_router

# Клиентская витрина (каталог, корзина, чекаут, Telegram Payments) отсюда
# убрана: магазин для покупателя один — витринный бот apps/bot. Подробности
# и причина — в докстринге bots/sales_bot/main.py.
all_routers = [
    start_router,
    b2b_router,
    # Постоянная клавиатура ДО ai_chat И ДО трека: её кнопки приходят
    # обычным текстом («Начал смену»), а `ai_chat` ловит свободный текст —
    # нажатие ушло бы в разговор с ИИ вместо открытия смены.
    shift_menu_router,
    # Трек ДО ai_chat: тот ловит свободный текст и медиа, и трансляция
    # геопозиции ушла бы в разговор с ИИ вместо записи смены.
    tracking_router,
    ai_chat_router,
]

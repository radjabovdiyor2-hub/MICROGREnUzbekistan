from bots.sales_bot.handlers.start import router as start_router
from bots.sales_bot.handlers.b2b import router as b2b_router
from bots.sales_bot.handlers.ai_chat import router as ai_chat_router

# Клиентская витрина (каталог, корзина, чекаут, Telegram Payments) отсюда
# убрана: магазин для покупателя один — витринный бот apps/bot. Подробности
# и причина — в докстринге bots/sales_bot/main.py.
all_routers = [
    start_router,
    b2b_router,
    ai_chat_router,
]

from bots.sales_bot.handlers.start import router as start_router
from bots.sales_bot.handlers.catalog import router as catalog_router
from bots.sales_bot.handlers.order import router as order_router
from bots.sales_bot.handlers.b2b import router as b2b_router
from bots.sales_bot.handlers.ai_chat import router as ai_chat_router
from bots.sales_bot.handlers.payments import router as payments_router

all_routers = [
    start_router,
    catalog_router,
    order_router,
    b2b_router,
    ai_chat_router,
    payments_router
]

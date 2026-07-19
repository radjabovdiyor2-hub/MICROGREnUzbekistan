import asyncio
import os
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import MenuButtonWebApp, WebAppInfo
from dotenv import load_dotenv

from handlers import start, agronomist, orders
from handlers.unified import router as unified_router
from handlers.group import router as group_router
from handlers.shop import router as shop_router
from handlers.admin import router as admin_router
from handlers import magazine, inline

# Load env from script directory (override system env vars)
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path, override=True)
TOKEN = os.getenv("BOT_TOKEN")

# Setup logging
logging.basicConfig(level=logging.INFO)

# Create bot and dispatcher
dp = Dispatcher()

# Register routers (order matters — first registered wins for same filter)
dp.include_router(admin_router)        # Admin commands first (highest priority)
dp.include_router(magazine.router)     # /magazine commands
dp.include_router(inline.router)       # inline queries
dp.include_router(start.router)        # /start with WebAppInfo & Farm Simulator links
dp.include_router(shop_router)         # /shop, /catalog, cart, checkout
dp.include_router(unified_router)      # /orders, /bonuses, menu callbacks
dp.include_router(orders.router)       # Order display callbacks
dp.include_router(agronomist.router)   # AI text/photo/voice in private chats
dp.include_router(group_router)        # Group FAQ & AI (last — catches remaining group msgs)


async def main():
    if not TOKEN:
        print("❌ Error: BOT_TOKEN not set in .env")
        return
    
    bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    
    # Set menu button to correct WebApp URL on every startup
    webapp_url = os.getenv("WEB_APP_URL", "https://microgreenuzbekistan.com")
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="🌱 Do'kon / Магазин",
                web_app=WebAppInfo(url=webapp_url)
            )
        )
        print(f"✅ Menu button set to: {webapp_url}")
    except Exception as e:
        print(f"⚠️ Failed to set menu button: {e}")
    
    print("🌱 AgroTech Ecosystem Bot starting...")
    print(f"📱 WebApp URL: {os.getenv('WEB_APP_URL', 'Not set')}")
    print(f"🔗 API URL: {os.getenv('WEB_API_URL', 'https://microgreenuzbekistan.com/api')}")
    
    # Graceful shutdown: close httpx client
    from services.ecosystem_bridge import bridge
    from services.trigger_service import start_daily_triggers
    
    trigger_task = asyncio.create_task(start_daily_triggers(bot))
    
    async def on_shutdown():
        trigger_task.cancel()
        await bridge.close()
        # Close extra Bot instances from services to avoid unclosed sessions
        try:
            from services.crosspost_service import crosspost
            await crosspost.close()
        except Exception:
            pass
        try:
            from services.channel_service import _bot_instance
            if _bot_instance:
                await _bot_instance.session.close()
        except Exception:
            pass
        print("🔌 Ecosystem bridge closed")
    dp.shutdown.register(on_shutdown)
    
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())


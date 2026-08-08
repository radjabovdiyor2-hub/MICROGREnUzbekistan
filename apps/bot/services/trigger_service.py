"""
🌱 MICROGREEN UZBEKISTAN — TRIGGER SERVICE

Background service for automated tasks:
- Daily tip posting to Telegram channel (10:00 AM Tashkent)
- User re-engagement pings (6:00 PM Tashkent)
- Game streak reminders
"""

import asyncio
import logging
from aiogram import Bot
from datetime import datetime, timezone, timedelta

from services.channel_service import post_daily_tip, DAILY_CONTENT

logger = logging.getLogger(__name__)

# Tashkent timezone (UTC+5)
TZ_TASHKENT = timezone(timedelta(hours=5))

# Track last execution to avoid duplicates
_last_tip_date = None
_last_reengage_date = None


async def _post_daily_tip(bot: Bot):
    """Post daily tip to channel at 10:00 AM"""
    global _last_tip_date
    
    now = datetime.now(TZ_TASHKENT)
    today = now.date()
    
    if _last_tip_date == today:
        return  # Already posted today
    
    if now.hour == 10:
        day = now.weekday()  # 0=Monday
        try:
            result = await post_daily_tip(day)
            if result.get("success"):
                _last_tip_date = today
                logger.info(f"✅ Daily tip #{day} posted to channel")
            else:
                logger.warning(f"Daily tip post failed: {result}")
        except Exception as e:
            logger.error(f"Daily tip error: {e}")


async def _reengage_inactive_users(bot: Bot):
    """Send re-engagement messages to inactive users at 6:00 PM"""
    global _last_reengage_date
    
    now = datetime.now(TZ_TASHKENT)
    today = now.date()
    
    if _last_reengage_date == today:
        return
    
    if now.hour == 18:
        _last_reengage_date = today
        
        try:
            import httpx
            import os
            
            api_url = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")
            bot_secret = os.getenv("BOT_SECRET", "")
            headers = {"Authorization": f"Bearer {bot_secret}"} if bot_secret else {}
            
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{api_url}/users/inactive?days=7",
                    headers=headers
                )
                if resp.status_code != 200:
                    logger.info("No inactive users endpoint or no users")
                    return
                
                users = resp.json()
                if not isinstance(users, list):
                    users = users.get("users", [])
            
            sent = 0
            for user in users[:20]:  # Max 20 per day to avoid spam
                tg_id = user.get("telegramId")
                name = user.get("name", "друг")
                if not tg_id:
                    continue
                
                try:
                    await bot.send_message(
                        chat_id=int(tg_id),
                        text=(
                            f"👋 Привет, <b>{name}</b>!\n\n"
                            "Давно не виделись! 🌱\n\n"
                            "🆕 У нас новые товары в каталоге\n"
                            "🎮 Твоя ферма ждёт тебя в Farm Simulator\n"
                            "🎁 Не забудь про бонусные баллы!\n\n"
                            "Напиши /start чтобы начать 🚀"
                        ),
                        parse_mode="HTML"
                    )
                    sent += 1
                    await asyncio.sleep(0.5)  # Rate limiting
                except Exception as e:
                    logger.debug(f"Couldn't reach user {tg_id}: {e}")
            
            if sent > 0:
                logger.info(f"✅ Re-engagement: sent {sent} messages")
                
        except Exception as e:
            logger.error(f"Re-engagement error: {e}")


async def start_daily_triggers(bot: Bot):
    """
    Background service for daily automated tasks.
    Runs every 15 minutes, checks if it's time for scheduled tasks.
    """
    logger.info("🌱 Daily Triggers service started (tip@10:00, re-engage@18:00 UZT)")
    
    # Wait 30 seconds after startup to let bot fully initialize
    await asyncio.sleep(30)
    
    while True:
        try:
            # Run scheduled tasks
            await _post_daily_tip(bot)
            await _reengage_inactive_users(bot)
            
            # Check every 15 minutes
            await asyncio.sleep(900)
            
        except asyncio.CancelledError:
            logger.info("Triggers service cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in triggers loop: {e}")
            await asyncio.sleep(60)

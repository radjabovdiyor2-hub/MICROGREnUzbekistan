"""
🌱 MICROGREEN UZBEKISTAN — CROSS-POST SERVICE

Unified content publishing across all platforms:
- Telegram Channel
- Telegram Group  
- Instagram (via Graph API)

All content passes through here for consistent branding.
"""

import os
from typing import Optional, Dict, List
from dataclasses import dataclass
from enum import Enum
import logging

from aiogram import Bot
from aiogram.enums import ParseMode
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Platform constants
BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID", "@MicrogreenUzbekistan")
GROUP_ID = os.getenv("GROUP_ID", "@Microgreen_Uzbekistan")


class Platform(Enum):
    CHANNEL = "channel"
    GROUP = "group"
    INSTAGRAM = "instagram"
    ALL = "all"


@dataclass
class CrossPost:
    """Content container for cross-platform posting"""
    title: str
    body: str
    image_url: Optional[str] = None
    hashtags: List[str] = None
    platforms: List[Platform] = None
    
    def __post_init__(self):
        if self.hashtags is None:
            self.hashtags = ["микрозелень", "microgreens", "узбекистан", "organic"]
        if self.platforms is None:
            self.platforms = [Platform.CHANNEL]


class CrossPostService:
    """Unified cross-platform posting service"""
    
    def __init__(self):
        self.bot = None
        self._init_bot()
    
    def _init_bot(self):
        if BOT_TOKEN:
            self.bot = Bot(token=BOT_TOKEN)
    
    async def _send_telegram(self, chat_id: str, text: str, photo_url: Optional[str] = None) -> Dict:
        """Send message to Telegram chat"""
        if not self.bot:
            return {"error": "Bot not initialized"}
        
        try:
            if photo_url:
                msg = await self.bot.send_photo(
                    chat_id=chat_id,
                    photo=photo_url,
                    caption=text,
                    parse_mode=ParseMode.HTML
                )
            else:
                msg = await self.bot.send_message(
                    chat_id=chat_id,
                    text=text,
                    parse_mode=ParseMode.HTML
                )
            return {"success": True, "message_id": msg.message_id}
        except Exception as e:
            logger.error(f"Telegram send failed to {chat_id}: {e}")
            return {"error": str(e)}
    
    def _format_for_telegram(self, post: CrossPost) -> str:
        """Format content for Telegram (HTML)"""
        text = f"<b>{post.title}</b>\n\n{post.body}"
        text += "\n\n🛒 Заказать: @Microgreenuzbekistan_bot"
        text += "\n📸 Instagram: @microgreenuzbekistan"
        return text
    
    def _format_for_instagram(self, post: CrossPost) -> str:
        """Format content for Instagram (plain text + hashtags)"""
        text = f"{post.title}\n\n{post.body}"
        text += "\n\n🛒 Заказать: microgreenuzbekistan.com"
        text += "\n📱 Telegram: @Microgreenuzbekistan_bot"
        text += "\n📢 Канал: @MicrogreenUzbekistan"
        
        # Add hashtags
        if post.hashtags:
            tags = " ".join(f"#{tag}" for tag in post.hashtags)
            text += f"\n\n{tags}"
        
        return text
    
    async def publish(self, post: CrossPost) -> Dict[str, Dict]:
        """Publish content to specified platforms"""
        results = {}
        
        for platform in post.platforms:
            if platform == Platform.CHANNEL:
                text = self._format_for_telegram(post)
                results["channel"] = await self._send_telegram(CHANNEL_ID, text, post.image_url)
                
            elif platform == Platform.GROUP:
                text = self._format_for_telegram(post)
                results["group"] = await self._send_telegram(GROUP_ID, text, post.image_url)
                
            elif platform == Platform.INSTAGRAM:
                # Instagram posting would go through Graph API
                # For now, just log (requires instagram_service.py)
                from services.instagram_service import create_instagram_post
                text = self._format_for_instagram(post)
                if post.image_url:
                    results["instagram"] = await create_instagram_post(post.image_url, text)
                else:
                    results["instagram"] = {"error": "Image required for Instagram"}
                    
            elif platform == Platform.ALL:
                # Recursive call for all platforms
                post.platforms = [Platform.CHANNEL, Platform.GROUP, Platform.INSTAGRAM]
                return await self.publish(post)
        
        return results
    
    async def close(self):
        """Cleanup resources"""
        if self.bot:
            await self.bot.session.close()


# Singleton instance
crosspost = CrossPostService()


# ==================== CONVENIENCE FUNCTIONS ====================

async def post_new_product(title: str, description: str, price: int, image_url: Optional[str] = None) -> Dict:
    """Post new product announcement to all platforms"""
    price_fmt = f"{price:,}".replace(",", " ")
    
    post = CrossPost(
        title=f"🆕 {title}",
        body=f"{description}\n\n💰 <b>{price_fmt} сум</b>",
        image_url=image_url,
        hashtags=["микрозелень", "новинка", "microgreens", "organic", "самарканд"],
        platforms=[Platform.CHANNEL, Platform.INSTAGRAM]
    )
    
    return await crosspost.publish(post)


async def post_daily_tip(tip: str) -> Dict:
    """Post daily tip to channel"""
    post = CrossPost(
        title="💡 Совет дня",
        body=tip,
        platforms=[Platform.CHANNEL]
    )
    
    return await crosspost.publish(post)


async def post_order_milestone(order_count: int) -> Dict:
    """Celebrate order milestones"""
    post = CrossPost(
        title=f"🎉 {order_count} заказов!",
        body="Спасибо что выбираете Microgreen Uzbekistan!\n\n"
             "Каждый заказ = +5% бонусов 💎\n"
             "Играйте в Farm Simulator для ещё больше бонусов! 🎮",
        platforms=[Platform.CHANNEL, Platform.GROUP]
    )
    
    return await crosspost.publish(post)


async def welcome_to_group(user_name: str, chat_id: str) -> Dict:
    """Welcome new member to group"""
    text = f"""👋 Добро пожаловать, <b>{user_name}</b>!

🌱 Это сообщество любителей свежей зелени <b>Microgreen Uzbekistan</b>

📌 <b>Полезные ссылки:</b>
• 📢 Канал: @MicrogreenUzbekistan
• 🤖 Бот: @Microgreenuzbekistan_bot  
• 📸 Instagram: @microgreenuzbekistan
• 🎮 Игра: t.me/Microgreenuzbekistan_bot/game

❓ Задавайте вопросы — AI-помощник ответит!"""
    
    return await crosspost._send_telegram(chat_id, text)

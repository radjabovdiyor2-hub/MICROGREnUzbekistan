"""
🌱 MICROGREEN UZBEKISTAN — CROSS-POST SERVICE

Публикация витринного бота в его собственные каналы:
- Telegram-канал
- Telegram-группа

Instagram здесь НЕ публикуется — им владеет офис
(`apps/tgas/shared/instagram.py`, расписания content_bot). Здесь была
вторая реализация без единого вызывающего; подробности — в `Platform`.
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
    """
    Куда публикует ВИТРИННЫЙ бот.

    Instagram сюда не входит намеренно. Публикацией в Instagram владеет
    офис (`apps/tgas/shared/instagram.py` плюс расписания content_bot):
    там обновление долгоживущих токенов, разбор ответов Graph API и учёт
    опубликованного. Вторая реализация жила здесь без единого
    вызывающего — `Platform.INSTAGRAM` не передавал никто — и разошлась
    бы с первой молча, как это уже случалось с промптами и каталогом.
    """

    CHANNEL = "channel"
    GROUP = "group"
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
                
            elif platform == Platform.ALL:
                # Recursive call for all platforms
                post.platforms = [Platform.CHANNEL, Platform.GROUP]
                return await self.publish(post)
        
        return results
    
    async def close(self):
        """Cleanup resources"""
        if self.bot:
            await self.bot.session.close()


# Singleton instance
crosspost = CrossPostService()


# ==================== CONVENIENCE FUNCTIONS ====================
#
# Здесь лежали `post_new_product`, `post_daily_tip` и `post_order_milestone`.
# Все три удалены, и вот почему.
#
# `post_new_product` передавала `Platform.INSTAGRAM` — значения, которого в
# перечислении нет: первый же вызов упал бы с AttributeError. Не упал он
# только потому, что функцию не звал никто. `ruff --select F` такое не
# ловит — обращение к атрибуту он не проверяет.
#
# `post_daily_tip` существовала ДВАЖДЫ: здесь и в `channel_service.py`.
# Живая — там, её зовёт `trigger_service`. Одно имя в двух файлах делало
# разное, и это ровно та болезнь, от которой в офисе завели правило
# «один владелец на имя».
#
# Публикация принадлежит офису: `apps/tgas/shared/publisher.py` — один
# вход на Instagram, канал и группу. Витринный бот публикует только то,
# что относится к нему самому: приветствие в группе ниже и объявления
# админа через `crosspost.publish`.

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

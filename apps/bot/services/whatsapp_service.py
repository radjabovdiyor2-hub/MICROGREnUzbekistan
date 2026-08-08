"""
WhatsApp Business API Service
Sends catalog messages and handles customer interactions.
"""

import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID")

GRAPH_API_URL = "https://graph.facebook.com/v18.0"

async def send_text_message(to: str, message: str) -> dict:
    """
    Sends a text message via WhatsApp Business API.
    
    Args:
        to: Recipient phone number (with country code, e.g., "998901234567")
        message: Text message content
    
    Returns:
        API response dict
    """
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        return {"error": "WhatsApp credentials not configured"}
    
    url = f"{GRAPH_API_URL}/{WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": message}
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as resp:
            return await resp.json()

async def send_catalog_message(to: str, catalog_id: str, products: list) -> dict:
    """
    Sends a product catalog message.
    
    Args:
        to: Recipient phone number
        catalog_id: Meta Commerce catalog ID
        products: List of product retailer IDs to include
    
    Returns:
        API response dict
    """
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_ID:
        return {"error": "WhatsApp credentials not configured"}
    
    url = f"{GRAPH_API_URL}/{WHATSAPP_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # Multi-product message
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "product_list",
            "header": {
                "type": "text",
                "text": "🌱 Каталог Microgreen"
            },
            "body": {
                "text": "Выберите товары из нашего каталога:"
            },
            "footer": {
                "text": "Доставка по всему Узбекистану"
            },
            "action": {
                "catalog_id": catalog_id,
                "sections": [
                    {
                        "title": "Популярные товары",
                        "product_items": [
                            {"product_retailer_id": pid} for pid in products[:10]
                        ]
                    }
                ]
            }
        }
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=payload) as resp:
            return await resp.json()

async def send_order_confirmation(to: str, order_id: str, total: str) -> dict:
    """Sends order confirmation message."""
    message = f"""✅ *Заказ #{order_id} подтверждён!*

💰 Сумма: {total} UZS

📦 Мы свяжемся с вами для уточнения доставки.

🌱 Спасибо, что выбрали Microgreen Uzbekistan!"""
    
    return await send_text_message(to, message)

async def send_welcome_message(to: str) -> dict:
    """Sends welcome message with quick actions."""
    message = """👋 Добро пожаловать в *Microgreen Uzbekistan*!

🌱 Свежая микрозелень, бейби-лист и салаты премиум качества.

Напишите:
• "Каталог" — посмотреть товары
• "Цены" — актуальный прайс
• "Заказ" — оформить покупку
• "Доставка" — условия доставки

🌐 Сайт: microgreenuzbekistan.com
📱 Telegram: @Microgreenuzbekistan_bot"""
    
    return await send_text_message(to, message)

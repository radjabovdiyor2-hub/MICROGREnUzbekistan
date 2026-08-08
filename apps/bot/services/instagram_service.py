"""
Instagram Autopilot Service
Posts new products automatically to Instagram using Meta Graph API.
"""

import os
import aiohttp
from dotenv import load_dotenv

load_dotenv()

INSTAGRAM_ACCESS_TOKEN = os.getenv("INSTAGRAM_ACCESS_TOKEN")
INSTAGRAM_ACCOUNT_ID = os.getenv("INSTAGRAM_ACCOUNT_ID")

GRAPH_API_URL = "https://graph.facebook.com/v18.0"

async def create_instagram_post(image_url: str, caption: str) -> dict:
    """
    Creates an Instagram post with image and caption.
    
    Steps:
    1. Create a media container with the image URL
    2. Publish the container to make it live
    
    Args:
        image_url: Public URL to the image
        caption: Post caption with hashtags
    
    Returns:
        API response dict with post ID
    """
    if not INSTAGRAM_ACCESS_TOKEN or not INSTAGRAM_ACCOUNT_ID:
        return {"error": "Instagram credentials not configured"}
    
    async with aiohttp.ClientSession() as session:
        # Step 1: Create media container
        container_url = f"{GRAPH_API_URL}/{INSTAGRAM_ACCOUNT_ID}/media"
        container_params = {
            "image_url": image_url,
            "caption": caption,
            "access_token": INSTAGRAM_ACCESS_TOKEN
        }
        
        async with session.post(container_url, params=container_params) as resp:
            container_data = await resp.json()
            
            if "error" in container_data:
                return container_data
            
            container_id = container_data.get("id")
        
        # Step 2: Publish the container
        publish_url = f"{GRAPH_API_URL}/{INSTAGRAM_ACCOUNT_ID}/media_publish"
        publish_params = {
            "creation_id": container_id,
            "access_token": INSTAGRAM_ACCESS_TOKEN
        }
        
        async with session.post(publish_url, params=publish_params) as resp:
            return await resp.json()

async def create_instagram_story(image_url: str) -> dict:
    """Creates an Instagram Story."""
    if not INSTAGRAM_ACCESS_TOKEN or not INSTAGRAM_ACCOUNT_ID:
        return {"error": "Instagram credentials not configured"}
    
    async with aiohttp.ClientSession() as session:
        container_url = f"{GRAPH_API_URL}/{INSTAGRAM_ACCOUNT_ID}/media"
        container_params = {
            "image_url": image_url,
            "media_type": "STORIES",
            "access_token": INSTAGRAM_ACCESS_TOKEN
        }
        
        async with session.post(container_url, params=container_params) as resp:
            container_data = await resp.json()
            if "error" in container_data:
                return container_data
            container_id = container_data.get("id")
        
        publish_url = f"{GRAPH_API_URL}/{INSTAGRAM_ACCOUNT_ID}/media_publish"
        publish_params = {
            "creation_id": container_id,
            "access_token": INSTAGRAM_ACCESS_TOKEN
        }
        
        async with session.post(publish_url, params=publish_params) as resp:
            return await resp.json()

def format_product_caption(product: dict) -> str:
    """Formats a product as an Instagram caption with hashtags."""
    price = f"{int(product['price']):,}".replace(",", " ")
    
    caption = f"""🌱 {product['title']}

{product.get('description', 'Свежая микрозелень премиум качества.')}

💰 {price} сум

🛒 Заказать: microgreenuzbekistan.com/shop
📱 Telegram: @Microgreenuzbekistan_bot
📢 Канал: @MicrogreenUzbekistan

#микрозелень #microgreens #узбекистан #здоровоепитание #самарканд #organic #superfood #зелень #ппрецепты #зож"""
    
    return caption

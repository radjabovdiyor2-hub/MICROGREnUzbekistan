"""
Site Config Service
Fetches site configuration from the API for use in bot messages
"""

import httpx
import logging
import os
import time
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)
WEB_API_URL = os.getenv("WEB_API_URL", "https://microgreenuzbekistan.com/api")


@dataclass
class SocialLinks:
    telegram_channel: str
    telegram_group: str
    telegram_bot: str
    instagram: str


@dataclass
class SiteConfig:
    hero_title: str
    hero_subtitle: str
    delivery_fee: int
    free_delivery_threshold: int
    contact_phone: str
    contact_email: str
    banner_enabled: bool
    banner_text: str
    social: SocialLinks


# Cache for config
_config_cache: Optional[SiteConfig] = None
_cache_time: float = 0
CACHE_TTL = 300  # 5 minutes


async def fetch_site_config() -> SiteConfig:
    """Fetch site config from API"""
    global _config_cache, _cache_time
    
    # Return cached if fresh
    current_time = time.time()
    if _config_cache and (current_time - _cache_time) < CACHE_TTL:
        return _config_cache
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{WEB_API_URL}/config",
                timeout=3.0
            )
            response.raise_for_status()
            data = response.json()
            
            social = SocialLinks(
                telegram_channel=data.get("social", {}).get("telegramChannel", "https://t.me/MicrogreenUzbekistan"),
                telegram_group=data.get("social", {}).get("telegramGroup", "https://t.me/Microgreen_Uzbekistan"),
                telegram_bot=data.get("social", {}).get("telegramBot", "https://t.me/Microgreenuzbekistan_bot"),
                instagram=data.get("social", {}).get("instagram", "https://instagram.com/microgreenuzbekistan"),
            )
            
            config = SiteConfig(
                hero_title=data.get("heroTitle", "Microgreen Uzbekistan"),
                hero_subtitle=data.get("heroSubtitle", "Свежая микрозелень • Бейби-лист • Салаты"),
                delivery_fee=int(data.get("deliveryFee", 25000)),
                free_delivery_threshold=int(data.get("freeDeliveryThreshold", 500000)),
                contact_phone=data.get("contactPhone", "+998 90 123 45 67"),
                contact_email=data.get("contactEmail", "hello@microgreenuzbekistan.com"),
                banner_enabled=data.get("bannerEnabled", False),
                banner_text=data.get("bannerText", ""),
                social=social,
            )
            
            # Update cache
            _config_cache = config
            _cache_time = current_time
            
            return config
            
    except Exception as e:
        logger.error("[ConfigService] Failed to fetch config: %s", e)
        # Return defaults
        return get_default_config()


def get_default_config() -> SiteConfig:
    """Return default config"""
    return SiteConfig(
        hero_title="Microgreen Uzbekistan",
        hero_subtitle="Свежая микрозелень • Бейби-лист • Салаты",
        delivery_fee=25000,
        free_delivery_threshold=500000,
        contact_phone="+998 98 007 20 20",
        contact_email="hello@microgreenuzbekistan.com",
        banner_enabled=False,
        banner_text="",
        social=SocialLinks(
            telegram_channel="https://t.me/MicrogreenUzbekistan",
            telegram_group="https://t.me/Microgreen_Uzbekistan",
            telegram_bot="https://t.me/Microgreenuzbekistan_bot",
            instagram="https://instagram.com/microgreenuzbekistan",
        ),
    )


def invalidate_cache():
    """Clear config cache to force refresh"""
    global _config_cache, _cache_time
    _config_cache = None
    _cache_time = 0

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
class BonusConfig:
    """Суммы бонусной программы. Единственный источник — настройки витрины.

    Раньше бот держал их литералами и говорил «500 баллов за друга», пока
    /api/referral начислял 5000: бот считал в модели «1 балл = 10 сум»,
    которой у витрины никогда не было. Балл равен суму.
    """
    referrer_reward: int
    new_user_reward: int
    min_cashout: int
    referral_percent: int


# Названия способов оплаты для клиента. Ключи приходят из настроек витрины
# (`payment.methods`), чтобы бот не обещал того, что не подключено.
PAYMENT_LABELS = {
    "cash": "наличные",
    "click": "Click",
    "payme": "Payme",
    "card": "карта",
    "transfer": "перевод",
    "contract": "договор (юр. лица)",
}


def payment_text(methods: list[str]) -> str:
    """`['cash', 'click']` → `наличные, Click`."""
    named = [PAYMENT_LABELS.get(m, m) for m in methods if m]
    return ", ".join(named) if named else "уточните у менеджера"


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
    payment_methods: list[str]
    bonus: BonusConfig
    magazine_print_price: int

    @property
    def payment_text(self) -> str:
        return payment_text(self.payment_methods)


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
            
            # Дефолты берём из get_default_config(): один набор запасных
            # значений вместо двух расходящихся. Раньше здесь стоял телефон
            # +998 90 123 45 67 — плейсхолдер, который противоречил
            # настоящему номеру двадцатью строками ниже и мог уехать клиенту.
            fallback = get_default_config()
            bonus_data = data.get("bonus", {}) or {}

            config = SiteConfig(
                hero_title=data.get("heroTitle", fallback.hero_title),
                hero_subtitle=data.get("heroSubtitle", fallback.hero_subtitle),
                delivery_fee=int(data.get("deliveryFee", fallback.delivery_fee)),
                free_delivery_threshold=int(data.get("freeDeliveryThreshold", fallback.free_delivery_threshold)),
                contact_phone=data.get("contactPhone", fallback.contact_phone),
                contact_email=data.get("contactEmail", fallback.contact_email),
                banner_enabled=data.get("bannerEnabled", fallback.banner_enabled),
                banner_text=data.get("bannerText", fallback.banner_text),
                social=social,
                payment_methods=data.get("paymentMethods") or fallback.payment_methods,
                magazine_print_price=int(
                    data.get("magazinePrintPrice", fallback.magazine_print_price)
                ),
                bonus=BonusConfig(
                    referrer_reward=int(bonus_data.get("referrerReward", fallback.bonus.referrer_reward)),
                    new_user_reward=int(bonus_data.get("newUserReward", fallback.bonus.new_user_reward)),
                    min_cashout=int(bonus_data.get("minCashout", fallback.bonus.min_cashout)),
                    referral_percent=int(bonus_data.get("referralPercent", fallback.bonus.referral_percent)),
                ),
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
    """Запасные значения на случай, когда витрина недоступна.

    Числа обязаны совпадать с дефолтами `settingsData.ts` — иначе бот при
    сбое связи начнёт называть суммы, которых нет ни в одной настройке.
    """
    return SiteConfig(
        hero_title="Microgreen Uzbekistan",
        hero_subtitle="Свежая микрозелень • Бейби-лист • Салаты",
        delivery_fee=25000,
        free_delivery_threshold=500000,
        # prompt-ok: zapasnoe znachenie na sluchay nedostupnoy vitriny; sovpadaet s defoltom settingsData.ts
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
        payment_methods=["cash", "click", "payme"],
        magazine_print_price=30000,
        bonus=BonusConfig(
            referrer_reward=5000,
            new_user_reward=2000,
            min_cashout=50000,
            referral_percent=3,
        ),
    )


def invalidate_cache():
    """Clear config cache to force refresh"""
    global _config_cache, _cache_time
    _config_cache = None
    _cache_time = 0

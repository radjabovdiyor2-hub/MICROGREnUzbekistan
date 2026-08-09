"""⚙️ STOREFRONT CONFIG — публичные настройки витрины для офиса.

Числа вроде стоимости доставки и порога бесплатной живут в настройках
витрины (`payment.methods`, `delivery.fee`, `delivery.freeThreshold`) и
меняются владельцем в админке. Офис их не хранит.

ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ

`bots/support_bot/knowledge/faq.md` уходит в базу знаний и оттуда — прямо в
системный промпт поддержки. Числа, вписанные в него строкой, замерзают
навсегда: их правят в админке, а бот продолжает называть старые. Так же
замёрзло обещание оплаты «через Click, Payme» — при том, что онлайн-оплаты в
системе нет и правило 3 из CLAUDE.md прямо запрещает её обещать.

Теперь в `faq.md` стоят плейсхолдеры, а `scripts/build_knowledge_base.py`
подставляет сюда живые значения при сборке базы.

Читаем публичный `/api/config` — тот же адрес, что опрашивает витринный бот.
Секрет не нужен: настройки с `publicKey: true` открыты.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

import aiohttp

logger = logging.getLogger(__name__)

STOREFRONT_API_URL = os.getenv("STOREFRONT_API_URL", "http://web:3000/api")

# Названия способов оплаты для клиента. Ключи — из `payment.methods`.
PAYMENT_LABELS = {
    "cash": "наличными курьеру",
    "click": "Click",
    "payme": "Payme",
    "card": "картой",
    "transfer": "перечислением",
    "contract": "по договору",
}

# Запасные значения — ровно дефолты `settingsData.ts`. Нужны, только если
# витрина недоступна в момент сборки базы знаний.
FALLBACK = {
    "deliveryFee": 25000,
    "freeDeliveryThreshold": 500000,
    "paymentMethods": ["cash", "click", "payme"],
}


async def fetch_public_config() -> Dict[str, Any]:
    """Публичные настройки витрины. При отказе — дефолты, а не исключение."""
    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{STOREFRONT_API_URL}/config") as resp:
                if resp.status != 200:
                    logger.warning("Витрина отдала %s на /config", resp.status)
                    return dict(FALLBACK)
                data = await resp.json()
    except Exception as e:
        logger.warning("Не удалось прочитать настройки витрины: %s", e)
        return dict(FALLBACK)

    return {
        "deliveryFee": int(data.get("deliveryFee") or FALLBACK["deliveryFee"]),
        "freeDeliveryThreshold": int(
            data.get("freeDeliveryThreshold") or FALLBACK["freeDeliveryThreshold"]
        ),
        "paymentMethods": data.get("paymentMethods") or FALLBACK["paymentMethods"],
    }


def money(amount: int) -> str:
    """500000 → `500 000`."""
    return f"{amount:,}".replace(",", " ")


def payment_text(methods: list[str]) -> str:
    """`['cash', 'transfer']` → `наличными курьеру, перечислением`."""
    named = [PAYMENT_LABELS.get(m, m) for m in methods if m]
    return ", ".join(named) if named else "уточните у менеджера"


async def knowledge_placeholders() -> Dict[str, str]:
    """Значения для подстановки в файлы базы знаний."""
    config = await fetch_public_config()
    return {
        "{{delivery_fee}}": money(config["deliveryFee"]),
        "{{free_delivery_threshold}}": money(config["freeDeliveryThreshold"]),
        "{{payment_methods}}": payment_text(config["paymentMethods"]),
    }

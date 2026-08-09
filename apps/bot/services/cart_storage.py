"""
🛒 Cart Storage — Redis-backed with file fallback

Primary: Redis (fast, shared, survives restarts across processes)
Fallback: JSON file (when Redis is unavailable)

Set REDIS_URL in .env to enable Redis:
  REDIS_URL=redis://localhost:6379/0
"""

import json
import os
import logging
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger(__name__)

CART_FILE = Path(__file__).parent.parent / "data" / "carts.json"
REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_PREFIX = "mcg:cart:"
REDIS_CHECKOUT_PREFIX = "mcg:checkout:"
REDIS_TTL = 86400 * 7  # 7 days


# ==================== REDIS BACKEND ====================

class RedisCartStorage:
    """Redis-backed cart storage with TTL auto-expiry"""

    def __init__(self, redis_url: str):
        try:
            import redis
            self.client = redis.from_url(redis_url, decode_responses=True)
            self.client.ping()
            self.available = True
            logger.info(f"✅ Redis cart storage connected: {redis_url.split('@')[-1]}")
        except Exception as e:
            self.client = None
            self.available = False
            logger.warning(f"Redis unavailable, using file fallback: {e}")

    def _key(self, user_id: int) -> str:
        return f"{REDIS_PREFIX}{user_id}"

    def _checkout_key(self, user_id: int) -> str:
        return f"{REDIS_CHECKOUT_PREFIX}{user_id}"

    # Cart
    def get_cart(self, user_id: int) -> list:
        raw = self.client.get(self._key(user_id))
        return json.loads(raw) if raw else []

    def add_to_cart(self, user_id: int, product: dict):
        cart = self.get_cart(user_id)
        # Check if product already in cart → increment quantity
        for item in cart:
            if item.get("id") == product.get("id"):
                item["quantity"] = item.get("quantity", 1) + 1
                self.client.setex(self._key(user_id), REDIS_TTL, json.dumps(cart, ensure_ascii=False))
                return
        product["quantity"] = product.get("quantity", 1)
        cart.append(product)
        self.client.setex(self._key(user_id), REDIS_TTL, json.dumps(cart, ensure_ascii=False))

    def clear_cart(self, user_id: int):
        self.client.delete(self._key(user_id))

    def set_cart(self, user_id: int, cart: list):
        self.client.setex(self._key(user_id), REDIS_TTL, json.dumps(cart, ensure_ascii=False))

    # Checkout
    def get_checkout_state(self, user_id: int) -> dict:
        raw = self.client.get(self._checkout_key(user_id))
        return json.loads(raw) if raw else {}

    def set_checkout_state(self, user_id: int, state: dict):
        self.client.setex(self._checkout_key(user_id), REDIS_TTL, json.dumps(state, ensure_ascii=False))

    def clear_checkout_state(self, user_id: int):
        self.client.delete(self._checkout_key(user_id))


# ==================== FILE BACKEND ====================

class FileCartStorage:
    """File-backed cart storage with in-memory cache"""

    def __init__(self, filepath: Path = CART_FILE):
        self.filepath = filepath
        self._carts: Dict[int, List[dict]] = {}
        self._checkout_states: Dict[int, dict] = {}
        self.available = True
        self._load()

    def _load(self):
        """Load carts from disk"""
        try:
            if self.filepath.exists():
                with open(self.filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._carts = {int(k): v for k, v in data.get("carts", {}).items()}
                self._checkout_states = {int(k): v for k, v in data.get("checkout_states", {}).items()}
                logger.info(f"Loaded {len(self._carts)} carts from {self.filepath}")
        except Exception as e:
            logger.warning(f"Cart load failed, starting fresh: {e}")
            self._carts = {}
            self._checkout_states = {}

    def _save(self):
        """Save carts to disk (atomic write)"""
        try:
            self.filepath.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.filepath.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({
                    "carts": {str(k): v for k, v in self._carts.items()},
                    "checkout_states": {str(k): v for k, v in self._checkout_states.items()},
                }, f, ensure_ascii=False, indent=2)
            if os.name == 'nt':
                if self.filepath.exists():
                    self.filepath.unlink()
            tmp.rename(self.filepath)
        except Exception as e:
            logger.error(f"Cart save failed: {e}")

    # Cart
    def get_cart(self, user_id: int) -> list:
        return self._carts.get(user_id, [])

    def add_to_cart(self, user_id: int, product: dict):
        if user_id not in self._carts:
            self._carts[user_id] = []
        # Check if product already in cart → increment quantity
        for item in self._carts[user_id]:
            if item.get("id") == product.get("id"):
                item["quantity"] = item.get("quantity", 1) + 1
                self._save()
                return
        product["quantity"] = product.get("quantity", 1)
        self._carts[user_id].append(product)
        self._save()

    def clear_cart(self, user_id: int):
        self._carts[user_id] = []
        self._save()

    def set_cart(self, user_id: int, cart: list):
        self._carts[user_id] = cart
        self._save()

    # Checkout
    def get_checkout_state(self, user_id: int) -> dict:
        return self._checkout_states.get(user_id, {})

    def set_checkout_state(self, user_id: int, state: dict):
        self._checkout_states[user_id] = state
        self._save()

    def clear_checkout_state(self, user_id: int):
        if user_id in self._checkout_states:
            del self._checkout_states[user_id]
            self._save()


# ==================== AUTO-SELECT BACKEND ====================

def _create_storage():
    """Auto-select Redis if available, else fall back to file storage"""
    if REDIS_URL:
        redis_storage = RedisCartStorage(REDIS_URL)
        if redis_storage.available:
            return redis_storage
        logger.warning("Redis configured but unavailable — falling back to file storage")

    return FileCartStorage()


# Singleton
cart_storage = _create_storage()

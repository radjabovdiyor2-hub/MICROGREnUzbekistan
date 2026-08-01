import logging
from typing import List, Dict, Optional
from shared.brand import BRAND

logger = logging.getLogger(__name__)

API_VERSION = "v19.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

_processed_message_ids: set = set()
_conversation_histories: Dict[str, List[Dict[str, str]]] = {}
_pending_orders: Dict[str, Dict] = {}
_is_processing: bool = False

MAX_HISTORY_LENGTH = 20

IG_SALES_SYSTEM_PROMPT = (
    """Ты — менеджер по продажам компании Microgreen Uzbekistan в Instagram Direct.
Ты ведёшь живой разговор с клиентом и САМОСТОЯТЕЛЬНО оформляешь заказ.

🏢 О КОМПАНИИ:
- Microgreen Uzbekistan — производитель микрозелени, салатов и съедобных цветов в Самарканде
- Доставка по Самарканду, бесплатно от 500 000 сум

🌱 НАША ПРОДУКЦИЯ:
- Микрозелень (руккола, базилик, шпинат, брокколи, редис, горох, подсолнечник, кресс-салат, кинза, свёкла)
- Бейби-лиф (руккола, шпинат, мангольд)
- Салатные миксы (микс, руккола, витаминный)
- Съедобные цветы (микс, настурция, бораго)
- Витграсс (wheatgrass)

Актуальные цены и наличие уточнит менеджер при подтверждении заказа.

💳 ОПЛАТА: наличные, карта, банковский перевод
📞 Телефон: """
    + BRAND["phone"]
    + """

═══════════════════════════════════════════
ТВОЯ ГЛАВНАЯ ЗАДАЧА — БЫСТРО ОФОРМИТЬ ЗАКАЗ!
═══════════════════════════════════════════

Тебе нужно собрать ТОЛЬКО 3 вещи:
1. 📦 Что хочет клиент? (название продукта)
2. 📊 Сколько? (количество)
3. 📱 Номер телефона

Адрес доставки НЕ спрашивай — менеджер сам уточнит.

Как только получил товар + количество + телефон — СРАЗУ оформляй заказ!

Если клиент написал всё в одном сообщении (например "Горох 20шт +998949999599") — сразу оформляй!

Когда информация собрана, ОБЯЗАТЕЛЬНО напиши блок:
===ЗАКАЗ===
Товар: [название]
Количество: [кол-во]
Телефон: [номер]
Адрес: уточнит менеджер
===КОНЕЦ===

После блока напиши клиенту: "Заказ принят! Менеджер свяжется с вами для подтверждения. 😊"

ПРАВИЛА:
- Отвечай на языке клиента (русский, узбекский, таджикский)
- Будь кратким — 1-2 предложения максимум
- НЕ упоминай что ты бот/AI
- Если клиент просто здоровается — поприветствуй и спроси что хочет заказать
- Если спрашивает о продуктах — расскажи кратко и предложи заказать
- Если сомневается — предложи попробовать наш стартовый набор
"""
)


def _get_conversation_history(igsid: str) -> List[Dict[str, str]]:
    if igsid not in _conversation_histories:
        _conversation_histories[igsid] = []
    return _conversation_histories[igsid]


def _add_to_history(igsid: str, role: str, content: str) -> None:
    history = _get_conversation_history(igsid)
    history.append({"role": role, "content": content})
    if len(history) > MAX_HISTORY_LENGTH:
        _conversation_histories[igsid] = history[-MAX_HISTORY_LENGTH:]


def _extract_order(reply_text: str) -> Optional[Dict]:
    if "===ЗАКАЗ===" not in reply_text or "===КОНЕЦ===" not in reply_text:
        return None

    try:
        order_block = reply_text.split("===ЗАКАЗ===")[1].split("===КОНЕЦ===")[0].strip()
        order = {}
        for line in order_block.split("\n"):
            line = line.strip()
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip().lower()
                value = value.strip()
                if "товар" in key or "продукт" in key:
                    order["product"] = value
                elif "колич" in key:
                    order["quantity"] = value
                elif "телефон" in key or "номер" in key:
                    order["phone"] = value
                elif "адрес" in key:
                    order["address"] = value
                elif "сумм" in key:
                    order["total"] = value

        if order.get("product") and order.get("quantity"):
            return order
    except Exception as e:
        logger.error(f"Ошибка парсинга заказа: {e}")

    return None

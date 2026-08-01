from shared.ai_engine import AIEngine

API_VERSION = "v21.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"

OUR_HANDLE = "microgreenuzbekistan"
REPLY_WINDOW_HOURS = 48
MAX_REPLIES_PER_RUN = 8

ai = AIEngine()

_INQUIRY_WORDS = [
    "цена", "цен", "стои", "сколько", "почём", "почем", "narx", "qancha",
    "достав", "yetkaz", "заказ", "buyurtma", "купить", "sotib", "заказать",
    "наличи", "есть в", " бор", "boru", "available", "how much", "price",
    "адрес", "manzil", "номер", "telefon", "телефон", "склад",
]

REPLY_SYSTEM = (
    "Ты — SMM-менеджер Microgreen Uzbekistan (микрозелень, салаты, съедобные цветы, Самарканд). "
    "Отвечаешь на комментарий под постом в Instagram — вежливо, тепло, КОРОТКО (1-2 предложения), "
    "с 1 эмодзи. Отвечай на языке комментария (русский/узбекский). Не упоминай, что ты бот. "
    "Если спрашивают цену/наличие/как заказать — коротко направь в Директ или на номер "
    "+998 94 999 95 99. Без длинных списков."
)

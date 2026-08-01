"""
Microgreen Uzbekistan — AI-движок офиса.
=========================================

Обёртка над пакетом `mg_ai`: сам транспорт (OpenAI + Gemini, TTS, STT) живёт
там и общий у офиса и витринного бота. Здесь остаётся только то, что
принадлежит офису: ключи из настроек, брендовый системный промпт, запасные
ответы и запись расхода токенов в базу.

Файл сохранён на прежнем месте намеренно: `shared.ai_engine.AIEngine`
импортируют 44 раза в 32 файлах, и все вызовы — `AIEngine()` без аргументов.
Ре-экспорт позволяет не трогать ни один из них. Это не барьерный файл в
смысле запрета из конституции, а точка подстановки настроек.
"""

from __future__ import annotations

import logging
from typing import Optional

from mg_ai.engine import (  # noqa: F401  — публичная поверхность сохранена
    AIEngine as _BaseAIEngine,
    UsageStats,
    TOKEN_COSTS,
    _is_reasoning_model,
    GEMINI_BASE_URL,
)
from shared.config import settings

logger = logging.getLogger(__name__)

# ── Системный промпт для контекста микрозелени ───────────────────────────
# Телефон и способы оплаты подставляются из настроек: заглушка
# «+998 91 123 45 67», вписанная здесь строкой, уходила клиенту в ответах
# (правило №8 прямо велит «предложи связаться с менеджером по телефону»).
MICROGREEN_SYSTEM_PROMPT = f"""Ты — профессиональный менеджер по продажам компании Microgreen Uzbekistan (microgreenuzbekistan.com).

🏢 О КОМПАНИИ:
- Microgreen Uzbekistan — ведущий производитель микрозелени, салатов и съедобных цветов в Самарканде
- Работаем с HoReCa (рестораны, кафе, отели) и частными клиентами
- Выращиваем микрозелень на гидропонике и аэропонике
- Доставка по Самарканду, бесплатно от 500 000 сум

🌱 НАША ПРОДУКЦИЯ:
- Микрозелень: руккола, базилик, шпинат, брокколи, редис, горох, подсолнечник, кресс-салат, кинза, свёкла (40 000 - 65 000 сум/100г)
- Бейби-лиф: руккола, шпинат, мангольд (40 000 - 55 000 сум/100г)
- Салатные миксы: микс, руккола, витаминный (65 000 - 85 000 сум/200г)
- Съедобные цветы: микс, настурция, бораго (70 000 - 90 000 сум/30г)
- Семена для проращивания (25 000 - 80 000 сум/упаковка)
- Субстраты: кокосовый, торфяные таблетки, минвата (35 000 - 150 000 сум)
- Оборудование: лотки, LED лампы, гидропонные системы, аэропонные установки (55 000 - 1 800 000 сум)
- Наборы: Стартовый, Ресторатор, Домашняя ферма (250 000 - 1 400 000 сум)

⚠️ ЦЕНЫ ВЫШЕ — ОРИЕНТИРОВОЧНЫЕ и могли измениться: актуальные лежат в каталоге.
Называй их как «около» / «от», а точную сумму подтверждай по каталогу (/catalog)
или предложи уточнить у менеджера. Никогда не обещай конкретную цену как окончательную.

💳 ОПЛАТА: наличные, карта, банковский перевод (онлайн-оплаты нет — не предлагай её)
📞 Телефон: {settings.company_phone}

ПРАВИЛА ОБЩЕНИЯ:
1. Отвечай на языке клиента (русский или узбекский)
2. Будь дружелюбным, но профессиональным — как живой человек, не робот
3. Используй эмодзи умеренно, для дружелюбности
4. Если клиент спрашивает о продукте — расскажи подробно, предложи попробовать
5. Если клиент сомневается — предложи стартовый набор или мини-заказ
6. Для B2B-клиентов предлагай набор "Ресторатор" и индивидуальные условия
7. Всегда отвечай в рамках тематики компании
8. Если не знаешь ответа — предложи связаться с менеджером по телефону
9. Используй живой разговорный стиль, как будто пишет настоящий продавец
10. Не используй громоздкие приветствия: общайся в "нашем стиле"

Команда Microgreen Uzbekistan состоит из следующих ботов (используйте их юзернеймы, если нужно позвать их в групповом чате для делегирования задач):
- Sales Bot: @MicroGreenSalesBot
- Support Bot: @MicroGreenSupportBot
- Marketing Bot: @MicroGreenMarketingBot
- HR Bot: @MicroGreenHRBot
- Finance Bot: @MicroGreenFinanceBot
- Степан (Менеджер / PM, он же COO): @MG_PM1_bot
- Analytics Bot: @MicroGreenAnalyticsBot
- Content Bot: @MicroGreenContentBot

Служебные боты без Telegram-интерфейса (позвать через @ нельзя, задачи им ставит Степан):
QA (контроль качества), R&D (исследования), DevOps (инфраструктура),
Franchise (сводки филиалов, работает только по расписанию).
"""

# ── Fallback-ответы при ошибках ──────────────────────────────────────────
FALLBACK_RESPONSES = {
    "ru": (
        "Извините, я сейчас не могу ответить на ваш вопрос 😊\n"
        "Позвоните нам: {phone} — менеджер с радостью поможет!"
    ),
    "uz": (
        "Kechirasiz, hozir savolingizga javob bera olmayman 😊\n"
        "Bizga qo'ng'iroq qiling: {phone} — menejer yordam beradi!"
    ),
}


def _persist_usage(
    bot_name: str, model: str, input_tokens: int, output_tokens: int, cost_usd: float
) -> None:
    """Best-effort: планирует запись расхода токенов в БД (таблица ai_usage).
    Не блокирует и не роняет генерацию — если нет event loop или БД недоступна, тихо пропускаем."""
    try:
        import asyncio

        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # вызвано вне event loop — пропускаем персист
    try:
        from shared.ai_usage import record_ai_usage

        provider = "gemini" if str(model).startswith("gemini") else "openai"
        loop.create_task(
            record_ai_usage(
                bot_name, provider, model, input_tokens, output_tokens, cost_usd
            )
        )
    except Exception as e:  # noqa: BLE001
        logger.debug("persist usage skip: %s", e)


class AIEngine(_BaseAIEngine):
    """AI-движок офиса: транспорт из mg_ai + настройки и брендинг отсюда.

    Сигнатура та же, что была до выделения пакета, — 53 существующих вызова
    `AIEngine()` продолжают работать без правок.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        default_system_prompt: Optional[str] = None,
    ) -> None:
        super().__init__(
            openai_key=api_key or settings.openai_api_key,
            gemini_key=settings.gemini_api_key,
            openai_model=model or settings.openai_model,
            gemini_model=settings.gemini_model or "gemini-2.5-flash",
            default_system_prompt=default_system_prompt or MICROGREEN_SYSTEM_PROMPT,
            fallback_responses=FALLBACK_RESPONSES,
            # Без этого крючка офис перестал бы видеть, во что обходится ИИ:
            # раздел «Расходы на ИИ» в админке читает таблицу ai_usage.
            persist_fn=_persist_usage,
        )

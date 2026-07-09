"""
Microgreen Uzbekistan — AI-движок (OpenAI интеграция)
=====================================================
Асинхронный клиент OpenAI с поддержкой:
- Контекста продаж микрозелени
- Двуязычности (узбекский + русский)
- Отслеживания токенов и стоимости
- Истории разговоров
- Fallback-ответов при сбоях
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from openai import AsyncOpenAI, APIError, RateLimitError, APITimeoutError

from shared.config import settings

logger = logging.getLogger(__name__)

# ── Стоимость токенов по моделям (USD за 1M токенов) ─────────────────────
TOKEN_COSTS: Dict[str, Dict[str, float]] = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
}

# ── Системный промпт для контекста микрозелени ───────────────────────────
MICROGREEN_SYSTEM_PROMPT = """Ты — профессиональный менеджер по продажам компании Microgreen Uzbekistan (microgreenuzbekistan.com).

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

💳 ОПЛАТА: наличные, карта, Click, Payme, банковский перевод
📞 Телефон: +998 91 123 45 67

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
- PM Bot: @MicroGreenPMBot
- Analytics Bot: @MicroGreenAnalyticsBot
- Content Bot: @MicroGreenContentBot
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


@dataclass
class UsageStats:
    """Статистика использования AI за сессию."""

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_requests: int = 0
    total_errors: int = 0
    total_cost_usd: float = 0.0
    requests_log: List[Dict] = field(default_factory=list)

    def add_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str,
        duration_ms: float,
    ) -> None:
        """Добавление записи об использовании."""
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_requests += 1

        # Расчёт стоимости
        costs = TOKEN_COSTS.get(model, {"input": 5.0, "output": 15.0})
        cost = (
            (input_tokens / 1_000_000) * costs["input"]
            + (output_tokens / 1_000_000) * costs["output"]
        )
        self.total_cost_usd += cost

        self.requests_log.append(
            {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": round(cost, 6),
                "duration_ms": round(duration_ms, 1),
                "model": model,
            }
        )


class AIEngine:
    """
    Асинхронный AI-движок на базе OpenAI.

    Предоставляет:
    - chat_completion() — генерация ответов с учётом контекста
    - Автоматическое отслеживание токенов и стоимости
    - Fallback-ответы при сбоях API
    - Настраиваемый системный промпт

    Использование:
        ai = AIEngine()
        response = await ai.chat_completion(
            system_prompt="Ты менеджер по продажам...",
            user_message="Что у вас есть из микрозелени?",
        )
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        default_system_prompt: Optional[str] = None,
    ):
        """
        Инициализация AI-движка.

        Args:
            api_key: OpenAI API ключ (по умолчанию из settings)
            model: Модель OpenAI (по умолчанию из settings)
            default_system_prompt: Системный промпт по умолчанию
        """
        self._api_key = api_key or settings.openai_api_key
        self._model = model or settings.openai_model
        self._default_system_prompt = default_system_prompt or MICROGREEN_SYSTEM_PROMPT

        # Асинхронный клиент OpenAI
        self._client = AsyncOpenAI(
            api_key=self._api_key,
            timeout=120.0,
            max_retries=2,
        )

        # Статистика использования
        self.usage = UsageStats()

        logger.info(f"AI-движок инициализирован: модель={self._model}")

    async def chat_completion(
        self,
        system_prompt: Optional[str] = None,
        user_message: str = "",
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: str = "ru",
        image_base64: Optional[str] = None,
    ) -> str:
        """
        Генерация ответа через OpenAI Chat Completions API.

        Args:
            system_prompt: Системный промпт (если None — используется промпт по умолчанию)
            user_message: Сообщение пользователя
            conversation_history: История диалога [{"role": "user"/"assistant", "content": "..."}]
            temperature: Креативность (0.0 — точность, 1.0 — креативность)
            max_tokens: Максимум токенов в ответе
            language: Язык ответа ("ru" или "uz") для fallback
            image_base64: Base64 строка изображения для Vision API

        Returns:
            Текст ответа от AI или fallback-сообщение при ошибке
        """
        # Формируем массив сообщений
        messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": system_prompt or self._default_system_prompt,
            }
        ]

        # Добавляем историю разговора (если есть)
        if conversation_history:
            messages.extend(conversation_history)

        # Добавляем текущее сообщение пользователя
        if user_message or image_base64:
            content = []
            if user_message:
                content.append({"type": "text", "text": user_message})
            if image_base64:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                })
            # Если только текст (и нет картинки), передаем просто строкой для совместимости
            if not image_base64 and user_message:
                messages.append({"role": "user", "content": user_message})
            else:
                messages.append({"role": "user", "content": content})

        # Замер времени
        start_time = time.monotonic()

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=0.95,
                frequency_penalty=0.1,   # Снижаем повторения
                presence_penalty=0.1,    # Поощряем разнообразие
            )

            duration_ms = (time.monotonic() - start_time) * 1000

            # Извлекаем ответ
            reply = response.choices[0].message.content or ""

            # Записываем статистику использования
            usage = response.usage
            if usage:
                self.usage.add_usage(
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.completion_tokens,
                    model=self._model,
                    duration_ms=duration_ms,
                )
                logger.debug(
                    f"AI ответ: {usage.prompt_tokens} in / "
                    f"{usage.completion_tokens} out / "
                    f"{duration_ms:.0f}ms"
                )

            return reply.strip()

        except RateLimitError as e:
            self.usage.total_errors += 1
            logger.warning(f"OpenAI rate limit: {e}")
            return self._get_fallback(language)

        except APITimeoutError as e:
            self.usage.total_errors += 1
            logger.warning(f"OpenAI timeout: {e}")
            return self._get_fallback(language)

        except APIError as e:
            self.usage.total_errors += 1
            logger.error(f"OpenAI API ошибка: {e}")
            return self._get_fallback(language)

        except Exception as e:
            self.usage.total_errors += 1
            logger.error(f"Неожиданная ошибка AI-движка: {e}", exc_info=True)
            return self._get_fallback(language)

    async def chat_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: List[Dict],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
    ):
        """
        OpenAI Chat Completions API with Function Calling support.
        """
        messages = [{"role": "system", "content": system_prompt}]
        if conversation_history:
            messages.extend(conversation_history)
        if user_message:
            messages.append({"role": "user", "content": user_message})

        try:
            start_time = time.monotonic()
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=temperature,
                tools=tools,
                tool_choice="auto",
            )
            duration_ms = (time.monotonic() - start_time) * 1000
            
            usage = response.usage
            if usage:
                self.usage.add_usage(
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.completion_tokens,
                    model=self._model,
                    duration_ms=duration_ms,
                )
            return response.choices[0].message
        except Exception as e:
            logger.error(f"OpenAI tools error: {e}")
            raise

    def _get_fallback(self, language: str = "ru") -> str:
        """Получение fallback-ответа на нужном языке."""
        template = FALLBACK_RESPONSES.get(language, FALLBACK_RESPONSES["ru"])
        return template.format(phone=settings.company_phone)

    async def generate_image(self, prompt: str, size: str = "1024x1024") -> Optional[str]:
        """
        Генерация изображения СТРОГО через GPT Image 2 (OpenAI).
        Возвращает локальный путь к файлу. Публичный URL сохраняется в self._last_image_url.
        """
        self._last_image_url = None
        # Фирменный стиль Microgreen Uzbekistan в каждый промпт
        from shared.brand import brand_image_prompt, overlay_logo
        prompt = brand_image_prompt(prompt)
        try:
            logger.info(f"Генерация картинки: {prompt[:50]}...")
            try:
                response = await self._client.images.generate(
                    model="gpt-image-2",
                    prompt=prompt,
                    size=size,
                    quality="auto",
                    n=1,
                )
                if response.data[0].b64_json:
                    import base64
                    with open("temp_img.jpg", "wb") as f:
                        f.write(base64.b64decode(response.data[0].b64_json))
                    # Накладываем логотип бренда на готовое изображение
                    overlay_logo("temp_img.jpg")
                    # gpt-image-2 returns base64, no public URL available
                    self._last_image_url = None
                    return "temp_img.jpg"
                self._last_image_url = response.data[0].url
                return response.data[0].url
            except Exception as e:
                logger.warning(f"gpt-image-2 failed: {e}. Trying gpt-image-1 as fallback...")
                response = await self._client.images.generate(
                    model="gpt-image-1",
                    prompt=prompt,
                    size=size,
                    n=1,
                )
                self._last_image_url = response.data[0].url
                return response.data[0].url
                
        except Exception as e:
            logger.error(f"Ошибка при генерации изображения через OpenAI API: {e}", exc_info=True)
            return None

    async def generate_speech(self, text: str, voice: str = "alloy") -> Optional[str]:
        """
        Генерация аудио (TTS) через OpenAI API.
        Возвращает путь к сгенерированному файлу voice.ogg.
        """
        try:
            logger.info(f"Генерация аудио для текста: {text[:50]}...")
            response = await self._client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text,
                response_format="opus"
            )
            file_path = "voice.ogg"
            # stream_to_file is synchronous, but we can do simple read/write for async if needed.
            # But the async client supports stream_to_file as an async operation usually, wait...
            # Actually with modern openai python client, `create` returns HttpxBinaryResponseContent for TTS.
            # It has stream_to_file, which is async if using AsyncOpenAI.
            response.stream_to_file(file_path)
            return file_path
        except Exception as e:
            logger.error(f"Ошибка при генерации аудио через OpenAI TTS: {e}", exc_info=True)
            return None

    async def transcribe_audio(self, file_path: str) -> Optional[str]:
        """
        Распознавание речи (Speech-to-Text) через OpenAI Whisper.
        Возвращает расшифрованный текст.
        """
        try:
            logger.info(f"Распознавание аудио файла: {file_path}")
            with open(file_path, "rb") as audio_file:
                response = await self._client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                )
            return response.text
        except Exception as e:
            logger.error(f"Ошибка распознавания аудио (Whisper): {e}", exc_info=True)
            return None

    def get_stats_summary(self) -> str:
        """
        Сводка статистики использования AI.

        Возвращает читаемую строку с данными о расходе токенов.
        """
        u = self.usage
        return (
            f"📊 Статистика AI-движка:\n"
            f"  Запросов: {u.total_requests}\n"
            f"  Ошибок: {u.total_errors}\n"
            f"  Токенов (вход): {u.total_input_tokens:,}\n"
            f"  Токенов (выход): {u.total_output_tokens:,}\n"
            f"  Стоимость: ${u.total_cost_usd:.4f}"
        )

    async def close(self) -> None:
        """Закрытие HTTP-клиента OpenAI."""
        await self._client.close()
        logger.info("AI-движок: клиент закрыт")


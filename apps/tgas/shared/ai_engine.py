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
- Степан (Менеджер / PM): @MicroGreenPMBot
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

        # ── КАСКАД провайдеров: бесплатные первыми, OpenAI последним ──
        # Не сработал один (квота/ошибка/пустой ответ) → сразу следующий. Заглушка —
        # только если упал весь каскад. Провайдеры без ключа уже отфильтрованы.
        from shared.ai_providers import iter_text_clients
        cascade = iter_text_clients()
        if not cascade:
            logger.error("AI: нет ни одного провайдера с ключом — проверьте *_API_KEY в env")
            return self._get_fallback(language)

        last_err = None
        for label, client, model in cascade:
            start_time = time.monotonic()
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    # Только широко поддерживаемые параметры — не все провайдеры принимают
                    # top_p/frequency_penalty/presence_penalty.
                )
                reply = ""
                if response.choices:
                    reply = (response.choices[0].message.content or "").strip()
                if not reply:
                    last_err = f"{label}/{model}: пустой ответ"
                    continue

                duration_ms = (time.monotonic() - start_time) * 1000
                usage = getattr(response, "usage", None)
                if usage:
                    try:
                        self.usage.add_usage(
                            input_tokens=usage.prompt_tokens,
                            output_tokens=usage.completion_tokens,
                            model=f"{label}/{model}",
                            duration_ms=duration_ms,
                        )
                    except Exception:  # noqa: BLE001
                        pass
                logger.info(f"AI: ответ через {label}/{model} ({duration_ms:.0f}ms)")
                return reply

            except (RateLimitError, APITimeoutError, APIError) as e:
                last_err = f"{label}/{model}: {type(e).__name__}"
                self.usage.total_errors += 1
                logger.warning(f"AI: {label}/{model} не сработал ({type(e).__name__}) — следующий")
                continue
            except Exception as e:  # noqa: BLE001
                last_err = f"{label}/{model}: {e}"
                self.usage.total_errors += 1
                logger.warning(f"AI: {label}/{model} ошибка — {e} — следующий")
                continue

        logger.error(f"AI: весь каскад провайдеров упал. Последняя ошибка: {last_err}")
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
        Генерация изображения через OpenAI (gpt-image-2, запасная — gpt-image-1).

        Обе модели отдают картинку в base64 (b64_json) — сохраняем её в файл; поле .url
        у них пустое, поэтому раньше запасная ветка возвращала None (картинка терялась).
        Теперь: при сбое основной модели запасная реально сохраняет результат, а при
        429/таймауте делаем повторные попытки с паузой. Возвращает локальный путь к файлу
        (или None, если все попытки не удались). Публичный URL — в self._last_image_url.
        """
        import asyncio
        import base64

        self._last_image_url = None
        # Фирменный стиль Microgreen Uzbekistan в каждый промпт
        from shared.brand import brand_image_prompt, overlay_logo
        prompt = brand_image_prompt(prompt)
        import os
        out_path = "temp_img.jpg"
        try:
            iw, ih = (int(x) for x in size.lower().split("x")[:2])
        except Exception:  # noqa: BLE001
            iw, ih = 1024, 1024

        # 1) OpenAI gpt-image (лучшее качество) — только при наличии ключа; fail-fast при квоте
        if getattr(self, "_api_key", None):
            models = ["gpt-image-2", "gpt-image-1"]
            openai_done = False
            for attempt in range(1, 3):  # 1 повтор при транзиентном 520
                if openai_done:
                    break
                for model in models:
                    try:
                        use_size = size
                        if model == "gpt-image-1" and size not in ("1024x1024", "1024x1536", "1536x1024"):
                            use_size = "1024x1536" if ih > iw else ("1536x1024" if iw > ih else "1024x1024")
                        kwargs = {"model": model, "prompt": prompt, "size": use_size, "n": 1}
                        if model == "gpt-image-2":
                            kwargs["quality"] = "auto"
                        response = await self._client.images.generate(**kwargs)
                        data = response.data[0] if response and response.data else None
                        b64 = getattr(data, "b64_json", None) if data else None
                        url = getattr(data, "url", None) if data else None
                        if b64:
                            with open(out_path, "wb") as f:
                                f.write(base64.b64decode(b64))
                            self._last_image_url = None
                            overlay_logo(out_path)
                            return out_path
                        if url:
                            import aiohttp
                            async with aiohttp.ClientSession() as s:
                                async with s.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
                                    if r.status == 200:
                                        with open(out_path, "wb") as f:
                                            f.write(await r.read())
                                        self._last_image_url = url
                                        overlay_logo(out_path)
                                        return out_path
                    except (RateLimitError, APITimeoutError):
                        logger.warning("OpenAI image: лимит/квота — переключаюсь на бесплатные")
                        openai_done = True
                        break
                    except Exception as e:  # noqa: BLE001
                        logger.warning(f"OpenAI image {model} failed: {e}")
                        continue
                if not openai_done and attempt < 2:
                    await asyncio.sleep(2)

        # 2) Бесплатные провайдеры: Pollinations (без ключа) → Cloudflare → HuggingFace
        from shared.ai_providers import image_pollinations, image_cloudflare, image_hf
        free = [
            ("pollinations", lambda: image_pollinations(prompt, iw, ih, out_path)),
            ("cloudflare", lambda: image_cloudflare(prompt, out_path)),
            ("huggingface", lambda: image_hf(prompt, out_path)),
        ]
        for name, make in free:
            try:
                path = await make()
            except Exception as e:  # noqa: BLE001
                logger.warning(f"image {name} error: {e}")
                path = None
            if path and os.path.isfile(path):
                self._last_image_url = None
                overlay_logo(path)
                logger.info(f"Картинка сгенерирована через {name}")
                return path

        logger.error("Не удалось сгенерировать картинку ни одним провайдером (вкл. бесплатные)")
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


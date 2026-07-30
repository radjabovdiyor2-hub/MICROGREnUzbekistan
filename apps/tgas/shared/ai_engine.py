"""
Microgreen Uzbekistan — AI-движок (Gemini + OpenAI fallback)
=============================================================
Асинхронный клиент с приоритетом:
  1. Google Gemini (gemini-2.5-flash) — основной LLM для текста
  2. OpenAI (gpt-4o) — fallback для текста, если Gemini недоступен
  3. OpenAI — генерация изображений (gpt-image-2/1)
  4. OpenAI — TTS/STT (tts-1, whisper-1)

Поддерживает:
- Контекст продаж микрозелени
- Двуязычность (узбекский + русский)
- Отслеживание токенов и стоимости
- Историю разговоров
- Fallback-ответы при сбоях
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import aiohttp
from shared.config import settings

logger = logging.getLogger(__name__)

# ── Стоимость токенов по моделям (USD за 1M токенов) ─────────────────────
TOKEN_COSTS: Dict[str, Dict[str, float]] = {
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}

# ── Gemini REST API URL ──────────────────────────────────────────────────
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

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


def _persist_usage(bot_name: str, model: str, input_tokens: int, output_tokens: int, cost_usd: float) -> None:
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
        loop.create_task(record_ai_usage(bot_name, provider, model, input_tokens, output_tokens, cost_usd))
    except Exception as e:  # noqa: BLE001
        logger.debug("persist usage skip: %s", e)


@dataclass
class UsageStats:
    """Статистика использования AI за сессию."""

    bot_name: str = "unknown"
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

        costs = TOKEN_COSTS.get(model, {"input": 1.0, "output": 3.0})
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

        # Персистентный учёт по боту/модели (для отчёта о стоимости и бюджет-алертов).
        _persist_usage(self.bot_name, model, input_tokens, output_tokens, cost)


class AIEngine:
    """
    Асинхронный AI-движок: Gemini (primary) + OpenAI (images, fallback).

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
        # Gemini — основной
        self._gemini_key = settings.gemini_api_key
        self._gemini_model = settings.gemini_model or "gemini-2.5-flash"

        # OpenAI — fallback для текста + генерация картинок
        self._openai_key = api_key or settings.openai_api_key
        self._openai_model = model or settings.openai_model
        self._openai_client = None

        self._default_system_prompt = default_system_prompt or MICROGREEN_SYSTEM_PROMPT
        self._session: Optional[aiohttp.ClientSession] = None

        # Статистика (bot_name из env BOT_NAME — атрибуция расхода по боту в ai_usage)
        import os
        self.usage = UsageStats(bot_name=os.getenv("BOT_NAME", "unknown"))

        provider = "Gemini" if self._gemini_key else "OpenAI"
        logger.info(f"AI-движок инициализирован: {provider}, модель={self._gemini_model if self._gemini_key else self._openai_model}")

    def _get_session(self) -> aiohttp.ClientSession:
        """Lazy-инициализация HTTP-сессии."""
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120)
            )
        return self._session

    def _get_openai_client(self):
        """Lazy-инициализация OpenAI клиента (для картинок/TTS/STT)."""
        if self._openai_client is None and self._openai_key:
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(
                api_key=self._openai_key,
                timeout=120.0,
                max_retries=2,
            )
        return self._openai_client

    # ─── Gemini REST API ─────────────────────────────────────────────

    async def _gemini_chat(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        image_base64: Optional[str] = None,
    ) -> str:
        """Вызов Gemini REST API."""
        session = self._get_session()

        # Формируем contents
        contents = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        # Текущее сообщение
        parts = []
        if user_message:
            parts.append({"text": user_message})
        if image_base64:
            parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": image_base64,
                }
            })
        if parts:
            contents.append({"role": "user", "parts": parts})

        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
                "topP": 0.95,
            },
        }

        url = f"{GEMINI_BASE_URL}/{self._gemini_model}:generateContent?key={self._gemini_key}"
        start_time = time.monotonic()

        for attempt in range(3):
            try:
                async with session.post(
                    url,
                    json=body,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        duration_ms = (time.monotonic() - start_time) * 1000

                        # Извлекаем текст
                        text = (
                            data.get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [{}])[0]
                            .get("text", "")
                        )

                        # Статистика (Gemini возвращает usageMetadata)
                        usage = data.get("usageMetadata", {})
                        input_tokens = usage.get("promptTokenCount", 0)
                        output_tokens = usage.get("candidatesTokenCount", 0)
                        if input_tokens or output_tokens:
                            self.usage.add_usage(
                                input_tokens=input_tokens,
                                output_tokens=output_tokens,
                                model=self._gemini_model,
                                duration_ms=duration_ms,
                            )
                        logger.debug(
                            f"Gemini ответ: {input_tokens} in / "
                            f"{output_tokens} out / {duration_ms:.0f}ms"
                        )
                        return text.strip()

                    if resp.status == 429 and attempt < 2:
                        logger.warning(f"Gemini 429, попытка {attempt + 1}/3")
                        await asyncio.sleep((attempt + 1) * 2.5)
                        continue

                    err = await resp.text()
                    logger.error(f"Gemini {resp.status}: {err[:200]}")
                    raise Exception(f"Gemini API error: {resp.status}")

            except aiohttp.ClientError as e:
                logger.warning(f"Gemini network error (attempt {attempt + 1}): {e}")
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                raise

        raise Exception("Gemini: max retries exceeded")

    # ─── OpenAI Fallback ─────────────────────────────────────────────

    async def _openai_chat(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        image_base64: Optional[str] = None,
    ) -> str:
        """Fallback через OpenAI SDK."""
        client = self._get_openai_client()
        if not client:
            raise Exception("OpenAI API key not configured")

        messages: List[Dict] = [
            {"role": "system", "content": system_prompt}
        ]
        if conversation_history:
            messages.extend(conversation_history)

        if user_message or image_base64:
            if not image_base64:
                messages.append({"role": "user", "content": user_message})
            else:
                content = []
                if user_message:
                    content.append({"type": "text", "text": user_message})
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                })
                messages.append({"role": "user", "content": content})

        start_time = time.monotonic()
        response = await client.chat.completions.create(
            model=self._openai_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=0.95,
        )

        duration_ms = (time.monotonic() - start_time) * 1000
        reply = response.choices[0].message.content or ""

        usage = response.usage
        if usage:
            self.usage.add_usage(
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                model=self._openai_model,
                duration_ms=duration_ms,
            )

        return reply.strip()

    # ─── Public API ──────────────────────────────────────────────────

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
        Генерация ответа: Gemini → OpenAI fallback → fallback текст.
        """
        prompt = system_prompt or self._default_system_prompt

        # 1. Gemini (primary)
        if self._gemini_key:
            try:
                return await self._gemini_chat(
                    system_prompt=prompt,
                    user_message=user_message,
                    conversation_history=conversation_history,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    image_base64=image_base64,
                )
            except Exception as e:
                self.usage.total_errors += 1
                logger.warning(f"Gemini сбой, пробуем OpenAI: {e}")

        # 2. OpenAI (fallback)
        if self._openai_key:
            try:
                return await self._openai_chat(
                    system_prompt=prompt,
                    user_message=user_message,
                    conversation_history=conversation_history,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    image_base64=image_base64,
                )
            except Exception as e:
                self.usage.total_errors += 1
                logger.error(f"OpenAI fallback сбой: {e}")

        # 3. Fallback текст
        self.usage.total_errors += 1
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
        Chat with function calling — Gemini → OpenAI fallback.

        Gemini использует REST API с functionDeclarations,
        OpenAI — стандартный tools API.
        """
        # Gemini function calling
        if self._gemini_key:
            try:
                return await self._gemini_tools_call(
                    system_prompt, user_message, tools,
                    conversation_history, temperature,
                )
            except Exception as e:
                logger.warning(f"Gemini tools сбой, пробуем OpenAI: {e}")

        # OpenAI fallback
        client = self._get_openai_client()
        if not client:
            raise Exception("Ни Gemini, ни OpenAI не настроены")

        messages = [{"role": "system", "content": system_prompt}]
        if conversation_history:
            messages.extend(conversation_history)
        if user_message:
            messages.append({"role": "user", "content": user_message})

        start_time = time.monotonic()
        response = await client.chat.completions.create(
            model=self._openai_model,
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
                model=self._openai_model,
                duration_ms=duration_ms,
            )
        return response.choices[0].message

    async def _gemini_tools_call(
        self,
        system_prompt: str,
        user_message: str,
        tools: List[Dict],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
    ):
        """Gemini function calling через REST API.

        Конвертирует OpenAI-формат tools в Gemini functionDeclarations.
        Возвращает объект, совместимый по интерфейсу с OpenAI message.
        """
        session = self._get_session()

        # Конвертируем OpenAI tools → Gemini functionDeclarations
        function_declarations = []
        for tool in tools:
            if tool.get("type") == "function":
                fn = tool["function"]
                decl = {
                    "name": fn["name"],
                    "description": fn.get("description", ""),
                }
                if "parameters" in fn:
                    decl["parameters"] = fn["parameters"]
                function_declarations.append(decl)

        contents = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        if user_message:
            contents.append({"role": "user", "parts": [{"text": user_message}]})

        body = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "tools": [{"functionDeclarations": function_declarations}] if function_declarations else [],
            "generationConfig": {"temperature": temperature},
        }

        url = f"{GEMINI_BASE_URL}/{self._gemini_model}:generateContent?key={self._gemini_key}"
        start_time = time.monotonic()

        async with session.post(url, json=body, headers={"Content-Type": "application/json"}) as resp:
            if resp.status != 200:
                err = await resp.text()
                raise Exception(f"Gemini tools error {resp.status}: {err[:200]}")

            data = await resp.json()
            duration_ms = (time.monotonic() - start_time) * 1000

            usage = data.get("usageMetadata", {})
            if usage.get("promptTokenCount"):
                self.usage.add_usage(
                    input_tokens=usage.get("promptTokenCount", 0),
                    output_tokens=usage.get("candidatesTokenCount", 0),
                    model=self._gemini_model,
                    duration_ms=duration_ms,
                )

            # Конвертируем Gemini ответ → OpenAI-совместимый формат
            candidate = data.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])

            return _GeminiToolMessage(parts)

    def _get_fallback(self, language: str = "ru") -> str:
        """Получение fallback-ответа на нужном языке."""
        template = FALLBACK_RESPONSES.get(language, FALLBACK_RESPONSES["ru"])
        return template.format(phone=settings.company_phone)

    async def generate_image(self, prompt: str, size: str = "1024x1024") -> Optional[str]:
        """
        Генерация изображения через OpenAI (gpt-image-2, запасная — gpt-image-1).

        Gemini не поддерживает генерацию изображений, поэтому используем OpenAI.
        """
        import base64
        from openai import RateLimitError, APITimeoutError

        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — генерация картинок невозможна")
            return None

        self._last_image_url = None
        from shared.brand import brand_image_prompt, overlay_logo
        prompt = brand_image_prompt(prompt)
        out_path = f"img_{id(prompt) % 100000:05d}.jpg"
        models = ["gpt-image-2", "gpt-image-1"]

        for model in models:
            try:
                logger.info(f"Генерация картинки ({model}): {prompt[:50]}...")
                use_size = size
                if model == "gpt-image-1" and size not in ("1024x1024", "1024x1536", "1536x1024"):
                    try:
                        w, h = (int(x) for x in size.lower().split("x")[:2])
                    except Exception:
                        w, h = 1024, 1024
                    use_size = "1024x1536" if h > w else ("1536x1024" if w > h else "1024x1024")

                kwargs = {"model": model, "prompt": prompt, "size": use_size, "n": 1}
                if model == "gpt-image-2":
                    kwargs["quality"] = "auto"
                response = await client.images.generate(**kwargs)

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
                    session = self._get_session()
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
                        if r.status == 200:
                            with open(out_path, "wb") as f:
                                f.write(await r.read())
                            self._last_image_url = url
                            overlay_logo(out_path)
                            return out_path

            except (RateLimitError, APITimeoutError) as e:
                logger.warning(f"{model}: лимит/таймаут — {e}")
                break
            except Exception as e:
                logger.warning(f"{model} failed: {e}. Пробуем следующую модель...")
                continue

        logger.error("Ошибка генерации изображения: все модели не удались")
        return None

    async def generate_speech(self, text: str, voice: str = "alloy") -> Optional[str]:
        """Генерация аудио (TTS) через OpenAI API."""
        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — TTS невозможен")
            return None
        try:
            logger.info(f"Генерация аудио: {text[:50]}...")
            response = await client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text,
                response_format="opus"
            )
            file_path = "voice.ogg"
            response.stream_to_file(file_path)
            return file_path
        except Exception as e:
            logger.error(f"Ошибка TTS: {e}", exc_info=True)
            return None

    async def transcribe_audio(self, file_path: str) -> Optional[str]:
        """Распознавание речи (STT) через OpenAI Whisper."""
        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — STT невозможен")
            return None
        try:
            logger.info(f"Распознавание аудио: {file_path}")
            with open(file_path, "rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                )
            return response.text
        except Exception as e:
            logger.error(f"Ошибка STT (Whisper): {e}", exc_info=True)
            return None

    def get_stats_summary(self) -> str:
        """Сводка статистики использования AI."""
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
        """Закрытие HTTP-клиентов."""
        if self._session and not self._session.closed:
            await self._session.close()
        if self._openai_client:
            await self._openai_client.close()
        logger.info("AI-движок: клиенты закрыты")


class _GeminiToolMessage:
    """Обёртка Gemini tool call ответа в OpenAI-совместимый формат.

    Gemini возвращает functionCall в parts[], OpenAI — tool_calls[].
    Этот класс позволяет бот-коду работать единообразно.
    """

    def __init__(self, parts: list):
        self._parts = parts
        self.content = None
        self.tool_calls = []

        for part in parts:
            if "text" in part:
                self.content = part["text"]
            elif "functionCall" in part:
                fc = part["functionCall"]
                self.tool_calls.append(_GeminiToolCall(fc))

    @property
    def role(self):
        return "assistant"


class _GeminiToolCall:
    """Единичный tool call в формате, совместимом с OpenAI."""

    def __init__(self, fc: dict):
        self.id = f"gemini_{fc.get('name', 'unknown')}"
        self.type = "function"
        self.function = _GeminiFunctionRef(fc)


class _GeminiFunctionRef:
    """Ссылка на функцию с аргументами."""

    def __init__(self, fc: dict):
        self.name = fc.get("name", "")
        import json
        self.arguments = json.dumps(fc.get("args", {}))

"""
mg_ai.engine — чистый AI-транспорт (OpenAI primary + Gemini fallback).
=====================================================================

Без зависимости на shared.config, shared.brand, shared.ai_usage.
API-ключи и модели передаются явно через конструктор.

Синтаксис — Python 3.11+ (базовый образ apps/bot).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable

import aiohttp

logger = logging.getLogger(__name__)

# ── Стоимость токенов по моделям (USD за 1M токенов) ─────────────────────
TOKEN_COSTS: Dict[str, Dict[str, float]] = {
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-5.5": {"input": 1.25, "output": 5.00},
    "o4-mini": {"input": 1.10, "output": 4.40},
    # Эмбеддинги: выхода у них нет, стоимость только за вход.
    "text-embedding-3-small": {"input": 0.02, "output": 0.0},
    "text-embedding-3-large": {"input": 0.13, "output": 0.0},
}


def _is_reasoning_model(model: str) -> bool:
    """Проверяет, относится ли модель к семейству рассуждающих (o1, o3, o4, gpt-5)."""
    m = model.lower()
    return m.startswith(("gpt-5", "o1", "o3", "o4"))


# ── Gemini REST API URL ──────────────────────────────────────────────────
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


@dataclass
class UsageStats:
    """Статистика использования AI за сессию."""

    bot_name: str = "unknown"
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_requests: int = 0
    total_errors: int = 0
    total_cost_usd: float = 0.0
    requests_log: List[Dict[str, Any]] = field(default_factory=list)
    # Опциональный колбэк для персистентного учёта (подставляется обёрткой).
    persist_fn: Optional[Callable[..., None]] = field(default=None, repr=False)

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

        if model not in TOKEN_COSTS:
            logger.warning(
                "Модель %s отсутствует в TOKEN_COSTS — расчёт по дефолтной ставке", model
            )
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

        if self.persist_fn is not None:
            try:
                self.persist_fn(self.bot_name, model, input_tokens, output_tokens, cost)
            except Exception:  # noqa: BLE001
                pass


class AIEngine:
    """
    Асинхронный AI-движок: OpenAI (primary) + Gemini (fallback).

    Чистый транспорт: ключи передаются явно, никаких from shared.*.

    Использование:
        ai = AIEngine(openai_key="sk-...", gemini_key="AI...")
        response = await ai.chat_completion(
            system_prompt="Ты менеджер...",
            user_message="Что у вас есть?",
        )
    """

    def __init__(
        self,
        openai_key: Optional[str] = None,
        gemini_key: Optional[str] = None,
        openai_model: Optional[str] = None,
        gemini_model: Optional[str] = None,
        default_system_prompt: str = "",
        bot_name: Optional[str] = None,
        fallback_responses: Optional[Dict[str, str]] = None,
        persist_fn: Optional[Callable[..., None]] = None,
    ):
        # Gemini — fallback
        self._gemini_key = gemini_key or ""
        self._gemini_model = gemini_model or "gemini-2.5-flash"

        # OpenAI — primary
        self._openai_key = openai_key or ""
        self._openai_model = openai_model or "gpt-4o-mini"
        self._openai_client: Any = None

        self._default_system_prompt = default_system_prompt
        self._session: Optional[aiohttp.ClientSession] = None
        self._fallback_responses = fallback_responses or {}

        # Статистика. persist_fn — крючок для записи расхода в базу: сам
        # пакет о базе не знает и знать не должен, поэтому запись подставляет
        # приложение. Без него офис перестал бы видеть, во что обходится ИИ.
        self.usage = UsageStats(
            bot_name=bot_name or os.getenv("BOT_NAME", "unknown"),
            persist_fn=persist_fn,
        )

        provider = "OpenAI" if self._openai_key else ("Gemini" if self._gemini_key else "none")
        model = self._openai_model if self._openai_key else self._gemini_model
        logger.info("AI-движок инициализирован: %s, модель=%s", provider, model)

    def _get_session(self) -> aiohttp.ClientSession:
        """Lazy-инициализация HTTP-сессии."""
        if not self._session or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=120)
            )
        return self._session

    def _get_openai_client(self) -> Any:
        """Lazy-инициализация OpenAI клиента."""
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

        contents: List[Dict[str, Any]] = []
        if conversation_history:
            for msg in conversation_history:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        parts: List[Dict[str, Any]] = []
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

                        text = (
                            data.get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [{}])[0]
                            .get("text", "")
                        )

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
                        return text.strip()

                    if resp.status == 429 and attempt < 2:
                        logger.warning("Gemini 429, попытка %d/3", attempt + 1)
                        await asyncio.sleep((attempt + 1) * 2.5)
                        continue

                    err = await resp.text()
                    logger.error("Gemini %s: %s", resp.status, err[:200])
                    raise Exception(f"Gemini API error: {resp.status}")

            except aiohttp.ClientError as e:
                logger.warning("Gemini network error (attempt %d): %s", attempt + 1, e)
                if attempt < 2:
                    await asyncio.sleep(1)
                    continue
                raise

        raise Exception("Gemini: max retries exceeded")

    # ─── OpenAI ──────────────────────────────────────────────────────

    async def _openai_chat(
        self,
        system_prompt: str,
        user_message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        image_base64: Optional[str] = None,
        effort: str = "low",
    ) -> str:
        """Вызов OpenAI SDK с поддержкой рассуждающих моделей."""
        client = self._get_openai_client()
        if not client:
            raise Exception("OpenAI API key not configured")

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ]
        if conversation_history:
            messages.extend(conversation_history)

        if user_message or image_base64:
            if not image_base64:
                messages.append({"role": "user", "content": user_message})
            else:
                content: List[Dict[str, Any]] = []
                if user_message:
                    content.append({"type": "text", "text": user_message})
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                })
                messages.append({"role": "user", "content": content})

        is_reasoning = _is_reasoning_model(self._openai_model)

        kwargs: Dict[str, Any] = {
            "model": self._openai_model,
            "messages": messages,
        }

        if is_reasoning:
            kwargs["max_completion_tokens"] = max_tokens
            kwargs["reasoning_effort"] = effort
        else:
            kwargs["max_tokens"] = max_tokens
            kwargs["temperature"] = temperature
            kwargs["top_p"] = 0.95

        start_time = time.monotonic()
        response = await client.chat.completions.create(**kwargs)
        duration_ms = (time.monotonic() - start_time) * 1000

        choice = response.choices[0]
        reply = (choice.message.content or "").strip()
        finish_reason = getattr(choice, "finish_reason", None)

        if not reply and finish_reason == "length" and is_reasoning:
            logger.warning(
                "OpenAI %s остановился по finish_reason='length'. Повтор с +2000 токенов.",
                self._openai_model,
            )
            kwargs["max_completion_tokens"] = max_tokens + 2000
            start_time = time.monotonic()
            response = await client.chat.completions.create(**kwargs)
            duration_ms += (time.monotonic() - start_time) * 1000
            choice = response.choices[0]
            reply = (choice.message.content or "").strip()

        usage = response.usage
        if usage:
            self.usage.add_usage(
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                model=self._openai_model,
                duration_ms=duration_ms,
            )

        return reply

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
        effort: str = "low",
    ) -> str:
        """Генерация ответа: OpenAI (primary) + Gemini (fallback)."""
        prompt = system_prompt or self._default_system_prompt

        openai_max_tokens = max_tokens
        if _is_reasoning_model(self._openai_model):
            openai_max_tokens = max(max_tokens + 1500, 2000)

        res = ""

        # 1. OpenAI (primary)
        if self._openai_key:
            try:
                res = await self._openai_chat(
                    system_prompt=prompt,
                    user_message=user_message,
                    conversation_history=conversation_history,
                    temperature=temperature,
                    max_tokens=openai_max_tokens,
                    image_base64=image_base64,
                    effort=effort,
                )
            except Exception as e:
                self.usage.total_errors += 1
                logger.error("OpenAI сбой: %s", e)

        # 2. Gemini (fallback)
        if not res and self._gemini_key:
            try:
                res = await self._gemini_chat(
                    system_prompt=prompt,
                    user_message=user_message,
                    conversation_history=conversation_history,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    image_base64=image_base64,
                )
            except Exception as e:
                self.usage.total_errors += 1
                logger.warning("Gemini fallback сбой: %s", e)

        if not res or not res.strip():
            logger.warning("AI-движок вернул пустой ответ: отдаём fallback")
            self.usage.total_errors += 1
            return self._get_fallback(language)

        return res.strip()

    async def chat_with_tools(
        self,
        system_prompt: str,
        user_message: str,
        tools: List[Dict[str, Any]],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
    ) -> Any:
        """Chat с function calling: OpenAI (primary) + Gemini (fallback)."""
        # 1. OpenAI (primary)
        client = self._get_openai_client()
        if client:
            try:
                messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
                if conversation_history:
                    messages.extend(conversation_history)
                if user_message:
                    messages.append({"role": "user", "content": user_message})

                kwargs: Dict[str, Any] = {
                    "model": self._openai_model,
                    "messages": messages,
                    "tools": tools,
                    "tool_choice": "auto",
                }
                if not _is_reasoning_model(self._openai_model):
                    kwargs["temperature"] = temperature

                start_time = time.monotonic()
                response = await client.chat.completions.create(**kwargs)
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
            except Exception as e:
                logger.warning("OpenAI tools сбой, пробуем Gemini: %s", e)

        # 2. Gemini fallback
        if self._gemini_key:
            return await self._gemini_tools_call(
                system_prompt, user_message, tools,
                conversation_history, temperature,
            )

        raise Exception("Ни OpenAI, ни Gemini не настроены")

    async def _gemini_tools_call(
        self,
        system_prompt: str,
        user_message: str,
        tools: List[Dict[str, Any]],
        conversation_history: Optional[List[Dict[str, str]]] = None,
        temperature: float = 0.7,
    ) -> "_GeminiToolMessage":
        """Gemini function calling через REST API."""
        session = self._get_session()

        function_declarations = []
        for tool in tools:
            if tool.get("type") == "function":
                fn = tool["function"]
                decl: Dict[str, Any] = {
                    "name": fn["name"],
                    "description": fn.get("description", ""),
                }
                if "parameters" in fn:
                    decl["parameters"] = fn["parameters"]
                function_declarations.append(decl)

        contents: List[Dict[str, Any]] = []
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

            candidate = data.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])

            return _GeminiToolMessage(parts)

    def _get_fallback(self, language: str = "ru") -> str:
        """Получение fallback-ответа на нужном языке."""
        if self._fallback_responses:
            return self._fallback_responses.get(language, next(iter(self._fallback_responses.values())))
        return "Извините, я сейчас не могу ответить. Попробуйте позже."

    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",
        out_path: Optional[str] = None,
        post_process: Optional[Callable[[str], None]] = None,
    ) -> Optional[str]:
        """Генерация изображения через OpenAI (gpt-image-2, запасная — gpt-image-1).

        Args:
            prompt: текстовый промпт для генерации
            size: размер изображения
            out_path: путь для сохранения (по умолчанию авто)
            post_process: опциональная функция постобработки (overlay_logo и пр.)
        """
        import base64
        from openai import RateLimitError, APITimeoutError

        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — генерация картинок невозможна")
            return None

        if out_path is None:
            out_path = f"img_{id(prompt) % 100000:05d}.jpg"

        models = ["gpt-image-2", "gpt-image-1"]

        for model in models:
            try:
                logger.info("Генерация картинки (%s): %s...", model, prompt[:50])
                use_size = size
                if model == "gpt-image-1" and size not in ("1024x1024", "1024x1536", "1536x1024"):
                    try:
                        w, h = (int(x) for x in size.lower().split("x")[:2])
                    except Exception:
                        w, h = 1024, 1024
                    use_size = "1024x1536" if h > w else ("1536x1024" if w > h else "1024x1024")

                gen_kwargs: Dict[str, Any] = {"model": model, "prompt": prompt, "size": use_size, "n": 1}
                if model == "gpt-image-2":
                    gen_kwargs["quality"] = "auto"
                response = await client.images.generate(**gen_kwargs)

                data = response.data[0] if response and response.data else None
                b64 = getattr(data, "b64_json", None) if data else None
                url = getattr(data, "url", None) if data else None

                if b64:
                    with open(out_path, "wb") as f:
                        f.write(base64.b64decode(b64))
                    if post_process:
                        post_process(out_path)
                    return out_path

                if url:
                    session = self._get_session()
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
                        if r.status == 200:
                            with open(out_path, "wb") as f:
                                f.write(await r.read())
                            if post_process:
                                post_process(out_path)
                            return out_path

            except (RateLimitError, APITimeoutError) as e:
                logger.warning("%s: лимит/таймаут — %s", model, e)
                break
            except Exception as e:
                logger.warning("%s failed: %s. Пробуем следующую модель...", model, e)
                continue

        logger.error("Ошибка генерации изображения: все модели не удались")
        return None

    async def generate_speech(self, text: str, voice: str = "alloy") -> Optional[str]:
        """Генерация аудио (TTS) через OpenAI API (tts-1)."""
        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — TTS невозможен")
            return None
        try:
            import tempfile
            logger.info("Генерация аудио: %s...", text[:50])
            response = await client.audio.speech.create(
                model="tts-1",
                voice=voice,
                input=text,
                response_format="opus",
            )
            fd, file_path = tempfile.mkstemp(prefix="tts_", suffix=".ogg")
            os.close(fd)
            response.stream_to_file(file_path)
            return file_path
        except Exception as e:
            logger.error("Ошибка TTS: %s", e, exc_info=True)
            return None

    async def transcribe_audio(self, file_path: str) -> Optional[str]:
        """Распознавание речи (STT) через OpenAI Whisper."""
        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — STT невозможен")
            return None
        try:
            logger.info("Распознавание аудио: %s", file_path)
            with open(file_path, "rb") as audio_file:
                response = await client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                )
            return response.text
        except Exception as e:
            logger.error("Ошибка STT (Whisper): %s", e, exc_info=True)
            return None

    async def embed(
        self,
        text: str,
        model: str = "text-embedding-3-small",
    ) -> Optional[List[float]]:
        """Вектор эмбеддинга для строки. None — ключа нет или запрос не удался.

        Живёт здесь, а не у потребителя: до аудита 31.07.2026 базу знаний
        support-бота и сборщик knowledge_base обслуживали два собственных
        экземпляра AsyncOpenAI. Прямые AI-клиенты в Python запрещены
        конституцией ровно поэтому — расход мимо учёта и ключ в третьем месте.

        Fallback на Gemini здесь намеренно НЕТ: у него другая размерность
        вектора, а колонка knowledge_base.embedding уже создана под 1536.
        Молча подменить провайдера — значит сломать поиск, а не спасти его.
        """
        client = self._get_openai_client()
        if not client:
            logger.error("OpenAI API key не настроен — эмбеддинги недоступны")
            return None
        started = time.monotonic()
        try:
            response = await client.embeddings.create(input=text, model=model)
            usage = getattr(response, "usage", None)
            self.usage.add_usage(
                input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                output_tokens=0,
                model=model,
                duration_ms=(time.monotonic() - started) * 1000,
            )
            return list(response.data[0].embedding)
        except Exception as e:
            logger.error("Ошибка эмбеддинга: %s", e, exc_info=True)
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


# ── Gemini → OpenAI compatibility wrappers ───────────────────────────────


class _GeminiToolMessage:
    """Обёртка Gemini tool call ответа в OpenAI-совместимый формат."""

    def __init__(self, parts: list) -> None:
        self._parts = parts
        self.content: Optional[str] = None
        self.tool_calls: List[_GeminiToolCall] = []

        for part in parts:
            if "text" in part:
                self.content = part["text"]
            elif "functionCall" in part:
                fc = part["functionCall"]
                self.tool_calls.append(_GeminiToolCall(fc))

    @property
    def role(self) -> str:
        return "assistant"


class _GeminiToolCall:
    """Единичный tool call в формате, совместимом с OpenAI."""

    def __init__(self, fc: dict) -> None:
        self.id = f"gemini_{fc.get('name', 'unknown')}"
        self.type = "function"
        self.function = _GeminiFunctionRef(fc)


class _GeminiFunctionRef:
    """Ссылка на функцию с аргументами."""

    def __init__(self, fc: dict) -> None:
        self.name = fc.get("name", "")
        self.arguments = json.dumps(fc.get("args", {}))

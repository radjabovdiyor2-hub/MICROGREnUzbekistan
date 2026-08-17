"""
mg_ai.engine — чистый AI-транспорт. Поставщик один: OpenAI.
============================================================

Без зависимости на shared.config, shared.brand, shared.ai_usage.
API-ключи и модели передаются явно через конструктор.

ПОЧЕМУ ЗАПАСНОГО ПОСТАВЩИКА БОЛЬШЕ НЕТ

Здесь была схема «OpenAI primary + Gemini fallback», и она молчала. Пустой или
протухший `OPENAI_API_KEY` не выключал ИИ, а переводил весь ИИ-офис на
`gemini-2.5-flash` одной строкой `logger.warning`. Ветка Gemini для function
calling слабее: нет `tool_choice`, история разворачивается в плоский текст,
результаты инструментов приходят обычными `user`-сообщениями. Месяцы работы на
запасной модели выглядели как «бот тупой», и найти причину было негде.

Тихая подмена хуже отказа: отказ видно сразу, подмену — никогда. Поэтому
поставщик один, а сбой громкий (`on_failure` → сигнал владельцу).

Синтаксис — Python 3.11+ (базовый образ apps/bot).
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable

import aiohttp

logger = logging.getLogger(__name__)

# ── Стоимость токенов по моделям (USD за 1M токенов) ─────────────────────
#
# Записи Gemini убраны вместе с самим поставщиком: цена модели, которую больше
# нельзя вызвать, — это приглашение вернуть подмену обратно.
#
# ⚠️ Модель, которой нет в этом словаре, считается по ставке «наугад»
# (1.0/3.0) — расход в админке будет неверным. Меняете модель — правьте и здесь.
TOKEN_COSTS: Dict[str, Dict[str, float]] = {
    # Общедоступные по обычному ключу (август 2026).
    "gpt-5.5": {"input": 5.00, "output": 30.00},
    "gpt-5.4": {"input": 2.50, "output": 15.00},
    "gpt-5.4-mini": {"input": 0.75, "output": 4.50},
    "gpt-5": {"input": 1.25, "output": 10.00},
    "gpt-5-mini": {"input": 0.25, "output": 2.00},
    "gpt-5-nano": {"input": 0.05, "output": 0.40},
    # Закрытое превью (нужен доступ от OpenAI) — цены на случай, если дадут.
    "gpt-5.6-sol": {"input": 5.00, "output": 30.00},
    "gpt-5.6-terra": {"input": 2.00, "output": 12.00},
    "gpt-5.6-luna": {"input": 0.20, "output": 1.20},
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "o4-mini": {"input": 1.10, "output": 4.40},
    # Эмбеддинги: выхода у них нет, стоимость только за вход.
    "text-embedding-3-small": {"input": 0.02, "output": 0.0},
    "text-embedding-3-large": {"input": 0.13, "output": 0.0},
}


def _is_reasoning_model(model: str) -> bool:
    """Рассуждающая модель? От этого зависят ДВА обязательных параметра.

    Рассуждающие модели (gpt-5.x, o1/o3/o4) принимают `max_completion_tokens`
    и НЕ принимают `max_tokens`, а качеством ответа управляет
    `reasoning_effort`. Ошибка в этой проверке не «чуть портит ответ», а роняет
    вызов целиком: старый префикс `gpt-5` был отсюда убран, и любая модель
    семейства 5.x получала `max_tokens` — то есть 400 от OpenAI на каждый
    запрос. Раньше такой отказ уводил офис на Gemini молча; теперь он просто
    отказ, поэтому проверка обязана быть верной.
    """
    m = model.lower()
    return m.startswith(("gpt-5", "o1", "o3", "o4"))


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
    Асинхронный AI-движок. Поставщик один — OpenAI.

    Чистый транспорт: ключи передаются явно, никаких from shared.*.

    Использование:
        ai = AIEngine(openai_key="sk-...")
        response = await ai.chat_completion(
            system_prompt="Ты менеджер...",
            user_message="Что у вас есть?",
        )
    """

    def __init__(
        self,
        openai_key: Optional[str] = None,
        openai_model: Optional[str] = None,
        default_system_prompt: str = "",
        bot_name: Optional[str] = None,
        fallback_responses: Optional[Dict[str, str]] = None,
        persist_fn: Optional[Callable[..., None]] = None,
        on_failure: Optional[Callable[..., None]] = None,
    ):
        self._openai_key = openai_key or ""
        # Резервное имя на случай, когда модель не передали вовсе. Совпадает с
        # дефолтом приложений (apps/tgas/shared/config.py, apps/bot,
        # apps/web/src/lib/ai/models.ts): четыре разных «модели по умолчанию» в
        # одном проекте уже приводили к падению каждого вызова.
        self._openai_model = openai_model or "gpt-5.5"
        self._openai_client: Any = None

        self._default_system_prompt = default_system_prompt
        self._session: Optional[aiohttp.ClientSession] = None
        self._fallback_responses = fallback_responses or {}
        # Отказ движка — событие, а не деталь реализации: приложение обязано
        # уметь о нём сказать владельцу. Сам пакет ни о владельце, ни о
        # Telegram не знает, поэтому сообщение подставляет приложение.
        self._on_failure = on_failure

        # Статистика. persist_fn — крючок для записи расхода в базу: сам
        # пакет о базе не знает и знать не должен, поэтому запись подставляет
        # приложение. Без него офис перестал бы видеть, во что обходится ИИ.
        self.usage = UsageStats(
            bot_name=bot_name or os.getenv("BOT_NAME", "unknown"),
            persist_fn=persist_fn,
        )

        if self._openai_key:
            logger.info(
                "AI-движок инициализирован: OpenAI, модель=%s", self._openai_model
            )
        else:
            # Не «предупреждение на всякий случай», а констатация: без ключа
            # ИИ не работает совсем. Раньше в этом месте молча включался
            # Gemini, и строка в логе выглядела как обычный старт.
            logger.error(
                "AI-движок БЕЗ КЛЮЧА OpenAI: ни один запрос не будет выполнен. "
                "Задайте OPENAI_API_KEY."
            )

    def _report_failure(self, where: str, error: Exception) -> None:
        """Сообщить приложению, что движок отказал.

        Раньше на этом месте включался Gemini — одной строкой `logger.warning`.
        Офис месяцами работал на запасной, самой лёгкой модели, а объяснением
        «бот тупой» служило что угодно, кроме настоящей причины. Молчащая
        подмена неотличима от работающего движка; отказ — виден.
        """
        if not self._on_failure:
            return
        try:
            self._on_failure(where, self._openai_model, f"{type(error).__name__}: {error}")
        except Exception:  # noqa: BLE001 — сообщение не должно ронять генерацию
            logger.debug("failure report skip", exc_info=True)

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
        effort: str = "medium",
    ) -> str:
        """Генерация ответа через OpenAI.

        Отказ движка НЕ подменяется другим поставщиком: возвращается честная
        заглушка («не могу ответить, позвоните») и уходит сигнал владельцу.
        Заглушка тут не «ответ похуже», а признание, что ответа нет, — в
        отличие от подмены модели, о которой никто не узнавал.

        `effort` по умолчанию `medium`, а не `low`: у флагманской модели это
        штатное значение, а `low` мы ставили когда-то ради экономии на слабой.
        Уровни: none, low, medium, high, xhigh, max. Вызовы, которым нужно
        думать больше, передают `effort="high"` сами.
        """
        prompt = system_prompt or self._default_system_prompt

        openai_max_tokens = max_tokens
        if _is_reasoning_model(self._openai_model):
            openai_max_tokens = max(max_tokens + 1500, 2000)

        res = ""
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
                self._report_failure("chat_completion", e)
        else:
            self.usage.total_errors += 1
            self._report_failure("chat_completion", Exception("OPENAI_API_KEY не задан"))

        if not res or not res.strip():
            logger.warning("AI-движок ответа не дал: отдаём честную заглушку")
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
        effort: str = "high",
        max_tokens: int = 2000,
    ) -> Any:
        """Chat с function calling через OpenAI.

        ⚠️ Отказ здесь ПОДНИМАЕТСЯ исключением, а не подменяется другим
        поставщиком. Раньше вызов уходил в Gemini, и это было худшее место для
        подмены: именно этот вызов решает, ЧТО сделать. Ветка Gemini не знает
        `tool_choice`, разворачивает историю в плоский текст и получает
        результаты инструментов обычными сообщениями — то есть выбирает
        действия заметно хуже, и никто об этом не узнавал.

        Вызывающие обязаны показать причину человеку: у Стёпана это
        `_ai_error_reason` («кончилась квота», «протух ключ»), у отделов —
        отчёт о невыполненной задаче.

        ⚠️ `effort` и запас токенов здесь так же обязательны, как в
        `_openai_chat`. Их не передавали вовсе, и рассуждающая модель выбирала
        инструменты на настройках по умолчанию — то есть самом коротком
        размышлении. Выбор инструмента и его аргументов — как раз то место, где
        думать надо: перепутанный инструмент даёт не «менее красивый ответ», а
        заказ не тому клиенту.

        `high` по умолчанию: этот вызов решает, ЧТО делать, и он один на
        сообщение. Экономить размышление именно здесь — значит экономить на
        выборе действия, а не на длине текста.
        """
        client = self._get_openai_client()
        if client is None:
            raise Exception(
                "OpenAI не настроен (OPENAI_API_KEY пуст) — выполнить нечем"
            )

        try:
            messages: List[Dict[str, Any]] = [
                {"role": "system", "content": system_prompt}
            ]
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
            if _is_reasoning_model(self._openai_model):
                kwargs["reasoning_effort"] = effort
                # Рассуждение тратит те же токены, что и ответ: без запаса
                # вызов обрывается на середине размышления и возвращает
                # пустоту — ни текста, ни инструмента.
                kwargs["max_completion_tokens"] = max(max_tokens + 1500, 2000)
            else:
                kwargs["temperature"] = temperature
                kwargs["max_tokens"] = max_tokens

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
            self.usage.total_errors += 1
            logger.error("OpenAI tools сбой: %s", e)
            self._report_failure("chat_with_tools", e)
            raise

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

        Запасного поставщика здесь никогда и не было — и это была правильная
        осторожность: у другой модели другая размерность вектора, а колонка
        `knowledge_base.embedding` создана под 1536. Молча подменить провайдера
        значит сломать поиск, а не спасти его. Теперь так же устроен и текст.
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


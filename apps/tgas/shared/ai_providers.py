"""
ai_providers — реестр бесплатных/резервных LLM-провайдеров и бесплатных генераторов картинок
для каскадного авто-переключения в shared/ai_engine.py.

Идея: Gemini, Groq, OpenRouter, Cerebras, GitHub Models — все OpenAI-совместимы (тот же
AsyncOpenAI-клиент, отличается base_url + ключ + модель). Поэтому текстовый каскад — это просто
перебор (провайдер, модель): не сработал один (квота/ошибка/пусто) → следующий. Бесплатные —
первыми, платный OpenAI — последним. Провайдеры без ключа тихо пропускаются.

Картинки: OpenAI gpt-image (платно) → Pollinations.ai (бесплатно, БЕЗ ключа) → Cloudflare
Workers AI → HuggingFace (последние два — если заданы ключи).
"""

from __future__ import annotations

import logging
import os
import random
import urllib.parse

import aiohttp
from openai import AsyncOpenAI

from shared.config import settings

logger = logging.getLogger(__name__)


# ── Текстовые провайдеры (OpenAI-совместимые), бесплатные — первыми ───────────
# base_url=None → штатный endpoint OpenAI. keys — атрибуты settings (может быть несколько,
# напр. два Gemini — пробуем оба). models — по убыванию предпочтения.
_TEXT_PROVIDERS = [
    {
        "name": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "keys": ["gemini_api_key", "gemini_api_key2"],
        "models": ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    },
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "keys": ["groq_api_key"],
        "models": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    },
    {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1",
        "keys": ["openrouter_api_key"],
        "models": [
            "meta-llama/llama-3.3-70b-instruct:free",
            "google/gemini-2.0-flash-exp:free",
            "deepseek/deepseek-chat-v3-0324:free",
            "qwen/qwen-2.5-72b-instruct:free",
        ],
    },
    {
        "name": "cerebras",
        "base_url": "https://api.cerebras.ai/v1",
        "keys": ["cerebras_api_key"],
        "models": ["llama-3.3-70b"],
    },
    {
        "name": "github",
        "base_url": "https://models.github.ai/inference",
        "keys": ["github_token"],
        "models": ["openai/gpt-4o-mini", "meta/Llama-3.3-70B-Instruct"],
    },
    {
        "name": "openai",   # платный — ПОСЛЕДНИЙ, вернётся сам при пополнении баланса
        "base_url": None,
        "keys": ["openai_api_key"],
        "models": ["gpt-4o-mini"],
    },
]

_client_cache: dict = {}


def _client(base_url: str | None, key: str) -> AsyncOpenAI:
    ck = (base_url or "openai", key[:10])
    c = _client_cache.get(ck)
    if c is None:
        kwargs = {"api_key": key, "timeout": 60.0, "max_retries": 0}  # каскад сам решает fallback
        if base_url:
            kwargs["base_url"] = base_url
        c = AsyncOpenAI(**kwargs)
        _client_cache[ck] = c
    return c


def iter_text_clients() -> list[tuple[str, AsyncOpenAI, str]]:
    """
    Строит каскад (label, client, model) из провайдеров, у которых есть ключ, в порядке
    приоритета (бесплатные первыми). Порядок можно переопределить env AI_TEXT_PROVIDER_ORDER
    (напр. 'gemini,groq,openrouter,openai'). Провайдеры без ключа пропускаются.
    """
    provs = list(_TEXT_PROVIDERS)
    order_raw = settings.ai_text_provider_order or os.getenv("AI_TEXT_PROVIDER_ORDER")
    if order_raw:
        order = [x.strip() for x in order_raw.split(",") if x.strip()]
        provs.sort(key=lambda p: order.index(p["name"]) if p["name"] in order else 999)

    out: list[tuple[str, AsyncOpenAI, str]] = []
    for p in provs:
        keys = [getattr(settings, ka, None) for ka in p["keys"]]
        keys = [k for k in keys if k]
        for i, key in enumerate(keys):
            client = _client(p["base_url"], key)
            label = p["name"] if len(keys) == 1 else f"{p['name']}#{i + 1}"
            for model in p["models"]:
                out.append((label, client, model))
    return out


# ── Бесплатные генераторы картинок ───────────────────────────────────────────

async def image_pollinations(prompt: str, width: int, height: int, out_path: str) -> str | None:
    """Pollinations.ai — бесплатно, БЕЗ ключа. Возвращает путь к jpg или None."""
    try:
        q = urllib.parse.quote(prompt[:1500])
        seed = random.randint(1, 10_000_000)
        url = (f"https://image.pollinations.ai/prompt/{q}"
               f"?width={width}&height={height}&nologo=true&model=flux&seed={seed}")
        async with aiohttp.ClientSession() as s:
            async with s.get(url, timeout=aiohttp.ClientTimeout(total=150)) as r:
                if r.status == 200:
                    data = await r.read()
                    if data and len(data) > 2000:
                        with open(out_path, "wb") as f:
                            f.write(data)
                        return out_path
                logger.warning("pollinations status=%s", r.status)
    except Exception as e:  # noqa: BLE001
        logger.warning("pollinations error: %s", e)
    return None


async def image_cloudflare(prompt: str, out_path: str) -> str | None:
    """Cloudflare Workers AI (flux-1-schnell) — если заданы cf_account_id + cf_api_token."""
    acc = getattr(settings, "cf_account_id", None)
    tok = getattr(settings, "cf_api_token", None)
    if not acc or not tok:
        return None
    try:
        import base64
        url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/@cf/black-forest-labs/flux-1-schnell"
        async with aiohttp.ClientSession() as s:
            async with s.post(url, headers={"Authorization": f"Bearer {tok}"},
                              json={"prompt": prompt[:2000]},
                              timeout=aiohttp.ClientTimeout(total=120)) as r:
                if r.status == 200:
                    data = await r.json()
                    b64 = (data.get("result") or {}).get("image")
                    if b64:
                        with open(out_path, "wb") as f:
                            f.write(base64.b64decode(b64))
                        return out_path
                logger.warning("cloudflare image status=%s", r.status)
    except Exception as e:  # noqa: BLE001
        logger.warning("cloudflare image error: %s", e)
    return None


async def image_hf(prompt: str, out_path: str) -> str | None:
    """HuggingFace Inference (SDXL) — если задан hf_api_key."""
    key = getattr(settings, "hf_api_key", None)
    if not key:
        return None
    try:
        url = "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0"
        async with aiohttp.ClientSession() as s:
            async with s.post(url, headers={"Authorization": f"Bearer {key}"},
                              json={"inputs": prompt[:2000]},
                              timeout=aiohttp.ClientTimeout(total=120)) as r:
                if r.status == 200:
                    data = await r.read()
                    if data and len(data) > 2000:
                        with open(out_path, "wb") as f:
                            f.write(data)
                        return out_path
                logger.warning("hf image status=%s", r.status)
    except Exception as e:  # noqa: BLE001
        logger.warning("hf image error: %s", e)
    return None

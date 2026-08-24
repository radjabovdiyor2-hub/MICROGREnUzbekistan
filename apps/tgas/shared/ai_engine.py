"""
Microgreen Uzbekistan — AI-движок офиса.
=========================================

Обёртка над пакетом `mg_ai`: сам транспорт (OpenAI: текст, зрение, TTS, STT)
живёт там и общий у офиса и витринного бота. Здесь остаётся только то, что
принадлежит офису: ключи из настроек, брендовый системный промпт, запасные
ответы, запись расхода токенов в базу и сигнал владельцу при отказе движка.

Поставщик один — OpenAI. Запасного нет намеренно: тихая подмена модели
неотличима от работающего движка (см. докстринг `mg_ai/engine.py`).

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
)
from shared.config import settings

logger = logging.getLogger(__name__)

# ── Системный промпт для контекста микрозелени ───────────────────────────
# Телефон и способы оплаты подставляются из настроек: заглушка
# «+998 91 123 45 67», вписанная здесь строкой, уходила клиенту в ответах
# (правило №8 прямо велит «предложи связаться с менеджером по телефону»).
#
# Порог бесплатной доставки — тоже из настроек. Числа в промпте живут своей
# жизнью: владелец меняет порог в админке, а бот продолжает обещать старый.
from shared.utils import format_price as _format_price  # noqa: E402

_FREE_DELIVERY_FROM = _format_price(float(settings.free_delivery_threshold))

# Юзернеймы ботов берутся из реестра. Вписанные сюда строкой, они разошлись с
# реальностью: половина имён была из другого семейства и вела в никуда.
from shared.bot_registry import team_usernames_text as _team_usernames  # noqa: E402

_TEAM_USERNAMES = _team_usernames()
MICROGREEN_SYSTEM_PROMPT = f"""Ты — профессиональный менеджер по продажам компании Microgreen Uzbekistan.

🏢 О КОМПАНИИ:
- Microgreen Uzbekistan — ведущий производитель микрозелени, салатов и съедобных цветов в Самарканде
- ЦЕЛЕВАЯ АУДИТОРИЯ: B2B (Шеф-повара, су-шефы, рестораны, кафе, отели) и B2C (спортзалы, фитнес, женщины, следящие за фигурой, ЗОЖ)
- Выращиваем микрозелень на гидропонике и аэропонике (промышленная сити-ферма)
- Доставка по Самарканду, бесплатно от {_FREE_DELIVERY_FROM}
- СТРОГИЙ ЗАПРЕТ: Мы продаем ГОТОВЫЙ премиальный продукт. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать советы для огородников (про замачивание семян, домашнее выращивание, грунт). НИКАКОГО домашнего фермерства! Не продаем семена и оборудование частным лицам для дома.

🌱 НАША ПРОДУКЦИЯ (ГОТОВАЯ К УПОТРЕБЛЕНИЮ) — четыре категории каталога:
- Микрозелень, за лоток: горох, подсолнечник, руккола, редис (Ред Корал, Санго), брокколи,
  амарант, базилик, кориандр, кресс-салат, горчица (зелёная и красная), пак-чой, татсой,
  мизуна (зелёная и красная), мангольд
- Бейби-лист, за 100 г: руккола, базилик, мята, шпинат, кейл, мангольд, татсой, мизуна, щавель
- Салаты, за килограмм: Aveleda, Айсберг, Романо, Лоло Росса, Радичио, Фризе
- BALANS, готовые миксы в упаковке 100 г и киты с заправкой: «Мягкий», «К плову»,
  «Крестоцветный», «Цветной», кит «Сначала зелень», кит «Сытный»

⚠️ ГОВОРИ ТОЛЬКО О ТОМ, ЧТО ЕСТЬ В КАТАЛОГЕ. Съедобные цветы, семена, оборудование и
наборы для домашнего выращивания сняты с продажи — не предлагай их. Точный состав
категорий бери инструментом каталога, а не из этого списка.

🥗 ЛИНЕЙКА BALANS — это метод подачи, а не медицинский продукт:
зелень съедают за 10–15 минут ДО основного блюда, заправку добавляют перед подачей.
ЗАПРЕЩЕНО говорить, что продукт снижает сахар, лечит, заменяет лекарства или
предназначен для больных. Заявления о лечебных свойствах требуют разрешения Минздрава,
которого у нас нет. Можно называть только состав, вес, калорийность и способ подачи.

⛔ ЦЕН ЗДЕСЬ НЕТ И НЕ БУДЕТ. Единственный источник цен — каталог: /catalog в боте,
инструмент get_price_list у сотрудников офиса. Раньше цены были вписаны в этот
промпт строкой, расходились с базой и уходили клиенту как настоящие.
Не знаешь цену — открой каталог или предложи уточнить у менеджера.
Никогда не называй сумму по памяти.

💳 ОПЛАТА: наличные, карта, банковский перевод (онлайн-оплаты нет — не предлагай её)
📞 Телефон: {settings.company_phone}
🌐 ССЫЛКА НА САЙТ: Всегда используй ТОЛЬКО официальную ссылку https://microgreenuzbekistan.com. Категорически запрещено выдумывать несуществующие страницы.

ПРАВИЛА ОБЩЕНИЯ:
1. Отвечай на языке клиента (русский или узбекский)
2. Будь дружелюбным, но профессиональным — как живой человек, не робот
3. Используй эмодзи умеренно, для дружелюбности
4. Если клиент B2B (шеф-повар) — делай акцент на стабильность поставок, food cost, визуальную подачу. Предлагай регулярную поставку по договору.
5. Если клиент B2C — делай акцент на состав, свежесть срезки и удобство готовой упаковки. Предлагай миксы BALANS и подписку.
6. НИКОГДА не предлагай выращивать зелень самостоятельно. Мы — поставщик готового решения.
7. Всегда отвечай в рамках тематики компании
8. Если не знаешь ответа — предложи связаться с менеджером по телефону
9. Используй живой разговорный стиль, как будто пишет настоящий продавец
10. Не используй громоздкие приветствия: общайся в "нашем стиле"

Команда Microgreen Uzbekistan состоит из следующих ботов (используйте их юзернеймы, если нужно позвать их в групповом чате для делегирования задач):
{_TEAM_USERNAMES}
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

        # Поставщик один, и в учёте он тоже один: колонка `provider` в
        # `ai_usage` осталась ради истории — по ней видно расход тех
        # месяцев, когда офис молча работал на Gemini.
        provider = "openai"
        loop.create_task(
            record_ai_usage(
                bot_name, provider, model, input_tokens, output_tokens, cost_usd
            )
        )
    except Exception as e:  # noqa: BLE001
        logger.debug("persist usage skip: %s", e)


def _notify_ai_failure(where: str, model: str, error: str) -> None:
    """Движок отказал — сказать владельцу один раз, а не только в лог.

    Ключ у `alert_once` один на причину: пока проблема та же, сигнал не
    повторяется чаще раза в сутки. Иначе при протухшем ключе OpenAI владелец
    получал бы сообщение на каждое своё слово.

    Сигнал обязателен именно потому, что запасного поставщика больше нет:
    отказ движка означает, что офис сейчас без ИИ, и узнать об этом надо
    сразу, а не по молчащим ботам.
    """
    try:
        import asyncio

        from shared import alert_once

        if not alert_once.should_send("ai_failure", f"{model}|{error[:120]}"):
            return
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # вне event loop — сигнал не отправить
    except Exception as exc:  # noqa: BLE001
        logger.debug("ai failure alert skip: %s", exc)
        return

    async def _raise() -> None:
        try:
            from shared.owner_alerts import SEVERITY_CRITICAL, raise_alert

            await raise_alert(
                kind="ai_failure",
                severity=SEVERITY_CRITICAL,
                title=f"ИИ не отвечает ({where})",
                message=(
                    f"OpenAI ({model}) отказал: {error}\n\n"
                    "Запасного движка нет намеренно — иначе офис молча работал "
                    "бы на слабой модели. Проверьте OPENAI_API_KEY, "
                    "OPENAI_MODEL и баланс аккаунта: "
                    "python scripts/check_ai.py"
                ),
                source="ai_engine",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Не смог сообщить об отказе движка: %s", exc)

    loop.create_task(_raise())


async def _ai_enabled() -> bool:
    """Включён ли ИИ. Любая заминка чтения — считаем, что включён.

    Осторожность именно в эту сторону: недоступная база не должна
    выключать офис целиком. Выключение — решение владельца, а не
    следствие сетевой ошибки.
    """
    try:
        from shared import settings_store

        return await settings_store.get_bool("ai.enabled", True)
    except Exception as e:  # noqa: BLE001 — причина не важна, важен ответ
        logger.debug("Не прочитан флаг ai.enabled (%s) — считаем включённым", e)
        return True


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
    ):
        super().__init__(
            openai_key=api_key or settings.openai_api_key,
            openai_model=model or settings.openai_model,
            default_system_prompt=default_system_prompt or MICROGREEN_SYSTEM_PROMPT,
            fallback_responses=FALLBACK_RESPONSES,
            # Без этого крючка офис перестал бы видеть, во что обходится ИИ:
            # раздел «Расходы на ИИ» в админке читает таблицу ai_usage.
            persist_fn=_persist_usage,
            # А без этого отказ движка остался бы строкой в логе — как и было
            # всё то время, пока офис молча отвечал запасной моделью.
            on_failure=_notify_ai_failure,
        )

    async def chat_completion(
        self,
        system_prompt: Optional[str] = None,
        user_message: str = "",
        conversation_history: Optional[list[dict[str, str]]] = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        language: str = "ru",
        image_base64: Optional[str] = None,
        effort: str = "low",
        use_memory: bool = False,
    ) -> str:
        """Переопределенный метод для внедрения Корпоративной Памяти (RAG)."""
        # ── Рубильник ИИ ──────────────────────────────────────────────
        #
        # Единственная точка, через которую офис ходит в модель: 53
        # вызова `AIEngine()` во всех ботах приходят сюда. Поэтому
        # проверка стоит здесь, а не в каждом боте, — иначе один
        # забытый вызов сводил бы выключатель на нет.
        #
        # ЗАЧЕМ ВООБЩЕ. Каждый выкат перезапускает двенадцать ботов, а
        # интервальные задачи стартуют через полминуты после запуска
        # (shared/scheduler.py, _IntervalJob.initial_delay). Пять
        # выкатов за день — пять кругов вызовов на ровном месте.
        #
        # ЧТЕНИЕ ДЕШЁВОЕ: settings_store держит кэш на минуту, поэтому
        # проверка не превращается в поход в Postgres на каждый ответ.
        # И она же означает, что выключение доезжает до ботов за минуту
        # БЕЗ перезапуска контейнеров — иначе выключатель сам стоил бы
        # того круга вызовов, который гасит.
        #
        # ОТКАЗ ВИДЕН, а не притворяется ответом: возвращаем ту же
        # честную заглушку, что и при отказе модели. Молчаливое пустое
        # значение читалось бы как «ИИ подумал и ничего не сказал».
        if not await _ai_enabled():
            logger.info("ИИ выключен владельцем — вызов не отправлен")
            return FALLBACK_RESPONSES.get(language, FALLBACK_RESPONSES["ru"]).format(
                phone=getattr(settings, "company_phone", "") or ""
            )

        prompt_to_use = system_prompt or ""
        if use_memory:
            try:
                from shared.corporate_memory import corporate_memory
                facts = await corporate_memory.recall(user_message, limit=3)
                if facts:
                    memory_context = "\\n\\n[КОРПОРАТИВНАЯ ПАМЯТЬ: Ниже приведены достоверные факты из базы знаний компании. Используй ТОЛЬКО ИХ, если они релевантны, не придумывай новых фактов.]\\n"
                    memory_context += "\\n".join(facts)
                    prompt_to_use += memory_context
            except Exception as e:
                logger.error(f"RAG Error in ai_engine: {e}")
        
        return await super().chat_completion(
            system_prompt=prompt_to_use,
            user_message=user_message,
            conversation_history=conversation_history,
            temperature=temperature,
            max_tokens=max_tokens,
            language=language,
            image_base64=image_base64,
            effort=effort
        )

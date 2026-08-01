import logging
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT
from shared.event_bus import event_bus

RND_SYSTEM_PROMPT = (
    TEAM_CONTEXT
    + """
Ты — аналитик R&D сити-фермы Microgreen Uzbekistan.
Занимаешься новыми культурами, субстратами и режимами: урожайность, сроки, себестоимость.
Предлагай гипотезы с оценкой риска и понятным способом проверки на одной партии.
Не выдумывай цифр: если данных нет — скажи, каких именно не хватает.
"""
)

logger = logging.getLogger(__name__)
ai = AIEngine()

async def generate_instagram_rnd_report() -> str:
    """R&D-анализ на основе РЕАЛЬНОЙ статистики Instagram + каталога."""
    from shared.instagram_analytics import get_instagram_stats
    stats = await get_instagram_stats(top_limit=5)

    products = []
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        async with get_session_ctx() as s:
            res = await s.execute(
                text("SELECT name_ru FROM products WHERE is_active=true LIMIT 15")
            )
            products = [r[0] for r in res.fetchall() if r[0]]
    except Exception as e:
        logger.warning(f"products fetch error: {e}")

    summary = stats.get("summary") or "нет данных"
    prompt = (
        f"РЕАЛЬНАЯ статистика Instagram за последнюю неделю:\n{summary}\n\n"
        f"Наш ассортимент: {', '.join(products) or 'микрозелень, съедобные цветы'}.\n\n"
        "Ты — аналитик R&D сити-фермы микрозелени. На основе вовлечённости постов:\n"
        "1) Выдели 3 тренда (что заходит аудитории — опирайся на лайки/комментарии/охваты).\n"
        "2) Дай 2-3 КОНКРЕТНЫЕ рекомендации, ЧТО ПОСАДИТЬ БОЛЬШЕ на этой неделе "
        "(сорта микрозелени / съедобные цветы) с обоснованием по цифрам.\n"
        "3) 1 идею контента на следующую неделю.\n"
        "Пиши кратко и по делу, на русском, с цифрами где есть."
    )
    try:
        report = await ai.chat_completion(
            system_prompt=RND_SYSTEM_PROMPT,
            user_message=prompt,
            effort="high",
        )
    except Exception as e:
        logger.error(f"AI error: {e}")
        from shared.health import record_bot_error
        await record_bot_error("rnd_bot", str(e))
        report = "Не удалось сгенерировать R&D-отчёт из-за ошибки ИИ."

    if not stats.get("configured"):
        report = (
            "⚠️ Instagram Graph API сейчас недоступен — рекомендации без свежих цифр.\n\n"
            + report
        )
    return report

async def weekly_instagram_rnd() -> None:
    """Еженедельно: R&D-рекомендации по трендам Instagram → руководителю (через Степана)."""
    try:
        report = await generate_instagram_rnd_report()
        text_msg = f"🧬 <b>R&D: тренды Instagram и что посадить</b>\n\n{report}"
        await event_bus.publish(
            "new_message",
            {"bot": "R&D — тренды Instagram", "text": text_msg},
            "rnd_bot",
        )
        logger.info("weekly_instagram_rnd: отчёт отправлен руководителю")
    except Exception as e:
        logger.error(f"weekly_instagram_rnd error: {e}", exc_info=True)
        from shared.health import record_bot_error
        await record_bot_error("rnd_bot", str(e))

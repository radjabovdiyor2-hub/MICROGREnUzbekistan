import logging
from shared.capabilities.core import Capability, Result
from shared.capabilities.actions import (
    cap_notify_customers,
    cap_push_stale_orders,
    cap_broadcast,
    cap_b2b_offer,
    cap_collect_leads,
    cap_publish_content,
    cap_build_report,
    cap_instagram_stats,
    cap_check_dm,
    cap_human_task,
)

logger = logging.getLogger(__name__)

CAPABILITIES = {
    c.key: c
    for c in [
        Capability(
            "notify_customers",
            "sales",
            "Написать клиентам",
            "Связаться с клиентами: Telegram → email → звонок человеку. "
            "Выбирай для «обзвонить», «связаться», «дожать», «уведомить», "
            "«вернуть», «напомнить». params: segment "
            "(all|b2b|b2c|vip|leads|stale_orders|inactive), message",
            outward=True,
            run=cap_notify_customers,
        ),
        Capability(
            "push_stale_orders",
            "sales",
            "Догнать необработанные заказы",
            "Написать клиентам с заказами, висящими больше суток. params: message",
            outward=True,
            run=cap_push_stale_orders,
        ),
        Capability(
            "broadcast",
            "marketing",
            "Рассылка по базе",
            "Массовое сообщение в Telegram: акция, новость, промокод. "
            "params: target (all|b2b|b2c|vip), message",
            outward=True,
            run=cap_broadcast,
        ),
        Capability(
            "b2b_offer",
            "marketing",
            "КП ресторанам",
            "Подготовить коммерческие предложения B2B-лидам (PDF на email, "
            "уходят после вашего одобрения). params: limit",
            outward=True,
            run=cap_b2b_offer,
        ),
        Capability(
            "collect_leads",
            "marketing",
            "Собрать лидов",
            "Найти новые рестораны (B2B-лиды) через 2ГИС/Google/Яндекс. params: limit",
            outward=False,
            run=cap_collect_leads,
        ),
        Capability(
            "publish_content",
            "content",
            "Опубликовать в Instagram",
            "Сделать и выложить пост/сторис. params: topic",
            outward=True,
            run=cap_publish_content,
        ),
        Capability(
            "build_report",
            "analytics",
            "Отчёт из базы",
            "Собрать аналитический отчёт по данным. params: kind",
            outward=False,
            run=cap_build_report,
        ),
        Capability(
            "instagram_stats",
            "analytics",
            "Статистика Instagram",
            "Реальные охваты и вовлечённость. Для «проанализировать соцсети».",
            outward=False,
            run=cap_instagram_stats,
        ),
        Capability(
            "check_dm",
            "support",
            "Разобрать Direct",
            "Проверить и обработать входящие Instagram Direct.",
            outward=False,
            run=cap_check_dm,
        ),
        Capability(
            "human_task",
            "pm",
            "Передать человеку",
            "ЕСЛИ действие боту недоступно (встреча, переговоры, производство, "
            "закупка, найм) — выбирай это. Не выдумывай выполнение. "
            "params: action, dept",
            outward=False,
            run=cap_human_task,
        ),
    ]
}


def catalog_for_ai() -> str:
    return "\n".join(
        f"- {c.key} ({c.dept}): {c.description}" for c in CAPABILITIES.values()
    )


def is_outward(key: str) -> bool:
    cap = CAPABILITIES.get(key)
    return bool(cap and cap.outward)


async def run_capability(key: str, params: dict) -> Result:
    cap = CAPABILITIES.get(key)
    if not cap:
        logger.info(f"неизвестная возможность '{key}' → отдаём человеку")
        return await cap_human_task(params)
    try:
        return await cap.run(params or {})
    except Exception as e:
        logger.error(f"возможность {key} упала: {e}", exc_info=True)
        return Result(False, f"Не удалось выполнить: {e}")

"""
Shared Cross-Bot Notifications — Уведомления между ботами.

Содержит функции-обработчики событий, которые вызываются EventBus.
Каждый бот регистрирует нужные обработчики при старте.
"""

import logging
from aiogram import Bot
from sqlalchemy import text
from shared import tasks_repo
from shared.config import settings
from shared.database import get_session_ctx
from shared.utils import format_price

logger = logging.getLogger(__name__)


def _admin_chat_id():
    """Чат для реакции отдела на TASK_CREATED: без chat_id консьюмеры
    (stepan/support/hr handle_task_created) молча игнорируют событие."""
    return settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None


# ─── Кнопка под сообщением ──────────────────────────────────
#
# ПОЧЕМУ ЭТО ЗДЕСЬ, А НЕ У КАЖДОГО ВЫЗЫВАЮЩЕГО
#
# Через эти две функции проходят почти все доклады офиса владельцу, и ни
# одна из них не умела нести клавиатуру: в сигнатуре не было `reply_markup`
# вовсе. Поэтому «бот не запущен», «жалоба», «крупный расход» приходили
# плоским текстом — человеку сообщали о проблеме и не давали ничего, чем
# на неё ответить. Открыть нужный экран значило уйти на сайт, вспомнить
# пароль и найти вкладку глазами среди полусотни.
#
# Вкладка задаётся строкой (`admin_tab="bot_health"`), а не готовой
# клавиатурой, намеренно: рассылка идёт нескольким получателям, и кнопка
# для каждого собирается своя. Mini App законен только в личной переписке,
# и клавиатура, собранная для владельца, в группе отклонит всё сообщение.


def _markup_for(admin_id: int, admin_tab: str | None, focus: str | None, button_text: str):
    """Клавиатура для конкретного получателя. `None` — вкладку не назвали."""
    if not admin_tab:
        return None
    try:
        from shared import admin_links

        return admin_links.tab_markup(admin_tab, admin_id, text=button_text, focus=focus)
    except Exception as exc:
        # Кнопка — украшение доклада, а не сам доклад: не построилась —
        # отправляем текст. Молчать об этом всё же нельзя.
        logger.warning("Кнопка в админку не собралась (%s): %s", admin_tab, exc)
        return None


async def notify_admin(
    bot: Bot,
    admin_ids: list,
    text_msg: str,
    admin_tab: str | None = None,
    focus: str | None = None,
    button_text: str = "🏢 Открыть в админке",
):
    """Отправить уведомление всем админам."""
    for admin_id in admin_ids:
        try:
            await bot.send_message(
                admin_id,
                text_msg,
                reply_markup=_markup_for(admin_id, admin_tab, focus, button_text),
            )
        except Exception as e:
            logger.error(f"Не удалось отправить уведомление админу {admin_id}: {e}")


async def send_report(
    bot: Bot,
    chat_id: int,
    text_msg: str,
    admin_tab: str | None = None,
    focus: str | None = None,
    button_text: str = "🏢 Открыть в админке",
    parse_mode: str | None = "HTML",
) -> bool:
    """Доклад в один чат — с кнопкой на экран, где с ним разберутся.

    ЗАЧЕМ ОТДЕЛЬНАЯ ДВЕРЬ

    Расписаний в офисе шестьдесят пять, и каждое звало `bot.send_message`
    напрямую. Из-за этого доклады разошлись во всём: у одних есть разметка,
    у других нет, превью страницы то включено, то выключено, а кнопки не
    было ни у одного. Хуже того, часть докладов прямо требует действия —
    «решите сами или удалите», «требуется внимание», «убедитесь, что на
    счету достаточно», — и не даёт ничего, чем ответить.

    Возвращает True, если доставлено: у доклада по расписанию нет второго
    шанса, и потерю надо хотя бы записать.
    """
    try:
        await bot.send_message(
            chat_id,
            text_msg,
            parse_mode=parse_mode,
            reply_markup=_markup_for(chat_id, admin_tab, focus, button_text),
            # Доклады часто длинные и со ссылками: карточка сайта под
            # каждым из них съедала бы пол-экрана телефона.
            disable_web_page_preview=True,
        )
        return True
    except Exception as exc:
        logger.error("Доклад не доставлен в чат %s: %s", chat_id, exc)
        return False


async def alert_admins(
    bot: Bot,
    text_msg: str,
    parse_mode: str | None = "HTML",
    admin_tab: str | None = None,
    focus: str | None = None,
    button_text: str = "🏢 Открыть в админке",
) -> int:
    """
    Разослать АВАРИЙНОЕ сообщение всем администраторам из ADMIN_TELEGRAM_IDS.

    Зачем отдельная функция: аварийные уведомления (упавший бот, ошибка
    оплаты, кончился диск) уходили только на admin_telegram_ids[0] — первому
    в списке. Пока владелец в отпуске или без сети, такие алерты попадали в
    чат, который никто не читает, и авария оставалась незамеченной.

    Обычную доставку контента (черновики сторис и т.п.) сюда переводить не
    надо — иначе все админы получат по копии каждого черновика.

    Возвращает число успешных доставок: 0 означает, что не узнал никто,
    и это стоит записать в лог как отдельную проблему.
    """
    admin_ids = settings.admin_telegram_ids or []
    if not admin_ids:
        logger.error(
            "ALERT не доставлен: ADMIN_TELEGRAM_IDS пуст. Текст: %s", text_msg[:200]
        )
        return 0

    delivered = 0
    for admin_id in admin_ids:
        try:
            await bot.send_message(
                admin_id,
                text_msg,
                parse_mode=parse_mode,
                reply_markup=_markup_for(admin_id, admin_tab, focus, button_text),
                # Ссылка в кнопке ведёт на сайт, и Telegram по умолчанию
                # подрисовывает под сообщением карточку страницы. У аварии
                # она занимает пол-экрана и ничего не сообщает.
                disable_web_page_preview=True,
            )
            delivered += 1
        except Exception as e:
            # Один недоступный получатель не должен блокировать остальных.
            logger.error("Не удалось доставить алерт админу %s: %s", admin_id, e)

    if delivered == 0:
        logger.error(
            "ALERT не дошёл ни до кого из %d админов: %s",
            len(admin_ids),
            text_msg[:200],
        )

    return delivered


# ─── Степан (Менеджер) обработчики событий ─────────────────


# Все три обработчика ниже заводили задачу сырым INSERT без `deadline`, а
# `check_deadlines` отбирает просроченные по `deadline < CURRENT_DATE`: задача
# без срока не попадала в дайджест НИКОГДА. Владелец видел «просрочено: 0» при
# сотнях открытых строк, включая срочные жалобы. Плюс каждый повторял руками
# публикацию события — с риском разойтись с `tasks_repo.create`, единственной
# правильной дверью. Теперь дверь одна, и срок есть у всех.


async def pm_on_order_created(bot: Bot, payload: dict):
    """Новый заказ → создать задачу на производство."""
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    items = data.get("items_summary", "")

    await tasks_repo.create(
        title=f"🛒 Заказ {order_number} — собрать и доставить",
        department="production",
        description=(
            f"Заказ {order_number} на сумму {format_price(total)}.\n{items}\n\n"
            f"Собрать и передать в доставку."
        ),
        priority="high",
        assignee="Производство",
        deadline_days=1,
        chat_id=_admin_chat_id(),
    )
    logger.info("PM: задача создана для заказа %s", order_number)


async def pm_on_complaint(bot: Bot, payload: dict):
    """Жалоба → создать срочную задачу."""
    data = payload.get("data", {})
    summary = data.get("summary", "Нет описания")
    customer = data.get("customer_name", "Клиент")

    await tasks_repo.create(
        title=f"🚨 Жалоба от {customer}",
        department="support",
        description=summary,
        priority="urgent",
        assignee="Менеджер",
        deadline_days=1,
        chat_id=_admin_chat_id(),
    )
    logger.info("PM: срочная задача для жалобы от %s", customer)


async def pm_on_hr_application(bot: Bot, payload: dict):
    """HR заявка → задача для HR."""
    data = payload.get("data", {})
    name = data.get("name", "Кандидат")
    position = data.get("position", "")

    await tasks_repo.create(
        title=f"👤 Кандидат: {name} — {position}",
        department="hr",
        description=f"Рассмотреть заявку от {name} на позицию {position}.",
        priority="medium",
        assignee="HR",
        deadline_days=3,
        chat_id=_admin_chat_id(),
    )
    logger.info("PM: задача HR для %s", name)


# ─── Finance Bot обработчики ───────────────────────────────


async def finance_on_order_created(bot: Bot, payload: dict):
    """Новый заказ → записать ожидаемый доход."""
    data = payload.get("data", {})
    order_number = data.get("order_number", "N/A")
    total = data.get("total_amount", 0)
    order_id = data.get("order_id")

    async with get_session_ctx() as session:
        await session.execute(
            text(
                "INSERT INTO finances (type, amount, category, description, related_order_id, date, created_at) "
                "VALUES ('income', :a, 'sales', :d, :oid, CURRENT_DATE, NOW())"
            ),
            {"a": total, "d": f"Заказ {order_number}", "oid": order_id},
        )
        await session.commit()
    logger.info(f"Finance: доход {total} от заказа {order_number}")


# Статусы, при которых заказ перестаёт быть доходом.
CANCELLED_STATUSES = {"cancelled", "canceled", "refunded"}


async def finance_on_order_status_changed(bot: Bot, payload: dict):
    """Отмена заказа → сторнировать записанный по нему доход.

    Доход пишется в момент СОЗДАНИЯ заказа (см. выше) — это верно, пока заказ
    жив. Но обратной проводки не существовало: отменённый заказ навсегда
    оставался доходом в `finances`, и P&L завышал прибыль ровно на сумму
    отмен. Складской остаток при этом возвращает витрина (lib/orders/cancel).

    Сторно — отдельная строка `expense`, а не удаление: журнал операций
    должен показывать, что было и что отменили, а не переписывать прошлое.
    Идемпотентность по `related_order_id` + категории: повторное событие
    (админка, бот и обратная синхронизация ведут к одному заказу) ничего
    не добавит.
    """
    data = payload.get("data", {})
    status = str(data.get("status") or "").lower()
    if status not in CANCELLED_STATUSES:
        return

    order_id = data.get("order_id")
    order_number = data.get("order_number", "N/A")
    if not order_id:
        return

    async with get_session_ctx() as session:
        already = (
            await session.execute(
                text(
                    "SELECT id FROM finances WHERE related_order_id = :oid "
                    "AND category = 'sales_cancelled' LIMIT 1"
                ),
                {"oid": order_id},
            )
        ).scalar()
        if already:
            return

        booked = (
            await session.execute(
                text(
                    "SELECT COALESCE(SUM(amount), 0) FROM finances "
                    "WHERE related_order_id = :oid AND type = 'income'"
                ),
                {"oid": order_id},
            )
        ).scalar()
        amount = float(booked or 0)
        if amount <= 0:
            return

        await session.execute(
            text(
                "INSERT INTO finances (type, amount, category, description, "
                "related_order_id, date, created_at) "
                "VALUES ('expense', :a, 'sales_cancelled', :d, :oid, CURRENT_DATE, NOW())"
            ),
            {"a": amount, "d": f"Сторно отменённого заказа {order_number}", "oid": order_id},
        )
        await session.commit()

    logger.info("Finance: сторнирован доход %s по отменённому заказу %s", amount, order_number)


# ─── Analytics Bot обработчики ─────────────────────────────


async def analytics_on_order_created(bot: Bot, payload: dict):
    """Логируем взаимодействие для аналитики."""
    data = payload.get("data", {})
    customer_id = data.get("customer_id")
    if customer_id:
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                    "VALUES (:cid, 'telegram', 'order', 'sales_bot', :s, NOW())"
                ),
                {"cid": customer_id, "s": f"Заказ {data.get('order_number', 'N/A')}"},
            )
    logger.info("Analytics: взаимодействие записано")


def register_pm_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий Степана (PM/Менеджер)."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: pm_on_order_created(bot, p))
    event_bus.on(Events.COMPLAINT_RECEIVED, lambda p: pm_on_complaint(bot, p))
    event_bus.on(Events.APPLICATION_RECEIVED, lambda p: pm_on_hr_application(bot, p))
    logger.info("Степан (Менеджер): подписан на events (order, complaint, hr)")


def register_finance_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий Finance бота."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: finance_on_order_created(bot, p))
    # Парная подписка к ORDER_CREATED: без неё отменённый заказ навсегда
    # оставался доходом, и месячный P&L завышал прибыль на сумму отмен.
    event_bus.on(
        Events.ORDER_STATUS_CHANGED,
        lambda p: finance_on_order_status_changed(bot, p),
    )
    logger.info("Finance Bot: подписан на events (order, order_status)")


def register_analytics_handlers(event_bus, bot: Bot):
    """Регистрирует все обработчики событий Analytics бота."""
    from shared.event_bus import Events

    event_bus.on(Events.ORDER_CREATED, lambda p: analytics_on_order_created(bot, p))
    logger.info("Analytics Bot: подписан на events (order)")

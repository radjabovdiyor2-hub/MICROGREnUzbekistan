"""
🧠 УНИВЕРСАЛЬНЫЙ ИСПОЛНИТЕЛЬ ЗАДАЧ ОТДЕЛА
==========================================
Через него задачу выполняет любой бот офиса, кроме Стёпана (у него свой
обработчик с тем же набором инструментов).

ЧТО ЗДЕСЬ ИЗМЕНИЛОСЬ И ПОЧЕМУ

1. Отдел ВЫПОЛНЯЕТ задачу инструментами, а не пересказывает её.
   Раньше был один `chat_completion` и разбор JSON: в контракте ответа были
   только текст, отдел и промпт картинки — места для действия не было. Прайс
   при этом вклеивался в промпт строкой, и когда каталог не читался, модель
   дописывала цены сама. Теперь цены берутся инструментом `get_price_list`,
   продажа регистрируется инструментом `register_sale`, и так далее.

2. Передача чужой задачи — инструмент `delegate_to_department`, а не поле JSON.
   Прежняя передача публиковала событие как `{"data": task_data}`, хотя
   `event_bus.publish` оборачивает payload сам. Получатели разворачивают его
   один раз, видели `{"data": {...}}`, отдела в нём не находили и молча
   выходили — задача исчезала на каждой передаче. Теперь событие плоское, с
   указанием отправителя и счётчиком передач: круг A→B→A обрывается на втором.

3. Боты без Telegram (qa, rnd, devops) больше не падают на первой строке.
   `bot.send_message` вызывался до проверки `bot is not None`, поэтому у трёх
   служебных ботов КАЖДАЯ задача заканчивалась AttributeError.

4. Рискованные инструменты уходят на подтверждение владельцу (shared/approvals).
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from aiogram import Bot

from shared import approvals, bot_registry, tasks_repo, tool_runtime
from shared.ai_engine import AIEngine
from shared.event_bus import Events, event_bus
from shared.task_ui import get_task_keyboard

logger = logging.getLogger(__name__)


RULES = """
ПРАВИЛА РАБОТЫ

1. Сначала реши, твоя ли это задача. Если она относится к другому отделу —
   вызови delegate_to_department и объясни почему. Не выполняй чужую работу.
2. Если задача твоя — ВЫПОЛНИ её инструментами, а не описывай словами.
   Нужны цены или ассортимент — вызови get_price_list или find_product.
   Нужны цифры по заказам, задачам, деньгам — возьми их инструментом.
3. НИКОГДА не называй цены, остатки, суммы и имена клиентов по памяти.
   В базе они уже есть; данные не из инструмента считаются выдумкой.
4. Часть инструментов требует подтверждения руководителя. Если инструмент
   ответил «отправлено на подтверждение» — так и напиши. Не рапортуй о
   выполнении того, что ещё не подтвердили.
5. Ответ — по-русски, по делу, без вступлений. Это результат работы отдела,
   который прочитает руководитель.
"""


def _admin_chat_id() -> Optional[int]:
    from shared.config import settings

    ids = getattr(settings, "admin_telegram_ids", None) or []
    return ids[0] if ids else None


async def _notify(bot: Optional[Bot], chat_id: Optional[int], text_body: str, **kwargs) -> None:
    """Сообщение в чат, если у бота вообще есть Telegram-интерфейс."""
    if bot is None or not chat_id:
        return
    try:
        await bot.send_message(chat_id, text_body, parse_mode="HTML", **kwargs)
    except Exception as exc:
        logger.warning("TASK_EXECUTOR: сообщение не доставлено: %s", exc)


async def _learning_policy(bot_name: str) -> str:
    """Активные выводы обучения для этого бота. Сбой не должен ронять задачу."""
    try:
        from shared.feedback_loop import feedback_loop

        return await feedback_loop.active_policy(bot_name)
    except Exception as exc:
        logger.warning("TASK_EXECUTOR: директивы обучения недоступны: %s", exc)
        return ""


async def _set_task_status(task_id: Any, status: str) -> None:
    try:
        await tasks_repo.set_status(int(task_id), status)
    except Exception as exc:
        logger.warning("TASK_EXECUTOR: статус задачи %s не обновлён: %s", task_id, exc)


def _department_list() -> str:
    return ", ".join(
        sorted(b.department for b in bot_registry.BOTS if b.department and b.department != "pm")
    )


def _image_from(calls) -> Optional[str]:
    """Путь к картинке, если отдел её сгенерировал."""
    for call in reversed(calls):
        if call.name == "generate_image" and isinstance(call.result, dict):
            if call.result.get("ok") and call.result.get("image"):
                return str(call.result["image"])
    return None


def _delegation_from(calls) -> Optional[Dict[str, Any]]:
    for call in reversed(calls):
        if call.name == "delegate_to_department" and isinstance(call.result, dict):
            if call.result.get("ok"):
                return call.result
    return None


def _escalated_to_human(calls) -> bool:
    """Отдел признал, что сам не может, и завёл задачу человеку.

    Это не выполнение: работа впереди, просто делать её будет не бот. Закрывать
    исходную задачу по такому вызову — то же самое, что отчитаться об успехе
    в момент отказа.
    """
    return any(
        call.name == "human_task"
        and isinstance(call.result, dict)
        and call.result.get("ok")
        for call in calls
    )


async def execute_bot_task(
    bot: Bot | None,
    bot_name: str,
    department: str,
    task_data: dict,
    team_context: str,
    policy: str = "",
):
    """Универсальный обработчик задач для любого бота офиса."""
    task_id = task_data.get("task_id")
    if not task_id:
        logger.warning("TASK_EXECUTOR: задача без task_id — пропускаю (%s)", bot_name)
        return

    chat_id = task_data.get("chat_id") or _admin_chat_id()
    title = task_data.get("title", "")
    description = task_data.get("description", "")
    hops = int(task_data.get("hops") or 0)

    # Директивы обучения подтягиваются здесь, а не в каждом боте: раньше их
    # передавали руками, и до промпта они доходили только у двух отделов из
    # десяти — остальные читали их из базы и выбрасывали.
    policy = f"{policy}{await _learning_policy(bot_name)}"

    system_prompt = (
        f"{team_context}\n\n"
        f"Ты — бот отдела {department}.\n"
        f"Отделы офиса: {_department_list()}. Задачи отделов без своего бота "
        f"(производство, логистика, операции) ведёт руководитель Стёпан.\n\n"
        f"ЗАДАЧА\nНазвание: {title}\nОписание: {description}\n"
        f"{RULES}\n{policy}"
    )

    await _notify(
        bot,
        chat_id,
        f"⏳ <b>Отдел {department} принял задачу в работу.</b>\nАнализирую и выполняю…",
    )

    try:
        result = await tool_runtime.run_tool_loop(
            AIEngine(),
            system_prompt=system_prompt,
            user_message="Разберись с задачей и выполни её.",
            department=department,
            # Контекст задачи подставляется в каждый вызов; лишнее реестр
            # отбросит по сигнатуре. chat_id нужен инструментам, которые сами
            # шлют в чат (опрос отдела контента), task_id и hops — делегированию.
            extra_args={"task_id": task_id, "hops": hops, "chat_id": chat_id},
            approve=approvals.approver(bot, bot_name, chat_id),
        )
    except Exception as exc:
        logger.error("TASK_EXECUTOR: задача %s упала: %s", task_id, exc, exc_info=True)
        failure = f"❌ <b>Ошибка при выполнении задачи ({department}):</b>\n{exc}"
        await _notify(bot, chat_id, failure)
        if bot is None:
            await event_bus.publish(
                Events.TASK_COMPLETED,
                {
                    "task_id": task_id,
                    "completed_by": department,
                    "chat_id": chat_id,
                    "text": failure,
                },
                bot_name,
            )
        return

    # ── Задача оказалась чужой: передаём и выходим ──────────────────────
    delegation = _delegation_from(result.calls)
    if delegation:
        target = delegation["department"]
        await _notify(
            bot,
            chat_id,
            f"🔄 <b>Передано в отдел {target}</b>\n{result.text}",
        )
        # Событие ПЛОСКОЕ: publish сам оборачивает payload в {"event", "data"}.
        # Лишняя обёртка `{"data": ...}` ломала фильтр по отделу у всех получателей.
        await event_bus.publish(
            Events.TASK_CREATED,
            {
                "task_id": task_id,
                "title": title,
                "description": description,
                "department": target,
                "chat_id": chat_id,
                "hops": delegation.get("hops", hops + 1),
                "delegated_by": department,
            },
            bot_name,
        )
        return

    # ── Ответ отдела ────────────────────────────────────────────────────
    #
    # Заголовок честный. Раньше «✅ Результат» стояло всегда — в том числе
    # когда модель не вызвала ни одного инструмента и просто написала текст.
    # Владелец видел зелёную галочку и считал задачу сделанной, а строка
    # оставалась `todo`; расхождение всплывало только в сводке просрочки.
    escalated = _escalated_to_human(result.calls)
    if escalated:
        header = f"🙋 <b>Нужен человек ({department}):</b>"
    elif result.awaiting_approval:
        header = f"⏳ <b>Ждёт вашего подтверждения ({department}):</b>"
    elif result.acted:
        header = f"✅ <b>Результат ({department}):</b>"
    else:
        header = f"💬 <b>Ответ без действий ({department}):</b>"

    body = f"{header}\n\n{result.text}"

    # Что отдел сделал САМ, без подтверждения. Автономия без доклада — это
    # незаметные действия: владелец узнавал бы о них только по изменившимся
    # остаткам. Пороги настраиваются в админке, раздел «Самостоятельность».
    autonomous = result.autonomous_calls
    if autonomous:
        body += "\n\n🤖 <b>Выполнено самостоятельно (в пределах порога):</b>"
        for run in autonomous:
            done = run.result.get("summary") or run.result.get("message") or run.name
            body += f"\n• {done}"

    image = _image_from(result.calls)

    if bot is not None and chat_id and image:
        await _send_with_image(bot, chat_id, body, image, task_id)
    else:
        await _notify(bot, chat_id, body, reply_markup=get_task_keyboard(task_id))

    # Задачу закрываем ТОЛЬКО если отдел действительно что-то сделал.
    #
    # Сгенерированный текст — не выполнение. Закрывать задачу по факту ответа
    # модели значило бы ровно то, против чего весь этот слой: отчёт об успехе,
    # которого не было. Признак работы — состоявшийся вызов инструмента
    # (`result.acted`); ждём подтверждения — тем более не закрываем, действие
    # ещё не произошло. Иначе оставляем `todo` и кнопку «Выполнено» человеку.
    #
    # `human_task` — тоже вызов инструмента, но это ЭСКАЛАЦИЯ: работа впереди,
    # и закрывать исходную задачу нельзя. Планировщик совещаний уже считает
    # так же (см. handlers/team_meeting.py, ветка `cap_key != "human_task"`);
    # здесь этого условия не было, и задача закрывалась ровно в тот момент,
    # когда бот признал, что сделать её не может.
    if result.acted and not result.awaiting_approval and not escalated:
        await _set_task_status(task_id, "done")

    await _record_own_performance(bot_name, result, escalated)

    if bot is None:
        await event_bus.publish(
            Events.TASK_COMPLETED,
            {
                "task_id": task_id,
                "completed_by": department,
                "chat_id": chat_id,
                "text": body,
            },
            bot_name,
        )


async def _record_own_performance(bot_name: str, result, escalated: bool) -> None:
    """Записать, как отдел отработал ЭТУ задачу — в замеры для обучения.

    Самое большое упущение петли обратной связи: она училась по выручке
    компании, а работа самого бота в неё не попадала вообще. Провалы
    инструментов, эскалации «сам не могу», ответы без единого действия —
    всё это считалось прямо здесь и выбрасывалось. Получалось, что бот,
    отработавший сегодня плохо, не давал в обучение НИ ОДНОГО сигнала,
    хотя директива в промпте обещает «выводы аналитики по твоей работе».

    Три метрики на задачу, 1 — плохо, 0 — хорошо:
      · tool_failure — инструмент вернул ошибку;
      · escalation — отдел передал работу человеку;
      · no_action — ответ текстом без единого вызова инструмента.
    """
    try:
        from shared.feedback_loop import feedback_loop

        calls = list(getattr(result, "calls", []) or [])
        failed = sum(
            1
            for c in calls
            if isinstance(c.result, dict)
            and (c.result.get("ok") is False or c.result.get("error"))
        )
        failure_rate = (failed / len(calls)) if calls else 0.0

        await feedback_loop.record_measurement(
            bot_name, "tool_failure", failure_rate, target=0.0
        )
        await feedback_loop.record_measurement(
            bot_name, "escalation", 1.0 if escalated else 0.0, target=0.0
        )
        await feedback_loop.record_measurement(
            bot_name, "no_action", 0.0 if result.acted else 1.0, target=0.0
        )
    except Exception as exc:
        # Телеметрия не должна ронять задачу.
        logger.debug("TASK_EXECUTOR: замеры своей работы не записаны: %s", exc)


async def _send_with_image(
    bot: Bot, chat_id: int, caption: str, image: str, task_id: Any
) -> None:
    """Отправить результат картинкой; не вышло — отправить текстом."""
    from aiogram.types import FSInputFile, URLInputFile

    try:
        if image.startswith("http"):
            photo = URLInputFile(image)
        elif os.path.isfile(image):
            photo = FSInputFile(image)
        else:
            photo = None
        if photo is None:
            raise ValueError(f"изображение недоступно: {image}")
        await bot.send_photo(
            chat_id,
            photo=photo,
            caption=caption[:1024],
            parse_mode="HTML",
            reply_markup=get_task_keyboard(task_id),
        )
    except Exception as exc:
        logger.warning("TASK_EXECUTOR: фото не отправлено (%s) — шлю текстом", exc)
        await _notify(bot, chat_id, caption, reply_markup=get_task_keyboard(task_id))

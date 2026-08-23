"""
👥 GROUP REPLY — как отдел отвечает в групповом чате
====================================================
Отделы в группе умели ровно одно: поговорить. Их обработчик упоминания был
`chat_completion` без истории и БЕЗ ЕДИНОГО ИНСТРУМЕНТА — например
`sales_bot.ai_chat.ai_fallback`, написанный для личной переписки с клиентом.
Спросить у отдела продаж в рабочей группе «есть ли такой клиент» или «сколько
стоит руккола» было бессмысленно: он отвечал общими словами, потому что
посмотреть ему было нечем, хотя двадцать четыре инструмента у него есть.

Здесь один путь для всех: история чата (`shared/chat_memory`) + инструменты
своего отдела (`shared/tool_runtime.run_tool_loop`) + подтверждение владельцу
для рискованных действий (`shared/approvals.approver`) — то же самое, чем
отдел выполняет делегированную задачу. Разница только в том, что задача
приходит из очереди, а здесь её задают словами в чате.

Стёпан сюда не входит: у него свой обработчик со своим набором перехватов
(`bots/stepan_bot/handlers/assistant.py`).
"""

from __future__ import annotations

import logging
from typing import Optional

from aiogram.types import Message

from shared import approvals, chat_memory, tool_runtime
from shared.ai_engine import AIEngine
from shared.prompts import role_prompt

logger = logging.getLogger(__name__)


def _prompt(persona: str, message: Message) -> str:
    """Системный промпт отдела для разговора в группе.

    Склейка одна на всех — через `role_prompt`: он добавляет командный контекст
    и фирменный голос. Собирать промпт руками здесь означало бы двадцать пятый
    способ разойтись с остальными (см. докстринг `shared/prompts.role_prompt`).
    """
    prompt = role_prompt(persona)
    prompt += (
        "\n\nСЕЙЧАС ТЫ ОТВЕЧАЕШЬ В РАБОЧЕМ ГРУППОВОМ ЧАТЕ. Отвечай коротко и по "
        "делу. Факты — только инструментами: цены, остатки, клиенты и заказы "
        "берутся из базы, а не из памяти. Не знаешь — так и скажи."
    )

    quoted = chat_memory.quoted_reply(message)
    if quoted:
        prompt += (
            f"\n\n📎 СОБЕСЕДНИК ОТВЕЧАЕТ НА СООБЩЕНИЕ:\n«{quoted}»\n"
            f"Его реплика относится именно к нему."
        )
    return prompt


def _open_button(result, message: Message):
    """Кнопка «посмотреть в админке» под ответом отдела.

    ЗАЧЕМ
    Группа — то место, где команда реально работает, и до сих пор в ней не
    было ни одной кликабельной строки: отдел отвечал `message.reply(text)`
    голым текстом. Спросил «что с заказом M-…» — получил ответ и тупик.

    КУДА ВЕДЁТ
    Не в общую админку, а на экран того, ЧЕМ отдел смотрел: у инструмента
    рядом с ним записана своя вкладка (`Tool.admin_tab`). Берём последний
    сработавший вызов — он и есть предмет разговора. Инструменты без
    экрана кнопки не дают: обещать показать и привести не туда хуже, чем
    не обещать.

    В группе кнопка обычная (`url`): Mini App Telegram разрешает только в
    личной переписке и иначе отклоняет сообщение целиком. Разделение живёт
    в `admin_links`, здесь о нём знать не надо.
    """
    try:
        from shared import admin_links

        for call in reversed(getattr(result, "calls", []) or []):
            if getattr(call, "pending_approval", False):
                continue
            markup = admin_links.tool_markup(call.name, call.args, message.chat.id)
            if markup:
                return markup
    except Exception as exc:
        # Кнопка — довесок к ответу, а не ответ: не собралась — отвечаем
        # текстом. Но в лог это обязано попасть.
        logger.warning("GROUP_REPLY: кнопка не собралась: %s", exc)
    return None


async def answer(
    message: Message,
    *,
    bot_name: str,
    department: str,
    persona: str,
    remember: bool = True,
) -> bool:
    """Ответить на упоминание отдела в группе. False — отвечать было нечего.

    Возвращаемое значение важно: по нему `group_orchestrator` ставит 👍 или
    🤷‍♂️. Реакция «сделал» под сообщением, на которое бот не ответил, — это
    ложь, из-за которой распоряжение считают выполненным.
    """
    text = (message.text or message.caption or "").strip()
    if not text:
        return False

    history = await chat_memory.load(bot_name, message.chat.id)

    try:
        result = await tool_runtime.run_tool_loop(
            AIEngine(),
            system_prompt=_prompt(persona, message),
            user_message=text,
            department=department,
            extra_args={"chat_id": message.chat.id, "caller_department": department},
            # Рискованное (деньги, цены, рассылки) по-прежнему уходит владельцу
            # карточкой ✅/❌ — разговор в группе не повод их обходить.
            approve=approvals.approver(message.bot, bot_name, message.chat.id, None),
            conversation_history=history,
        )
    except Exception as exc:
        logger.error("GROUP_REPLY (%s): %s", bot_name, exc, exc_info=True)
        await message.reply(
            "😔 Не смог ответить — движок не отозвался. Повторите, пожалуйста."
        )
        return False

    answer_text = (result.text or "").strip()
    if not answer_text:
        return False

    await message.reply(answer_text, reply_markup=_open_button(result, message))
    if remember:
        await chat_memory.remember(bot_name, message.chat.id, text, answer_text)
    return True


def group_handler(bot_name: str, department: str, persona: str):
    """Обработчик упоминания для `create_group_router`.

    Отдельная фабрика, чтобы `main.py` каждого бота остался одной строкой, а
    состав ответа не расползся по одиннадцати файлам заново.
    """

    async def handle_mention(message: Message, **_: Optional[object]) -> bool:
        return await answer(
            message, bot_name=bot_name, department=department, persona=persona
        )

    return handle_mention

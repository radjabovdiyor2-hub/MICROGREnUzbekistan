import logging
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from shared.debate_manager import debate_manager
from shared.event_bus import event_bus
from shared.ai_engine import AIEngine
from shared.prompts import TEAM_CONTEXT

logger = logging.getLogger(__name__)


async def handle_debate_turn(
    payload: dict, bot_token: str, bot_name: str, bot_role_prompt: str
):
    data = payload.get("data", {})
    assignee = data.get("assignee", "")

    # Check if this turn is for this bot
    if assignee.lower() != bot_name.lower():
        return

    chat_id = data.get("chat_id")
    topic = data.get("topic")
    question = data.get("question", "")

    if not chat_id:
        return

    logger.info(f"[{bot_name}] Received DEBATE_TURN for chat {chat_id}")

    bot = Bot(token=bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    try:
        # Get debate history
        history = await debate_manager.get_history(chat_id)

        # Format history for prompt
        history_text = "\n".join(
            [f"{item['sender']}: {item['message']}" for item in history]
        )
        if not history_text:
            history_text = "Дискуссия только началась."

        sys_prompt = f"{TEAM_CONTEXT}\n\n{bot_role_prompt}\n\nТы участвуешь в рабочем совещании с другими отделами. Внимательно изучи историю дискуссии и ответь на направленный тебе вопрос или прокомментируй ситуацию. Будь профессионалом, предлагай конкретные решения, при необходимости аргументированно критикуй коллег."

        user_prompt = f"Тема совещания: {topic}\n\nИстория дискуссии:\n{history_text}\n\nСлово передано тебе. Модератор (Степан) спрашивает/поручает:\n{question}\n\nТвой ответ (обращайся к коллегам напрямую):"

        ai = AIEngine()
        answer = await ai.chat_completion(sys_prompt, user_prompt, effort="high")

        # Send message to chat
        display_name = bot_name.upper()
        if "bot" in display_name:
            display_name = display_name.replace("_BOT", "")

        msg = f"🗣 <b>Отдел {display_name}:</b>\n\n{answer}"
        await bot.send_message(chat_id, msg)

        # Add to history
        await debate_manager.add_message(chat_id, display_name, answer)

        # Publish completion
        await event_bus.publish(
            "DEBATE_TURN_COMPLETED",
            {"chat_id": chat_id, "bot_name": bot_name, "topic": topic},
            bot_name,
        )

        logger.info(f"[{bot_name}] Completed DEBATE_TURN")

    except Exception as e:
        logger.error(f"Error handling debate turn: {repr(e)}", exc_info=True)
        # Still publish completion so debate doesn't hang
        await event_bus.publish(
            "DEBATE_TURN_COMPLETED",
            {"chat_id": chat_id, "bot_name": bot_name, "topic": topic, "error": str(e)},
            bot_name,
        )
    finally:
        await bot.session.close()

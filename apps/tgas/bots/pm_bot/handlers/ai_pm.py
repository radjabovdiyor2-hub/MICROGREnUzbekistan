"""PM Bot — AI PM fallback"""
from aiogram import Router, F
from aiogram.types import Message
from shared.ai_engine import AIEngine
from shared.utils import simulate_typing
router = Router()
ai = AIEngine()

@router.message(F.text, F.chat.type == "private")
async def ai_pm(msg: Message):
    await simulate_typing(msg, delay=2)
    sys_prompt = "Ты Операционный Директор (COO) и Project Manager фермы микрозелени Microgreen Uzbekistan. Общайся как профессионал, помогай управлять задачами, производством и логистикой, используя Agile/Lean подходы. Не давай банальных ответов, будь кратким и четким."
    resp = await ai.chat_completion(sys_prompt, msg.text)
    await msg.answer(resp)

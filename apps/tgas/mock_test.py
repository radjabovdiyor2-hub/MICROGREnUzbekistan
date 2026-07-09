import asyncio
import logging
from shared.ai_engine import AIEngine

logging.basicConfig(level=logging.INFO)

async def mock_test():
    ai = AIEngine()
    mock_data = {
        "orders_by_status": [
            {"status": "new", "count": 5, "emoji": "🆕"},
            {"status": "preparing", "count": 2, "emoji": "🔧"},
            {"status": "delivering", "count": 3, "emoji": "🚚"}
        ],
        "stuck_deliveries": 1
    }
    
    prompt = (
        "Сформируй понятный, живой и мотивирующий отчёт для группы продаж о текущем статусе заказов. "
        f"Данные: {mock_data}. "
        "Не используй слишком формальный язык. Опиши ситуацию с курьерами и сборкой."
    )
    
    print("⏳ СТЕПАН ДУМАЕТ НАД ОТЧЁТОМ (AI генерация)...\n")
    try:
        ai_report = await ai.chat_completion("Ты руководитель Степан. Отправь отчёт о доставке для команды.", prompt)
        print("✅ СООБЩЕНИЕ ДЛЯ ГРУППЫ ПРОДАЖ:")
        print("====================================")
        print(f"📦 <b>Сводка по логистике от Степана:</b>\n\n{ai_report}")
        print("====================================")
    except Exception as e:
        print(f"Ошибка при вызове OpenAI: {e}")

if __name__ == "__main__":
    asyncio.run(mock_test())

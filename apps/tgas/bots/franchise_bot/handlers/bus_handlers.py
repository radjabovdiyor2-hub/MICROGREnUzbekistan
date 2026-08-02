import logging
from shared.database import get_db
from shared.ai_engine import AIEngine

logger = logging.getLogger(__name__)

async def bus_analyze_franchise(params: dict) -> dict:
    """
    Анализ франшиз через Bot Bus.
    Ожидает params={"city": "samarkand"}
    """
    city = params.get("city")
    if not city:
        return {"status": "error", "error": "Missing city parameter"}

    try:
        db = await get_db()
        # Получаем данные журнала
        journals = await db.franchisejournal.find_many(
            where={"city": city},
            order={"created_at": "desc"},
            take=10
        )
        
        journal_text = "\n".join([f"[{j.created_at}] {j.department}: {j.action} - {j.content}" for j in journals])
        
        ai = AIEngine("franchise_analyzer")
        prompt = f"""
        Проанализируй последние события франшизы в городе {city}.
        Журнал событий:
        {journal_text}
        
        Выдели главные достижения, проблемы и дай 3 рекомендации для развития филиала.
        Ответь в формате Markdown.
        """
        
        result = await ai.generate(prompt)
        
        # Сохраним результат анализа в журнал
        await db.franchisejournal.create(
            data={
                "city": city,
                "department": "analytics",
                "action": "ИИ Анализ",
                "content": result,
                "metrics": {"type": "ai_report"}
            }
        )
        
        return {"status": "ok", "report": result}
    except Exception as e:
        logger.error(f"Error analyzing franchise: {e}")
        return {"status": "error", "error": str(e)}

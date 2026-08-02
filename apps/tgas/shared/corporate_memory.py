import logging
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine

logger = logging.getLogger(__name__)

class CorporateMemory:
    """Семантическая память компании (RAG). Использует pgvector для поиска."""
    
    def __init__(self):
        self.ai = AIEngine()

    async def memorize(self, source: str, event_text: str) -> bool:
        """Запоминает факт или вывод в корпоративной базе."""
        try:
            vec = await self.ai.embed(event_text)
            if not vec:
                logger.warning(f"CorporateMemory: Не удалось получить эмбеддинг для {source}")
                return False
            
            # pgvector ожидает строку вида '[0.1, 0.2, ...]'
            vec_str = "[" + ",".join(map(str, vec)) + "]"
            
            async with get_session_ctx() as session:
                await session.execute(
                    text("INSERT INTO knowledge_base (chunk, embedding, source) VALUES (:c, :e::vector, :s)"),
                    {"c": event_text, "e": vec_str, "s": source}
                )
            return True
        except Exception as e:
            logger.error(f"CorporateMemory memorize error: {e}", exc_info=True)
            return False

    async def recall(self, query: str, limit: int = 3, threshold: float = 0.5) -> list[str]:
        """Вспомнить релевантные факты по запросу с помощью косинусного расстояния."""
        try:
            vec = await self.ai.embed(query)
            if not vec:
                return []
            
            vec_str = "[" + ",".join(map(str, vec)) + "]"
            
            async with get_session_ctx() as session:
                # <=> это оператор косинусного расстояния в pgvector
                # Чем меньше расстояние, тем ближе вектора
                # 1 - (embedding <=> query) = cosine similarity
                res = await session.execute(
                    text("""
                        SELECT chunk, source, 1 - (embedding <=> :v::vector) as similarity 
                        FROM knowledge_base 
                        WHERE 1 - (embedding <=> :v::vector) > :t
                        ORDER BY embedding <=> :v::vector ASC 
                        LIMIT :l
                    """),
                    {"v": vec_str, "l": limit, "t": threshold}
                )
                rows = res.fetchall()
                if not rows:
                    return []
                
                return [f"[{r.source}] {r.chunk}" for r in rows]
        except Exception as e:
            logger.error(f"CorporateMemory recall error: {e}", exc_info=True)
            return []

corporate_memory = CorporateMemory()

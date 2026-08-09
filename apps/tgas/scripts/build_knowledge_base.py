import asyncio
import os
import re
import sys

# Добавляем корневую папку проекта в sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from shared.ai_engine import AIEngine
from shared.database import get_session_ctx
from shared.storefront_config import knowledge_placeholders

# Эмбеддинги через общий движок: прямой AsyncOpenAI здесь был обходом mg_ai,
# из-за чего сборка базы знаний не попадала в учёт расхода токенов.
engine = AIEngine()


async def setup_vector_table():
    async with get_session_ctx() as session:
        # Расширение pgvector. Prisma не управляет расширениями — включаем вручную.
        # Образ pgvector/pgvector:pg16 расширение содержит, нужно лишь включить.
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Таблица knowledge_base управляется Prisma (schema.prisma).
        # CREATE TABLE IF NOT EXISTS больше не нужен.
        # Создаем индекс для векторного поиска
        await session.execute(
            text("""
            CREATE INDEX IF NOT EXISTS kb_embedding_idx 
            ON knowledge_base 
            USING ivfflat (embedding vector_cosine_ops) 
            WITH (lists = 100);
        """)
        )
        print("Таблица knowledge_base и индекс созданы.")


async def build_knowledge_base():
    kb_path = os.path.join(
        os.path.dirname(__file__), "..", "bots", "support_bot", "knowledge"
    )
    if not os.path.exists(kb_path):
        print("Папка knowledge не найдена!")
        return

    # Очищаем старую базу
    async with get_session_ctx() as session:
        await session.execute(text("TRUNCATE TABLE knowledge_base"))

    # Живые значения вместо плейсхолдеров: стоимость доставки, порог
    # бесплатной и способы оплаты берутся из настроек витрины. Раньше они
    # стояли в faq.md числами и обещанием «Click, Payme» — и уходили клиенту
    # прямо из системного промпта, даже когда владелец давно поменял их.
    placeholders = await knowledge_placeholders()
    print(f"Подстановки из настроек витрины: {placeholders}")

    for filename in os.listdir(kb_path):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(kb_path, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # Служебные комментарии — не знание. Без этого пояснение про
        # плейсхолдеры попало бы в чанк и оттуда в системный промпт.
        content = re.sub(r"<!--.*?-->", "", content, flags=re.S)

        for key, value in placeholders.items():
            content = content.replace(key, value)

        left = [k for k in placeholders if k in content]
        if left:
            print(f"⚠️ {filename}: не подставлены {left}")

        # Очень примитивный чанкинг по заголовкам ##
        chunks = content.split("##")
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue

            lines = chunk.split("\n", 1)
            title = lines[0].strip()
            text_content = chunk

            # Генерируем эмбеддинг
            embedding = await engine.embed(text_content)
            if embedding is None:
                print(f"Пропущен чанк (эмбеддинг не получен): {title}")
                continue

            # Сохраняем в БД
            async with get_session_ctx() as session:
                await session.execute(
                    # Колонки таблицы — chunk/source/embedding (так её создаёт
                    # Prisma и так её читают faq.py и corporate_memory.py).
                    # Прежние title/content не существовали, и база знаний
                    # support-бота не наполнялась вовсе.
                    text("""
                        INSERT INTO knowledge_base (chunk, source, embedding)
                        VALUES (:chunk, :source, CAST(:embedding AS vector))
                    """),
                    {
                        "chunk": text_content,
                        "source": title,
                        "embedding": str(embedding),
                    },
                )
            print(f"Добавлен чанк: {title}")

    print("База знаний успешно построена и векторизована!")


async def main():
    await setup_vector_table()
    await build_knowledge_base()


if __name__ == "__main__":
    asyncio.run(main())

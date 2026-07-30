import asyncio
import os
import sys

# Добавляем корневую папку проекта в sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from openai import AsyncOpenAI
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

async def setup_vector_table():
    async with get_session_ctx() as session:
        # Расширение pgvector. Оно объявлено и в database/init.sql, но init.sql
        # выполняется ТОЛЬКО при первой инициализации тома Postgres — на уже
        # работающей базе его нет, и CREATE TABLE с типом vector падал.
        # Образ pgvector/pgvector:pg16 расширение содержит, нужно лишь включить.
        await session.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Создаем таблицу для эмбеддингов
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS knowledge_base (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255),
                content TEXT,
                embedding vector(1536)
            )
        """))
        # Создаем индекс для векторного поиска
        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS kb_embedding_idx 
            ON knowledge_base 
            USING ivfflat (embedding vector_cosine_ops) 
            WITH (lists = 100);
        """))
        print("Таблица knowledge_base и индекс созданы.")

async def build_knowledge_base():
    kb_path = os.path.join(os.path.dirname(__file__), "..", "bots", "support_bot", "knowledge")
    if not os.path.exists(kb_path):
        print("Папка knowledge не найдена!")
        return

    # Очищаем старую базу
    async with get_session_ctx() as session:
        await session.execute(text("TRUNCATE TABLE knowledge_base"))

    for filename in os.listdir(kb_path):
        if not filename.endswith(".md"):
            continue

        filepath = os.path.join(kb_path, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

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
            response = await client.embeddings.create(
                input=text_content,
                model="text-embedding-3-small"
            )
            embedding = response.data[0].embedding

            # Сохраняем в БД
            async with get_session_ctx() as session:
                await session.execute(
                    text("""
                        INSERT INTO knowledge_base (title, content, embedding)
                        VALUES (:title, :content, CAST(:embedding AS vector))
                    """),
                    {"title": title, "content": text_content, "embedding": str(embedding)}
                )
            print(f"Добавлен чанк: {title}")

    print("База знаний успешно построена и векторизована!")

async def main():
    await setup_vector_table()
    await build_knowledge_base()

if __name__ == "__main__":
    asyncio.run(main())

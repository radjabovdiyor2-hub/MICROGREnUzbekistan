"""
Microgreen Uzbekistan — Асинхронное подключение к базе данных
=============================================================
SQLAlchemy 2.0 async с asyncpg драйвером.
Предоставляет движок, фабрику сессий и утилиту инициализации.

Единая база: и боты, и витрина работают с одной PostgreSQL.
Prisma владеет схемой (packages/database/prisma/schema.prisma).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from shared.config import settings

logger = logging.getLogger(__name__)

# ── Базовый класс для ORM-моделей (если понадобятся) ─────────────────────
class Base(DeclarativeBase):
    """Базовый класс для всех ORM-моделей проекта."""
    pass


# ── Асинхронный движок PostgreSQL ────────────────────────────────────────
engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=False,                  # True для отладки SQL-запросов
    pool_size=20,                # Размер пула соединений
    max_overflow=10,             # Дополнительные соединения сверх пула
    pool_pre_ping=True,          # Проверка соединений перед использованием
    pool_recycle=3600,           # Переподключение каждый час
    connect_args={
        "server_settings": {
            "application_name": "microgreen_uz",
            "jit": "off",       # Отключаем JIT для коротких запросов
        }
    },
)

# ── Фабрика асинхронных сессий ───────────────────────────────────────────
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,      # Не инвалидировать объекты после коммита
    autoflush=False,             # Явный контроль над flush
)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Асинхронный генератор сессий для Dependency Injection.

    Использование:
        async for session in get_async_session():
            result = await session.execute(query)

    Или в aiogram/FastAPI:
        session = await anext(get_async_session())
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_session_ctx() -> AsyncGenerator[AsyncSession, None]:
    """
    Контекстный менеджер для сессий (удобнее в бизнес-логике).

    Использование:
        async with get_session_ctx() as session:
            result = await session.execute(query)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Единая база: витрина и боты в одном PostgreSQL.
# Алиас сохранён для обратной совместимости (franchise_bot, content_bot).
get_storefront_session_ctx = get_session_ctx


async def init_db() -> None:
    """
    Инициализация базы данных.

    Создаёт все таблицы, определённые через ORM-модели (Base.metadata).
    Основная схема управляется Prisma (prisma db push).
    """
    logger.info("Инициализация базы данных...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("База данных инициализирована успешно.")
    except Exception as e:
        logger.error(f"Ошибка инициализации БД: {e}")
        raise


async def check_db_connection() -> bool:
    """
    Проверка подключения к базе данных.

    Возвращает True если соединение установлено, False при ошибке.
    Используется для health-check эндпоинтов.
    """
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Подключение к БД — ОК")
        return True
    except Exception as e:
        logger.error(f"Ошибка подключения к БД: {e}")
        return False


async def close_db() -> None:
    """
    Закрытие всех соединений с базой данных.

    Вызывается при завершении работы приложения (shutdown).
    """
    logger.info("Закрытие соединений с БД...")
    await engine.dispose()
    logger.info("Соединения с БД закрыты.")

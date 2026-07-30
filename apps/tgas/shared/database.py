"""
Microgreen Uzbekistan — Асинхронное подключение к базе данных
=============================================================
SQLAlchemy 2.0 async с asyncpg драйвером.
Предоставляет движок, фабрику сессий и утилиту инициализации.
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


# ── Движок витрины (рестораны, журнал) ───────────────────────────────────
# На проде витрина — отдельная база microgreen_db, боты — microgreen.
_storefront_engine: AsyncEngine | None = None
_storefront_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def _get_storefront_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Фабрика сессий к базе витрины; движок поднимается при первом обращении.

    Лениво — намеренно. Переменная окружения задана всем ботам одинаково (иначе
    в compose пришлось бы переопределять весь блок `environment` и потерять
    остальные), но читает оттуда один content_bot. Создавай мы движок на
    импорте, каждый из 13 ботов держал бы свой пул к базе витрины — это
    десятки простаивающих соединений при лимите Postgres в 100.
    """
    global _storefront_engine, _storefront_sessionmaker
    if _storefront_sessionmaker is not None:
        return _storefront_sessionmaker

    url = settings.storefront_url
    if url == settings.database_url:
        # База одна (так в разработке) — второй пул не нужен.
        _storefront_engine = engine
        _storefront_sessionmaker = AsyncSessionLocal
    else:
        logger.info("Витрина в отдельной базе — поднимаю отдельный движок")
        _storefront_engine = create_async_engine(
            url,
            echo=False,
            pool_size=5,         # читаем оттуда редко, большой пул ни к чему
            max_overflow=5,
            pool_pre_ping=True,
            pool_recycle=3600,
            connect_args={
                "server_settings": {
                    "application_name": "microgreen_uz_storefront",
                    "jit": "off",
                }
            },
        )
        _storefront_sessionmaker = async_sessionmaker(
            bind=_storefront_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _storefront_sessionmaker


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


@asynccontextmanager
async def get_storefront_session_ctx() -> AsyncGenerator[AsyncSession, None]:
    """Сессия к базе витрины — рестораны, блюда, выпуски журнала.

    Схемой владеет Prisma (`packages/database/prisma/schema.prisma`), пишет туда
    админка. Боты отсюда только читают: у `restaurants` на проде есть двойник в
    CRM-базе с той же схемой, и запрос через обычный `get_session_ctx()` попадал
    в него — админка добавляла ресторан, а бот его не видел.
    """
    async with _get_storefront_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """
    Инициализация базы данных.

    Создаёт все таблицы, определённые через ORM-модели (Base.metadata).
    Для таблиц из init.sql используйте: psql -f database/init.sql
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
    # Движок витрины мог и не подниматься (ленивый) либо оказаться тем же самым.
    if _storefront_engine is not None and _storefront_engine is not engine:
        await _storefront_engine.dispose()
    logger.info("Соединения с БД закрыты.")

"""
Microgreen Uzbekistan — Конфигурация приложения
================================================
Загрузка переменных окружения из .env файла с помощью Pydantic Settings.
Все боты и сервисы используют единый объект настроек.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# brand.py — единственный источник фирменных контактов; он ничего не импортирует
# из проекта, поэтому направление config → brand цикла не создаёт.
from shared.brand import BRAND


class Settings(BaseSettings):
    """
    Главный класс настроек проекта.

    Все значения загружаются из переменных окружения или файла .env
    в корне проекта. Для списков используется запятая как разделитель.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Токены Telegram-ботов ──────────────────────────────────────────
    sales_bot_token: str | None = Field(
        default=None, description="Токен бота продаж (@MicroGreenSalesBot)"
    )
    support_bot_token: str | None = Field(
        default=None, description="Токен бота поддержки (@MicroGreenSupportBot)"
    )
    marketing_bot_token: str | None = Field(
        default=None, description="Токен маркетинг-бота (@MicroGreenMarketingBot)"
    )
    hr_bot_token: str | None = Field(
        default=None, description="Токен HR-бота (@MicroGreenHRBot)"
    )
    finance_bot_token: str | None = Field(
        default=None, description="Токен финансового бота (@MicroGreenFinanceBot)"
    )
    analytics_bot_token: str | None = Field(
        default=None, description="Токен аналитик-бота (@MicroGreenAnalyticsBot)"
    )
    content_bot_token: str | None = Field(
        default=None, description="Токен контент-бота (@MicroGreenContentBot)"
    )
    stepan_bot_token: str | None = Field(
        default=None, description="Токен Степана — личного AI-помощника руководителя"
    )

    # ── База данных ────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/microgreen",
        description="URL подключения к PostgreSQL через asyncpg",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_asyncpg_scheme(cls, v):
        if isinstance(v, str):
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # ── Redis ──────────────────────────────────────────────────────────
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="URL подключения к Redis (кэш, очереди, rate-limit)",
    )

    # ── Публичный адрес витрины ────────────────────────────────────────
    # Нужен для ссылок и кнопок в Telegram: он требует публичный HTTPS.
    # `STOREFRONT_API_URL` для этого не годится — это внутренний адрес сети
    # docker (`http://web:3000/api`), с телефона владельца он не открывается.
    public_web_url: str = Field(
        default="https://microgreenuzbekistan.com",
        description="Публичный HTTPS-адрес витрины — база для ссылок в админку",
    )

    # ── OpenAI (image generation) ───────────────────────────────────────
    openai_api_key: str | None = Field(
        default=None, description="API-ключ OpenAI (для генерации картинок)"
    )
    openai_model: str = Field(
        default="gpt-5.5",
        description="Модель OpenAI (фоллбэк для текста, если Gemini недоступен)",
    )

    # ── Google Gemini (primary LLM) ───────────────────────────────────
    gemini_api_key: str | None = Field(
        default=None, description="API-ключ Google Gemini"
    )
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        description="Модель Gemini для генерации ответов",
    )

    # ── Бюджеты на AI-токены (учёт + алерт; НЕ жёсткий стоп) ───────────
    ai_daily_budget_usd: float = Field(
        default=5.0,
        description="Дневной бюджет на AI-токены (USD). Превышение → алерт админу.",
    )
    ai_monthly_budget_usd: float = Field(
        default=100.0,
        description="Месячный бюджет на AI-токены (USD). Превышение → алерт админу.",
    )
    usd_uzs_rate: float = Field(
        default=12600.0,
        description="Курс USD→UZS для записи стоимости AI-токенов в P&L (finances, в сумах).",
    )

    # ── Секрет авторизации event-bus (bot→bot /event) ─────────────────
    event_bus_secret: str | None = Field(
        default=None,
        description="Общий секрет для аутентификации событий между ботами (заголовок X-Bot-Secret)",
    )

    # ── Администраторы и Каналы ───────────────────────────────────────
    admin_telegram_ids: List[int] = Field(
        default_factory=list,
        description="Список Telegram ID администраторов (через запятую в .env)",
    )
    telegram_channel_id: str | None = Field(
        default=None,
        description="ID Telegram канала для автопостинга (например, @microgreen_uz)",
    )

    @field_validator("admin_telegram_ids", mode="before")
    @classmethod
    def parse_admin_ids(cls, v):
        """Парсинг строки с ID администраторов из .env (через запятую)."""
        if isinstance(v, str):
            if not v.strip():
                return []
            return [int(x.strip()) for x in v.split(",") if x.strip()]
        if isinstance(v, int):
            return [v]
        return v

    # ── Контактные данные компании ─────────────────────────────────────
    company_name: str = Field(
        default="Microgreen Uzbekistan",
        description="Название компании",
    )
    # Default берём из brand.py — там единственный источник фирменных контактов.
    # Раньше здесь стояла заглушка «+998 91 123 45 67», и она же была вписана
    # строкой в промпт продаж, промпт сторис и подвал PDF: бот, сторис и
    # коммерческие предложения называли клиенту несуществующий номер.
    # .env по-прежнему перекрывает значение.
    company_phone: str = Field(
        default=BRAND["phone"],
        description="Основной телефон компании (по умолчанию — из shared/brand.py)",
    )
    free_delivery_threshold: int = Field(
        default=500_000,
        description="Порог бесплатной доставки в UZS",
    )

    # ── Платежные системы ──────────────────────────────────────────────
    # click_merchant_id / payme_merchant_id удалены вместе с генерацией ссылок
    # на онлайн-оплату в sales_bot. У них стояли defaults «12345» и
    # «1234567890», в .env их никто не задавал — и клиент получал кликабельную
    # кнопку «Оплатить», которая никуда не ведёт. Онлайн-оплата не используется:
    # наличные, карта, банковский перевод.
    # Если Click/Payme понадобятся — добавлять БЕЗ defaults, чтобы отсутствие
    # настройки было видно сразу, а не подменялось выдуманным ID.

    @field_validator("free_delivery_threshold", mode="before")
    @classmethod
    def parse_free_delivery_threshold(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return 500_000
            return int(v)
        if v is None:
            return 500_000
        return v

    # ── Instagram Graph API ───────────────────────────────────────────
    instagram_account_id: str = Field(
        default="",
        description="ID Instagram бизнес-аккаунта для публикации контента",
    )
    instagram_access_token: str = Field(
        default="",
        description="Access Token для Instagram Graph API",
    )
    facebook_page_id: str = Field(
        default="",
        description="ID Facebook-страницы, привязанной к Instagram",
    )
    facebook_app_id: str = Field(
        default="",
        description="ID приложения Facebook для обновления токенов",
    )
    facebook_app_secret: str = Field(
        default="",
        description="Секрет приложения Facebook для обновления токенов",
    )

    # ── Telegram группы ───────────────────────────────────────────────
    sales_group_id: int = Field(
        default=0,
        description="ID Telegram группы 'Продажа' для уведомлений о заказах",
    )

    # ── Лид-генерация (сбор ресторанов) ───────────────────────────────
    dgis_api_key: str = Field(
        default="",
        description="API-ключ 2ГИС для поиска ресторанов (Catalog API)",
    )
    google_places_api_key: str = Field(
        default="",
        description="API-ключ Google Places для поиска ресторанов",
    )
    yandex_maps_api_key: str = Field(
        default="",
        description="API-ключ Yandex Maps (Search API) для поиска ресторанов",
    )
    b2b_daily_limit: int = Field(
        default=8,
        description="Сколько холодных B2B-контактов делать в день (1 AI-вызов на лид)",
    )
    lead_gen_city: str = Field(
        default="Самарканд",
        description="Город для поиска ресторанов при сборе лидов",
    )

    # ── Совещание отделов (multi-agent «круглый стол») ────────────────
    meeting_rounds: int = Field(
        default=1,  # 1 раунд — экономия AI-вызовов (было 2 с дебатами)
        description="Сколько раундов обсуждения на совещании (1 — только позиции, 2+ — с дебатами)",
    )
    meeting_min_participants: int = Field(
        default=2,
        description="Минимум отделов на совещании",
    )
    meeting_max_participants: int = Field(
        default=3,  # 3 вместо 5 — совещание дешевле по AI-вызовам
        description="Максимум отделов на совещании",
    )
    meeting_departments: str = Field(
        default="",
        description="Список ключей отделов через запятую (пул для совещаний). Пусто = все доступные",
    )
    meeting_max_vote_rounds: int = Field(
        default=3,
        description="Сколько раз переголосовать с новой дискуссией, если решение не набрало большинства",
    )

    # ── KPI-watchdog (авто-разбор при падении показателей) ─────────────
    kpi_watchdog_enabled: bool = Field(
        default=True,
        description="Включить авто-мониторинг KPI: при падении собирать отделы на разбор",
    )
    kpi_watchdog_drop_pct: int = Field(
        default=20,
        description="Порог падения показателя (%) неделя-к-неделе для срабатывания",
    )
    kpi_watchdog_hour: int = Field(
        default=11,
        description="Час (по времени UZT+5) ежедневной проверки KPI",
    )
    kpi_watchdog_autoexecute: bool = Field(
        default=False,
        description="Сразу запускать план (True) или ждать «делайте» от руководителя (False)",
    )

    # ── Instagram: авто-ответ на комментарии ──────────────────────────
    ig_comments_autoreply_enabled: bool = Field(
        default=True,
        description="Автоматически отвечать на комментарии-вопросы под постами Instagram",
    )

    @property
    def sync_database_url(self) -> str:
        """URL для синхронного подключения (миграции, скрипты)."""
        return self.database_url.replace("+asyncpg", "")


@lru_cache()
def get_settings() -> Settings:
    """
    Фабрика настроек с кэшированием.

    Возвращает синглтон-экземпляр Settings. При первом вызове
    загружаются все переменные окружения из .env файла.
    """
    return Settings()


# Глобальный объект настроек — импортируется всеми модулями
settings = get_settings()

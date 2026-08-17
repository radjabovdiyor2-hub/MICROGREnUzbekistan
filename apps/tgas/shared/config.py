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

    # ── OpenAI — ЕДИНСТВЕННЫЙ движок текста, зрения, речи и картинок ────
    #
    # Запасного поставщика нет: раньше пустой ключ не выключал ИИ, а молча
    # переводил офис на Gemini Flash, и месяцы работы на слабой модели
    # выглядели как «бот тупой». Теперь отказ — это отказ, о нём приходит
    # сигнал владельцу (`shared/ai_engine._notify_ai_failure`).
    openai_api_key: str | None = Field(
        default=None,
        description="API-ключ OpenAI. Пусто = ИИ не работает совсем",
    )
    openai_model: str = Field(
        # Флагман OpenAI: reasoning_effort до `max`, окно 1,05 млн токенов.
        # Офис — один владелец и десятки сообщений в день, поэтому здесь
        # уместна самая умная модель, а не самая дешёвая. Дешёвые варианты
        # того же семейства (`gpt-5.6-terra`, `gpt-5.6-luna`) задаются через
        # OPENAI_MODEL, если расход окажется выше ожидаемого.
        default="gpt-5.6-sol",
        description="Модель OpenAI. Единственный источник — эта настройка",
    )

    @field_validator("openai_model", mode="before")
    @classmethod
    def model_default_on_empty(cls, v, info):
        """Пустая строка в .env — это «возьми значение по умолчанию».

        `OPENAI_MODEL=` в окружении перебивает дефолт пустой строкой, а дальше
        `mg_ai` подставляет свой резервный `gpt-4o-mini`. Так и получилось три
        разных ответа на вопрос «какая у нас модель»: конфиг, compose и
        .env.example расходились между собой.
        """
        if v is None or (isinstance(v, str) and not v.strip()):
            field = cls.model_fields[info.field_name]
            return field.default
        return v

    # ── Бюджеты на AI-токены (учёт + алерт; НЕ жёсткий стоп) ───────────
    #
    # Это ПОРОГ ОПОВЕЩЕНИЯ, а не лимит расхода: превышение шлёт владельцу
    # сигнал, ничего не отключая. Поэтому порог, который срабатывает каждый
    # день, бесполезен — его перестают читать ровно так же, как перестали
    # читать повторяющиеся сводки (см. shared/alert_once.py).
    #
    # Прежние 5/100 считались под `gpt-4o-mini` ($0.15/$0.60 за 1M). На
    # флагмане `gpt-5.6-sol` ($5/$30) та же работа стоит иначе:
    #   · сообщение владельцу ≈ 10k входа + 1,5k выхода ≈ $0.10;
    #   · ответ клиенту       ≈ 2k входа + 0,4k выхода ≈ $0.02.
    # Активный день (≈50 распоряжений + ≈200 клиентских сообщений + сводки и
    # совещания по расписанию) укладывается в $10–20. Порог берём с запасом:
    # он должен значить «что-то идёт не так», а не «мы сегодня работали».
    #
    # ⚠️ Это оценка, а не замер. Через неделю сверьтесь с разделом «Расходы на
    # ИИ» в админке и поправьте — там настоящие цифры по ботам и моделям.
    ai_daily_budget_usd: float = Field(
        default=25.0,
        description="Дневной порог расхода на ИИ (USD). Превышение → алерт админу.",
    )
    ai_monthly_budget_usd: float = Field(
        default=500.0,
        description="Месячный порог расхода на ИИ (USD). Превышение → алерт админу.",
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

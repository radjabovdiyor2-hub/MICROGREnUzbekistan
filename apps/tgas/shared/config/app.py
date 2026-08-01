import typing
from typing import List
from pydantic import Field, BaseModel, field_validator
from shared.brand import BRAND

class AppConfig(BaseModel):
    event_bus_secret: str | None = Field(default=None, description="Общий секрет для аутентификации событий между ботами (заголовок X-Bot-Secret)")
    admin_telegram_ids: List[int] = Field(default_factory=list, description="Список Telegram ID администраторов (через запятую в .env)")
    telegram_channel_id: str | None = Field(default=None, description="ID Telegram канала для автопостинга (например, @microgreen_uz)")

    @field_validator("admin_telegram_ids", mode="before")
    @classmethod
    def parse_admin_ids(cls: typing.dict, v: str) -> dict:
        if isinstance(v, str):
            if not v.strip():
                return []
            return [int(x.strip()) for x in v.split(",") if x.strip()]
        if isinstance(v, int):
            return [v]
        return v

    company_name: str = Field(default="Microgreen Uzbekistan", description="Название компании")
    company_phone: str = Field(default=BRAND["phone"], description="Основной телефон компании (по умолчанию — из shared/brand.py)")
    free_delivery_threshold: int = Field(default=500_000, description="Порог бесплатной доставки в UZS")

    @field_validator("free_delivery_threshold", mode="before")
    @classmethod
    def parse_free_delivery_threshold(cls: typing.dict, v: str) -> dict:
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return 500_000
            return int(v)
        if v is None:
            return 500_000
        return v

    sales_group_id: int = Field(default=0, description="ID Telegram группы 'Продажа' для уведомлений о заказах")

class MeetingConfig(BaseModel):
    meeting_rounds: int = Field(default=1, description="Сколько раундов обсуждения на совещании (1 — только позиции, 2+ — с дебатами)")
    meeting_min_participants: int = Field(default=2, description="Минимум отделов на совещании")
    meeting_max_participants: int = Field(default=3, description="Максимум отделов на совещании")
    meeting_departments: str = Field(default="", description="Список ключей отделов через запятую (пул для совещаний). Пусто = все доступные")
    meeting_max_vote_rounds: int = Field(default=3, description="Сколько раз переголосовать с новой дискуссией, если решение не набрало большинства")

class KPIConfig(BaseModel):
    kpi_watchdog_enabled: bool = Field(default=True, description="Включить авто-мониторинг KPI: при падении собирать отделы на разбор")
    kpi_watchdog_drop_pct: int = Field(default=20, description="Порог падения показателя (%) неделя-к-неделе для срабатывания")
    kpi_watchdog_hour: int = Field(default=11, description="Час (по времени UZT+5) ежедневной проверки KPI")
    kpi_watchdog_autoexecute: bool = Field(default=False, description="Сразу запускать план (True) или ждать «делайте» от руководителя (False)")

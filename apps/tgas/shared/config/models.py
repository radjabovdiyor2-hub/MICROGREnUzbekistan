from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from shared.config.bots import BotsConfig, AIConfig
from shared.config.integrations import DatabaseConfig, RedisConfig, InstagramConfig, LeadGenConfig
from shared.config.app import AppConfig, MeetingConfig, KPIConfig

class Settings(
    BaseSettings,
    BotsConfig,
    AIConfig,
    DatabaseConfig,
    RedisConfig,
    InstagramConfig,
    LeadGenConfig,
    AppConfig,
    MeetingConfig,
    KPIConfig,
):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

@lru_cache()
def get_settings() -> Settings:
    return Settings()

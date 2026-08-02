from pydantic import Field, BaseModel, field_validator

class DatabaseConfig(BaseModel):
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/microgreen",
        description="URL подключения к PostgreSQL через asyncpg",
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_asyncpg_scheme(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "")

class RedisConfig(BaseModel):
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="URL подключения к Redis (кэш, очереди, rate-limit)",
    )

class InstagramConfig(BaseModel):
    instagram_account_id: str = Field(default="", description="ID Instagram бизнес-аккаунта для публикации контента")
    instagram_access_token: str = Field(default="", description="Access Token для Instagram Graph API")
    facebook_page_id: str = Field(default="", description="ID Facebook-страницы, привязанной к Instagram")
    facebook_app_id: str = Field(default="", description="ID приложения Facebook для обновления токенов")
    facebook_app_secret: str = Field(default="", description="Секрет приложения Facebook для обновления токенов")
    ig_comments_autoreply_enabled: bool = Field(default=True, description="Автоматически отвечать на комментарии-вопросы под постами Instagram")

class LeadGenConfig(BaseModel):
    dgis_api_key: str = Field(default="", description="API-ключ 2ГИС для поиска ресторанов (Catalog API)")
    google_places_api_key: str = Field(default="", description="API-ключ Google Places для поиска ресторанов")
    yandex_maps_api_key: str = Field(default="", description="API-ключ Yandex Maps (Search API) для поиска ресторанов")
    b2b_daily_limit: int = Field(default=8, description="Сколько холодных B2B-контактов делать в день (1 AI-вызов на лид)")
    lead_gen_city: str = Field(default="Самарканд", description="Город для поиска ресторанов при сборе лидов")

from pydantic import Field, BaseModel

class BotsConfig(BaseModel):
    sales_bot_token: str | None = Field(default=None, description="Токен бота продаж (@MicroGreenSalesBot)")
    support_bot_token: str | None = Field(default=None, description="Токен бота поддержки (@MicroGreenSupportBot)")
    marketing_bot_token: str | None = Field(default=None, description="Токен маркетинг-бота (@MicroGreenMarketingBot)")
    hr_bot_token: str | None = Field(default=None, description="Токен HR-бота (@MicroGreenHRBot)")
    finance_bot_token: str | None = Field(default=None, description="Токен финансового бота (@MicroGreenFinanceBot)")
    analytics_bot_token: str | None = Field(default=None, description="Токен аналитик-бота (@MicroGreenAnalyticsBot)")
    content_bot_token: str | None = Field(default=None, description="Токен контент-бота (@MicroGreenContentBot)")
    stepan_bot_token: str | None = Field(default=None, description="Токен Степана — личного AI-помощника руководителя")

class AIConfig(BaseModel):
    openai_api_key: str | None = Field(default=None, description="API-ключ OpenAI (для генерации картинок)")
    openai_model: str = Field(default="gpt-5.5", description="Модель OpenAI (фоллбэк для текста, если Gemini недоступен)")
    gemini_api_key: str | None = Field(default=None, description="API-ключ Google Gemini")
    gemini_model: str = Field(default="gemini-2.5-flash", description="Модель Gemini для генерации ответов")
    ai_daily_budget_usd: float = Field(default=5.0, description="Дневной бюджет на AI-токены (USD). Превышение → алерт админу.")
    ai_monthly_budget_usd: float = Field(default=100.0, description="Месячный бюджет на AI-токены (USD). Превышение → алерт админу.")
    usd_uzs_rate: float = Field(default=12600.0, description="Курс USD→UZS для записи стоимости AI-токенов в P&L (finances, в сумах).")

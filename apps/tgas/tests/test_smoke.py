import sys
import os
import pytest

# Добавляем путь для корректного импорта из корня apps/tgas
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def test_settings_load():
    """Проверка загрузки настроек из .env."""
    from shared.config import settings
    assert settings.company_name == "Microgreen Uzbekistan"
    assert settings.redis_url is not None
    assert hasattr(settings, "openai_api_key")

def test_shared_imports():
    """Проверка импортируемости общих библиотек."""
    import shared.brand as brand
    import shared.content_plan as content_plan
    import shared.trends as trends
    import shared.event_bus as event_bus
    
    assert brand.BRAND["name"] == "Microgreen Uzbekistan"
    assert len(content_plan.CONTENT_PILLARS) > 0

def test_event_bus_handlers():
    """Проверка работы регистрации обработчиков в шине событий."""
    from shared.event_bus import EventBus
    eb = EventBus()
    
    # Регистрация
    dummy_called = False
    async def dummy_handler(payload):
        nonlocal dummy_called
        dummy_called = True
        
    eb.on("test_event", dummy_handler)
    
    # Нормализация регистра
    assert "TEST_EVENT" in eb._handlers
    assert eb._handlers["TEST_EVENT"][0] == dummy_handler

def test_bot_imports():
    """Динамический импорт всех ботов экосистемы для проверки синтаксиса и NameError."""
    bots_to_test = [
        "stepan_bot",
        "sales_bot",
        "support_bot",
        "hr_bot",
        "finance_bot",
        "marketing_bot",
        "analytics_bot",
        "content_bot",
        "qa_bot",
        "rnd_bot",
        "devops_bot",
        "franchise_bot",
        "n8n_bridge",
    ]
    
    for bot_name in bots_to_test:
        module_name = f"bots.{bot_name}.main"
        try:
            __import__(module_name)
        except Exception as e:
            pytest.fail(f"Не удалось импортировать {module_name}. Ошибка: {e}")

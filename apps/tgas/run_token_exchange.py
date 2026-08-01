"""
Microgreen Uzbekistan — Одноразовый обмен токена Instagram
=========================================================
Запустите этот скрипт, чтобы обменять текущий токен на долгосрочный.

Выполняет:
1. Обмен текущего токена на долгосрочный user-токен (60 дней)
2. Получение Page-токена из долгосрочного user-токена
3. Сохранение нового токена в .env

Требования:
  - FACEBOOK_APP_ID и FACEBOOK_APP_SECRET установлены в .env
  - INSTAGRAM_ACCESS_TOKEN содержит действующий токен
  - python-dotenv установлен (pip install python-dotenv)

Использование:
    python run_token_exchange.py
"""

import asyncio
import logging
import sys
import os

# Настройка логирования для вывода в консоль
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# Добавляем корень проекта в sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


async def main() -> None:
    from shared.token_refresh import full_token_exchange, debug_token
    from shared.config import settings

    print("=" * 60)
    print("🔄 Instagram Token Exchange — Microgreen Uzbekistan")
    print("=" * 60)
    print()

    # Проверяем credentials
    app_id = getattr(settings, "facebook_app_id", "")
    app_secret = getattr(settings, "facebook_app_secret", "")
    current_token = getattr(settings, "instagram_access_token", "")
    page_id = getattr(settings, "facebook_page_id", "")

    print(f"  FACEBOOK_APP_ID:     {app_id or '❌ НЕ УСТАНОВЛЕН'}")
    print(
        f"  FACEBOOK_APP_SECRET: {'✅ установлен' if app_secret else '❌ НЕ УСТАНОВЛЕН'}"
    )
    print(f"  FACEBOOK_PAGE_ID:    {page_id or '❌ НЕ УСТАНОВЛЕН'}")
    print(
        f"  Current token:       {current_token[:30]}..."
        if current_token
        else "  Current token:       ❌ НЕ УСТАНОВЛЕН"
    )
    print()

    if not app_id or not app_secret:
        print("❌ FACEBOOK_APP_ID и FACEBOOK_APP_SECRET должны быть в .env!")
        print("   Запустите: python setup_fb_credentials.py")
        sys.exit(1)

    if not current_token:
        print("❌ INSTAGRAM_ACCESS_TOKEN не установлен в .env!")
        sys.exit(1)

    # Отладка текущего токена
    print("🔍 Проверка текущего токена...")
    debug_info = await debug_token(current_token)
    if debug_info:
        is_valid = debug_info.get("is_valid", False)
        token_type = debug_info.get("type", "unknown")
        days_left = debug_info.get("_days_left", "?")
        print(f"   Valid: {is_valid}")
        print(f"   Type: {token_type}")
        print(f"   Days left: {days_left}")
        print()

        if not is_valid:
            print("❌ Текущий токен недействителен!")
            print("   Необходимо получить новый токен через Facebook Login.")
            sys.exit(1)
    print()

    # Запускаем полный обмен
    print("🔄 Запуск полного обмена токенов...")
    print("-" * 40)
    result = await full_token_exchange(current_token)
    print("-" * 40)
    print()

    if result["success"]:
        print("=" * 60)
        print("✅ УСПЕШНО! Токен обновлён.")
        print("=" * 60)
        if result.get("user_token"):
            print(f"  User token:  {result['user_token'][:30]}...")
        if result.get("page_token"):
            print(f"  Page token:  {result['page_token'][:30]}...")
        print()
        print("  Токен сохранён в .env и будет автоматически обновляться")
        print("  каждую неделю через scheduler в stepan_bot.")
    else:
        print("=" * 60)
        print("❌ ОШИБКА обмена токена. Проверьте логи выше.")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

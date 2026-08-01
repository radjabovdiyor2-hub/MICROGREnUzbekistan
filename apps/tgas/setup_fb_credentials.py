"""
Microgreen Uzbekistan — Настройка Facebook App Credentials
==========================================================
Запустите этот скрипт, чтобы установить FACEBOOK_APP_ID
и FACEBOOK_APP_SECRET в .env файле.

Использование:
    python setup_fb_credentials.py
    python setup_fb_credentials.py --app-id 123 --app-secret abc123
"""

import argparse
import os
import sys
from pathlib import Path

ENV_PATH = str(Path(__file__).resolve().parent / ".env")


def main():
    parser = argparse.ArgumentParser(
        description="Установить Facebook App ID и App Secret в .env"
    )
    parser.add_argument("--app-id", help="Facebook App ID")
    parser.add_argument("--app-secret", help="Facebook App Secret")
    args = parser.parse_args()

    # Проверяем наличие dotenv
    try:
        from dotenv import set_key, get_key
    except ImportError:
        print("❌ python-dotenv не установлен.")
        print("   Установите: pip install python-dotenv")
        sys.exit(1)

    if not os.path.isfile(ENV_PATH):
        print(f"❌ .env файл не найден: {ENV_PATH}")
        sys.exit(1)

    print("=" * 50)
    print("🔐 Настройка Facebook App Credentials")
    print("=" * 50)
    print()

    # Показать текущие значения
    current_id = get_key(ENV_PATH, "FACEBOOK_APP_ID") or ""
    current_secret = get_key(ENV_PATH, "FACEBOOK_APP_SECRET") or ""

    if current_id:
        print(f"  Текущий FACEBOOK_APP_ID: {current_id}")
    if current_secret:
        print(f"  Текущий FACEBOOK_APP_SECRET: {current_secret[:8]}...")
    print()

    # Получить App ID
    app_id = args.app_id
    if not app_id:
        app_id = input(f"Введите FACEBOOK_APP_ID [{current_id or 'пусто'}]: ").strip()
        if not app_id:
            app_id = current_id

    # Получить App Secret
    app_secret = args.app_secret
    if not app_secret:
        app_secret = input(
            f"Введите FACEBOOK_APP_SECRET [{current_secret[:8] + '...' if current_secret else 'пусто'}]: "
        ).strip()
        if not app_secret:
            app_secret = current_secret

    if not app_id or not app_secret:
        print("❌ App ID и App Secret обязательны.")
        print()
        print("Где найти:")
        print("  1. Перейдите на https://developers.facebook.com/apps/")
        print("  2. Выберите ваше приложение")
        print("  3. Settings → Basic")
        print("  4. App ID и App Secret находятся вверху страницы")
        sys.exit(1)

    # Сохранить
    set_key(ENV_PATH, "FACEBOOK_APP_ID", app_id)
    set_key(ENV_PATH, "FACEBOOK_APP_SECRET", app_secret)

    print()
    print("✅ Credentials сохранены в .env!")
    print(f"   FACEBOOK_APP_ID={app_id}")
    print(f"   FACEBOOK_APP_SECRET={app_secret[:8]}...")
    print()
    print("Теперь можете запустить обмен токена:")
    print("   python run_token_exchange.py")


if __name__ == "__main__":
    main()

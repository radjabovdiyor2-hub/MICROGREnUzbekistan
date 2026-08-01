import asyncio
import sys
import os

# Добавляем корневую папку проекта в sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from shared.database import get_session_ctx


async def seed_products() -> None:
    print("Очищаем старые товары и загружаем реальный прайс-лист...")
    products_data = [
        # Салаты и зелень (кг)
        {
            "name_uz": "Shpinat",
            "name_ru": "Шпинат",
            "category": "salads",
            "price": 150000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Lollo Rossa",
            "name_ru": "Лолло Росса",
            "category": "salads",
            "price": 130000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Aysberg",
            "name_ru": "Айсберг",
            "category": "salads",
            "price": 55000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Yalpiz",
            "name_ru": "Мята",
            "category": "salads",
            "price": 95000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Rukkola",
            "name_ru": "Руккола",
            "category": "salads",
            "price": 150000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Rayhon",
            "name_ru": "Базилик",
            "category": "salads",
            "price": 150000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Salat bargi",
            "name_ru": "Салатный лист",
            "category": "salads",
            "price": 100000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Selderey",
            "name_ru": "Сельдерей",
            "category": "salads",
            "price": 100000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Romano bol",
            "name_ru": "Романо бол",
            "category": "salads",
            "price": 110000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Romano mol",
            "name_ru": "Романо мол",
            "category": "salads",
            "price": 200000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Frezze",
            "name_ru": "Фреззе",
            "category": "salads",
            "price": 200000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Latuk",
            "name_ru": "Латук",
            "category": "salads",
            "price": 200000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Pak choy",
            "name_ru": "Пак чой",
            "category": "salads",
            "price": 140000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Ukrop",
            "name_ru": "Укроп",
            "category": "salads",
            "price": 50000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Kinza",
            "name_ru": "Кинза",
            "category": "salads",
            "price": 50000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Rozmarin",
            "name_ru": "Розмарин",
            "category": "salads",
            "price": 130000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Pomidor cherri (qizil)",
            "name_ru": "Помидоры черри (красн)",
            "category": "salads",
            "price": 110000,
            "unit": "kg",
            "stock_qty": 50,
        },
        {
            "name_uz": "Pomidor cherri (sariq)",
            "name_ru": "Помидоры черри (жел)",
            "category": "salads",
            "price": 180000,
            "unit": "kg",
            "stock_qty": 50,
        },
        # Микрозелень (упаковка) - все по 18 тыс
        {
            "name_uz": "Mikroko'kat no'xat",
            "name_ru": "Микрозелень Горошек",
            "category": "microgreens",
            "price": 18000,
            "unit": "pack",
            "stock_qty": 100,
        },
        {
            "name_uz": "Mikroko'kat rukkola",
            "name_ru": "Микрозелень Руккола",
            "category": "microgreens",
            "price": 18000,
            "unit": "pack",
            "stock_qty": 100,
        },
        {
            "name_uz": "Mikroko'kat rediska",
            "name_ru": "Микрозелень Редис",
            "category": "microgreens",
            "price": 18000,
            "unit": "pack",
            "stock_qty": 100,
        },
        {
            "name_uz": "Mikroko'kat kungaboqar",
            "name_ru": "Микрозелень Подсолнечник",
            "category": "microgreens",
            "price": 18000,
            "unit": "pack",
            "stock_qty": 100,
        },
        {
            "name_uz": "Mikroko'kat xantal",
            "name_ru": "Микрозелень Горчица",
            "category": "microgreens",
            "price": 18000,
            "unit": "pack",
            "stock_qty": 100,
        },
    ]

    async with get_session_ctx() as session:
        # Удаляем старые тестовые товары
        await session.execute(text("TRUNCATE TABLE products CASCADE"))

        for p in products_data:
            query = text("""
                INSERT INTO products (name_uz, name_ru, category, price, unit, stock_qty)
                VALUES (:name_uz, :name_ru, :category, :price, :unit, :stock_qty)
            """)
            await session.execute(query, p)

        print("Реальные товары успешно загружены в базу!")


async def main() -> None:
    await seed_products()


if __name__ == "__main__":
    asyncio.run(main())

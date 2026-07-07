"""
CLI: сбор ресторанов в лид-базу (customers).

Примеры:
    # Из 2ГИС (нужен DGIS_API_KEY в .env)
    python -m scripts.collect_restaurants --source 2gis --limit 60

    # Из ручного CSV (company_name,phone,email,address,review_score,review_summary)
    python -m scripts.collect_restaurants --source manual --file restaurants.csv
"""

import argparse
import asyncio
import logging
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.lead_gen import collect_from_2gis, parse_manual_csv, import_leads  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [collect] %(levelname)s: %(message)s")


async def main():
    parser = argparse.ArgumentParser(description="Сбор ресторанов в лид-базу")
    parser.add_argument("--source", choices=["2gis", "manual"], required=True)
    parser.add_argument("--limit", type=int, default=50, help="Макс. заведений (для 2gis)")
    parser.add_argument("--query", default="рестораны", help="Поисковый запрос (для 2gis)")
    parser.add_argument("--file", help="Путь к CSV (для manual)")
    args = parser.parse_args()

    if args.source == "2gis":
        leads = await collect_from_2gis(query=args.query, limit=args.limit)
    else:
        if not args.file:
            parser.error("--file обязателен для --source manual")
        leads = parse_manual_csv(args.file)

    if not leads:
        print("Ничего не собрано (проверьте ключ/файл).")
        return

    result = await import_leads(leads)
    print(f"✅ Готово: +{result['inserted']} новых лидов, {result['skipped']} пропущено (дубли).")


if __name__ == "__main__":
    asyncio.run(main())

"""
CLI: сбор заведений в лид-базу (customers).

Примеры:
    # Весь справочник Самаркандской области: 18 категорий × 15 населённых
    # пунктов × три провайдера. Нужны ключи в .env.
    # (Категорий в COMPANY_TYPES девятнадцать, но «прочее» не ищется:
    #  поискового запроса к «прочему» не существует.)
    python -m scripts.collect_restaurants --source api --all-categories --all-places

    # Только тойхоны и фитнес по Ургуту
    python -m scripts.collect_restaurants --source api \
        --category toyxona --category fitness --place Urgut

    # Собрать, но в базу не писать — посмотреть выгрузку глазами
    python -m scripts.collect_restaurants --source api --all-categories \
        --all-places --out ../../content/venues-samarkand.json

    # Из ручного CSV (колонки — CSV_FIELDS в shared/lead_gen.py)
    python -m scripts.collect_restaurants --source manual --file venues.csv

`--source 2gis` оставлен синонимом `api` ради старых вызовов: сбор всё равно
идёт со всех настроенных провайдеров, а провайдер без ключа просто молчит.
"""

import argparse
import asyncio
import json
import logging
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.lead_gen import (  # noqa: E402
    SAMARKAND_PLACES,
    VENUE_QUERIES,
    collect_venues,
    import_leads,
    parse_manual_csv,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [collect] %(levelname)s: %(message)s"
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Сбор заведений в лид-базу")
    parser.add_argument("--source", choices=["api", "2gis", "manual"], default="api")
    parser.add_argument(
        "--limit", type=int, default=200, help="Макс. заведений на один запрос"
    )
    parser.add_argument(
        "--category",
        action="append",
        choices=sorted(VENUE_QUERIES),
        help="Категория заведений; можно повторять. По умолчанию — restaurant",
    )
    parser.add_argument(
        "--all-categories",
        action="store_true",
        help=f"Все {len(VENUE_QUERIES)} категорий сразу",
    )
    parser.add_argument(
        "--place",
        action="append",
        help="Населённый пункт; можно повторять. По умолчанию — город из настроек",
    )
    parser.add_argument(
        "--all-places",
        action="store_true",
        help=f"Все {len(SAMARKAND_PLACES)} населённых пунктов Самаркандской области",
    )
    parser.add_argument("--file", help="Путь к CSV (для --source manual)")
    parser.add_argument(
        "--out",
        help="Записать выгрузку в JSON и НЕ трогать базу. "
        "Так собранное можно посмотреть до того, как оно станет лидами",
    )
    return parser


async def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.source == "manual":
        if not args.file:
            parser.error("--file обязателен для --source manual")
        # Категория из аргумента — значение по умолчанию для строк, где
        # колонка company_type пустая.
        default_type = (args.category or ["restaurant"])[0]
        leads = parse_manual_csv(args.file, company_type=default_type)
    else:
        categories = list(VENUE_QUERIES) if args.all_categories else args.category
        if args.all_places:
            places = SAMARKAND_PLACES
        elif args.place:
            # Район у произвольного пункта не угадываем: его проставит
            # геокодер по адресу. Ложный район тише ложной координаты и
            # потому опаснее — неверный пин видно на карте сразу.
            places = [(name, None) for name in args.place]
        else:
            places = None
        leads = await collect_venues(
            categories=categories, places=places, limit_per_query=args.limit
        )

    if not leads:
        print("Ничего не собрано (проверьте ключи/файл).")
        return

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(leads, f, ensure_ascii=False, indent=2)
        print(f"📄 Записано {len(leads)} карточек в {args.out}. База не тронута.")
        return

    result = await import_leads(leads)
    print(
        f"✅ Готово: +{result['inserted']} новых лидов, "
        f"{result['skipped']} пропущено (дубли)."
    )


if __name__ == "__main__":
    asyncio.run(main())

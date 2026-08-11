"""
📚 CATALOG REPO — единственная дверь офиса к каталогу
=====================================================
Каталог-мастер живёт на витрине: таблица `products` (Prisma, cuid-ключи), рядом
`categories`. Офисное зеркало `crm_products` нужно только там, где на товар
ссылаются CRM-строки (`crm_order_items.product_id` — целочисленный FK).

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

`unify_databases.sql` переименовал офисные таблицы (`products → crm_products`),
отдав имя `products` витрине. Код офиса это переименование не заметил и
продолжал спрашивать у витринной таблицы офисные колонки:

    SELECT id, name_ru, price, unit FROM products ORDER BY sort_order

У витрины нет ни `unit`, ни `sort_order` — запрос падал с UndefinedColumn,
ошибка гасилась внешним `except`, и регистрация продажи молча отвечала
«не смог записать продажу в БД». Прайс-лист по той же причине приходил пустым,
и модель дописывала цены сама.

Поэтому обращение к каталогу собрано здесь, в одном месте, с колонками витрины.
Новый запрос к товарам — сюда, не в бота.

СООТВЕТСТВИЕ КОЛОНОК

    витрина (products)         офис (crm_products)
    id           cuid/text     id            serial
    name_ru      text          name_ru       varchar
    name_uz      text          name_uz       varchar
    price        integer       price         numeric(12,2)
    stock        integer       stock_qty     numeric(10,2)
    category_id  cuid → categories.slug      category      varchar
    —                          unit          varchar
    —                          storefront_id ← products.id

Единиц измерения у витрины нет: `unit` подтягивается из зеркала по
`storefront_id`, а без зеркальной строки честно отдаётся `piece`.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import String, bindparam, text

from sqlalchemy.dialects.postgresql import ARRAY

from shared.database import get_session_ctx
from shared.text_match import normal_forms, query_variants
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Порог нечёткого совпадения (pg_trgm). Ниже — уже случайные созвучия.
FUZZY_THRESHOLD = 0.45

DEFAULT_UNIT = "piece"

# Витрина отдаёт товар одним и тем же набором полей во всех функциях модуля,
# чтобы вызывающему не приходилось помнить, какая выборка что вернула.
#
# Единица измерения берётся из САМОГО товара (`p.unit`). Раньше её тянули
# подзапросом из офисного зеркала `crm_products` по `storefront_id`, а без
# зеркальной строки честно отдавали `piece` — и это было единственной причиной,
# по которой прайс ботов вообще упоминал единицы. Теперь она есть на витрине:
# микрозелень продаётся за лоток, бейби-лист за 100 г, салаты за килограмм,
# и «Фризе 200 000 сум» без единицы читается как цена за кочан.
_FIELDS = (
    "p.id, p.name_ru, p.name_uz, p.price, p.stock, "
    "c.slug AS category_slug, p.is_active, "
    "COALESCE(NULLIF(p.unit, ''), :default_unit) AS unit, "
    "p.description_ru, p.description_uz"
)
_FROM = "FROM products p LEFT JOIN categories c ON c.id = p.category_id "
_SELECT = f"SELECT {_FIELDS} {_FROM}"


def _row(row) -> Dict[str, Any]:
    """Строка выборки → словарь товара. Единственное место разбора."""
    return {
        "id": row[0],
        "name": row[1] or row[2] or "Товар",
        "name_ru": row[1],
        "name_uz": row[2],
        "price": float(row[3] or 0),
        "stock": float(row[4] or 0),
        "category_slug": row[5],
        "is_active": bool(row[6]),
        "unit": row[7] or DEFAULT_UNIT,
        "description_ru": row[8],
        "description_uz": row[9],
    }


async def by_id(product_id: str) -> Optional[Dict[str, Any]]:
    """Товар по cuid витрины. None — если товара нет."""
    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(_SELECT + "WHERE p.id = :pid"),
                {"pid": str(product_id), "default_unit": DEFAULT_UNIT},
            )
        ).fetchone()
    return _row(row) if row else None


async def list_active(
    category_slug: Optional[str] = None, limit: int = 200
) -> List[Dict[str, Any]]:
    """Активные товары каталога, при желании — одной категории."""
    where = "WHERE p.is_active = true"
    params: Dict[str, Any] = {"limit": limit, "default_unit": DEFAULT_UNIT}
    if category_slug:
        where += " AND c.slug = :cat"
        params["cat"] = category_slug

    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(_SELECT + where + " ORDER BY c.slug, p.name_ru LIMIT :limit"),
                params,
            )
        ).fetchall()
    return [_row(r) for r in rows]


async def low_stock(threshold: float = 3, limit: int = 30) -> List[Dict[str, Any]]:
    """Активные товары, которых почти не осталось. Пустой список — всё в порядке.

    Раньше этот же вопрос задавала `auto_task_creation` и на каждый ответ
    заводила отдельную задачу «Пополнить <товар>» с событием и вызовом модели:
    при нулевом каталоге — 34 задачи и 69 сообщений владельцу за прогон. Задача
    при этом невыполнима, пополнить готовый товар нечем — пополнение идёт через
    посадку. Поэтому теперь это просто список для утренней сводки.
    """
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    _SELECT
                    + "WHERE p.is_active = true AND p.stock <= :threshold "
                    "ORDER BY p.stock ASC, p.name_ru LIMIT :limit"
                ),
                {
                    "threshold": float(threshold),
                    "limit": int(limit),
                    "default_unit": DEFAULT_UNIT,
                },
            )
        ).fetchall()
    return [_row(r) for r in rows]


async def categories() -> List[Dict[str, Any]]:
    """Категории каталога с количеством активных товаров — для навигации."""
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT c.slug, c.name_ru, COUNT(p.id) "
                    "FROM categories c "
                    "LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true "
                    "GROUP BY c.slug, c.name_ru, c.\"order\" "
                    "HAVING COUNT(p.id) > 0 "
                    "ORDER BY c.\"order\", c.name_ru"
                )
            )
        ).fetchall()
    return [{"slug": r[0], "title": r[1], "count": r[2]} for r in rows]


# Слова-категории: менеджер называет их вместе с товаром («микрозелень
# гороха»), но в НАЗВАНИИ товара их нет — это категория. Пока поиск считал их
# частью имени, такой запрос не находился вовсе: «микрозелень» отсутствует в
# name_ru у всех 34 позиций.
#
# Слово ищется и как есть, и в нормальной форме: «семена» приводятся к «семя»,
# а вот заимствования морфология портит — pymorphy3 разбирает «бейби» как
# форму глагола «бейбить», а «беби» как «бести». Поэтому сверяем оба варианта,
# и обе записи ниже нужны.
CATEGORY_WORDS = {
    "микрозелень": "microgreens",
    "микрозелен": "microgreens",
    "бейби": "baby-leaf",
    "беби": "baby-leaf",
    "бейбилист": "baby-leaf",
    "салат": "salads",
    "семя": "seeds",
    "семена": "seeds",
}


def _split_category(query: str) -> tuple[Optional[str], str]:
    """Отделить слово-категорию от названия товара.

    «микрозелень гороха» → ("microgreens", "гороха"). Если после отделения не
    остаётся имени («микрозелень» одним словом) — категорию не выделяем: искать
    пустое имя внутри категории бессмысленно.
    """
    words = re.split(r"\s+", query.strip())
    if len(words) < 2:
        return None, query

    slug, rest = None, []
    for word in words:
        forms = normal_forms(word)
        keys = {word.lower().strip("-·,.")} | set(forms)
        hit = next((CATEGORY_WORDS[k] for k in keys if k in CATEGORY_WORDS), None)
        if slug is None and hit:
            slug = hit
            continue
        rest.append(word)

    remainder = " ".join(rest).strip()
    if not slug or not remainder:
        return None, query
    return slug, remainder


async def find(query: Optional[str], limit: int = 10) -> List[Dict[str, Any]]:
    """
    Поиск товара так, как его мог написать человек: «санго», «sango», «cfyuj»
    (кириллица в латинской раскладке), «сангоо» с опечаткой, «микрозелень
    гороха» в родительном падеже.

    Проходы, каждый следующий — только если предыдущий пуст:
    1. Подстрока по всем вариантам написания (транслит + исправленная раскладка).
    2. То же, но со словом-категорией, отделённым от имени.
    3. Все слова запроса по отдельности, в любом порядке.
    4. Нормальные формы слов — падежи («гороха» → «горох»).
    5. Нечёткое совпадение через pg_trgm (ловит опечатки).

    Проход 1 идёт по ЦЕЛОМУ запросу и раньше отделения категории намеренно:
    «Кресс-салат» — настоящее имя товара, и слово «салат» в нём не должно
    превращаться в фильтр по категории салатов.
    """
    raw = str(query or "").strip()
    variants = query_variants(raw)
    if not variants:
        return []

    async with get_session_ctx() as session:
        rows = await _search_substring(session, variants, None, limit)

        category, name = _split_category(raw)
        if not rows and category:
            rows = await _search_substring(
                session, query_variants(name), category, limit
            )

        words = [w for w in re.split(r"\s+", name) if len(w) >= 3]
        if not rows and len(words) > 1:
            rows = await _search_by_words(session, words, limit)

        if not rows:
            rows = await _search_morph(session, name, category, limit)

        if not rows:
            rows = await _search_fuzzy(session, variants, limit)

    return [_row(r) for r in rows]


async def _search_substring(
    session, variants: List[str], category: Optional[str], limit: int
) -> List[Any]:
    """Подстрока по всем написаниям, при желании — внутри одной категории."""
    if not variants:
        return []
    where = (
        "WHERE p.is_active = true "
        "AND (p.name_ru ILIKE ANY(:pats) OR p.name_uz ILIKE ANY(:pats)) "
    )
    params: Dict[str, Any] = {"limit": limit, "default_unit": DEFAULT_UNIT}
    if category:
        where += "AND c.slug = :cat "
        params["cat"] = category

    patterns = [f"%{v}%" for v in variants]
    return (
        await session.execute(
            text(_SELECT + where + "ORDER BY p.name_ru LIMIT :limit").bindparams(
                bindparam("pats", value=patterns, type_=ARRAY(String))
            ),
            params,
        )
    ).fetchall()


async def _search_morph(
    session, query: str, category: Optional[str], limit: int
) -> List[Any]:
    """
    Совпадение по нормальным формам: «гороха» находит «Горох».

    Сравнение идёт в Python по обеим сторонам сразу — SQL нормальную форму не
    знает, а нормализация одной стороны только сдвигает несовпадение. Каталог
    маленький (34 позиции), поэтому перебор дешевле любой индексной хитрости.
    """
    wanted = set(normal_forms(query))
    if not wanted:
        return []

    where = "WHERE p.is_active = true "
    params: Dict[str, Any] = {"limit": 500, "default_unit": DEFAULT_UNIT}
    if category:
        where += "AND c.slug = :cat "
        params["cat"] = category

    rows = (
        await session.execute(
            text(_SELECT + where + "ORDER BY p.name_ru LIMIT :limit"), params
        )
    ).fetchall()

    # Имя товара должно содержать ВСЕ слова запроса — иначе «горох» вытянул бы
    # и «Горчицу» просто потому, что она тоже в микрозелени.
    matched = [
        r
        for r in rows
        if wanted <= set(normal_forms(r[1])) | set(normal_forms(r[2]))
    ]
    return matched[:limit]


async def _search_by_words(session, words: List[str], limit: int) -> List[Any]:
    """Товар, в названии которого есть ВСЕ слова запроса, в любом порядке."""
    conditions, params = [], {"limit": limit, "default_unit": DEFAULT_UNIT}
    binds = []
    for index, word in enumerate(words):
        word_patterns = [f"%{v}%" for v in query_variants(word)]
        if not word_patterns:
            continue
        key = f"w{index}"
        conditions.append(f"(p.name_ru ILIKE ANY(:{key}) OR p.name_uz ILIKE ANY(:{key}))")
        params[key] = word_patterns
        binds.append(bindparam(key, value=word_patterns, type_=ARRAY(String)))
    if not conditions:
        return []

    stmt = text(
        _SELECT + "WHERE p.is_active = true AND "
        + " AND ".join(conditions)
        + " ORDER BY p.name_ru LIMIT :limit"
    ).bindparams(*binds)
    return (await session.execute(stmt, params)).fetchall()


async def _search_fuzzy(session, variants: List[str], limit: int) -> List[Any]:
    """
    Опечатки: word_similarity сравнивает запрос с лучшим куском названия,
    поэтому «сангоо» находит «Микрозелень Санго». Без расширения pg_trgm
    запрос падает — тогда честно остаёмся без нечёткого поиска.
    """
    try:
        rows = (
            await session.execute(
                text(
                    f"SELECT {_FIELDS}, "
                    "(SELECT MAX(GREATEST(word_similarity(v, lower(p.name_ru)), "
                    "                     word_similarity(v, lower(p.name_uz)))) "
                    " FROM unnest(:vars) AS v) AS sim "
                    f"{_FROM}"
                    "WHERE p.is_active = true "
                    "ORDER BY sim DESC NULLS LAST LIMIT :limit"
                ).bindparams(bindparam("vars", value=variants, type_=ARRAY(String))),
                {"limit": limit, "default_unit": DEFAULT_UNIT},
            )
        ).fetchall()
        # sim идёт сразу за общим набором полей (_row читает 0..9).
        return [r for r in rows if (r[10] or 0) >= FUZZY_THRESHOLD]
    except Exception as exc:  # pg_trgm не установлен — остаёмся без fuzzy
        logger.warning("CATALOG_REPO: нечёткий поиск недоступен (%s)", exc)
        return []


async def resolve(query: Optional[str]) -> Dict[str, Any]:
    """
    Сопоставить название с каталогом: точное совпадение → один кандидат → выбор.

    Возвращает {"product": {...}} либо {"candidates": [...]} (нужен выбор),
    либо {} — товара нет. Единая трактовка для продаж и для инструментов.

    ⚠️ Тёзки. Шесть позиций прайса называются одинаково в двух категориях:
    Руккола, Базилик, Мангольд, Татсой и обе Мизуны есть и в микрозелени
    (лоток, 15 000), и в бейби-листе (100 г, 25 000). Здесь стояло
    `if exact: return {"product": exact[0]}` — при двух точных совпадениях
    молча бралось первое, а порядок у тёзок задаёт `ORDER BY p.name_ru`, то
    есть произволен. «Продажа руккола» записывалась бейби-листом за 25 000
    вместо микрозелени за 15 000: не тот товар, не та цена, не тот остаток.

    Несколько точных совпадений — это неоднозначность, а не готовый ответ.
    """
    name = str(query or "").strip()
    if not name:
        return {}
    matches = await find(name)
    exact = [m for m in matches if (m["name_ru"] or "").strip().lower() == name.lower()]
    if len(exact) == 1:
        return {"product": exact[0]}
    if len(exact) > 1:
        return {"candidates": exact}
    if len(matches) == 1:
        return {"product": matches[0]}
    if matches:
        return {"candidates": matches}
    return {}


async def price_list(category_slug: Optional[str] = None) -> str:
    """
    Прайс-лист текстом — для промптов, постов и коммерческих предложений.

    Это единственный источник цен для ботов: ни один промпт больше не хранит
    цены строкой. Пустой каталог отдаётся явной фразой, чтобы модель не
    принялась выдумывать позиции.
    """
    items = await list_active(category_slug)
    if not items:
        return (
            "Каталог пуст: активных товаров в базе нет. "
            "Цены называть нельзя — сначала заведите товары."
        )

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        grouped.setdefault(item["category_slug"] or "прочее", []).append(item)

    lines: List[str] = []
    for slug, group in grouped.items():
        lines.append(f"[{slug}]")
        for item in group:
            stock = f", остаток {item['stock']:g}" if item["stock"] else ", нет в наличии"
            lines.append(
                f"- {item['name']}: {format_price(item['price'])} / {item['unit']}{stock}"
            )
    return "\n".join(lines)

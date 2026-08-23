"""
👥 CUSTOMER REPO — единственная дверь офиса к клиентам
======================================================
Ровно то же, чем `catalog_repo` служит каталогу, только для `customers`.

ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ

Карточку клиента умели заводить восемь разных мест, и каждое искало по-своему:
три сравнивали имя через `ILIKE :n` **без процентов** (то есть точным
совпадением), одно — регистрозависимым `=`, остальные вообще не смотрели на имя.
Телефон при этом хранился в четырёх несовместимых форматах, поэтому и «надёжное»
сравнение по номеру промахивалось.

Результат наблюдался в админке: «Жасмин», «Ресторан Жасмин» и «Jasmina» —
три карточки одного ресторана. Продажа тому же клиенту каждый раз заводила
новую и заново спрашивала телефон, хотя номер лежал в соседней строке.

При этом механизм, который всё это умеет, в проекте уже был — `text_match.
query_variants` (кириллица ↔ латиница, исправление раскладки, узбекские
апострофы) плюс `pg_trgm` для опечаток. Он был подключён только к товарам.
Здесь он подключён к клиентам.

ПОРЯДОК ПОИСКА (каждый следующий проход — только если предыдущий пуст)

    1. Телефон по последним 9 цифрам — находит любой исторический формат.
    2. Подстрока по всем написаниям запроса целиком.
    3. Подстрока по значащим словам: «ресторан Жасмин» находит «Жасмин»,
       потому что «ресторан» отброшен как родовое слово.
    4. Нечёткое совпадение через pg_trgm — ловит опечатки.

Найдено больше одного — это НЕ повод выбрать первого. `resolve()` вернёт
кандидатов, а спрашивать будет вызывающий: лишний вопрос дешевле, чем продажа,
записанная не тому клиенту.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import Integer, String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from shared import phone as phone_utils
from shared.database import get_session_ctx
from shared.text_match import query_variants

logger = logging.getLogger(__name__)

# Порог нечёткого совпадения. Тот же, что у каталога: ниже начинаются
# случайные созвучия вроде «Жасмин» ↔ «Ясмина».
FUZZY_THRESHOLD = 0.45

# Порог для `similar()` — «нет ли рядом похожего, о ком стоит спросить».
# Мягче обычного намеренно: цена ошибки здесь — один лишний вопрос
# руководителю, а цена пропуска — второй клиент с той же историей заказов.
LOOSE_THRESHOLD = 0.3

# Родовые слова в названиях заведений. Их отбрасываем, когда ищем по словам:
# они есть у половины базы и различать клиентов не помогают. «Ресторан Жасмин»
# должен находиться по «Жасмин» и наоборот — ради этого проход и существует.
GENERIC_WORDS = {
    # русский
    "ресторан", "кафе", "кофейня", "бар", "столовая", "чайхана", "чайхона",
    "пиццерия", "пекарня", "кондитерская", "гостиница", "отель", "магазин",
    "маркет", "центр", "компания", "фирма", "ооо", "оао", "зао", "ип", "чп",
    # узбекский (латиница и кириллица)
    "restoran", "kafe", "qahvaxona", "oshxona", "choyxona", "mehmonxona",
    "do'kon", "dokon", "markaz", "markazi", "mchj", "ok", "xk",
    "ошхона", "чойхона", "дўкон", "марказ", "марказ*",
    # английский
    "restaurant", "cafe", "coffee", "bar", "canteen", "hotel", "shop", "store",
    "market", "center", "centre", "company", "group", "llc", "ltd", "inc",
    "pizzeria", "sushi", "bakery", "food",
}

# Поля клиента — один набор во всех функциях модуля, чтобы вызывающему не
# приходилось помнить, какая выборка что вернула.
#
# КООРДИНАТ ЗДЕСЬ НЕТ, И ЭТО НАМЕРЕННО. Колонки latitude/longitude/geo_* нужны
# карте клиентов в веб-админке, а не офису: ни один бот их не читает, зато
# словарь _row() уходит в десятки инструментов и раздувает контекст каждого.
# Второе, более важное: раз координат нет в проекции, их нет и в UPDATE внутри
# upsert() — поэтому пин, поставленный владельцем руками, переживает любой
# upsert из офиса. Добавите поля «для полноты» — сломаете этот инвариант.
_FIELDS = (
    "c.id, c.name, c.company_name, c.phone, c.telegram_id, c.telegram_username, "
    "c.customer_type, c.company_type, c.status, c.city, c.total_spent, "
    "c.bonus_balance, c.orders_count, c.last_order_date, c.source, "
    "c.web_user_id, c.notes"
)
_FROM = "FROM customers c "
_SELECT = f"SELECT {_FIELDS} {_FROM}"


def _row(row) -> Dict[str, Any]:
    """Строка выборки → словарь клиента. Единственное место разбора."""
    return {
        "id": row[0],
        "name": row[1] or row[2] or "Клиент",
        "company_name": row[2],
        "phone": row[3],
        "phone_display": phone_utils.format_display(row[3]),
        "telegram_id": row[4],
        "telegram_username": row[5],
        "customer_type": (row[6] or "b2c").lower(),
        "company_type": row[7],
        "status": (row[8] or "lead").lower(),
        "city": row[9],
        "total_spent": float(row[10] or 0),
        "bonus_balance": float(row[11] or 0),
        "orders_count": int(row[12] or 0),
        "last_order_date": row[13],
        "source": row[14],
        "web_user_id": row[15],
        "notes": row[16],
    }


def _significant_words(query: str) -> List[str]:
    """
    Значащие слова названия — без родовых («ресторан», «кафе», «MCHJ»).

    Пустой список значит, что различать нечем: запрос состоит из одних родовых
    слов. Тогда проход по словам пропускается — иначе «ресторан» вернул бы
    половину базы.
    """
    words = re.split(r"[^\w']+", str(query or "").lower(), flags=re.UNICODE)
    return [w for w in words if len(w) >= 3 and w not in GENERIC_WORDS]


def _patterns(values: List[str]) -> List[str]:
    """Варианты написания → ILIKE-шаблоны, без повторов."""
    seen, out = set(), []
    for value in values:
        for variant in query_variants(value):
            pattern = f"%{variant}%"
            if pattern not in seen:
                seen.add(pattern)
                out.append(pattern)
    return out


async def by_id(customer_id: int) -> Optional[Dict[str, Any]]:
    """Клиент по id CRM. None — если карточки нет."""
    async with get_session_ctx() as session:
        row = (
            await session.execute(
                text(_SELECT + "WHERE c.id = :cid"), {"cid": int(customer_id)}
            )
        ).fetchone()
    return _row(row) if row else None


async def by_phone(raw_phone: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Клиент по телефону в любом историческом формате записи.

    Сравнение идёт по последним 9 цифрам, а не по строке: в базе одновременно
    лежат `+998 66 233-45-67`, `998662334567` и `662334567` — один и тот же
    номер, записанный тремя писателями по-разному.
    """
    tail = phone_utils.match_tail(raw_phone)
    if not tail:
        return None
    async with get_session_ctx() as session:
        row = await _by_phone(session, tail)
    return _row(row) if row else None


async def _by_phone(session, tail: str):
    return (
        await session.execute(
            text(
                _SELECT
                + f"WHERE c.phone IS NOT NULL AND {phone_utils.SQL_PHONE_TAIL} = :tail "
                "ORDER BY c.orders_count DESC, c.id LIMIT 1"
            ),
            {"tail": tail},
        )
    ).fetchone()


async def find(query: Optional[str], limit: int = 10) -> List[Dict[str, Any]]:
    """
    Найти клиента так, как его мог назвать человек: «Жасмин», «ресторан жасмин»,
    «Jasmina», «жасмин» с опечаткой, или просто номером телефона.

    Четыре прохода, каждый следующий — только если предыдущий пуст.
    """
    raw = str(query or "").strip()
    if not raw:
        return []

    async with get_session_ctx() as session:
        # 1. Запрос похож на телефон — это самый надёжный ключ.
        tail = phone_utils.match_tail(raw)
        if tail and len(phone_utils.digits(raw)) >= phone_utils.MIN_DIGITS:
            row = await _by_phone(session, tail)
            if row:
                return [_row(row)]

        # 2. Название целиком, во всех написаниях.
        rows = await _search_like(session, _patterns([raw]), limit)

        # 3. По значащим словам: «ресторан Жасмин» ↔ «Жасмин».
        if not rows:
            words = _significant_words(raw)
            if words:
                rows = await _search_like(session, _patterns(words), limit)

        # 4. Опечатки.
        if not rows:
            rows = await _search_fuzzy(session, query_variants(raw), limit)

    return [_row(r) for r in rows]


async def _search_like(session, patterns: List[str], limit: int) -> List[Any]:
    """Подстрока по имени или названию компании — по любому из написаний."""
    if not patterns:
        return []
    stmt = text(
        _SELECT + "WHERE c.name ILIKE ANY(:pats) OR c.company_name ILIKE ANY(:pats) "
        "ORDER BY c.orders_count DESC, c.id LIMIT :limit"
    ).bindparams(bindparam("pats", value=patterns, type_=ARRAY(String)))
    return (await session.execute(stmt, {"limit": limit})).fetchall()


def _fuzzy_sql(function: str) -> Any:
    """Запрос нечёткого поиска на заданной функции сравнения pg_trgm.

    Две меры похожести считаются по отдельности — по имени и по названию
    компании, — чтобы вызывающий мог сказать, ЧТО именно совпало. Пока была
    одна `GREATEST(...)`, вопрос руководителю выглядел так: «Похоже, «Nozi»
    уже есть: SAMARQAND OSH MARKAZI N1». Совпало второе поле, которого в
    вопросе нет, и объяснить это было нечем.

    Обёртка подзапросом нужна из-за Postgres: в `ORDER BY` имя выходной
    колонки можно использовать только само по себе, а не внутри выражения.
    """
    return text(
        "SELECT * FROM ("
        f"  SELECT {_FIELDS}, "
        f"    (SELECT MAX({function}(v, lower(COALESCE(c.name, '')))) "
        "      FROM unnest(:vars) AS v) AS sim_name, "
        f"    (SELECT MAX({function}(v, lower(COALESCE(c.company_name, '')))) "
        "      FROM unnest(:vars) AS v) AS sim_company "
        f"  {_FROM}"
        ") s "
        "ORDER BY GREATEST(COALESCE(sim_name, 0), COALESCE(sim_company, 0)) DESC "
        "LIMIT :limit"
    ).bindparams(bindparam("vars", type_=ARRAY(String)))


async def _search_fuzzy(
    session,
    variants: List[str],
    limit: int,
    threshold: float = FUZZY_THRESHOLD,
    strict: bool = False,
) -> List[Any]:
    """
    Опечатки через pg_trgm. `threshold` мягче у `similar()`: там ответ идёт в
    вопрос руководителю, а не в запись.

    ⚠️ `strict` — не оттенок, а разные вопросы.

    `word_similarity` сравнивает запрос с лучшим КУСКОМ названия: «жасмн»
    находит «Ресторан Жасмин» — ради этого функция и выбрана. Но кусок может
    быть началом чужого слова, и тогда короткое имя цепляет однофамильцев по
    двум буквам: у «nozi» и «noxat» общее начало «no» даёт ≈0.4 — выше любого
    разумного порога. 16.08.2026 из-за этого не завёлся ресторан Nozi: бот
    предложил двух посторонних клиентов и остановился.

    `strict_word_similarity` берёт только ЦЕЛЫЕ слова. «Жасмин» ↔ «ресторан
    жасмин» по-прежнему 1.0, опечатка «жасмн» ≈ 0.44, а «nozi» ↔ «noxat»
    падает до ≈0.22 и в кандидаты не попадает.

    Функция появилась в pg_trgm 9.6. Нет её — откатываемся на прежнюю и
    честно говорим об этом в лог: лишний вопрос лучше, чем поиск без нечёткого
    сравнения вовсе.
    """
    if not variants:
        return []

    functions = ["strict_word_similarity", "word_similarity"] if strict else ["word_similarity"]
    rows: List[Any] = []
    for number, function in enumerate(functions):
        try:
            rows = (
                await session.execute(
                    _fuzzy_sql(function), {"vars": variants, "limit": limit}
                )
            ).fetchall()
            break
        except Exception as exc:
            # Упавший запрос обрывает транзакцию: без отката Postgres отвергнет
            # и вторую попытку, и любой следующий SELECT этой сессии.
            try:
                await session.rollback()
            except Exception:  # noqa: BLE001 — сессия уже нежива, откатывать нечего
                pass
            if number + 1 < len(functions):
                logger.warning(
                    "CUSTOMER_REPO: %s недоступна (%s) — сравниваю по куску слова",
                    function,
                    exc,
                )
                continue
            # pg_trgm не установлен — остаёмся без fuzzy, как в catalog_repo
            logger.warning("CUSTOMER_REPO: нечёткий поиск недоступен (%s)", exc)
            return []

    # Обе меры идут сразу за общим набором полей (_row читает 0..16).
    return [r for r in rows if max(r[17] or 0, r[18] or 0) >= threshold]


def _similar_row(row) -> Dict[str, Any]:
    """Кандидат похожести: карточка плюс чем и насколько она похожа.

    `score` и `matched_field` идут в вопрос руководителю и в лог. Без них
    вопрос невозможно ни понять, ни разобрать потом: совпасть могло название
    компании, которого в карточке не видно.
    """
    by_name = float(row[17] or 0)
    by_company = float(row[18] or 0)
    return {
        **_row(row),
        "score": round(max(by_name, by_company), 3),
        "matched_field": "name" if by_name >= by_company else "company_name",
    }


async def similar(name: Optional[str], limit: int = 5) -> List[Dict[str, Any]]:
    """Кто ПОХОЖ на это имя — даже если обычный поиск ничего не нашёл.

    Нужно ровно перед заведением новой карточки. `find` отвечает на вопрос
    «это он?» и молчит, когда не уверен; здесь вопрос другой — «нет ли рядом
    кого-то похожего, о ком стоит спросить».

    10.08.2026 рядом с «Жасмин» завёлся «ресторан жасмин»: поиск не нашёл
    совпадения, и карточка создалась молча. Дубль клиента разводит историю
    заказов и долги на два лица, а замечают это на сверке — то есть поздно.

    Порог мягче обычного, но сравнение — по целым словам (`strict=True`).
    Мягкий порог на сравнении с куском слова означал другое: любое короткое
    имя «похоже» на всё, что начинается с тех же двух букв, и вопрос
    задавался там, где спрашивать не о чем (см. `_search_fuzzy`).
    """
    query = str(name or "").strip()
    if not query:
        return []
    async with get_session_ctx() as session:
        rows = await _search_fuzzy(
            session, query_variants(query), limit, LOOSE_THRESHOLD, strict=True
        )
        if not rows:
            words = _significant_words(query)
            if words:
                rows = await _search_fuzzy(
                    session, words, limit, LOOSE_THRESHOLD, strict=True
                )
    found = [_similar_row(r) for r in rows]
    if found:
        logger.info(
            "CUSTOMER_REPO: «%s» похож на %s",
            query,
            ", ".join(
                f"{c['name']} (#{c['id']}, {c['matched_field']}={c['score']})"
                for c in found
            ),
        )
    return found


def same_phone(candidate_phone: Optional[str], raw_phone: Optional[str]) -> Optional[bool]:
    """Один ли это номер. `None` — судить не по чему (номера нет у кого-то).

    Единственное место, где офис решает «тот же номер или другой»: сравнение
    идёт по тем же девяти цифрам, что и поиск, потому что в базе лежат
    `+998 66 233-45-67`, `998662334567` и `662334567` — один и тот же номер.

    Ответ `False` сильнее любой похожести имён: у карточки есть свой номер, и
    он не тот. Значит это другой клиент, и спрашивать не о чем.
    """
    mine = phone_utils.match_tail(raw_phone)
    theirs = phone_utils.match_tail(candidate_phone)
    if not mine or not theirs:
        return None
    return mine == theirs


async def resolve(
    name: Optional[str], phone: Optional[str] = None
) -> Dict[str, Any]:
    """
    Сопоставить клиента: точный телефон → точное имя → один кандидат → выбор.

    Возвращает `{"customer": {...}}` либо `{"candidates": [...]}` (нужен выбор),
    либо `{}` — клиента нет. Трактовка одна на продажи, инструменты и зеркало,
    как `catalog_repo.resolve` для товаров.

    Телефон сильнее имени намеренно: имя менеджер диктует на слух и по-разному,
    номер он берёт из карточки или от клиента.
    """
    if phone:
        found = await by_phone(phone)
        if found:
            return {"customer": found}

    query = str(name or "").strip()
    if not query:
        return {}

    matches = await find(query)
    if not matches:
        return {}

    lowered = query.lower()
    exact = [
        m
        for m in matches
        if (m["name"] or "").strip().lower() == lowered
        or (m["company_name"] or "").strip().lower() == lowered
    ]
    if exact:
        return {"customer": exact[0]}
    if len(matches) == 1:
        return {"customer": matches[0]}
    return {"candidates": matches}


async def upsert(
    *,
    customer_id: Optional[int] = None,
    name: Optional[str] = None,
    company_name: Optional[str] = None,
    raw_phone: Optional[str] = None,
    telegram_id: Optional[int] = None,
    telegram_username: Optional[str] = None,
    web_user_id: Optional[str] = None,
    customer_type: Optional[str] = None,
    company_type: Optional[str] = None,
    status: Optional[str] = None,
    city: Optional[str] = None,
    language: Optional[str] = None,
    source: Optional[str] = None,
    source_ref: Optional[str] = None,
    notes: Optional[str] = None,
    bonus_balance: Optional[float] = None,
    match_by_name: bool = True,
    session: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Найти или завести карточку клиента. **Единственный писатель `customers`.**

    Порядок сопоставления — от самого надёжного ключа к самому шаткому:
    `customer_id` → `web_user_id` → `telegram_id` → телефон → имя. Первые три
    однозначны, телефон сравнивается по девяти цифрам, имя — нечётко.

    `customer_id` передаётся, когда карточку уже выбрал человек (кнопкой в
    уточнении). Тогда искать заново нельзя: тот же запрос снова вернул бы
    список кандидатов, и выбор руководителя был бы проигнорирован.

    Возвращает `{"id", "created", "phone", "name", "matched_by"}`. `phone` — то,
    что теперь лежит в карточке: у найденного клиента это может быть номер,
    которого вызывающий не знал. Именно ради него функция и возвращает телефон —
    иначе продажа постоянному клиенту снова спрашивала бы номер, лежащий в базе.

    Обновление только дополняет карточку и никогда не понижает её: b2b не
    становится b2c, активный клиент не откатывается в лиды. Иначе заказ с сайта
    сбрасывал бы ресторану тип и статус, наработанные отделом продаж.

    Исключение — `bonus_balance`: им владеет витрина, поэтому он именно
    перезаписывается, а не дополняется.

    `session` передаёт вызывающий, у которого уже открыта транзакция (зеркало
    `/ingest/order` создаёт клиента и заказ вместе). Тогда коммитить здесь
    нельзя: заказ и карточка должны появиться или исчезнуть разом.
    """
    if session is not None:
        return await _upsert_in(
            session,
            commit=False,
            customer_id=customer_id,
            name=name,
            company_name=company_name,
            raw_phone=raw_phone,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            web_user_id=web_user_id,
            customer_type=customer_type,
            company_type=company_type,
            status=status,
            city=city,
            language=language,
            source=source,
            source_ref=source_ref,
            notes=notes,
            bonus_balance=bonus_balance,
            match_by_name=match_by_name,
        )
    async with get_session_ctx() as own:
        return await _upsert_in(
            own,
            commit=True,
            customer_id=customer_id,
            name=name,
            company_name=company_name,
            raw_phone=raw_phone,
            telegram_id=telegram_id,
            telegram_username=telegram_username,
            web_user_id=web_user_id,
            customer_type=customer_type,
            company_type=company_type,
            status=status,
            city=city,
            language=language,
            source=source,
            source_ref=source_ref,
            notes=notes,
            bonus_balance=bonus_balance,
            match_by_name=match_by_name,
        )


async def _upsert_in(
    session,
    *,
    commit: bool,
    customer_id: Optional[int],
    name: Optional[str],
    company_name: Optional[str],
    raw_phone: Optional[str],
    telegram_id: Optional[int],
    telegram_username: Optional[str],
    web_user_id: Optional[str],
    customer_type: Optional[str],
    company_type: Optional[str],
    status: Optional[str],
    city: Optional[str],
    language: Optional[str],
    source: Optional[str],
    source_ref: Optional[str],
    notes: Optional[str],
    bonus_balance: Optional[float],
    match_by_name: bool,
) -> Dict[str, Any]:
    """Тело upsert в заданной сессии. Логика одна на оба режима вызова."""
    canonical = phone_utils.normalize(raw_phone)
    tail = phone_utils.match_tail(raw_phone)
    display_name = (str(name or "").strip() or str(company_name or "").strip()) or None
    company = str(company_name or "").strip() or None

    found, matched_by = None, None

    if customer_id:
        found = (
            await session.execute(
                text(_SELECT + "WHERE c.id = :cid LIMIT 1"),
                {"cid": int(customer_id)},
            )
        ).fetchone()
        matched_by = "id" if found else None

    if not found and web_user_id:
        found = (
            await session.execute(
                text(_SELECT + "WHERE c.web_user_id = :wid LIMIT 1"),
                {"wid": str(web_user_id)},
            )
        ).fetchone()
        matched_by = "web_user_id" if found else None

    if not found and telegram_id:
        found = (
            await session.execute(
                text(_SELECT + "WHERE c.telegram_id = :tid LIMIT 1"),
                {"tid": int(telegram_id)},
            )
        ).fetchone()
        matched_by = "telegram_id" if found else None

    if not found and tail:
        found = await _by_phone(session, tail)
        matched_by = "phone" if found else None

    if not found and match_by_name and display_name:
        rows = await _search_like(session, _patterns([display_name]), 2)
        if not rows:
            words = _significant_words(display_name)
            if words:
                rows = await _search_like(session, _patterns(words), 2)
        # Ровно одно совпадение — это он. Несколько — не угадываем: пусть
        # спросит вызывающий через resolve(), иначе продажа уйдёт не тому.
        if len(rows) == 1:
            found, matched_by = rows[0], "name"

    if found:
        current = _row(found)
        await session.execute(
            text(
                "UPDATE customers SET "
                "  phone = COALESCE(:phone, phone), "
                "  name = COALESCE(NULLIF(name, ''), :name), "
                "  company_name = COALESCE(company_name, :company), "
                "  telegram_id = COALESCE(telegram_id, :tid), "
                "  telegram_username = COALESCE(telegram_username, :tusername), "
                "  web_user_id = COALESCE(web_user_id, :wid), "
                "  company_type = COALESCE(company_type, :company_type), "
                "  city = COALESCE(NULLIF(city, ''), :city), "
                "  language = COALESCE(NULLIF(language, ''), :language), "
                "  source = COALESCE(source, :source), "
                "  source_ref = COALESCE(source_ref, :source_ref), "
                "  notes = COALESCE(notes, :notes), "
                # Бонусами владеет витрина — их именно перезаписываем.
                "  bonus_balance = COALESCE(:bonus, bonus_balance), "
                # b2b и «активный» — состояния, которые нарабатывает отдел
                # продаж. Заказ с сайта не должен их сбрасывать.
                "  customer_type = CASE WHEN customer_type = 'b2b' OR :ctype = 'b2b' "
                "                       THEN 'b2b' ELSE COALESCE(:ctype, customer_type) END, "
                "  status = CASE WHEN status IN ('active', 'vip') THEN status "
                "                ELSE COALESCE(:status, status) END, "
                "  updated_at = NOW() "
                "WHERE id = :cid"
            ),
            {
                "phone": canonical,
                "name": display_name,
                "company": company,
                "tid": int(telegram_id) if telegram_id else None,
                "tusername": telegram_username,
                "wid": str(web_user_id) if web_user_id else None,
                "company_type": company_type,
                "city": city,
                "language": language,
                "source": source,
                "source_ref": source_ref,
                "notes": notes,
                "bonus": bonus_balance,
                "ctype": (customer_type or "").lower() or None,
                "status": (status or "").lower() or None,
                "cid": current["id"],
            },
        )
        if commit:
            await session.commit()
        return {
            "id": current["id"],
            "created": False,
            "phone": canonical or current["phone"],
            "name": current["name"],
            "matched_by": matched_by,
        }

    ctype = (customer_type or "b2c").lower()
    new_id = (
        await session.execute(
            text(
                "INSERT INTO customers (name, company_name, phone, telegram_id, "
                "  telegram_username, web_user_id, customer_type, company_type, "
                "  status, city, language, source, source_ref, notes, bonus_balance) "
                "VALUES (:name, :company, :phone, :tid, :tusername, :wid, :ctype, "
                "  :company_type, :status, COALESCE(:city, 'Samarqand'), "
                "  COALESCE(NULLIF(:language, ''), 'ru'), :source, "
                "  :source_ref, :notes, COALESCE(:bonus, 0)) "
                "RETURNING id"
            ),
            {
                "name": display_name or "Клиент",
                "company": company or (display_name if ctype == "b2b" else None),
                "phone": canonical,
                "tid": int(telegram_id) if telegram_id else None,
                "tusername": telegram_username,
                "wid": str(web_user_id) if web_user_id else None,
                "ctype": ctype,
                "company_type": company_type
                or ("restaurant" if ctype == "b2b" else None),
                "status": (status or "lead").lower(),
                "city": city,
                "language": language,
                "source": source or "manual",
                "source_ref": source_ref,
                "notes": notes,
                "bonus": bonus_balance,
            },
        )
    ).scalar()
    if commit:
        await session.commit()

    return {
        "id": new_id,
        "created": True,
        "phone": canonical,
        "name": display_name or "Клиент",
        "matched_by": None,
    }


async def orders(customer_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """
    История заказов клиента — с позициями, чтобы на вопрос «что он обычно берёт»
    можно было ответить фактами, а не пересказом.

    Читаем `crm_orders`: через зеркало проходит каждый заказ — и с сайта, и
    зарегистрированный менеджером, — поэтому это полная картина по клиенту.
    """
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    "SELECT o.id, o.order_number, o.total_amount, o.status, "
                    "       o.payment_status, o.created_at, o.delivery_address "
                    "FROM crm_orders o WHERE o.customer_id = :cid "
                    "ORDER BY o.created_at DESC, o.id DESC LIMIT :limit"
                ),
                {"cid": int(customer_id), "limit": limit},
            )
        ).fetchall()
        if not rows:
            return []

        order_ids = [r[0] for r in rows]
        items = (
            await session.execute(
                text(
                    "SELECT i.order_id, COALESCE(p.name_ru, p.name_uz, 'Товар'), "
                    "       i.quantity, i.unit, i.total_price "
                    "FROM crm_order_items i "
                    "LEFT JOIN crm_products p ON p.id = i.product_id "
                    "WHERE i.order_id = ANY(:ids) ORDER BY i.id"
                ).bindparams(bindparam("ids", value=order_ids, type_=ARRAY(Integer))),
                {},
            )
        ).fetchall()

    by_order: Dict[int, List[Dict[str, Any]]] = {}
    for item in items:
        by_order.setdefault(item[0], []).append(
            {
                "name": item[1],
                "quantity": float(item[2] or 0),
                "unit": item[3],
                "total_price": float(item[4] or 0),
            }
        )

    return [
        {
            "id": r[0],
            "order_number": r[1],
            "total_amount": float(r[2] or 0),
            "status": r[3],
            "payment_status": r[4],
            "created_at": r[5],
            "delivery_address": r[6],
            "items": by_order.get(r[0], []),
        }
        for r in rows
    ]


async def recalc_stats(session, customer_id: int) -> None:
    """Пересчитать счётчики клиента по фактическим заказам.

    Здесь стоял инкремент: `orders_count = orders_count + 1,
    total_spent = total_spent + :amount`. Уменьшения не было НИГДЕ — при
    отмене заказа и счётчик, и сумма оставались прежними. На этих числах
    держатся статус VIP, сортировка «лучшие клиенты» (`ORDER BY total_spent`
    в sales_bot) и сегменты рассылок, то есть завышение расходилось по всему
    офису.

    Пересчёт вместо декремента выбран по двум причинам: он самоисцеляющийся
    (уже накопленное искажение уходит при первом же касании клиента) и
    снимает риск двойного счёта, о котором предупреждает комментарий в
    sales_bot/handlers/order.py.

    Статус только повышается. Понижать его нельзя: `churned` и `vip`
    проставляет отдел продаж, и отмена одного заказа не повод откатывать
    наработанное — то же правило, что и в `customer_repo.upsert`.
    """
    await session.execute(
        text(
            "UPDATE customers c SET "
            "  orders_count = s.cnt, "
            "  total_spent = s.total, "
            "  last_order_date = s.last_at, "
            "  status = CASE "
            "             WHEN s.cnt >= 5 THEN 'vip' "
            "             WHEN s.cnt >= 1 AND c.status = 'lead' THEN 'active' "
            "             ELSE c.status END "
            "FROM ("
            # Считаем ЗАКАЗЫ, а суммируем ВСЁ. Возврат приходит зеркалом
            # витрины отдельной строкой с отрицательной суммой (см.
            # posRefundIngestBody): он обязан уменьшить «Потрачено», но не
            # имеет права увеличить «Заказов» — иначе у клиента, вернувшего
            # покупку, покупок становится больше.
            "  SELECT COUNT(*) FILTER (WHERE total_amount >= 0) AS cnt, "
            "         COALESCE(SUM(total_amount), 0) AS total, "
            "         MAX(created_at) FILTER (WHERE total_amount >= 0) AS last_at "
            "  FROM crm_orders WHERE customer_id = :cid AND status <> 'cancelled'"
            ") s "
            "WHERE c.id = :cid"
        ),
        {"cid": int(customer_id)},
    )

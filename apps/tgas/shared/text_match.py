"""
🔤 TEXT MATCH — поиск товара «как написал человек»
===================================================
Менеджер пишет на бегу: «санго», «sango», «Sango», «cfyuj» (набрал кириллицу в
латинской раскладке), «микразелень» с опечаткой. Каталог при этом хранит
«Микрозелень Санго» (name_ru) и узбекское название (name_uz).

Модуль порождает варианты написания запроса, чтобы SQL-поиск нашёл товар:
- транслитерация в обе стороны (кириллица ↔ латиница);
- исправление раскладки (ЙЦУКЕН ↔ QWERTY, в обе стороны);
- узбекские латинские диграфы (o'/g'/sh/ch);
- нормальная форма слова — падежи (`normal_forms`).

Опечатки ловятся уже на стороне Postgres — через pg_trgm (см. shared/sales_ops).
"""

from __future__ import annotations

import logging
import re
from typing import List, Optional

logger = logging.getLogger(__name__)

# ── Транслитерация ────────────────────────────────────────────────────────
_RU_TO_LAT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "yo",
    "ж": "j",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "i",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}

# Латиница → кириллица. Многобуквенные сочетания идут первыми — иначе «sh»
# распадётся на «с» + «х».
_LAT_TO_RU = [
    ("sch", "щ"),
    ("sh", "ш"),
    ("ch", "ч"),
    ("zh", "ж"),
    ("yo", "ё"),
    ("yu", "ю"),
    ("ya", "я"),
    ("ts", "ц"),
    ("o'", "у"),
    ("g'", "г"),
    ("a", "а"),
    ("b", "б"),
    ("c", "к"),
    ("d", "д"),
    ("e", "е"),
    ("f", "ф"),
    ("g", "г"),
    ("h", "х"),
    ("i", "и"),
    ("j", "ж"),
    ("k", "к"),
    ("l", "л"),
    ("m", "м"),
    ("n", "н"),
    ("o", "о"),
    ("p", "п"),
    ("q", "к"),
    ("r", "р"),
    ("s", "с"),
    ("t", "т"),
    ("u", "у"),
    ("v", "в"),
    ("w", "в"),
    ("x", "х"),
    ("y", "й"),
    ("z", "з"),
]

# ── Раскладка клавиатуры ──────────────────────────────────────────────────
_QWERTY = "qwertyuiop[]asdfghjkl;'zxcvbnm,."
_JCUKEN = "йцукенгшщзхъфывапролджэячсмитьбю"
_EN_TO_RU_LAYOUT = dict(zip(_QWERTY, _JCUKEN))
_RU_TO_EN_LAYOUT = dict(zip(_JCUKEN, _QWERTY))


def _translit_ru_lat(text: str) -> str:
    return "".join(_RU_TO_LAT.get(ch, ch) for ch in text)


def _translit_lat_ru(text: str) -> str:
    out = text
    for lat, ru in _LAT_TO_RU:
        out = out.replace(lat, ru)
    return out


def _fix_layout(text: str, mapping: dict) -> str:
    return "".join(mapping.get(ch, ch) for ch in text)


def query_variants(query: str) -> List[str]:
    """
    Все разумные написания запроса — для поиска по name_ru / name_uz.

    «санго»  → санго, sango, cfyuj…
    «sango»  → sango, санго…
    «cfyuj»  → cfyuj, санго (исправленная раскладка)…
    """
    base = re.sub(r"\s+", " ", str(query or "")).strip().lower()
    if not base:
        return []

    variants = [base]
    has_cyrillic = bool(re.search(r"[а-яё]", base))
    has_latin = bool(re.search(r"[a-z]", base))

    if has_cyrillic:
        variants.append(_translit_ru_lat(base))  # санго → sango
        variants.append(
            _fix_layout(base, _RU_TO_EN_LAYOUT)
        )  # набрал кириллицей вместо латиницы
    if has_latin:
        variants.append(_translit_lat_ru(base))  # sango → санго
        fixed = _fix_layout(base, _EN_TO_RU_LAYOUT)  # cfyuj → санго
        variants.append(fixed)
        # «cfyuj» после исправления раскладки — уже кириллица; её латинский
        # транслит тоже пригодится (вдруг товар записан латиницей).
        if re.search(r"[а-яё]", fixed):
            variants.append(_translit_ru_lat(fixed))

    # Узбекские апострофы: o'simlik / oʻsimlik / osimlik — считаем одним словом
    variants.extend(
        v.replace("'", "").replace("ʻ", "").replace("‘", "") for v in list(variants)
    )

    seen, result = set(), []
    for v in variants:
        v = v.strip()
        if len(v) >= 2 and v not in seen:
            seen.add(v)
            result.append(v)
    return result


# ── Морфология: падежи ────────────────────────────────────────────────────
#
# Менеджер называет товар в том падеже, какой просится в фразу: «продал
# микрозелень ГОРОХА», «два лотка РУККОЛЫ». Каталог хранит именительный:
# «Горох», «Руккола». Подстрокой «гороха» в «Горох» не входит — и поиск,
# который умел транслит и раскладку, спотыкался на обычной русской фразе.
#
# Анализатор тяжёлый (словарь на диске), поэтому создаётся один раз и лениво:
# импорт модуля не должен стоить секунду каждому боту, который его случайно
# затянул. Нет пакета — честно остаёмся без морфологии, как и с pg_trgm.

_morph = None
_morph_ready = False

_WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


def _analyzer():
    global _morph, _morph_ready
    if _morph_ready:
        return _morph
    _morph_ready = True
    try:
        import pymorphy3

        _morph = pymorphy3.MorphAnalyzer()
    except Exception as exc:  # пакета нет / словарь не поставлен
        logger.warning("TEXT_MATCH: морфология недоступна (%s)", exc)
        _morph = None
    return _morph


def normal_forms(query: Optional[str]) -> List[str]:
    """
    Слова текста в нормальной форме: «микрозелень гороха» → [микрозелень, горох].

    Применяется к ОБЕИМ сторонам сравнения — и к запросу, и к названию товара.
    Иначе «Руккола» в базе и «рукколы» в запросе снова не сойдутся: нормализация
    одной стороны только сдвигает несовпадение, а не убирает его.
    """
    words = _WORD_RE.findall(str(query or "").lower())
    if not words:
        return []

    morph = _analyzer()
    if morph is None:
        return words

    out: List[str] = []
    for word in words:
        try:
            out.append(morph.parse(word)[0].normal_form)
        except Exception:
            # Разбор одного слова не должен ронять весь поиск: берём как есть.
            out.append(word)
    return out

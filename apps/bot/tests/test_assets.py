"""Картинки, на которые бот ссылается, лежат в витрине.

Бот шлёт Телеграму АДРЕС картинки, а не файл. Телеграм идёт по нему сам, и
на 404 отвечает отказом — карточка товара не отправляется, превью пересылки
выходит голым. В логе бота при этом ничего интересного: ошибка приходит от
чужого сервиса и выглядит как случайный сбой сети.

Ровно так и вышло: чистка дубликатов в `public/` убрала `images/logo.jpg` и
`magazine/img/cover.png`, а три места в боте продолжали их называть. Ни один
тест не покраснел, потому что путь — это строка, и строке всё равно.
"""

import ast
import re
from pathlib import Path

import pytest

BOT = Path(__file__).resolve().parent.parent
PUBLIC = BOT.parent / "web" / "public"

# Адрес витрины в любом из написаний, что встречаются в коде.
SITE = re.compile(
    r'(?:https://microgreenuzbekistan\.com|\{WEB_URL\}|\{SITE_URL\}|\{WEB_APP_URL\})'
    r'(/[\w./-]+\.(?:jpg|jpeg|png|webp|svg|pdf))'
)


def _referenced() -> list[tuple[str, str]]:
    """Адреса из строковых литералов — комментарии и докстринги не в счёт.

    Читать файл построчно проще, но тогда сторож ловит сам себя: строка
    `/images/logo.jpg` в комментарии, объясняющем, ПОЧЕМУ её больше нет,
    неотличима от живой ссылки.
    """
    found = []
    for path in sorted(BOT.glob("**/*.py")):
        if "__pycache__" in path.parts or path.parent.name == "tests":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        docs = {id(n.body[0].value) for n in ast.walk(tree)
                if isinstance(n, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                and ast.get_docstring(n)}
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            if id(node) in docs:
                continue
            for asset in SITE.findall(node.value):
                found.append((f"{path.relative_to(BOT)}:{node.lineno}", asset))
        # f-строка: части лежат отдельными узлами, склеиваем исходный текст
        for node in ast.walk(tree):
            if not isinstance(node, ast.JoinedStr):
                continue
            text = ast.get_source_segment(path.read_text(encoding="utf-8"), node) or ""
            for asset in SITE.findall(text):
                found.append((f"{path.relative_to(BOT)}:{node.lineno}", asset))
    return sorted(set(found))


@pytest.mark.skipif(not PUBLIC.is_dir(), reason="витрина рядом не развёрнута")
def test_каждая_названная_картинка_есть_в_витрине():
    missing = [f"{where} → {asset}" for where, asset in _referenced()
               if not (PUBLIC / asset.lstrip("/")).exists()]
    assert not missing, "бот ссылается на файлы, которых нет:\n  " + "\n  ".join(missing)


def test_сторож_вообще_что_то_находит():
    """Если регулярка перестанет ловить адреса, первый тест станет зелёным
    навсегда и молча. Проверяем, что он смотрит на непустой список."""
    assert _referenced(), "ни одной ссылки на картинку не найдено — сторож ослеп"

"""scripts/check_tools.py — сверка инструментов отделов.

Запуск:  python scripts/check_tools.py       (из apps/tgas)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Инструменты — это то, чем отдел ДЕЛАЕТ работу, а не рассказывает о ней. Пока их
не было, бот отвечал текстом: прайс сочинялся моделью, продажа не регистрировалась,
а «передать другому отделу» было полем в JSON, которое терялось по дороге.

Ошибки в этом слое так же незаметны, как и в SQL: бот запускается, отвечает, и
только по результату видно, что инструмента у него не оказалось. Скрипт ловит
четыре случая, каждый из которых означает молча неработающую цепочку:

  · у отдела из реестра ботов нет ни одного инструмента — он снова только текст;
  · два инструмента с одним именем — модель вызовет не тот, что имел в виду автор;
  · рискованный инструмент без карточки подтверждения — запись в данные пройдёт
    без ведома владельца;
  · рискованный инструмент без экрана админки (`admin_tab`) или с несуществующей
    вкладкой — кнопка «Открыть в админке» уведёт владельца на кассу вместо
    задачи, о которой его спрашивают;
  · delegate_to_department умеет отправить в отдел, у которого нет слушателя —
    задача создастся, событие улетит, исполнителя не будет (так терялся
    `operations`);
  · инструмент есть в реестре и доступен Стёпану, но в его промпте не упомянут —
    значит не выбирается никогда (так `add_customer` существовал, а «зарегистрируй
    клиента» уходило в register_sale с выдуманным товаром).

Инфраструктура не нужна: только импорт реестра, как в check_bot_roster.py.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent  # apps/tgas
sys.path.insert(0, str(ROOT))

from shared import approvals  # noqa: E402
from shared import bot_registry  # noqa: E402
from shared import tools as tool_registry  # noqa: E402
from shared.tools.common import CHIEF_FALLBACK, LISTENED_DEPARTMENTS  # noqa: E402

problems: list[str] = []
notes: list[str] = []


def check_department_coverage() -> None:
    """У каждого отдела с ботом должен быть СВОЙ инструмент, а не только общие.

    Считать просто «есть хоть что-то» бессмысленно: `common.py` регистрирует
    семь инструментов на все отделы сразу, поэтому такая проверка не могла бы
    упасть никогда — даже если у отдела отобрать всё своё. Проверяем то, ради
    чего сторож и заведён: умеет ли отдел делать СВОЮ работу.
    """
    common_names = {t.name for t in tool_registry.tools_for("hr")} & {
        t.name for t in tool_registry.tools_for("devops")
    }
    for bot in bot_registry.BOTS:
        dept = bot.department
        if not dept or dept == "pm":
            continue  # pm видит все; franchise/n8n задач не принимают
        own = [
            t.name
            for t in tool_registry.tools_for(dept)
            if t.name not in common_names
        ]
        if not own:
            problems.append(
                f"у отдела «{dept}» ({bot.name}) нет ни одного собственного "
                f"инструмента — только общие, то есть свою работу он делать "
                f"не умеет и сможет лишь сгенерировать текст"
            )


def check_unique_names() -> None:
    """Имена уникальны — иначе register() бы упал, но проверим и здесь."""
    seen: dict[str, int] = {}
    for tool in tool_registry.all_tools():
        seen[tool.name] = seen.get(tool.name, 0) + 1
    for name, count in seen.items():
        if count > 1:
            problems.append(f"инструмент «{name}» объявлен {count} раза")


def check_risky_have_confirmation() -> None:
    """У рискованного инструмента должна быть внятная карточка подтверждения."""
    for tool in tool_registry.all_tools():
        if not tool.risky:
            continue
        if tool.confirm is None:
            problems.append(
                f"«{tool.name}» помечен risky, но не описывает, что произойдёт: "
                f"владелец увидит в карточке голый вызов функции"
            )


#: Реестр вкладок админки на витрине. Правды об экранах в Python нет —
#: она в TypeScript, и другого способа сверить, кроме как прочитать файл, тоже.
ADMIN_TABS_TSX = ROOT.parent / "web" / "src" / "app" / "admin" / "adminTabs.tsx"


def admin_tab_ids() -> set[str]:
    """Идентификаторы вкладок из adminTabs.tsx."""
    if not ADMIN_TABS_TSX.exists():
        return set()
    return set(re.findall(r"\{\s*id:\s*'([a-z_]+)'", ADMIN_TABS_TSX.read_text(encoding="utf-8")))


def check_risky_have_admin_screen() -> None:
    """Из карточки подтверждения должен быть путь на экран админки.

    Карточка «Удалить задачу #95 безвозвратно» была тупиком: посмотреть саму
    задачу владелец мог, только открыв сайт и найдя вкладку глазами среди
    сорока семи. Теперь у карточки есть кнопка, а куда она ведёт — говорит
    `Tool.admin_tab`.

    Сверяем со ВКЛАДКАМИ ВИТРИНЫ, а не с самим фактом заполнения: опечатка в
    имени вкладки даёт ссылку, которая открывает админку на кассе, и заметить
    это можно только руками. Ровно так уехали юзернеймы ботов, когда лежали
    в четырёх местах.
    """
    known = admin_tab_ids()
    if not known:
        problems.append(
            f"не читается реестр вкладок админки ({ADMIN_TABS_TSX}): "
            f"проверить ссылки из карточек подтверждения нечем"
        )
        return

    # Экран обязан знать КАЖДЫЙ инструмент, а не только рискованный.
    #
    # Сначала правило касалось карточек подтверждения, то есть write-действий.
    # Теперь по `admin_tab` строится и кнопка под ответом отдела в групповом
    # чате (`shared/group_reply._open_button`): спросили «что с заказом» —
    # под ответом кнопка на заказы. Инструмент без экрана такой кнопки не
    # даёт, и ответ снова становится тупиком — молча, потому что отсутствие
    # кнопки ничем не отличается от «нечего показывать».
    for tool in tool_registry.all_tools():
        if not tool.admin_tab:
            problems.append(
                f"«{tool.name}» не говорит, на какой экран админки вести "
                f"человека (Tool.admin_tab пуст): ответ с этим инструментом "
                f"останется без кнопки"
            )
        elif tool.admin_tab not in known:
            problems.append(
                f"«{tool.name}» ведёт на вкладку «{tool.admin_tab}», которой нет "
                f"в adminTabs.tsx — ссылка откроет админку не там"
            )


#: Кто на витрине раздаёт `focus` экранам. Другого способа узнать нет: это
#: TypeScript, и связь «вкладка умеет подсветить запись» видна только здесь.
ADMIN_ROUTER_TSX = ROOT.parent / "web" / "src" / "app" / "admin" / "AdminTabRouter.tsx"


def tabs_honouring_focus() -> set[str]:
    """Вкладки, которым маршрутизатор передаёт `focus`."""
    if not ADMIN_ROUTER_TSX.exists():
        return set()
    source = ADMIN_ROUTER_TSX.read_text(encoding="utf-8")

    honoured: set[str] = set()
    # Блок вкладки — от `activeTab === 'x'` до следующего такого же.
    parts = re.split(r"activeTab === '([a-z_]+)'", source)
    # parts: [до, имя1, тело1, имя2, тело2, ...]
    for name, body in zip(parts[1::2], parts[2::2]):
        if "focus={focus}" in body or "focus={focus}" in body.replace("\n", ""):
            honoured.add(name)
    return honoured


def check_focus_lands_on_the_record() -> None:
    """Ссылка на ЗАПИСЬ должна открывать запись, а не просто экран.

    `Tool.admin_focus_arg` означает: у этого действия есть предмет, и офис
    подставит его в `?focus=`. Но подсвечивать запись умеют не все экраны —
    и расхождение невидимо: ссылка открывается, ошибок нет, просто «не
    пригодилось». Человек приходит по ссылке про партию #57 и дальше ищет
    её глазами, то есть ссылка экономит один шаг из двух.

    Проверяем именно пару «инструмент с предметом → экран, который умеет
    его показать». Инструменты без `admin_focus_arg` сюда не попадают: им
    достаточно открыть вкладку.
    """
    honoured = tabs_honouring_focus()
    if not honoured:
        problems.append(
            f"не читается маршрутизатор админки ({ADMIN_ROUTER_TSX}): "
            f"проверить подсветку записей нечем"
        )
        return

    for tool in tool_registry.all_tools():
        if not tool.admin_focus_arg or not tool.admin_tab:
            continue
        if tool.admin_tab not in honoured:
            problems.append(
                f"«{tool.name}» строит ссылку на запись (focus={tool.admin_focus_arg}), "
                f"но вкладка «{tool.admin_tab}» её не подсвечивает — человек "
                f"придёт на экран и будет искать запись глазами"
            )


#: Реестр кнопок «Пульта ИИ» на витрине.
BOT_ACTIONS_TSX = ROOT.parent / "web" / "src" / "components" / "admin" / "botActions.tsx"


def check_pult_actions_are_allowed() -> None:
    """Кнопка пульта должна вести к действию, которое офис разрешает.

    Это две копии одного знания: белый список `ADMIN_BOT_ACTIONS` в
    `web_office/main.py` и реестр кнопок в `botActions.tsx`. Разойдись они —
    и кнопка отвечает «действие не разрешено» на нажатие, а понять это можно
    только нажав. Ровно так расходились юзернеймы ботов.

    Обратную сторону (разрешено, но кнопки нет) НЕ проверяем: три действия
    там отсутствуют намеренно — рассылка и публикации необратимы и требуют
    формы с текстом, а не кнопки (см. шапку `botActions.tsx`).
    """
    office = ROOT / "web_office" / "main.py"
    if not office.exists() or not BOT_ACTIONS_TSX.exists():
        problems.append("не читается пара «белый список офиса ↔ кнопки пульта»")
        return

    block = re.search(
        r"ADMIN_BOT_ACTIONS:\s*dict\[str,\s*str\]\s*=\s*\{(.*?)\}",
        office.read_text(encoding="utf-8"),
        re.S,
    )
    if not block:
        problems.append("не нашёл ADMIN_BOT_ACTIONS в web_office/main.py")
        return

    allowed = dict(re.findall(r'"([a-z_]+)":\s*"([a-z_]+)"', block.group(1)))
    tsx = BOT_ACTIONS_TSX.read_text(encoding="utf-8")

    # Пары «бот → действие» из реестра кнопок, в порядке объявления.
    for bot, action in re.findall(
        r"bot:\s*'([a-z_]+)',[\s\S]{0,200}?action:\s*'([a-z_]+)'", tsx
    ):
        target = allowed.get(action)
        if target is None:
            problems.append(
                f"кнопка пульта «{action}» не разрешена офисом — нажатие "
                f"вернёт «действие не разрешено»"
            )
        elif target != bot:
            problems.append(
                f"кнопка пульта «{action}» подписана ботом {bot}, а офис "
                f"отправит её {target} — подпись врёт о том, кто работает"
            )


#: Перечисление тем живых обновлений на витрине.
REALTIME_BUS_TS = ROOT.parent / "web" / "src" / "lib" / "realtime" / "bus.ts"


def check_realtime_topics_match() -> None:
    """Темы живых обновлений одинаковы у офиса и витрины.

    Офис говорит витрине «этот срез изменился» именем темы
    (`shared/storefront_realtime.TOPICS`), а витрина знает свой список
    (`Topic` в lib/realtime/bus.ts). Импорта между приложениями нет, значит
    это две копии — и расхождение проявится молчащим экраном: сигнал уйдёт,
    витрина ответит 400, а человек будет смотреть на неизменившийся список
    и считать, что ничего не произошло.
    """
    if not REALTIME_BUS_TS.exists():
        problems.append(f"не читается перечисление тем витрины ({REALTIME_BUS_TS})")
        return

    source = REALTIME_BUS_TS.read_text(encoding="utf-8")
    block = re.search(r"export type Topic\s*=(.*?);", source, re.S)
    if not block:
        problems.append("не нашёл `export type Topic` в lib/realtime/bus.ts")
        return

    web = set(re.findall(r"'([a-z_]+)'", block.group(1)))

    try:
        from shared import storefront_realtime
    except Exception as exc:
        problems.append(f"не импортируется shared/storefront_realtime: {exc}")
        return

    office = set(storefront_realtime.TOPICS)

    only_office = office - web
    only_web = web - office
    if only_office:
        problems.append(
            f"офис шлёт темы, которых нет у витрины: {', '.join(sorted(only_office))} — "
            f"сигнал вернётся 400, экран не обновится"
        )
    if only_web:
        problems.append(
            f"витрина знает темы, которых офис не умеет слать: "
            f"{', '.join(sorted(only_web))} — экран будет ждать сигнала, которого нет"
        )


def check_delegation_targets() -> None:
    """Каждый отдел-получатель делегирования должен кем-то слушаться."""
    known = {b.department for b in bot_registry.BOTS if b.department}
    for dept in sorted(LISTENED_DEPARTMENTS):
        if dept not in known:
            problems.append(
                f"«{dept}» объявлен слушающим в shared/tools/common.py, но "
                f"такого отдела нет в bot_registry — задача уйдёт в никуда"
            )
    if CHIEF_FALLBACK not in known:
        problems.append(
            f"запасной отдел «{CHIEF_FALLBACK}» не найден в bot_registry: "
            f"задачу без исполнителя будет некому принять"
        )

    # Отделы с ботом и слушателем TASK_CREATED, но не попавшие в список.
    listens = _departments_listening_task_created()
    missed = listens - LISTENED_DEPARTMENTS - {CHIEF_FALLBACK}
    if missed:
        problems.append(
            f"отделы {', '.join(sorted(missed))} принимают TASK_CREATED, но не "
            f"объявлены в LISTENED_DEPARTMENTS — делегирование в них уйдёт "
            f"руководителю вместо исполнителя"
        )


def _departments_listening_task_created() -> set[str]:
    """Отделы, чьи боты подписаны на TASK_CREATED (по коду main.py)."""
    found: set[str] = set()
    for bot in bot_registry.BOTS:
        main = ROOT / "bots" / bot.name / "main.py"
        if not main.exists() or not bot.department:
            continue
        body = main.read_text(encoding="utf-8", errors="replace")
        if re.search(r"event_bus\.on\(\s*[\"']TASK_CREATED[\"']", body, re.I):
            found.add(bot.department)
    return found


def check_executor_wired() -> None:
    """Каждый бот с отделом должен звать execute_bot_task или иметь свой обработчик."""
    for bot in bot_registry.BOTS:
        if not bot.department or bot.name == "stepan_bot":
            continue  # у Стёпана собственный обработчик с теми же инструментами
        main = ROOT / "bots" / bot.name / "main.py"
        if not main.exists():
            continue
        body = main.read_text(encoding="utf-8", errors="replace")
        if "execute_bot_task" not in body and "handle_task_created" not in body:
            problems.append(
                f"{bot.name} не подключён ни к TaskExecutor, ни к своему "
                f"обработчику задач — делегированная задача до него не дойдёт"
            )


#: Обязательные аргументы-идентификаторы и инструменты, которые их отдают.
#: Ключ — суффикс имени аргумента, значение — чем его получить.
_ID_SOURCES = {
    "employee_id": ("list_staff",),
    "driver_id": ("list_staff",),
    "material_id": ("get_inventory",),
    "supplier_id": ("list_suppliers",),
    "task_id": ("get_tasks",),
}


def check_tool_arguments_are_obtainable() -> None:
    """Обязательный id должен быть откуда взять — в ТОМ ЖЕ отделе.

    Инструмент с обязательным `employee_id` бесполезен, если ни один
    инструмент этого отдела не отдаёт id сотрудников: модель не может
    выдумать cuid. Ровно так `assign_shift` и `create_delivery_route`
    были непригодны к вызову с рождения — списки людей и курьеров не
    существовало вовсе, а `list_employees` отдела кадров читает другую
    таблицу с другими ключами.

    Это единственная проверка, которая ловит «инструмент есть, а позвать
    его нечем»: покрытие отделов считает только количество имён.
    """
    for tool in tool_registry.all_tools():
        for arg in tool.required:
            sources = _ID_SOURCES.get(arg)
            if not sources:
                continue
            for dept in tool.departments:
                available = {t.name for t in tool_registry.tools_for(dept)}
                if not available & set(sources):
                    problems.append(
                        f"«{tool.name}» требует «{arg}», но у отдела «{dept}» нет "
                        f"инструмента, который его отдаёт "
                        f"(нужен один из: {', '.join(sources)}) — вызвать нельзя"
                    )


def check_risky_tools_are_reachable() -> None:
    """У отдела с рискованным инструментом должен быть канал подтверждения.

    rnd_bot и devops_bot не имеют Telegram-интерфейса и зовут
    `execute_bot_task(bot=None)`. Пока `approvals.request` не умел запасного
    канала, заявка у них просто не создавалась: модель получала «подтвердить
    не удалось», и ЛЮБОЙ risky-инструмент этих отделов не выполнялся никогда.
    `run_backup` — единственное реальное действие DevOps — был мёртв из задач,
    и ни одна проверка этого не видела.

    Канал есть, если у бота отдела свой токен ИЛИ в approvals объявлен запасной
    (`_fallback_bot`). Второе и чинит безголовых.
    """
    fallback = getattr(approvals, "_fallback_bot", None)
    if fallback is None:
        problems.append(
            "approvals не объявляет запасной канал подтверждения: у ботов без "
            "Telegram-интерфейса рискованные инструменты не выполнятся никогда"
        )

    for bot in bot_registry.BOTS:
        dept = bot.department
        if not dept:
            continue
        risky = [t.name for t in tool_registry.tools_for(dept) if t.risky]
        if risky and not bot.telegram and fallback is None:
            problems.append(
                f"у отдела «{dept}» ({bot.name}) есть рискованные инструменты "
                f"({', '.join(sorted(risky)[:3])}…), но бот безголовый и запасного "
                f"канала подтверждения нет — они не выполнятся никогда"
            )


#: Инструменты, без которых промпт Стёпана оставляет владельца без ответа.
#: Каждый закрывает вопрос, который задают каждый день; модель зовёт то, о чём
#: ей сказали, а `tools_for("pm")` отдаёт ей ВЕСЬ реестр — молчание промпта
#: означает, что инструмент существует, но не выбирается никогда.
_PERSONA_MUST_MENTION = {
    "add_customer": "«зарегистрируй клиента», «запиши ресторан»",
    "find_customer": "«есть ли такой клиент»",
    "register_sale": "«продали N ресторану X»",
    "get_customer_orders": "«что он обычно берёт»",
}


def check_stepan_persona_covers_tools() -> None:
    """Промпт Стёпана: упомянутые инструменты существуют, нужные — упомянуты.

    Ловит ровно ту поломку, из-за которой «Клиент <имя>, <номер>,
    ЗАРЕГИСТРИРУЙ» не завёл карточку: `add_customer` был в реестре и доступен
    Стёпану, но в персоне не упоминался НИ РАЗУ, а слово «зарегистрируй» там
    жёстко привязано к `register_sale`. Модель послушно вызвала продажу,
    выдумала товар и упёрлась в «нет в каталоге».

    Чтением кода это не видно: инструмент на месте, отдел на месте, вызов
    проходит. Не хватает одной строки в промпте — и её отсутствие ничем не
    отличается от опечатки в имени.
    """
    persona_file = ROOT / "bots" / "stepan_bot" / "handlers" / "assistant.py"
    if not persona_file.exists():
        problems.append("не найден промпт Стёпана: bots/stepan_bot/handlers/assistant.py")
        return
    body = persona_file.read_text(encoding="utf-8", errors="replace")

    known = {t.name for t in tool_registry.all_tools()}
    for name, hint in _PERSONA_MUST_MENTION.items():
        if name not in known:
            problems.append(
                f"промпт Стёпана обязан упоминать «{name}», но такого инструмента "
                f"в реестре нет — проверьте имя"
            )
        elif not re.search(rf"\b{re.escape(name)}\b", body):
            problems.append(
                f"«{name}» есть в реестре и доступен Стёпану, но в его промпте не "
                f"упомянут — на {hint} модель вызовет не его. Инструмент, о котором "
                f"промпт молчит, не выбирается никогда"
            )


def check_no_prices_in_prompts() -> None:
    """В промптах не должно быть цен строкой: источник цен — get_price_list."""
    price_re = re.compile(r"\d[\d\s]{3,}\s*(сум|so'm|uzs)", re.I)
    for path in sorted((ROOT / "shared").rglob("*.py")):
        if "__pycache__" in path.as_posix():
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
        except SyntaxError:
            continue
        # Докстринги пропускаем: там цены встречаются в примерах
        # (`format_price(50000) -> '50 000 сум'`), и это документация, а не промпт.
        docstrings = {
            id(node.value)
            for node in ast.walk(tree)
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant)
        }
        for node in ast.walk(tree):
            if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                continue
            if id(node) in docstrings or len(node.value) < 200:
                continue  # короткие строки — не промпты
            if price_re.search(node.value):
                problems.append(
                    f"{path.relative_to(ROOT).as_posix()}:{node.lineno} — в длинной "
                    f"строке есть цена в сумах. Цены живут в каталоге; в промпте "
                    f"они устаревают молча (инструмент get_price_list)"
                )


def main() -> int:
    check_department_coverage()
    check_unique_names()
    check_risky_have_confirmation()
    check_risky_have_admin_screen()
    check_focus_lands_on_the_record()
    check_pult_actions_are_allowed()
    check_realtime_topics_match()
    check_delegation_targets()
    check_executor_wired()
    check_tool_arguments_are_obtainable()
    check_risky_tools_are_reachable()
    check_stepan_persona_covers_tools()
    check_no_prices_in_prompts()

    all_tools = tool_registry.all_tools()
    counts = tool_registry.departments_with_tools()
    notes.append(f"  ok  инструментов всего: {len(all_tools)}")
    notes.append(f"  ok  рискованных (через подтверждение): "
                 f"{len([t for t in all_tools if t.risky])}")
    notes.append(f"  ok  отделов с инструментами: {len(counts)}")
    notes.append(f"  ok  руководитель видит: {len(tool_registry.tools_for('pm'))}")

    print("Сверка инструментов отделов\n")
    for note in notes:
        print(note)
    for dept in sorted(counts):
        print(f"      {dept:<10} {counts[dept]}")

    if problems:
        print(f"\n✗ найдено ({len(problems)}):")
        for problem in dict.fromkeys(problems):
            print(f"  · {problem}")
        return 1

    print("\n✓ у каждого отдела есть инструменты, цепочка делегирования замкнута")
    return 0


if __name__ == "__main__":
    sys.exit(main())

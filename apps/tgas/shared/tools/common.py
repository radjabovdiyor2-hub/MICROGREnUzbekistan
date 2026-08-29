"""
Инструменты, доступные КАЖДОМУ отделу: каталог, заказы, задачи, делегирование.

`get_price_list` здесь — прямой ответ на «бот выдумал цены»: прайс берётся из
каталога-мастера витрины, а не из промпта. Ни один системный промпт больше не
должен содержать цены строкой.

`delegate_to_department` — это «если это не моя обязанность, передай тому, чья
она». Раньше передача была полем в JSON-ответе модели и терялась по дороге;
теперь это обычный инструмент с проверкой, что у отдела-получателя есть
слушатель, и со счётчиком переходов против пинг-понга.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from shared import bot_registry, catalog_repo, storefront_orders, tasks_repo, tool_render
from shared.database import get_session_ctx
from shared.tools.registry import CHIEF_ALIASES, Tool, register
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Отделы, у которых есть слушатель TASK_CREATED. Задача в отдел без слушателя
# создаётся в БД, событие улетает, а исполнителя нет — так однажды потерялся
# весь `operations`. Отделы без бота ведёт Стёпан.
LISTENED_DEPARTMENTS = {
    "sales",
    "support",
    "hr",
    "finance",
    "marketing",
    "analytics",
    "content",
    "rnd",
    "devops",
}
CHIEF_FALLBACK = "pm"

# Больше двух передач — признак того, что отделы гоняют задачу по кругу.
MAX_DELEGATION_HOPS = 2


async def get_price_list(category: Optional[str] = None) -> Dict[str, Any]:
    """Актуальный прайс-лист из каталога.

    Показывается ДОСЛОВНО (`render=tool_render.price_list`): пересказ прайса
    моделью один раз уже назвал бейби-лист микрозеленью — цены настоящие,
    категория чужая.
    """
    return {
        "price_list": await catalog_repo.price_list(category),
        "source": "каталог витрины (products)",
        "note": "Это единственный источник цен. Другие цифры называть нельзя.",
    }


async def find_product(query: str) -> Dict[str, Any]:
    """Найти товар по названию — с учётом опечаток и раскладки."""
    matches = await catalog_repo.find(query)
    if not matches:
        return {"found": False, "message": f"«{query}» в каталоге нет."}
    return {
        "found": True,
        "products": [
            {
                "id": m["id"],
                "name": m["name"],
                "price": m["price"],
                "price_text": format_price(m["price"]),
                "unit": m["unit"],
                "stock": m["stock"],
                "category": m["category_slug"],
            }
            for m in matches
        ],
    }


async def get_orders(limit: int = 10, status: Optional[str] = None) -> Dict[str, Any]:
    """Последние заказы магазина (и с сайта, и оформленные офисом)."""
    orders = await storefront_orders.list_orders(limit=limit, status=status)
    if orders is None:
        # Отказ витрины — не «ноль заказов». Форма `{"count": 0}` неотличима
        # от честного «сегодня никто не купил», и модель докладывала провал
        # продаж, которого не было.
        return {
            "ok": False,
            "error": "Витрина недоступна — список заказов получить не удалось. "
            "Не выдавай это за отсутствие заказов.",
        }
    return {"count": len(orders), "orders": orders}


async def get_tasks(department: Optional[str] = None) -> Dict[str, Any]:
    """Открытые задачи — все или по отделу."""
    where = "status NOT IN ('done', 'cancelled')"
    params: Dict[str, Any] = {}
    if department:
        where += " AND LOWER(department) = :dept"
        params["dept"] = str(department).lower()
    async with get_session_ctx() as session:
        rows = (
            await session.execute(
                text(
                    f"SELECT id, title, department, status, priority, deadline "
                    f"FROM tasks WHERE {where} ORDER BY id DESC LIMIT 20"
                ),
                params,
            )
        ).fetchall()
    return {
        "count": len(rows),
        "tasks": [
            {
                "id": r[0],
                "title": r[1],
                "department": r[2],
                "status": r[3],
                "priority": r[4],
                "deadline": str(r[5]) if r[5] else None,
            }
            for r in rows
        ],
    }


async def create_task(
    title: str,
    department: str,
    description: str = "",
    priority: str = "medium",
) -> Dict[str, Any]:
    """Завести задачу отделу (без передачи текущей — для этого delegate)."""
    dept = _route(department)

    # Модель дробит одно поручение на несколько вызовов, и в базе появлялись
    # подряд идущие строки с одним и тем же текстом. Повтор за последний час
    # считаем тем же поручением и возвращаем номер уже существующей задачи.
    twin_id = await tasks_repo.find_recent_duplicate(title, dept)
    if twin_id:
        return {
            "ok": True,
            "task_id": twin_id,
            "department": dept,
            "duplicate": True,
            "note": f"Такая задача уже заведена — #{twin_id}. Новую не создаю.",
        }

    # Вставка и событие — одной дверью (shared/tasks_repo.create). Без события
    # строка появляется, а исполнителя у неё нет: отдел, которому её завели,
    # о ней не узнает. Ровно так копились «невыполнимые» задачи.
    return await tasks_repo.create(
        title=title,
        department=dept,
        description=description,
        priority=priority,
        assignee=dept,
    )


async def delete_task(task_id: int, reason: str = "") -> Dict[str, Any]:
    """Удалить задачу насовсем. Для мусора, а не для «больше не актуально»."""
    task = await tasks_repo.get(int(task_id))
    if not task:
        return {"ok": False, "task_id": task_id, "error": f"Задачи #{task_id} нет."}

    removed = await tasks_repo.delete(int(task_id))
    if not removed:
        return {"ok": False, "task_id": task_id, "error": "Удалить не удалось."}

    return {
        "ok": True,
        "task_id": task_id,
        "title": removed["title"],
        "department": removed["department"],
        "reason": reason,
        "summary": f"Задача #{task_id} «{removed['title'][:60]}» удалена.",
    }


def _route(department: Optional[str]) -> str:
    """Отдел, у которого точно есть исполнитель."""
    dept = str(department or "").strip().lower()
    return dept if dept in LISTENED_DEPARTMENTS else CHIEF_FALLBACK


async def delegate_to_department(
    department: str,
    reason: str = "",
    task_id: Optional[int] = None,
    hops: int = 0,
    caller_department: str = "",
) -> Dict[str, Any]:
    """Передать текущую задачу другому отделу — если она не твоя.

    `caller_department` подставляет исполнитель (`shared/task_executor.py`),
    модель его не задаёт. Имя не `department` намеренно: так называется цель,
    а `extra_args` перекрывает аргументы модели — совпадение имён стёрло бы
    выбор отдела.

    ДВЕ ОСТАНОВКИ, И ОБЕ ОБЯЗАТЕЛЬНЫ.

    10.08.2026 офис ушёл в бесконечный цикл, и остановила его только
    перезагрузка сервера. Механика была такая: на пределе передач задача
    не останавливалась, а перенаправлялась в CHIEF_FALLBACK = "pm". Но "pm" —
    это Стёпан, и когда предел срабатывал у него самого, он передавал задачу
    себе же. Событие уходило, он его принимал, снова передавал — и так без
    конца, потому что предел на каждом витке срабатывал заново.

    Поэтому: передача самому себе запрещена, а предел передач — ОТКАЗ,
    а не смена адресата. Отказ возвращается с `ok: False`, и исполнитель,
    который ищет делегирование по `ok`, события не публикует: цикл не
    начинается вообще, вместо того чтобы обрываться на каком-то витке.
    """
    caller = str(caller_department or "").strip().lower()
    target = _route(department)
    requested = str(department or "").strip().lower()

    # Себе передать нельзя. Для Стёпана это ещё и все его псевдонимы:
    # production/logistics/operations ведёт он же, и передача туда из pm —
    # та же передача самому себе, только под другим именем.
    caller_owns_target = target == caller or (
        caller in CHIEF_ALIASES and target in CHIEF_ALIASES
    )
    if caller and caller_owns_target:
        return {
            "ok": False,
            "department": caller,
            "error": (
                f"Отдел «{target}» — это ты сам. Передать задачу себе нельзя: "
                f"выполняй её инструментами или заводи human_task, если нужен человек."
            ),
        }

    if hops >= MAX_DELEGATION_HOPS:
        return {
            "ok": False,
            "department": caller or CHIEF_FALLBACK,
            "hops": hops,
            "error": (
                f"Задачу уже передавали {hops} раза — предел исчерпан, дальше "
                f"решаешь ты. Выполни её сам или заведи human_task с объяснением, "
                f"что именно нужно от человека."
            ),
        }

    if task_id:
        async with get_session_ctx() as session:
            await session.execute(
                text("UPDATE tasks SET department = :d, assignee = :d WHERE id = :tid"),
                {"d": target, "tid": task_id},
            )
            await session.commit()

    return {
        "ok": True,
        "department": target,
        "requested": requested,
        "reason": reason,
        "hops": hops + 1,
        # Причина подмены адресата ровно одна — у отдела нет слушателя.
        # Раньше сюда попадал и случай исчерпанного лимита, и модель читала
        # «отдела finance с исполнителем нет» про существующий отдел, верила
        # и передавала снова. Теперь лимит выходит отказом выше и сюда не
        # доходит.
        "note": (
            f"Отдела «{department}» с исполнителем нет — задачу ведёт руководитель."
            if target != requested
            else f"Задача передана в отдел {target}."
        ),
    }


async def human_task(action: str, department: str = "pm", reason: str = "") -> Dict[str, Any]:
    """Честно передать человеку то, чего бот сделать не может.

    С ДЕДЛАЙНОМ — это здесь главное. Дайджест просрочки ищет задачи по
    `deadline < CURRENT_DATE`, а эскалация заводилась без него: значит,
    просроченной она не становилась никогда и в сводку не попадала. Задача,
    о которой бот честно сказал «сам не могу», молча ложилась в базу, и
    человек о ней не узнавал вообще. Сутки — срок по умолчанию для того,
    что уже потребовало вмешательства.

    И БЕЗ СОБЫТИЯ — это второе. `tasks_repo.create` рассылал `TASK_CREATED`
    с отделом `pm`, а `pm` принимает Стёпан: он брал задачу «Бот выполнить это
    не может: нужен человек», исполнял её, снова упирался в то же самое и звал
    `human_task` ещё раз. Счётчик `hops` есть только у `delegate_to_department`,
    поэтому виток повторялся бесконечно, оставляя за собой цепочку одинаковых
    строк в `tasks` и по два сообщения владельцу на круг; останавливалось это
    только перезапуском. Человека будит не событие, а дайджест и список задач.
    """
    dept = _route(department)
    created = await tasks_repo.create(
        title=action[:500],
        department=dept,
        description=(
            f"{action}\n\nБот выполнить это не может: {reason or 'нужен человек'}."
        ),
        priority="high",
        assignee="Человек",
        deadline_days=1,
        notify_department=False,
    )
    return {
        "ok": True,
        "task_id": created.get("task_id"),
        "department": dept,
        "human_task": action,
        "summary": f"Передано человеку: {action}",
    }


async def get_business_summary() -> Dict[str, Any]:
    """Сводка за сегодня: заказы, выручка, задачи, новые клиенты.

    Отменённые заказы не считаются выручкой — витрина так делала всегда, а офис
    складывал их вместе с оплаченными, и одна и та же дата давала разные суммы
    на разных экранах.
    """
    from shared.tools.crm import NOT_A_SALE

    async with get_session_ctx() as session:
        orders = (
            await session.execute(
                text(
                    "SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM crm_orders "
                    "WHERE DATE(created_at) = CURRENT_DATE "
                    f"AND LOWER(status) NOT IN {NOT_A_SALE}"
                )
            )
        ).fetchone()
        tasks_open = (
            await session.execute(
                text("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done','cancelled')")
            )
        ).scalar()
        new_customers = (
            await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE deleted_at IS NULL AND DATE(created_at) = CURRENT_DATE"
                )
            )
        ).scalar()
    return {
        "orders_today": orders[0] if orders else 0,
        "revenue_today": float(orders[1]) if orders else 0.0,
        "revenue_today_text": format_price(float(orders[1]) if orders else 0),
        "open_tasks": tasks_open or 0,
        "new_customers_today": new_customers or 0,
    }


def _all_departments() -> List[str]:
    return sorted(LISTENED_DEPARTMENTS)


EVERY_DEPARTMENT = _all_departments()

register(
    Tool(
        name="get_price_list",
        admin_tab="products",
        description=(
            "Актуальный прайс-лист по товарам компании из каталога. "
            "Вызывай ВСЕГДА, когда нужны цены, ассортимент, прайс, коммерческое "
            "предложение или пост о товарах. Свои цены выдумывать запрещено."
        ),
        run=get_price_list,
        departments=EVERY_DEPARTMENT,
        params={
            "category": {
                "type": "string",
                "description": "Слаг категории (microgreens, salads, sets…). Пусто — весь каталог.",
            }
        },
        render=tool_render.price_list,
    )
)

register(
    Tool(
        name="find_product",
        admin_tab="products",
        description="Найти товар в каталоге по названию: цена, единица, остаток, id.",
        run=find_product,
        departments=EVERY_DEPARTMENT,
        params={"query": {"type": "string", "description": "Название товара"}},
        required=["query"],
    )
)

register(
    Tool(
        name="get_orders",
        admin_tab="orders",
        description="Последние заказы магазина: номер, сумма, статус, клиент.",
        run=get_orders,
        departments=EVERY_DEPARTMENT,
        params={
            "limit": {"type": "number", "description": "Сколько заказов (по умолчанию 10)"},
            "status": {"type": "string", "description": "Фильтр по статусу, необязательно"},
        },
    )
)

register(
    Tool(
        name="get_tasks",
        admin_tab="tasks",
        description="Открытые задачи — все или конкретного отдела.",
        run=get_tasks,
        departments=EVERY_DEPARTMENT,
        params={"department": {"type": "string", "description": "Отдел, необязательно"}},
    )
)

register(
    Tool(
        name="create_task",
        admin_tab="tasks",
        description=(
            "Завести НОВУЮ задачу отделу. Не для передачи текущей задачи — "
            "для этого есть delegate_to_department."
        ),
        run=create_task,
        departments=EVERY_DEPARTMENT,
        params={
            "title": {"type": "string", "description": "Коротко, что сделать"},
            "department": {
                "type": "string",
                "description": "Отдел-исполнитель: " + ", ".join(EVERY_DEPARTMENT),
            },
            "description": {"type": "string", "description": "Подробности"},
            "priority": {
                "type": "string",
                "enum": ["low", "medium", "high", "urgent"],
                "description": "Приоритет",
            },
        },
        required=["title", "department"],
    )
)

# Только руководителю: `tools_for` отдаёт весь реестр отделам из CHIEF_ALIASES
# и фильтрует по этому списку для остальных. Отделам удалять задачи незачем —
# им есть чем их закрыть, а удаление необратимо.
register(
    Tool(
        name="delete_task",
        description=(
            "Удалить задачу НАСОВСЕМ по её номеру. Только для мусора: дублей, "
            "ошибочно заведённых, потерявших смысл строк. Если задачу просто "
            "не будут делать — закрой её, а не удаляй: удалённую не вернуть."
        ),
        run=delete_task,
        departments=["pm"],
        params={
            "task_id": {"type": "integer", "description": "Номер задачи"},
            "reason": {"type": "string", "description": "Почему удаляем"},
        },
        required=["task_id"],
        risky=True,
        admin_tab="tasks",
        admin_focus_arg="task_id",
        confirm=lambda a: (
            f"Удалить задачу #{a.get('task_id', '?')} безвозвратно"
            + (f": {a.get('reason')}" if a.get("reason") else "")
        ),
    )
)

register(
    Tool(
        name="delegate_to_department",
        admin_tab="tasks",
        description=(
            "Передать ТЕКУЩУЮ задачу другому отделу, если она не входит в твои "
            "обязанности. Отдел укажи по-английски: "
            + ", ".join(EVERY_DEPARTMENT)
            + ". Если исполнителя нет, задачу примет руководитель. "
            "Себе передать нельзя, и после двух передач инструмент откажет — "
            "тогда задачу делает тот, у кого она сейчас, либо заводит human_task."
        ),
        run=delegate_to_department,
        departments=EVERY_DEPARTMENT,
        params={
            "department": {"type": "string", "description": "Кому передаём"},
            "reason": {"type": "string", "description": "Почему это их задача"},
        },
        required=["department"],
    )
)

register(
    Tool(
        name="human_task",
        admin_tab="tasks",
        description=(
            "Передать дело человеку, когда бот физически не может его сделать: "
            "встреча, переговоры, звонок, производство, закупка, найм. "
            "Честная эскалация — лучше, чем сделать вид, что выполнено."
        ),
        run=human_task,
        departments=EVERY_DEPARTMENT,
        params={
            "action": {"type": "string", "description": "Что должен сделать человек"},
            "department": {"type": "string", "description": "Чей это участок"},
            "reason": {"type": "string", "description": "Почему боту это недоступно"},
        },
        required=["action"],
    )
)

register(
    Tool(
        name="get_business_summary",
        admin_tab="stats",
        description="Сводка за сегодня: заказы, выручка, открытые задачи, новые клиенты.",
        run=get_business_summary,
        departments=EVERY_DEPARTMENT,
    )
)

# bot_registry импортируется ради проверки на старте: список отделов со
# слушателями должен совпадать с реестром ботов, иначе делегирование уедет в
# отдел, которого нет.
_KNOWN = {b.department for b in bot_registry.BOTS if b.department}
_ORPHANS = LISTENED_DEPARTMENTS - _KNOWN
if _ORPHANS:
    logger.warning(
        "TOOLS: отделы %s объявлены слушающими, но их нет в bot_registry",
        ", ".join(sorted(_ORPHANS)),
    )

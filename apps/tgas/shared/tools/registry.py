"""
🧰 РЕЕСТР ИНСТРУМЕНТОВ ОТДЕЛОВ
================================
До этого модуля инструменты были только у Стёпана: он один ходил в
`chat_with_tools` с набором функций из витрины. Остальные двенадцать ботов
делали единственный `chat_completion` и возвращали текст — то есть отдел
«выполнял» задачу, ничего не меняя в данных. Прайс-лист сочинялся моделью,
продажа не регистрировалась, а «передать в другой отдел» было полем в JSON,
которое никуда не доезжало.

Здесь объявляются инструменты, доступные боту по его отделу. Каждый инструмент:
  • делает РЕАЛЬНОЕ действие или возвращает РЕАЛЬНЫЕ данные;
  • объявляет отделы, которым он положен (`departments`);
  • помечается `risky=True`, если меняет деньги, цены, каталог или пишет клиенту —
    такие исполняются только после подтверждения владельца (shared/approvals.py).

Тела инструментов ничего не реализуют сами: они зовут `sales_ops`, `catalog_ops`,
`catalog_repo`, `storefront_orders`, `capabilities` и `bot_bus`. Дублировать
логику здесь нельзя — разойдётся с тем, что делает Стёпан.

Отдел `pm` (Стёпан) видит инструменты ВСЕХ отделов: он руководитель и работает
за отделы, у которых нет своего бота (production, logistics, operations).
"""

from __future__ import annotations

import inspect
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Отдел, который видит всё. Стёпан — руководитель, а не ещё один отдел.
CHIEF_DEPARTMENT = "pm"

# Отделы без собственного бота: задачи по ним ведёт Стёпан.
CHIEF_ALIASES = {"pm", "production", "logistics", "operations"}


@dataclass
class Tool:
    """Инструмент отдела в терминах function calling."""

    name: str
    description: str
    run: Callable[..., Awaitable[Any]]
    departments: List[str]
    params: Dict[str, Any] = field(default_factory=dict)
    required: List[str] = field(default_factory=list)
    risky: bool = False
    # Короткая фраза для карточки подтверждения владельцу: что именно произойдёт.
    confirm: Optional[Callable[[Dict[str, Any]], str]] = None

    #: Как показать РЕЗУЛЬТАТ инструмента человеку. Тем же приёмом, что `confirm`.
    #:
    #: Нужен потому, что цифры нельзя отдавать модели на пересказ. Когда результат
    #: уходил ей «сформулируй ответ», бейби-лист (100 г, 35 000) был назван
    #: «прайс-листом на микрозелень» — цены настоящие, категория чужая. Причём
    #: системный промпт несёт `BRAND_TEXT_STYLE`, то есть просит рекламный тон
    #: с хэштегом: под внутренним прайсом это выглядит ровно так, как выглядело.
    #:
    #: Здесь тот же принцип, что у отчёта о продаже и показа поста: факт из БД
    #: печатается как есть, комментарий модели поверх него запрещён.
    render: Optional[Callable[[Any], str]] = None

    #: Когда рискованный инструмент можно выполнить БЕЗ подтверждения.
    #:
    #: `risky=True` означало «всегда спрашивать», и под это правило попало
    #: всё, что делает настоящую работу: деньги, склад, производство, клиенты.
    #: Без владельца офис оставался наблюдателем — списать два килограмма
    #: субстрата стоило столько же внимания, сколько рассылка по всей базе.
    #:
    #: Предикат получает аргументы вызова и словарь порогов из настроек
    #: (`autonomy.*`, правятся в админке). Вернул True — выполняем сразу и
    #: докладываем постфактум; False — прежний путь через подтверждение.
    #:
    #: Клиентские и публикующие действия предиката НЕ имеют намеренно:
    #: письмо клиенту и пост в Instagram отозвать нельзя.
    auto_when: Optional[Callable[[Dict[str, Any], Dict[str, float]], bool]] = None

    #: Вкладка веб-админки, на которой владелец увидит предмет этого действия.
    #:
    #: Карточка подтверждения и дайджест «Ждут вашего решения» были плоским
    #: текстом: прочитав «Удалить задачу #95», владелец не мог никуда нажать —
    #: админка открывалась на кассе, и задачу он искал глазами по вкладкам.
    #: Отсюда строится ссылка `/admin?tab=<admin_tab>&focus=<...>`.
    #:
    #: Значение обязано существовать среди `id` в
    #: `apps/web/src/app/admin/adminTabs.tsx` — сверяет `scripts/check_tools.py`.
    #: Соответствие живёт ЗДЕСЬ, а не отдельной таблицей в другом файле:
    #: вторая копия разошлась бы с реестром так же, как разошлись юзернеймы
    #: ботов, и половина ссылок вела бы не туда.
    admin_tab: str = ""

    #: Из какого аргумента брать предмет действия для `focus` в ссылке.
    #: Пусто — ссылка ведёт на вкладку без выделения конкретной записи.
    admin_focus_arg: str = ""

    #: Постоянное значение `focus`, не зависящее от аргументов.
    #:
    #: Понадобилось, когда десять вкладок отделов свернулись в один экран с
    #: переключателем: у инструмента отдела контента предмет действия
    #: разный, а отдел всегда один. Без этого ссылка открывала бы продажи —
    #: первый отдел в списке — и человек переключался бы вручную каждый раз.
    #:
    #: Аргумент главнее: если `admin_focus_arg` дал значение, берётся оно.
    admin_focus_const: str = ""

    def may_run_alone(self, args: Dict[str, Any], limits: Dict[str, float]) -> bool:
        """Можно ли выполнить без подтверждения при этих аргументах."""
        if not self.risky:
            return True
        if self.auto_when is None:
            return False
        try:
            return bool(self.auto_when(args or {}, limits or {}))
        except Exception:  # порог не должен ронять исполнение
            logger.warning("Порог автономии у «%s» не сработал — спрошу владельца", self.name)
            return False

    def schema(self) -> Dict[str, Any]:
        """Объявление в формате OpenAI function calling."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.params,
                    "required": self.required,
                },
            },
        }

    def summary(self, args: Dict[str, Any]) -> str:
        if self.confirm:
            try:
                return self.confirm(args)
            except Exception:  # карточка не должна ронять исполнение
                pass
        return f"{self.name}({', '.join(f'{k}={v}' for k, v in (args or {}).items())})"


_REGISTRY: Dict[str, Tool] = {}

# Отдельный флаг, а не «реестр непустой»: модули отделов регистрируют инструменты
# при импорте, и любой прямой импорт (`from shared.tools.common import ...`)
# наполнял реестр частично. Проверка по непустому реестру считала загрузку
# завершённой, и остальные отделы оставались без инструментов — у всех выходил
# один и тот же общий набор.
_loaded = False


def register(tool: Tool) -> Tool:
    """Добавить инструмент в реестр. Имена уникальны на весь офис."""
    if tool.name in _REGISTRY:
        raise ValueError(
            f"Инструмент «{tool.name}» уже объявлен: имена должны быть уникальны, "
            f"иначе модель вызовет не то, что ожидает автор."
        )
    _REGISTRY[tool.name] = tool
    return tool


def _load() -> None:
    """Импортировать модули отделов — их импорт и наполняет реестр."""
    global _loaded
    if _loaded:
        return
    _loaded = True  # до импортов: модули отделов сами зовут register()
    from shared.tools import (  # noqa: F401  (импорт ради регистрации)
        analytics,
        common,
        content,
        crm,
        finance,
        hr,
        marketing,
        operations,
        operations_read,
        ops,
        sales,
        support,
    )


def all_tools() -> List[Tool]:
    _load()
    return list(_REGISTRY.values())


def by_name(name: str) -> Optional[Tool]:
    _load()
    return _REGISTRY.get(name)


def tools_for(department: Optional[str]) -> List[Tool]:
    """Инструменты отдела. Стёпан (pm и отделы без бота) видит все."""
    _load()
    dept = str(department or "").lower()
    if dept in CHIEF_ALIASES:
        return list(_REGISTRY.values())
    return [t for t in _REGISTRY.values() if dept in t.departments]


def schemas_for(department: Optional[str]) -> List[Dict[str, Any]]:
    return [t.schema() for t in tools_for(department)]


def catalog_text(department: Optional[str] = None) -> str:
    """Каталог инструментов текстом — для планировщика совещаний.

    Отличается от `schemas_for` тем, что это одна строка на инструмент с
    перечнем аргументов: планировщик выбирает действие в свободной форме, а не
    через function calling, и ему нужен компактный список. Обязательные
    аргументы помечены звёздочкой — раньше модель угадывала параметры по
    текстовому описанию и регулярно промахивалась.
    """
    lines: List[str] = []
    for tool in tools_for(department):
        args = ", ".join(
            f"{name}{'*' if name in tool.required else ''}"
            for name in tool.params
        )
        depts = "все" if len(tool.departments) > 5 else "/".join(tool.departments)
        mark = " ⚠️" if tool.risky else ""
        lines.append(
            f"- {tool.name} ({depts}){mark}: {tool.description}"
            + (f" | параметры: {args}" if args else " | без параметров")
        )
    return "\n".join(lines)


def from_capability(result: Any) -> Dict[str, Any]:
    """`capabilities.Result` → словарь инструмента.

    Один адаптер на все обёртки над `shared/capabilities.py`: раньше эти же
    пять строк были скопированы в sales, marketing, content, analytics и
    support — по копии на отдел.
    """
    return {
        "ok": result.ok,
        "summary": result.summary,
        "evidence": result.evidence,
        "human_task": result.human_task,
    }


def normalize_result(value: Any) -> Dict[str, Any]:
    """Ответ инструмента → единая форма {ok, summary, evidence, human_task}.

    Инструменты возвращают разные словари: обёртки над `capabilities` уже
    отдают эту форму, остальные — свою. Планировщику и карточкам нужен один
    вид, иначе каждый вызывающий изобретает разбор заново.
    """
    if not isinstance(value, dict):
        return {"ok": True, "summary": str(value)[:500], "evidence": [], "human_task": None}
    ok = value.get("ok")
    if ok is None and "status" in value:
        # Форма `{"status": "ok"|"error"|"clarify"|"duplicate"}` — так отвечают
        # `sales_ops.register_sale` и `catalog_ops.add_product`. Ключа `error` в
        # ней нет, поэтому проверка ниже считала провал успехом: карточка
        # получалась «✅ Одобрено. Продажу НЕ записал…», а телеметрия обучения
        # записывала неудачный вызов как удачный и училась на неверном сигнале.
        #
        # `duplicate` — успех: нужное состояние уже достигнуто. `clarify` — нет:
        # не хватило данных, и не произошло ничего.
        ok = str(value.get("status", "")).lower() in ("ok", "success", "done", "duplicate")
    if ok is None:
        ok = not value.get("error")
    summary = (
        value.get("summary")
        or value.get("message")
        or value.get("error")
        or ("Готово." if ok else "Не выполнено.")
    )
    evidence = value.get("evidence")
    if not isinstance(evidence, list):
        # Из обычного словаря делаем короткие факты: что именно вернул инструмент.
        evidence = [
            f"{k}: {v}"
            for k, v in value.items()
            if k not in ("ok", "summary", "message", "error", "evidence", "human_task")
            and not isinstance(v, (list, dict))
        ][:5]
    return {
        "ok": bool(ok),
        "summary": str(summary)[:500],
        "evidence": [str(e)[:200] for e in evidence],
        "human_task": value.get("human_task"),
    }


def departments_with_tools() -> Dict[str, int]:
    """{отдел: сколько инструментов} — для сверки покрытия (check_tools.py)."""
    _load()
    counts: Dict[str, int] = {}
    for tool in _REGISTRY.values():
        for dept in tool.departments:
            counts[dept] = counts.get(dept, 0) + 1
    return counts


async def call(name: str, args: Dict[str, Any]) -> Any:
    """
    Выполнить инструмент по имени.

    Лишние аргументы от модели отбрасываются: модель регулярно добавляет поля,
    которых нет в сигнатуре, и падение по TypeError выглядело бы как отказ
    инструмента, хотя вызвать его было можно.
    """
    tool = by_name(name)
    if not tool:
        return {"error": f"инструмент «{name}» не существует"}
    args = args or {}
    signature = inspect.signature(tool.run)
    accepts_all = any(
        p.kind is inspect.Parameter.VAR_KEYWORD for p in signature.parameters.values()
    )
    if not accepts_all:
        args = {k: v for k, v in args.items() if k in signature.parameters}
    try:
        return await tool.run(**args)
    except Exception as exc:
        logger.exception("TOOLS: инструмент %s упал: %s", name, exc)
        return {"error": f"инструмент «{name}» не отработал: {exc}"}

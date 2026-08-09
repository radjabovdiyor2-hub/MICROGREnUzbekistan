"""
🔁 ЦИКЛ ВЫЗОВА ИНСТРУМЕНТОВ
============================
Тонкая обвязка над `AIEngine.chat_with_tools`: модель просит инструмент — мы его
выполняем — результат возвращаем модели — она формулирует ответ человеку.

Зачем отдельный модуль: у Стёпана такой цикл уже был вшит в его обработчик, а у
остальных ботов не было никакого. Общий цикл нужен, чтобы отдел мог выполнить
задачу, а не пересказать её.

Обмен с моделью ведётся ОБЫЧНЫМИ сообщениями (`user`/`assistant` с текстом), а не
специальным ролью `tool`. Причина простая: движок один на два провайдера, и
Gemini-ветка читает у сообщения только `content` — на служебной роли она упала бы
с KeyError. Текстовая передача результата работает у обоих.

Рискованные инструменты здесь НЕ исполняются: они уходят на подтверждение
владельцу (shared/approvals.py), а модели возвращается честное «отправлено на
подтверждение», чтобы она не рапортовала о сделанном.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from shared import tools as tool_registry

logger = logging.getLogger(__name__)

# Больше четырёх кругов — модель зациклилась на инструментах вместо ответа.
MAX_ITERATIONS = 4

# Результат инструмента, урезанный до разумного размера: полный прайс-лист или
# сотня заказов вытеснили бы из контекста саму задачу.
MAX_RESULT_CHARS = 6000


@dataclass
class ToolRun:
    """След одного вызова — для отчёта и для журнала."""

    name: str
    args: Dict[str, Any]
    result: Any
    pending_approval: bool = False


@dataclass
class LoopResult:
    text: str
    calls: List[ToolRun] = field(default_factory=list)

    @property
    def acted(self) -> bool:
        """Был ли хоть один реальный вызов инструмента."""
        return bool(self.calls)

    @property
    def awaiting_approval(self) -> bool:
        return any(c.pending_approval for c in self.calls)

    @property
    def autonomous_calls(self) -> List[ToolRun]:
        """Рискованные действия, выполненные без подтверждения — на доклад."""
        return [
            c
            for c in self.calls
            if isinstance(c.result, dict) and c.result.get("autonomous")
        ]


#: Пороги самостоятельности из настроек админки. Ключи — `autonomy.*`.
_LIMIT_KEYS = (
    "autonomy.writeOffMax",
    "autonomy.plantTraysMax",
    "autonomy.receiptMaxSum",
    "autonomy.financeMaxSum",
)


async def _autonomy_limits() -> Dict[str, float]:
    """Пороги из настроек. Недоступны — считаем нулями, то есть спрашиваем.

    Безопасная сторона отказа здесь важнее свежести: если база настроек
    недоступна, бот не должен «на всякий случай» списать со склада сам.
    """
    try:
        from shared import settings_store

        return {
            key: await settings_store.get_float(key, 0.0) for key in _LIMIT_KEYS
        }
    except Exception as exc:
        logger.warning("Пороги автономии недоступны (%s) — спрашиваю владельца", exc)
        return {key: 0.0 for key in _LIMIT_KEYS}


def _dump(value: Any) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        text = str(value)
    if len(text) > MAX_RESULT_CHARS:
        text = text[:MAX_RESULT_CHARS] + "… (результат сокращён)"
    return text


def _parse_args(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        logger.warning("TOOL_RUNTIME: аргументы не разобрались: %r", raw)
        return {}


async def run_tool_loop(
    ai,
    system_prompt: str,
    user_message: str,
    department: Optional[str],
    *,
    extra_args: Optional[Dict[str, Any]] = None,
    approve: Optional[Any] = None,
    temperature: float = 0.4,
    max_iterations: int = MAX_ITERATIONS,
) -> LoopResult:
    """
    Прогнать задачу через модель с инструментами отдела.

    ai            — экземпляр AIEngine.
    department    — чей набор инструментов давать (см. shared/tools/registry).
    extra_args    — что подставить в каждый вызов помимо аргументов модели
                    (например task_id и hops для delegate_to_department).
    approve       — корутина approve(tool, args) → текст для модели. Задана —
                    рискованные инструменты уходят на подтверждение владельцу.
                    Не задана — рискованные инструменты не выполняются вовсе.
    """
    schemas = tool_registry.schemas_for(department)
    history: List[Dict[str, str]] = []
    calls: List[ToolRun] = []
    message = None

    for iteration in range(max_iterations):
        message = await ai.chat_with_tools(
            system_prompt=system_prompt,
            user_message=user_message if iteration == 0 else "",
            tools=schemas,
            conversation_history=history or None,
            temperature=temperature,
        )
        tool_calls = list(getattr(message, "tool_calls", None) or [])
        if not tool_calls:
            break

        asked, answers = [], []
        for call in tool_calls:
            name = call.function.name
            args = _parse_args(call.function.arguments)
            tool = tool_registry.by_name(name)

            if tool is None:
                answers.append(f"{name}: такого инструмента нет.")
                continue

            # Мелкое и обратимое рискованный инструмент делает сам — если у
            # него объявлен порог и аргументы в него укладываются. Крупное
            # и всё клиентское по-прежнему идёт владельцу.
            alone = tool.may_run_alone(args, await _autonomy_limits())

            if tool.risky and not alone:
                if approve is None:
                    outcome = (
                        f"{name}: действие требует подтверждения владельца, "
                        f"а подтвердить сейчас негде. НЕ сообщай, что оно выполнено."
                    )
                    calls.append(ToolRun(name, args, {"skipped": "no_approval_channel"}, True))
                else:
                    outcome = await approve(tool, {**args, **(extra_args or {})})
                    calls.append(ToolRun(name, args, {"sent_for_approval": True}, True))
                asked.append(f"{name}({_dump(args)})")
                answers.append(outcome)
                continue

            result = await tool_registry.call(name, {**args, **(extra_args or {})})
            if tool.risky:
                # Пометка нужна исполнителю: о самостоятельном действии
                # владельцу докладывают постфактум отдельной строкой.
                result = {**result, "autonomous": True} if isinstance(result, dict) else result
                logger.info(
                    "AUTONOMY: %s выполнен без подтверждения (%s)", name, _dump(args)
                )
            calls.append(ToolRun(name, args, result))
            asked.append(f"{name}({_dump(args)})")
            answers.append(f"{name} вернул: {_dump(result)}")

        history.append({"role": "assistant", "content": "Вызвал инструменты: " + "; ".join(asked)})
        history.append(
            {
                "role": "user",
                "content": (
                    "Результаты инструментов:\n"
                    + "\n".join(answers)
                    + "\n\nТеперь дай окончательный ответ по задаче. "
                    "Опирайся ТОЛЬКО на эти данные, ничего не додумывай."
                ),
            }
        )

    text = (getattr(message, "content", None) or "").strip()
    if not text and calls:
        # Модель ушла в инструменты и не сформулировала ответ — отдаём факты,
        # а не пустое сообщение: человек должен видеть, что произошло.
        text = "Выполнено:\n" + "\n".join(f"• {c.name}: {_dump(c.result)}" for c in calls)
    return LoopResult(text=text or "Не смог сформулировать ответ по задаче.", calls=calls)

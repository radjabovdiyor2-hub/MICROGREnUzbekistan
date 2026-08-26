"""
✅ ПОДТВЕРЖДЕНИЕ ВЛАДЕЛЬЦА — ЕДИНЫЙ МЕХАНИЗМ НА ВЕСЬ TELEGRAM
==============================================================
Отделы получили инструменты, которые меняют деньги, цены, каталог и пишут живым
клиентам. Ошибка модели в таком инструменте — это не кривой текст, а изменённые
данные, поэтому исполняется он только после нажатия «Одобрить».

ПОЧЕМУ МЕХАНИЗМ ОДИН

Их было три, и все делали одно и то же по-разному:
  · этот модуль — заявки инструментов отделов (Redis, 15 минут);
  · `_PENDING` в assistant.py — карточки изменяющих действий витрины
    (словарь в памяти процесса: перезапуск бота обнулял всё неподтверждённое);
  · `PENDING_EXEC` в team_meeting.py — планы совещаний (тоже словарь в памяти).
Три хранилища, три префикса callback_data, три набора текстов. Теперь заявка
одна, а тип действия задаётся полем `kind` с обработчиком, который
регистрирует владелец логики.

ЗАЯВКА НЕ ИСТЕКАЕТ

Хранилище — таблица `owner_approvals`, а не Redis с TTL 15 минут. Прежний
срок жизни означал ровно одно: не нажал за четверть часа — намерение
исчезло. Никто не напоминал, повтора не было, задача оставалась в `todo`
навсегда, и владельцу даже не сообщали, что заявка существовала. Очереди
«что от меня ждут» не было ни в Telegram, ни в админке.

Теперь заявка ждёт решения сколько нужно, о ней напоминают с нарастающим
интервалом (`REMIND_AFTER_HOURS`), а `list_pending()` показывает очередь.
Решение атомарно — `UPDATE ... WHERE status = 'pending'`, поэтому двойное
нажатие не выполняет действие дважды (связка Redis GET+DELETE такой
гарантии не давала).

Тот же принцип действует в веб-админке: там write-инструмент возвращает
предложение с подписанным токеном, а не выполняется сразу
(apps/web/src/lib/stepan/proposal.ts). Здесь — телеграм-сторона того же.

КАК ДОБАВИТЬ СВОЙ ТИП

    approvals.register_handler("meeting_plan", run_plan)   # при старте бота
    await approvals.request(bot, chat_id, "meeting_plan",
                            payload={...}, summary="Запустить план")

`run_plan(payload, callback)` вызывается после нажатия ✅ и возвращает строку
для карточки. Ничего не выполняется до нажатия — в этом весь смысл.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from typing import Any, Awaitable, Callable, Dict, Optional, Protocol

from aiogram import Bot, F, Router
from aiogram.types import CallbackQuery, InlineKeyboardMarkup, Message
from aiogram.utils.keyboard import InlineKeyboardBuilder

from shared import admin_links
from shared import tools as tool_registry
from shared.config import settings

logger = logging.getLogger(__name__)

approvals_router = Router()

#: Через сколько часов напомнить о невзятой заявке. Интервал нарастает:
#: первое напоминание через час, дальше реже — чтобы не превратиться в спам,
#: но и не дать заявке потеряться.
REMIND_AFTER_HOURS = (1, 4, 12, 24)

class Decision(Protocol):
    """
    Чем обработчик заявки пользуется на самом деле.

    Решение приходит двумя путями: нажатием кнопки в Telegram
    (`CallbackQuery`) и из веб-админки (`_WebDecision`). Тип был объявлен
    как `CallbackQuery` — то есть веб-путь описывался типом, которому он
    не соответствует, и проверка типов на этом спотыкалась справедливо.

    Обработчикам нужны ровно две вещи: `bot`, чтобы написать в чат, и
    `answer`, чтобы показать всплывающий ответ. Протокол называет это
    честно и оставляет оба пути равноправными.
    """

    # Свойство, а не поле: у `CallbackQuery` это свойство aiogram, и
    # изменяемым полем оно не описывается — типы разошлись бы на ровном месте.
    @property
    def bot(self) -> Optional[Bot]: ...

    # Не `async def`: у `CallbackQuery` это обычный метод, возвращающий
    # ожидаемый объект aiogram, а у веб-заглушки — корутина. Общее у них —
    # «результат можно await», и протокол говорит ровно это.
    def answer(self, text: Optional[str] = None, **kwargs: Any) -> Any: ...


#: Тип заявки → что сделать после «Одобрить». Возвращает текст для карточки.
Handler = Callable[[Dict[str, Any], Decision], Awaitable[str]]
_HANDLERS: Dict[str, Handler] = {}

#: Тип заявки → что прибрать после «Отклонить». Нужен не всем: у отказа обычно
#: нет работы. Но, например, отклонённый план совещания надо снять с «исполнен»,
#: иначе он залипает в meeting_state и мешает следующему.
_REJECT_HANDLERS: Dict[str, Handler] = {}

#: Аргументы, которые модель пишет свободным текстом. В отпечаток они не входят.
#:
#: «Задача удалена по запросу» и «Удаление дублирующих задач» — это ОДНО
#: действие `delete_task(task_id=95)` с разной формулировкой причины. Пока
#: причина участвовала бы в отпечатке, дедуп не сработал бы ни разу: на
#: скриншоте владельца именно так и вышло — десять строк про одну задачу.
_VOLATILE_ARGS = frozenset({"reason", "comment", "note", "notes", "message", "description"})


def register_handler(kind: str, handler: Handler) -> None:
    """Зарегистрировать обработчик типа заявки (вызывать при старте бота)."""
    _HANDLERS[kind] = handler


def register_reject_handler(kind: str, handler: Handler) -> None:
    """Что сделать, если владелец нажал «Отклонить» (необязательно)."""
    _REJECT_HANDLERS[kind] = handler


def fingerprint(kind: str, payload: Dict[str, Any], bot_name: str) -> str:
    """Отпечаток действия: одинаковая просьба даёт одинаковую строку.

    В него входят тип заявки, отдел, инструмент и его СТАБИЛЬНЫЕ аргументы —
    то есть предмет действия. Свободный текст модели (`_VOLATILE_ARGS`)
    исключён намеренно: переформулированная причина не делает действие другим.
    """
    data = payload or {}
    raw_args = data.get("args")
    args: Dict[str, Any] = raw_args if isinstance(raw_args, dict) else {}
    stable = {k: v for k, v in args.items() if k not in _VOLATILE_ARGS}
    material = json.dumps(
        {
            "kind": str(kind or ""),
            "bot": str(bot_name or ""),
            "tool": str(data.get("tool") or ""),
            # Витринные заявки (`storefront_write`) намеренно НЕ склеиваются:
            # аргументы у них спрятаны в подписанном токене, а он одноразовый
            # и живёт 15 минут (apps/web/src/lib/stepan/proposal.ts). Вернув
            # владельцу токен получасовой давности, дедуп превратил бы нажатие
            # «Одобрить» в отказ витрины. Токен в отпечатке — это и есть отказ
            # от склейки: у каждого предложения он свой.
            "token": str(data.get("token") or ""),
            "args": stable,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:32]


async def _find_pending(fp: str) -> Optional[str]:
    """Токен висящей заявки с тем же отпечатком, если она есть."""
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    sa_text(
                        "UPDATE owner_approvals "
                        "SET duplicate_count = duplicate_count + 1 "
                        "WHERE token = ("
                        "  SELECT token FROM owner_approvals "
                        "  WHERE status = 'pending' AND fingerprint = :fp "
                        "  ORDER BY created_at ASC LIMIT 1"
                        ") RETURNING token"
                    ),
                    {"fp": fp},
                )
            ).fetchone()
            await session.commit()
        return row[0] if row else None
    except Exception as exc:
        logger.warning("APPROVALS: сверка дублей не сработала: %s", exc)
        return None


async def _save(
    token: str,
    kind: str,
    payload: Dict[str, Any],
    summary: str,
    bot_name: str,
    chat_id: Optional[int],
    task_id: Optional[int] = None,
    fp: str = "",
) -> bool:
    """Сохранить заявку в базу. False — сохранить не удалось, заявки нет."""
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            await session.execute(
                sa_text(
                    "INSERT INTO owner_approvals "
                    "(token, kind, summary, payload, bot_name, chat_id, task_id, "
                    " fingerprint, duplicate_count, status, remind_count, created_at) "
                    "VALUES (:tok, :kind, :sum, CAST(:pl AS jsonb), :bot, :chat, "
                    " :task, :fp, 0, 'pending', 0, NOW())"
                ),
                {
                    "tok": token,
                    "kind": kind,
                    "sum": summary[:2000],
                    "pl": json.dumps(payload, ensure_ascii=False, default=str),
                    "bot": bot_name[:50],
                    "chat": chat_id,
                    "fp": fp or None,
                    "task": task_id
                    if task_id is not None
                    else (
                        (payload or {}).get("args", {}).get("task_id")
                        if isinstance(payload, dict)
                        else None
                    ),
                },
            )
            await session.commit()
        return True
    except Exception as exc:
        logger.warning("APPROVALS: не смог сохранить заявку: %s", exc)
        return False


async def list_pending(limit: int = 20) -> list:
    """Заявки, ждущие решения. Это и есть очередь «на вас».

    Такого списка не существовало: заявка жила в Redis 15 минут и молча
    испарялась, а увидеть «что от меня ждут» было негде — ни в Telegram,
    ни в админке.
    """
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            rows = (
                await session.execute(
                    sa_text(
                        "SELECT token, kind, summary, bot_name, chat_id, "
                        "remind_count, created_at, reminded_at, payload, "
                        "duplicate_count FROM owner_approvals "
                        "WHERE status = 'pending' ORDER BY created_at ASC LIMIT :lim"
                    ),
                    {"lim": int(limit)},
                )
            ).fetchall()
        return [
            {
                "token": r[0],
                "kind": r[1],
                "summary": r[2],
                "bot_name": r[3],
                "chat_id": r[4],
                "remind_count": r[5],
                "created_at": r[6],
                # Без него шаг напоминания отсчитывался от создания заявки, а не
                # от последнего напоминания: после суток жизни условие
                # срабатывало на КАЖДОМ часовом прогоне, и владелец получал
                # один и тот же дайджест круглосуточно.
                "reminded_at": r[7],
                # Нужен, чтобы построить ссылку на экран по теме заявки.
                "payload": json.loads(r[8]) if isinstance(r[8], str) else (r[8] or {}),
                "duplicate_count": r[9] or 0,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning("APPROVALS: очередь недоступна: %s", exc)
        return []


async def count_pending() -> int:
    """Сколько всего заявок ждёт решения.

    Считается отдельно от `list_pending`: та отдаёт страницу с `LIMIT`, и
    `len()` по ней печатал в шапке дайджеста размер лимита («20») вместо
    настоящей очереди — сколько бы заявок ни висело на самом деле.
    """
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    sa_text("SELECT COUNT(*) FROM owner_approvals WHERE status = 'pending'")
                )
            ).fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:
        logger.warning("APPROVALS: не смог посчитать очередь: %s", exc)
        return 0


async def mark_reminded(token: str) -> None:
    """Отметить, что о заявке напомнили — интервал следующего растёт."""
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            await session.execute(
                sa_text(
                    "UPDATE owner_approvals "
                    "SET remind_count = remind_count + 1, reminded_at = NOW() "
                    "WHERE token = :tok"
                ),
                {"tok": token},
            )
            await session.commit()
    except Exception as exc:
        logger.warning("APPROVALS: не отметил напоминание %s: %s", token, exc)


def _owner_chat_id() -> Optional[int]:
    ids = getattr(settings, "admin_telegram_ids", None) or []
    return ids[0] if ids else None


def _fallback_bot() -> Optional[Bot]:
    """Бот Стёпана — запасной канал до владельца.

    У qa_bot, rnd_bot и devops_bot нет Telegram-интерфейса: они зовут
    `execute_bot_task(bot=None)`, и карточку подтверждения слать было нечем.
    Заявка не создавалась, модель получала «подтвердить не удалось», и ЛЮБОЙ
    рискованный инструмент у этих трёх отделов не выполнялся никогда — включая
    `run_backup`, единственное реальное действие DevOps.

    Стёпан подходит: у него есть токен и подключён `approvals_router`,
    а владелец у офиса один. Кнопку всё равно нажимает только он (`is_owner`).
    """
    token = getattr(settings, "stepan_bot_token", "") or ""
    if not token:
        return None
    try:
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode

        return Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    except Exception as exc:  # токен битый — молча не падаем
        logger.warning("APPROVALS: запасной канал недоступен: %s", exc)
        return None


def is_owner(user_id: Optional[int]) -> bool:
    """Кнопку подтверждения нажимает ТОЛЬКО владелец.

    Проверка здесь, а не у вызывающих: карточка уходит в чат задачи, а отделы
    работают и в групповых чатах — без неё любой участник группы мог одобрить
    регистрацию продажи, рассылку по всей клиентской базе, смену статуса
    заказа, списание со склада или бэкап. Оба механизма, которые этот модуль
    заменил, такую проверку имели (`is_admin` в assistant.py, `_is_admin` в
    team_meeting.py), и при объединении она потерялась.
    """
    ids = getattr(settings, "admin_telegram_ids", None) or []
    return bool(user_id) and user_id in ids


async def request(
    bot: Optional[Bot],
    chat_id: Optional[int],
    kind: str,
    payload: Dict[str, Any],
    summary: str,
    *,
    bot_name: str = "office",
    details: str = "",
    task_id: Optional[int] = None,
    outcome: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Показать владельцу карточку и запомнить заявку. Возвращает токен или None.

    Ничего не выполняется: до нажатия кнопки в данных не меняется ни строки.

    `task_id` связывает заявку с задачей, из которой она выросла: по нему
    решение владельца закрывает задачу. Если не передан — берётся из
    `payload["args"]["task_id"]`, как было раньше.

    `outcome` — необязательный словарь, куда кладётся `duplicate=True`, если
    такая же заявка уже висела и новой карточки не было. Нужен вызывающему,
    чтобы сказать модели «ты уже просила об этом», а не делать вид, что
    отправлена новая просьба.
    """
    target = chat_id or _owner_chat_id()

    # Безголовый бот (qa/rnd/devops) шлёт карточку через Стёпана, а не молчит.
    # Чат при этом всегда владельца: у чужого бота нет доступа к чату задачи.
    own_bot = bot is not None
    if bot is None:
        bot = _fallback_bot()
        target = _owner_chat_id()

    if bot is None or not target:
        logger.warning("APPROVALS: нет канала до руководителя — заявка %s не создана", kind)
        return None

    # Та же просьба уже висит — поднимаем счётчик и молчим. Иначе владелец
    # получал по карточке на каждый повтор: задача оставалась в `todo`, её
    # ежечасно переоткрывал `retry_stuck_tasks`, отдел заново звал тот же
    # инструмент, и каждый раз рождался новый токен — мимо защиты от двойного
    # нажатия. Десять строк «Удалить задачу #95» в дайджесте — это оно.
    fp = fingerprint(kind, payload, bot_name)
    existing = await _find_pending(fp)
    if existing:
        logger.info("APPROVALS: повтор заявки %s — карточка уже висит (%s)", kind, existing)
        if outcome is not None:
            outcome["duplicate"] = True
        if not own_bot:
            try:
                await bot.session.close()
            except Exception:
                pass
        return existing

    token = uuid.uuid4().hex[:16]
    if not await _save(token, kind, payload, summary, bot_name, target, task_id, fp):
        return None

    builder = InlineKeyboardBuilder()
    builder.button(text="✅ Одобрить", callback_data=f"approve:{token}")
    builder.button(text="❌ Отклонить", callback_data=f"reject:{token}")
    # Третья кнопка ведёт на экран админки по теме заявки. Без неё карточка
    # была тупиком: чтобы посмотреть задачу, заказ или цену, о которых
    # спрашивают, владелец открывал сайт и искал вкладку глазами.
    builder.add(admin_links.open_button("🏢 Открыть в админке", kind, payload, target))
    builder.adjust(2, 1)

    body = (
        f"⚠️ <b>Нужно ваше подтверждение</b>\n\n"
        f"<b>От кого:</b> {bot_name}\n"
        f"<b>Действие:</b> {summary}\n"
    )
    if details:
        body += f"\n{details}\n"
    # Заявка больше НЕ истекает. Раньше здесь обещали «кнопки живут 15 минут»,
    # и это была правда: ключ в Redis истекал, намерение исчезало, задача
    # оставалась в todo навсегда, и владельцу об этом никто не говорил.
    body += "\n<i>В базе пока ничего не изменилось. Заявка ждёт вашего решения.</i>"

    try:
        await bot.send_message(
            target, body, parse_mode="HTML", reply_markup=builder.as_markup()
        )
    except Exception as exc:
        logger.warning("APPROVALS: карточка не доставлена: %s", exc)
        return None
    finally:
        # Запасного бота создали здесь — здесь же и закрываем сессию,
        # иначе aiohttp течёт по одному соединению на каждую заявку.
        if not own_bot:
            try:
                await bot.session.close()
            except Exception:
                pass
    return token


async def request_approval(
    bot: Optional[Bot],
    tool: tool_registry.Tool,
    args: Dict[str, Any],
    *,
    bot_name: str,
    chat_id: Optional[int] = None,
    task_id: Optional[int] = None,
) -> str:
    """
    Отправить на подтверждение вызов рискованного инструмента.

    Возвращает текст для модели — он попадёт в её контекст, поэтому формулировка
    важна: модель не должна решить, что действие уже выполнено.
    """
    outcome: Dict[str, Any] = {}
    token = await request(
        bot,
        chat_id,
        "tool",
        {"tool": tool.name, "args": args},
        tool.summary(args),
        bot_name=bot_name,
        task_id=task_id,
        outcome=outcome,
    )
    if not token:
        return (
            f"{tool.name}: подтвердить не удалось (нет канала до руководителя "
            f"или недоступен Redis). Действие НЕ выполнено — так и скажи."
        )
    if outcome.get("duplicate"):
        # Иначе модель решит, что отправила новую просьбу, и повторит вызов —
        # именно так копилась пачка одинаковых карточек у владельца.
        return (
            f"{tool.name}: об этом УЖЕ отправлена заявка, она ждёт решения "
            f"руководителя. Повторно не проси и не описывай результат как "
            f"достигнутый — просто скажи, что ждём."
        )
    return (
        f"{tool.name}: отправлено руководителю на подтверждение. "
        f"Действие ПОКА НЕ выполнено — сообщи, что ждём решения, "
        f"и не описывай результат как достигнутый."
    )


def approver(
    bot: Optional[Bot],
    bot_name: str,
    chat_id: Optional[int] = None,
    task_id: Optional[int] = None,
):
    """Готовая функция `approve` для shared/tool_runtime.run_tool_loop.

    `task_id` нужен, чтобы решение владельца закрыло задачу, из которой
    выросла заявка, — иначе она остаётся в очереди и её переоткрывают заново.
    """

    async def _approve(tool: tool_registry.Tool, args: Dict[str, Any]) -> str:
        return await request_approval(
            bot, tool, args, bot_name=bot_name, chat_id=chat_id, task_id=task_id
        )

    return _approve


async def _take(token: str, decision: str) -> Optional[Dict[str, Any]]:
    """Забрать заявку и зафиксировать решение. Одноразово.

    Одним UPDATE с условием `status = 'pending'`: два быстрых нажатия дают
    одну сработавшую строку, вторая вернёт пусто. Прежняя связка
    Redis GET + DELETE такой гарантии не давала — между ними помещался
    второй обработчик, и действие могло выполниться дважды.
    """
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    sa_text(
                        "UPDATE owner_approvals SET status = :st, decided_at = NOW() "
                        "WHERE token = :tok AND status = 'pending' "
                        "RETURNING kind, payload, bot_name, chat_id, task_id"
                    ),
                    {"tok": token, "st": decision},
                )
            ).fetchone()
            await session.commit()
        if not row:
            return None
        payload = row[1]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return {
            "kind": row[0],
            "payload": payload or {},
            "bot": row[2],
            "chat_id": row[3],
            "task_id": row[4],
        }
    except Exception as exc:
        logger.warning("APPROVALS: не смог прочитать заявку %s: %s", token, exc)
        return None


async def _take_by_id(approval_id: int, decision: str) -> Optional[Dict[str, Any]]:
    """То же, что `_take`, но по номеру строки — так заявку видит админка.

    В Telegram заявка адресуется токеном (он влезает в `callback_data`), а в
    вебе — обычным `id` из списка. Условие `status = 'pending'` то же самое,
    поэтому одновременное нажатие в двух местах даёт ровно одно выполнение.
    """
    from sqlalchemy import text as sa_text

    from shared.database import get_session_ctx

    try:
        async with get_session_ctx() as session:
            row = (
                await session.execute(
                    sa_text(
                        "UPDATE owner_approvals SET status = :st, decided_at = NOW() "
                        "WHERE id = :aid AND status = 'pending' "
                        "RETURNING kind, payload, bot_name, chat_id, task_id"
                    ),
                    {"aid": int(approval_id), "st": decision},
                )
            ).fetchone()
            await session.commit()
        if not row:
            return None
        payload = row[1]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return {
            "kind": row[0],
            "payload": payload or {},
            "bot": row[2],
            "chat_id": row[3],
            "task_id": row[4],
        }
    except Exception as exc:
        logger.warning("APPROVALS: не смог прочитать заявку #%s: %s", approval_id, exc)
        return None


class _WebDecision:
    """Заглушка `CallbackQuery` для решения, принятого НЕ в Telegram.

    Обработчики заявок объявлены как `(payload, callback)` и почти все
    аргумент игнорируют — им нужен только `payload`. Исключение одно:
    запуск плана совещания зовёт `cb.bot`, чтобы написать в чат.
    Поэтому здесь ровно то, чем пользуются, и ничего больше.
    """

    def __init__(self, bot: Optional[Bot]):
        self.bot = bot
        self.message = None
        self.from_user = None

    async def answer(self, *args, **kwargs) -> None:
        """Всплывающего ответа в вебе нет — результат вернётся в HTTP."""
        return None


async def decide(
    approval_id: int,
    decision: str,
    bot: Optional[Bot] = None,
) -> Dict[str, Any]:
    """Решить заявку по её номеру. Возвращает результат для показа человеку.

    ЗАЧЕМ ЭТО ЕСТЬ

    Одобрить заявку можно было ТОЛЬКО в Telegram: выполнение живёт здесь, в
    `_HANDLERS`, а у витрины нет ни инструментов, ни шины. Владелец, сидящий
    в админке, видел очередь «Ждёт решения» и мог лишь снять заявку — то
    есть весь цикл подтверждений упирался в мессенджер.

    Функция общая: кнопка в Telegram и админка проходят один и тот же путь,
    включая одноразовость (`status = 'pending'` в UPDATE) и закрытие задачи,
    из которой заявка выросла.

    Ключи ответа: `ok` (решение принято), `acted` (действие получилось),
    `message` (что сказать человеку), `kind`.
    """
    if decision not in ("approved", "rejected"):
        return {"ok": False, "acted": False, "message": "Неизвестное решение", "kind": ""}

    request_data = await _take_by_id(approval_id, decision)
    if not request_data:
        # Не «ошибка», а «уже решено»: то же самое видит второй нажавший.
        return {"ok": False, "acted": False, "message": "Заявка уже обработана", "kind": ""}

    kind = request_data.get("kind", "")
    context = _WebDecision(bot or _fallback_bot())

    if decision == "rejected":
        handler = _REJECT_HANDLERS.get(kind)
        note = ""
        if handler is not None:
            try:
                note = await handler(request_data.get("payload") or {}, context) or ""
            except Exception as exc:
                logger.exception("APPROVALS: обработчик отказа %s упал: %s", kind, exc)
        await _close_task(request_data.get("task_id"), "cancelled")
        return {"ok": True, "acted": True, "message": note or "Отклонено.", "kind": kind}

    handler = _HANDLERS.get(kind)
    if handler is None:
        logger.error("APPROVALS: нет обработчика для типа %r — заявка потеряна", kind)
        return {"ok": True, "acted": False, "message": "Некому выполнить это действие", "kind": kind}

    acted = True
    try:
        outcome = await handler(request_data.get("payload") or {}, context)
        if isinstance(outcome, tuple):
            message, acted = outcome
        else:
            message = outcome
    except Exception as exc:
        logger.exception("APPROVALS: обработчик %s упал: %s", kind, exc)
        message = f"Не выполнено: {exc}"
        acted = False

    # Получилось — задача закрыта. Нет — возвращаем в работу, чтобы она не
    # считалась выполненной и осталась на виду.
    await _close_task(request_data.get("task_id"), "done" if acted else "todo")
    return {"ok": True, "acted": acted, "message": message or "", "kind": kind}


async def _run_tool(payload: Dict[str, Any], callback: Decision):
    result = await tool_registry.call(payload["tool"], payload.get("args") or {})
    normalized = tool_registry.normalize_result(result)
    # Возвращаем и признак успеха: по нему решается судьба задачи. Инструмент
    # может отказать уже ПОСЛЕ нажатия ✅ (витрина не ответила, данных не
    # хватило), и закрывать задачу в этом случае значит записать несделанное
    # в сделанное.
    return normalized["summary"], normalized["ok"]


_HANDLERS["tool"] = _run_tool


async def _close_task(task_id: Optional[int], status: str) -> None:
    """Довести решение по заявке до задачи, из которой она выросла.

    Колонка `owner_approvals.task_id` заполнялась с самого начала и не
    читалась нигде. Задача оставалась в `todo`, пока владелец думал, и через
    три часа `retry_stuck_tasks` заводил ВТОРУЮ карточку на то же действие,
    в 15:00 — третью. Заявки разные, поэтому защита от двойного нажатия не
    срабатывала: три «✅» списывали втрое больше, чем просили.
    """
    if not task_id:
        return
    try:
        from shared import tasks_repo

        await tasks_repo.set_status(int(task_id), status)
    except Exception as exc:
        logger.warning("APPROVALS: не смог сменить статус задачи #%s: %s", task_id, exc)


@approvals_router.callback_query(F.data.startswith("approve:"))
async def on_approve(callback: CallbackQuery):
    if not is_owner(callback.from_user.id if callback.from_user else None):
        await callback.answer("⛔ Только для руководителя", show_alert=True)
        return

    token = (callback.data or "").split(":", 1)[-1]
    if not token:
        await callback.answer("Заявка не опознана", show_alert=True)
        return
    request_data = await _take(token, "approved")
    if not request_data:
        await callback.answer("Заявка истекла или уже обработана", show_alert=True)
        return

    handler = _HANDLERS.get(request_data.get("kind", ""))
    if handler is None:
        await callback.answer("Некому выполнить это действие", show_alert=True)
        logger.error(
            "APPROVALS: нет обработчика для типа %r — заявка потеряна",
            request_data.get("kind"),
        )
        return

    await callback.answer("Выполняю…")
    acted = True
    try:
        outcome = await handler(request_data.get("payload") or {}, callback)
        # Обработчик может вернуть либо текст, либо пару (текст, успех).
        if isinstance(outcome, tuple):
            message, acted = outcome
        else:
            message = outcome
    except Exception as exc:
        logger.exception("APPROVALS: обработчик %s упал: %s", request_data.get("kind"), exc)
        message = f"Не выполнено: {exc}"
        acted = False

    # Действие получилось — задача закрыта. Не получилось — возвращаем в работу,
    # чтобы она не считалась выполненной и осталась на виду.
    await _close_task(request_data.get("task_id"), "done" if acted else "todo")

    head = "✅ <b>Одобрено.</b>" if acted else "⚠️ <b>Одобрено, но не выполнено.</b>"
    await _finish(callback, f"{head}\n{message}", token)


@approvals_router.callback_query(F.data.startswith("reject:"))
async def on_reject(callback: CallbackQuery):
    # Отказ тоже только для владельца: иначе посторонний мог бы «отклонить»
    # заявку и тем самым отменить решение руководителя.
    if not is_owner(callback.from_user.id if callback.from_user else None):
        await callback.answer("⛔ Только для руководителя", show_alert=True)
        return

    token = (callback.data or "").split(":", 1)[-1]
    if not token:
        await callback.answer("Заявка не опознана", show_alert=True)
        return
    request_data = await _take(token, "rejected")
    if not request_data:
        await callback.answer("Заявка истекла или уже обработана", show_alert=True)
        return

    await callback.answer("Отклонено")
    handler = _REJECT_HANDLERS.get(request_data.get("kind", ""))
    tail = "❌ <b>Отклонено.</b> Ничего не изменилось."
    if handler is not None:
        try:
            note = await handler(request_data.get("payload") or {}, callback)
            if note:
                tail += f"\n{note}"
        except Exception as exc:
            logger.exception(
                "APPROVALS: обработчик отказа %s упал: %s", request_data.get("kind"), exc
            )
    # Владелец сказал «нет» — задача закрыта отказом, а не висит в очереди,
    # откуда её через три часа достанет retry_stuck_tasks и спросит снова.
    await _close_task(request_data.get("task_id"), "cancelled")
    await _finish(callback, tail, token)


def _keyboard_without(
    markup: Optional[InlineKeyboardMarkup], token: str
) -> Optional[InlineKeyboardMarkup]:
    """Клавиатура без кнопок решённой заявки — остальные остаются живыми.

    На одиночной карточке решение снимает обе кнопки, и клавиатуры не остаётся.
    А в дайджесте кнопки трёх разных заявок висят на ОДНОМ сообщении: погасив
    их все, нажатие «Одобрить» по первой строке лишило бы владельца решения по
    двум другим — и он ушёл бы искать их карточки по переписке, ровно от чего
    дайджест и уводит.
    """
    if markup is None:
        return None
    rows = []
    for row in markup.inline_keyboard:
        kept = [b for b in row if not (b.callback_data or "").endswith(f":{token}")]
        if kept:
            rows.append(kept)
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _finish(callback: CallbackQuery, tail: str, token: str = "") -> None:
    """
    Дописать решение в карточку.

    ⚠️ КАРТОЧКА МОЖЕТ БЫТЬ НЕРЕДАКТИРУЕМОЙ, и здесь это не редкость, а
    норма: заявка ждёт решения сколько угодно (см. «ЗАЯВКА НЕ ИСТЕКАЕТ»
    выше), а сообщение старше 48 часов Telegram отдаёт как
    `InaccessibleMessage` — у него нет ни текста, ни `edit_text`, ни
    `answer`. Прежний код звал их прямо, ловил падение и в запасном пути
    звал `answer` у того же недоступного объекта: действие к этому моменту
    УЖЕ выполнено, а владелец не видел ни подтверждения, ни ошибки.

    Поэтому доступность проверяется явно, а последний рубеж — отправка
    нового сообщения ботом: чат известен даже у недоступной карточки.
    """
    message = callback.message

    if isinstance(message, Message):
        keyboard = _keyboard_without(message.reply_markup, token) if token else None
        try:
            await message.edit_text(
                message.html_text + "\n\n" + tail,
                parse_mode="HTML",
                reply_markup=keyboard,
                # Ссылки в строках дайджеста ведут в админку; превью сайта под
                # каждым решением превратило бы сообщение в ленту картинок.
                disable_web_page_preview=True,
            )
            return
        except Exception as exc:
            logger.warning("APPROVALS: карточка не обновилась (%s) — пишу отдельно", exc)
            try:
                await message.answer(tail, parse_mode="HTML")
                return
            except Exception as exc2:
                logger.warning("APPROVALS: ответ в карточку не ушёл: %s", exc2)

    # Карточка недоступна: пишем в тот же чат новым сообщением.
    chat_id = message.chat.id if message else (
        callback.from_user.id if callback.from_user else None
    )
    if callback.bot is None or chat_id is None:
        logger.error("APPROVALS: решение принято, но сообщить о нём некуда")
        return
    try:
        await callback.bot.send_message(chat_id, tail, parse_mode="HTML")
    except Exception as exc:
        logger.error("APPROVALS: решение принято, но доложить не удалось: %s", exc)

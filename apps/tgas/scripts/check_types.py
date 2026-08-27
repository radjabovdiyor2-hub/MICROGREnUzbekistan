"""
Проверка типов там, где ошибка типа стоит денег.

ЗАЧЕМ ЭТА ПРОВЕРКА

`mypy` в CI стоял с `|| true`, то есть не значил ничего: типизация Python не
гарантировалась ни одной строкой. Прогон по всему офису даёт 573 ошибки в
61 файле — почти все в обработчиках aiogram, где `message.text` объявлен
необязательным, а код читает его напрямую. Включить это блокирующим целиком
значит сделать CI вечно красным, а красный CI перестают открывать; в
ci.yml уже записано, почему так нельзя (см. `npm audit --audit-level=high`).

ПОЧЕМУ ИМЕННО ЭТИ МОДУЛИ. Здесь ЕДИНСТВЕННЫЕ ДВЕРИ к данным и машинерия
вокруг них: заказы, каталог, клиенты, задачи, производство, учёт токенов,
подтверждения, планировщик, шина. Ошибка типа в обработчике — это
неотвеченное сообщение; ошибка типа здесь — несписанное сырьё, потерянный
заказ или расход, посчитанный по ставке наугад.

Первый же прогон по этому списку нашёл 27 расхождений, и одно из них было
настоящим багом: `post_reel` объявляла возврат `Optional[str]`, а отдавала
`True` — и вызывающий писал это булево в поле `media_id` опубликованного
контента. Найти пост по такому «идентификатору» нельзя.

СПИСОК РАСТЁТ, А НЕ СТОИТ. Привели модуль в порядок — допишите строкой
сюда. Так проверка остаётся честной: она не притворяется, что типизирован
весь офис, и не разрешает испортить то, что уже проверено.

Запуск: python scripts/check_types.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 — вывод и так годится
    pass

TGAS = Path(__file__).resolve().parent.parent

# Что проверяем. `shared/tools` целиком — это инструменты отделов, то, чем
# боты ДЕЛАЮТ работу; остальное перечислено поимённо.
# ⚠️ ЗЕЛЁНЫЙ ЛОКАЛЬНЫЙ ПРОГОН НЕ РАВЕН ЗЕЛЁНОМУ В CI.
#
# `mypy` в этом репозитории не закреплён версией, а CI ставит его свежим и
# на Python 3.11 — локально здесь 3.10. Разошлись не мнения, а стабы:
# смешанный словарь `{"q": "…", "limit": 1}` под аннотацию `params` у
# aiohttp не подходит, и CI это увидел, а локальный прогон промолчал.
#
# Практический вывод: перед «готово» смотрите на прогон в CI, а не только
# на свой. И пишите так, чтобы обе версии сходились, — в случае с `params`
# это значит держать все значения строками, а не полагаться на вывод типа.
CHECKED = [
    "shared/tools",
    "shared/tasks_repo.py",
    "shared/customer_repo.py",
    "shared/catalog_repo.py",
    "shared/storefront_orders.py",
    "shared/production_repo.py",
    "shared/sales_ops.py",
    "shared/ai_engine.py",
    "shared/ai_usage.py",
    "shared/tool_runtime.py",
    "shared/settings_store.py",
    "shared/scheduler.py",
    "shared/health.py",
    "shared/owner_alerts.py",
    "shared/alert_once.py",
    "shared/feedback_loop.py",
    "shared/bot_registry.py",
    "shared/event_bus.py",
    "shared/bot_bus.py",
    # Второй слой: то, что решает и действует рядом с дверями к данным —
    # подтверждения владельца, исходящие клиентам, исполнитель задач,
    # каталожные операции, гео, ночной сбор лидов, память разговора и
    # доставка одобренного КП.
    "shared/approvals.py",
    "shared/capabilities.py",
    "shared/catalog_ops.py",
    "shared/chat_memory.py",
    "shared/geo.py",
    "shared/lead_gen.py",
    "bots/marketing_bot/b2b_offer.py",
    # Третий слой: общая машинерия, которой пользуются все двенадцать
    # ботов — ответ отдела в группе, уведомления, ссылки в админку,
    # фирменный стиль, телефоны, промпты, условия витрины.
    "shared/group_reply.py",
    "shared/notifications.py",
    "shared/storefront_config.py",
    "shared/admin_links.py",
    "shared/brand.py",
    "shared/phone.py",
    "shared/utils.py",
    "shared/prompts.py",
    # Карточки с кнопками, которые живут дольше 48 часов, и общий разбор
    # их недоступности. Именно здесь проверка типов нашла дефект: действие
    # выполнялось, а владельцу докладывали об ошибке.
    "shared/tg_cards.py",
    "shared/task_ui.py",
    # Четвёртый слой: исполнитель задач отдела, цикл вызова инструментов,
    # групповые упоминания, Instagram целиком, архив контента, письма,
    # PDF, бэкапы и тренды. Расширение нашло здесь `int(None)` в позиции
    # заказа из Instagram и второй `Bot(token=None)`.
    "shared/task_executor.py",
    "shared/group_orchestrator.py",
    "shared/instagram.py",
    "shared/instagram_dm.py",
    "shared/content_archive.py",
    "shared/pdf_generator.py",
    "shared/email_sender.py",
    "shared/backup.py",
    "shared/trends.py",
]


def main() -> int:
    missing = [p for p in CHECKED if not (TGAS / p).exists()]
    if missing:
        # Модуль переименовали или удалили, а список не поправили: молча
        # проверять меньше — худший исход для сторожа.
        print("Проверка типов\n")
        print("✗ в списке есть исчезнувшие модули:")
        for p in missing:
            print(f"  · {p}")
        return 1

    print("Проверка типов\n")
    print(f"  область: {len(CHECKED)} путей — двери к данным и машинерия\n")

    result = subprocess.run(
        [
            sys.executable, "-m", "mypy",
            "--ignore-missing-imports",
            "--explicit-package-bases",
            "--namespace-packages",
            *CHECKED,
        ],
        cwd=TGAS,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    output = (result.stdout or "") + (result.stderr or "")
    errors = [ln for ln in output.splitlines() if ": error:" in ln]

    if errors:
        print(f"✗ найдено ({len(errors)}):")
        for line in errors:
            print(f"  · {line}")
        print(
            "\nЭто модули, через которые идут заказы, деньги и производство.\n"
            "Поправьте тип или, если проверять здесь нечего, уберите путь из "
            "CHECKED — но осознанно."
        )
        return 1

    if result.returncode != 0:
        print("✗ mypy не отработал:")
        print(output.strip()[:2000])
        return 1

    print("✓ типы в порядке")
    return 0


if __name__ == "__main__":
    sys.exit(main())

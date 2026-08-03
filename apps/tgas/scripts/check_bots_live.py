"""scripts/check_bots_live.py — сверка юзернеймов ботов с Telegram.

Запуск:  python scripts/check_bots_live.py       (из apps/tgas, нужен .env с токенами)

ЗАЧЕМ ЭТОТ СКРИПТ СУЩЕСТВУЕТ

Юзернейм бота — единственное поле реестра, которое нельзя проверить чтением
кода: правду знает только Telegram. И именно оно разъехалось сильнее всего.
Имена лежали в четырёх местах — промпт `shared/ai_engine.py`, описания полей
`shared/config.py`, `DEPARTMENT_META` в web_office и `AdminTabRouter.tsx` —
причём ДВУМЯ несовместимыми семействами: `@MicroGreenSalesBot` против
`MicrogreenSales_bot`. Верно максимум одно. Админка при этом рисует
кликабельную ссылку `https://t.me/<username>`, а для QA/R&D/DevOps
подставлялся бот руководителя — ссылка обещала чат отдела, которого нет.

Теперь имя одно, в `shared/bot_registry.py`, а этот скрипт спрашивает у
Telegram, кому на самом деле принадлежит токен, и сверяет с реестром.

В отличие от check_schema/check_tools/check_bot_roster эта сверка ходит в сеть
и требует токенов, поэтому в обычный прогон «перед готово» не входит —
запускайте при смене ботов или при подозрении на расхождение.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from shared import bot_registry  # noqa: E402
from shared.config import settings  # noqa: E402

problems: list[str] = []
notes: list[str] = []


def _token_for(bot: bot_registry.BotInfo) -> str | None:
    """Токен бота из настроек: sales_bot → settings.sales_bot_token."""
    return getattr(settings, f"{bot.name}_token", None)


async def _get_me(token: str) -> dict:
    import aiohttp

    url = f"https://api.telegram.org/bot{token}/getMe"
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url) as resp:
            data = await resp.json(content_type=None)
    if not data.get("ok"):
        raise RuntimeError(data.get("description") or f"HTTP {resp.status}")
    return data["result"]


async def main() -> int:
    checked = 0
    for bot in bot_registry.BOTS:
        token = _token_for(bot)

        if not bot.username:
            # Служебный воркер. Токена быть не должно — иначе реестр врёт.
            if token:
                problems.append(
                    f"{bot.name}: в реестре нет юзернейма, но токен задан — "
                    f"либо бот всё-таки в Telegram (впишите username), "
                    f"либо токен лишний"
                )
            else:
                notes.append(f"  --  {bot.name}: без Telegram-интерфейса, пропуск")
            continue

        if not token:
            problems.append(
                f"{bot.name}: в реестре есть @{bot.username}, но токена в .env нет — "
                f"бот не поднимется, а админка нарисует ссылку на него"
            )
            continue

        try:
            me = await _get_me(token)
        except Exception as exc:
            problems.append(f"{bot.name}: Telegram не ответил на getMe ({exc})")
            continue

        checked += 1
        real = me.get("username") or ""
        if real.lower() != bot.username.lower():
            problems.append(
                f"{bot.name}: в реестре @{bot.username}, а токен принадлежит "
                f"@{real} — ссылка в админке и упоминание в промпте ведут не туда"
            )
        else:
            notes.append(f"  ok  {bot.name}: @{real}")

    print("Сверка юзернеймов ботов с Telegram\n")
    for note in notes:
        print(note)
    print(f"\n  проверено токенов: {checked}")

    if problems:
        print(f"\n✗ найдено ({len(problems)}):")
        for problem in dict.fromkeys(problems):
            print(f"  · {problem}")
        return 1

    print("\n✓ реестр совпадает с тем, что говорит Telegram")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""shared/scheduler.py — Универсальный планировщик фоновых задач для ботов.

Пример использования в main.py бота:
    from shared.scheduler import BotScheduler

    scheduler = BotScheduler("sales_bot")
    scheduler.add_cron(hour=9, minute=0, name="daily_report", func=my_report_func)
    scheduler.add_interval(seconds=3600*4, name="stock_check", func=check_stock)

    async def main():
        ...
        await scheduler.start()
        await dp.start_polling(bot)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Awaitable, Optional

logger = logging.getLogger(__name__)

UZ_TZ = timezone(timedelta(hours=5))  # UTC+5 Uzbekistan


class _Job:
    __slots__ = ("name", "func", "bot_name")

    def __init__(self, name: str, func: Callable[[], Awaitable], bot_name: str):
        self.name = name
        self.func = func
        self.bot_name = bot_name

    async def _run_safe(self):
        try:
            logger.info("[%s] ⏳ Задача '%s' запущена", self.bot_name, self.name)
            await self.func()
            logger.info("[%s] ✅ Задача '%s' выполнена", self.bot_name, self.name)
            await self._report("ok")
        except Exception as exc:
            logger.exception(
                "[%s] ❌ Задача '%s' упала: %s", self.bot_name, self.name, exc
            )
            await self._report("error", str(exc))

    async def _report(self, status: str, error: str | None = None):
        """Отметить исполнение в bot_jobs, чтобы владелец видел это в админке.

        Best-effort: отчёт о задаче не имеет права уронить саму задачу.
        """
        try:
            from shared.settings_store import record_job_run

            await record_job_run(self.bot_name, self.name, status, error)
        except Exception as exc:
            # Ронять задачу нельзя, но и молчать не надо: без этой строки
            # админка просто показывает пустую историю запусков, и понять,
            # что отчёт не доходит, неоткуда.
            logger.debug("scheduler: не записал прогон %s/%s: %s", self.bot_name, self.name, exc)


class _CronJob(_Job):
    """Задача по расписанию (час:минута каждый день, или по дню недели/месяца)."""

    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        hour: int,
        minute: int = 0,
        day_of_week: Optional[int] = None,  # 0=Mon ... 6=Sun
        day_of_month: Optional[int] = None,  # 1-31
    ):
        super().__init__(name, func, bot_name)
        self.hour = hour
        self.minute = minute
        self.day_of_week = day_of_week
        self.day_of_month = day_of_month

    def _next_target(self, now: datetime) -> datetime:
        target = now.replace(
            hour=self.hour, minute=self.minute, second=0, microsecond=0
        )
        if now >= target:
            target += timedelta(days=1)

        # Skip if day_of_week constraint doesn't match
        if self.day_of_week is not None:
            while target.weekday() != self.day_of_week:
                target += timedelta(days=1)

        # Skip if day_of_month constraint doesn't match
        if self.day_of_month is not None:
            while target.day != self.day_of_month:
                target += timedelta(days=1)

        return target

    async def _refresh(self) -> bool:
        """Перечитать расписание из админки. True — если что-то изменилось.

        Ждём не одним длинным sleep до цели, а короткими отрезками с проверкой:
        иначе задача, которая спит до завтрашних 18:00, узнала бы о переносе
        на 19:00 только ПОСЛЕ сегодняшнего запуска, то есть через сутки.
        Чтение дешёвое — settings_store держит кэш на 60 секунд.
        """
        try:
            from shared.settings_store import get_job_overrides

            cfg = (await get_job_overrides(self.bot_name)).get(self.name)
        except Exception:
            return False
        if not cfg:
            return False

        changed = False
        for attr, col in (
            ("hour", "hour"),
            ("minute", "minute"),
            ("day_of_week", "day_of_week"),
            ("day_of_month", "day_of_month"),
        ):
            value = cfg.get(col)
            if value is not None and getattr(self, attr, None) != value:
                setattr(self, attr, value)
                changed = True

        self.enabled = cfg.get("enabled", True)
        return changed

    async def loop(self):
        self.enabled = True
        while True:
            now = datetime.now(UZ_TZ)
            target = self._next_target(now)
            logger.info(
                "[%s] ⏰ '%s' следующий запуск через %.0f мин (%s)",
                self.bot_name,
                self.name,
                (target - now).total_seconds() / 60,
                target.strftime("%d.%m %H:%M"),
            )

            # Дробим ожидание, чтобы подхватывать правки расписания на лету.
            rescheduled = False
            while True:
                now = datetime.now(UZ_TZ)
                remaining = (target - now).total_seconds()
                if remaining <= 0:
                    break
                await asyncio.sleep(min(remaining, 60))
                if await self._refresh():
                    logger.info(
                        "[%s] ⚙️ '%s': расписание изменено в админке, пересчитываю",
                        self.bot_name,
                        self.name,
                    )
                    rescheduled = True
                    break

            if rescheduled:
                continue

            if getattr(self, "enabled", True):
                await self._run_safe()
            else:
                logger.info(
                    "[%s] ⏸ '%s' выключена в админке — пропуск",
                    self.bot_name,
                    self.name,
                )

            # Small delay to avoid double-fire
            await asyncio.sleep(60)


class _IntervalJob(_Job):
    """Задача с интервалом (каждые N секунд)."""

    def __init__(
        self,
        name: str,
        func: Callable[[], Awaitable],
        bot_name: str,
        seconds: int,
        initial_delay: int = 30,
    ):
        super().__init__(name, func, bot_name)
        self.seconds = seconds
        self.initial_delay = initial_delay

    async def loop(self):
        await asyncio.sleep(self.initial_delay)
        while True:
            await self._run_safe()
            await asyncio.sleep(self.seconds)


class BotScheduler:
    """Планировщик фоновых задач для конкретного бота."""

    def __init__(self, bot_name: str):
        self.bot_name = bot_name
        self._jobs: list[_Job] = []
        self._tasks: list[asyncio.Task] = []

    def add_cron(
        self,
        *,
        name: str,
        func: Callable[[], Awaitable],
        hour: int,
        minute: int = 0,
        day_of_week: Optional[int] = None,
        day_of_month: Optional[int] = None,
    ):
        """Добавить задачу по расписанию (cron-стиль)."""
        self._jobs.append(
            _CronJob(name, func, self.bot_name, hour, minute, day_of_week, day_of_month)
        )

    def add_interval(
        self,
        *,
        name: str,
        func: Callable[[], Awaitable],
        seconds: int,
        initial_delay: int = 30,
    ):
        """Добавить интервальную задачу."""
        self._jobs.append(
            _IntervalJob(name, func, self.bot_name, seconds, initial_delay)
        )

    async def _apply_overrides(self):
        """Наложить расписания, заданные владельцем в админке.

        Код остаётся источником дефолта: задача регистрируется в bot_jobs
        как есть, а строка в БД перекрывает время и флаг enabled. Если БД
        недоступна или таблицы ещё нет — работаем ровно по коду, как раньше.

        Возвращает список задач к запуску (без выключенных).
        """
        try:
            from shared.settings_store import get_job_overrides, prune_jobs, register_job
        except Exception:
            return list(self._jobs)

        # Снятые с расписания задачи убираем из таблицы: иначе админка вечно
        # показывает их действующими, а выполнять их уже некому.
        await prune_jobs(self.bot_name, [job.name for job in self._jobs])

        # Показать владельцу полный список задач, включая нетронутые.
        for job in self._jobs:
            fields = {
                "hour": getattr(job, "hour", None),
                "minute": getattr(job, "minute", None),
                "day_of_week": getattr(job, "day_of_week", None),
                "day_of_month": getattr(job, "day_of_month", None),
                "seconds": getattr(job, "seconds", None),
            }
            kind = "interval" if isinstance(job, _IntervalJob) else "cron"
            await register_job(self.bot_name, job.name, kind, **fields)

        overrides = await get_job_overrides(self.bot_name)
        if not overrides:
            return list(self._jobs)

        runnable = []
        for job in self._jobs:
            cfg = overrides.get(job.name)
            if not cfg:
                runnable.append(job)
                continue

            if cfg.get("enabled") is False:
                logger.info(
                    "[%s] ⏸ Задача '%s' выключена в админке", self.bot_name, job.name
                )
                continue

            # Перекрываем только заданные поля: NULL в БД означает
            # «оставить как в коде», а не «сбросить в None».
            for attr, col in (
                ("hour", "hour"),
                ("minute", "minute"),
                ("day_of_week", "day_of_week"),
                ("day_of_month", "day_of_month"),
                ("seconds", "seconds"),
            ):
                value = cfg.get(col)
                if value is not None and hasattr(job, attr):
                    if getattr(job, attr) != value:
                        logger.info(
                            "[%s] ⚙️ '%s': %s %s → %s (из админки)",
                            self.bot_name,
                            job.name,
                            attr,
                            getattr(job, attr),
                            value,
                        )
                    setattr(job, attr, value)

            runnable.append(job)
        return runnable

    async def start(self):
        """Запустить все задачи как asyncio.Tasks."""
        # Память оповещений — до первой задачи.
        #
        # `alert_once` держит «о чём уже сообщали», и раньше это жило только
        # в памяти процесса: после каждой выкладки все поводы звучали
        # заново. Пока поводы были часовыми, размен сходился; со сводкой,
        # которую подтверждают раз в неделю, — перестал: мержей в main
        # бывает по четыре за сутки.
        #
        # Здесь, а не в `main()` каждого бота: `alert_once` пользуются
        # только плановые задачи, и точка входа у них одна. Забыть строчку
        # в новом боте невозможно — её там нет.
        from shared import alert_once

        await alert_once.load()

        jobs = await self._apply_overrides()
        logger.info(
            "[%s] 🚀 Планировщик: запуск %d задач (из %d зарегистрированных)",
            self.bot_name,
            len(jobs),
            len(self._jobs),
        )
        for job in jobs:
            task = asyncio.create_task(job.loop(), name=f"{self.bot_name}:{job.name}")
            self._tasks.append(task)

    async def restart(self):
        """Перечитать расписания и перезапустить задачи без рестарта контейнера.

        Вызывается по событию CONFIG_UPDATED: владелец поменял время в
        админке — задачи подхватывают его сразу, а не после деплоя.
        """
        await self.stop()
        try:
            from shared.settings_store import invalidate

            invalidate()
        except Exception as exc:
            # Кэш настроек не сброшен — значит, задачи перезапустятся со
            # СТАРЫМ расписанием. Владелец поменял время в админке и не
            # поймёт, почему оно не подхватилось.
            logger.warning("scheduler: не сбросил кэш настроек: %s", exc)
        await self.start()

    async def stop(self):
        """Остановить все задачи."""
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("[%s] 🛑 Планировщик остановлен", self.bot_name)

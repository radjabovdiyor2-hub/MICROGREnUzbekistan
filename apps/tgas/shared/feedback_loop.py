"""
Feedback Loop Engine — Замкнутые петли автономного обучения для всех ботов TGAS.
=============================================================================
Петля: Действие → Замер результата → Вывод (LLM Reasoning) → Изменение поведения
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy import text

from shared.ai_engine import ai_engine
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)


class FeedbackLoopEngine:
    """Движок замкнутых петель обратной связи и самообучения ботов."""

    async def record_measurement(
        self,
        bot: str,
        metric: str,
        value: float,
        target: Optional[float] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Записать измерение (Action -> Measurement)."""
        logger.info(
            "[%s] Measurement recorded: metric=%s, value=%s, target=%s",
            bot, metric, value, target
        )

    async def evaluate_and_adapt(
        self,
        bot: str,
        metric: str,
        current_data: Dict[str, Any],
        benchmark_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Выполнить мыслительный процесс (Measurement -> Inference -> Behavior Change).

        1. Запрашивает анализ через LLM с образцовым промптом рассуждения.
        2. Формирует выводы и новые адаптивные параметры поведения.
        3. Сохраняет новое состояние в таблицу `bot_learnings` PostgreSQL.
        """
        system_prompt = (
            f"Ты — главный аналитик и мета-оптимизатор для бота '{bot}' в экосистеме Microgreen Uzbekistan.\n"
            "Твоя задача — замкнуть петлю обратной связи:\n"
            "1. Измерить текущие результаты относительно бенчмарка.\n"
            "2. Сделать логический вывод (Inference) о причинах отклонений.\n"
            "3. Сформировать конкретные изменения поведения (Behavior Adjustment) в формате JSON.\n\n"
            "Отвечай строго в JSON формате с ключами:\n"
            "{\n"
            '  "observation": "Краткое резюме измерений",\n'
            '  "inference": "Глубокий вывод о причинах и логика дальнейших действий",\n'
            '  "adjustments": {\n'
            '     "key_parameter_1": value_1,\n'
            '     "key_parameter_2": value_2\n'
            "  }\n"
            "}"
        )

        user_message = (
            f"Метрика: {metric}\n"
            f"Текущие данные: {json.dumps(current_data, ensure_ascii=False, indent=2)}\n"
            f"Бенчмарки: {json.dumps(benchmark_data or {}, ensure_ascii=False, indent=2)}"
        )

        try:
            raw_response = await ai_engine.generate_text(
                prompt=user_message,
                system_prompt=system_prompt,
                temperature=0.3,
            )

            # Очистка JSON от markdown блоков
            clean_json = raw_response.strip()
            if clean_json.startswith("```"):
                lines = clean_json.split("\n")
                clean_json = "\n".join(lines[1:-1])

            data = json.loads(clean_json)
            observation = str(data.get("observation") or "Измерение выполнено")
            inference = str(data.get("inference") or "Анализ завершен")
            adjustments = data.get("adjustments") or {}

            # Сохраняем выводы и адаптации в PostgreSQL (bot_learnings)
            async with get_session_ctx() as session:
                # Деактивируем предыдущие настройки этой метрики для бота
                await session.execute(
                    text(
                        "UPDATE bot_learnings SET is_active = FALSE "
                        "WHERE bot = :bot AND metric = :metric"
                    ),
                    {"bot": bot, "metric": metric},
                )

                # Записываем новое состояние обучения
                await session.execute(
                    text(
                        "INSERT INTO bot_learnings (bot, metric, observation, inference, adjustment, is_active, applied_at) "
                        "VALUES (:bot, :metric, :obs, :inf, :adj, TRUE, NOW())"
                    ),
                    {
                        "bot": bot,
                        "metric": metric,
                        "obs": observation,
                        "inf": inference,
                        "adj": json.dumps(adjustments, ensure_ascii=False),
                    },
                )

            logger.info(
                "[%s] Feedback loop completed for %s: %s",
                bot, metric, observation
            )
            return {
                "bot": bot,
                "metric": metric,
                "observation": observation,
                "inference": inference,
                "adjustments": adjustments,
            }

        except Exception as e:
            logger.error("[%s] Feedback loop failed for %s: %s", bot, metric, e, exc_info=True)
            return {
                "bot": bot,
                "metric": metric,
                "observation": f"Error during reasoning: {e}",
                "inference": "Fallback: keep existing behavior",
                "adjustments": {},
            }

    async def get_active_behavior(self, bot: str, metric: str) -> Dict[str, Any]:
        """Получить активные параметры поведения бота для конкретной метрики."""
        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT adjustment FROM bot_learnings "
                    "WHERE bot = :bot AND metric = :metric AND is_active = TRUE "
                    "ORDER BY id DESC LIMIT 1"
                ),
                {"bot": bot, "metric": metric},
            )
            row = res.fetchone()
            if row and row[0]:
                val = row[0]
                if isinstance(val, str):
                    return json.loads(val)
                elif isinstance(val, dict):
                    return val
            return {}


feedback_loop = FeedbackLoopEngine()

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict
from shared.ai_engine import AIEngine
from shared.instagram_dm.state import (
    _processed_message_ids,
    _is_processing,
    IG_SALES_SYSTEM_PROMPT,
    _get_conversation_history,
    _add_to_history,
    _extract_order,
)
from shared.instagram_dm.api import check_new_messages, send_dm_reply
from shared.instagram_dm.order_publisher import _publish_order_to_stepan, _notify_admin_telegram

logger = logging.getLogger(__name__)

async def auto_reply_to_new_messages() -> None:
    from shared.instagram_dm import state
    if state._is_processing:
        logger.debug("Instagram DM: уже обрабатывается, пропускаю...")
        return
    state._is_processing = True

    try:
        new_messages = await check_new_messages()

        if not new_messages:
            return

        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        recent_messages = []
        for msg in new_messages:
            created_str = msg.get("created_time", "")
            if created_str:
                try:
                    created = datetime.fromisoformat(created_str.replace("+0000", "+00:00"))
                    if created < cutoff:
                        _processed_message_ids.add(msg.get("message_id", ""))
                        continue
                except (ValueError, TypeError):
                    pass
            recent_messages.append(msg)

        if not recent_messages:
            return

        grouped: Dict[str, list] = {}
        for msg in recent_messages:
            from_id = msg.get("from_id", "")
            if from_id not in grouped:
                grouped[from_id] = []
            grouped[from_id].append(msg)

        ai = AIEngine()

        for from_id, msgs in grouped.items():
            try:
                for m in msgs:
                    _processed_message_ids.add(m.get("message_id", ""))

                last_msg = msgs[-1]
                from_name = last_msg.get("from_name", "Пользователь")

                all_texts = [m.get("text", "").strip() for m in msgs if m.get("text", "").strip()]
                if not all_texts:
                    continue
                combined_text = "\n".join(all_texts)

                logger.info(f"📩 DM от {from_name} ({len(msgs)} сообщ.): {combined_text[:80]}...")
                _add_to_history(from_id, "user", combined_text)

                history = _get_conversation_history(from_id)

                reply_text = await ai.chat_completion(
                    system_prompt=IG_SALES_SYSTEM_PROMPT,
                    user_message="",
                    conversation_history=history,
                    temperature=0.6,
                    max_tokens=500,
                    effort="medium",
                )

                order = _extract_order(reply_text)
                reply_for_customer = reply_text
                if "===ЗАКАЗ===" in reply_for_customer:
                    reply_for_customer = reply_for_customer.split("===ЗАКАЗ===")[0].strip()
                    if "===КОНЕЦ===" in reply_text:
                        after = reply_text.split("===КОНЕЦ===")[1].strip()
                        if after:
                            reply_for_customer += "\n" + after

                if not reply_for_customer:
                    reply_for_customer = "Заказ оформлен! Наш менеджер свяжется с вами для подтверждения. 😊"

                success = await send_dm_reply(from_id, reply_for_customer)

                if success:
                    logger.info(f"✅ Автоответ отправлен {from_name}: {reply_for_customer[:60]}...")
                    _add_to_history(from_id, "assistant", reply_for_customer)
                else:
                    logger.warning(f"⚠️ Не удалось отправить автоответ {from_name}.")

                if order:
                    await _publish_order_to_stepan(order, from_name, from_id)
                    await _notify_admin_telegram(from_name, combined_text, reply_for_customer, order=order)
                    logger.info(f"📦 Заказ от {from_name} оформлен и передан!")

            except Exception as e:
                logger.error(f"Ошибка обработки DM от {from_id}: {e}", exc_info=True)

        logger.info(
            f"📬 Обработано {len(recent_messages)} DM от {len(grouped)} клиентов. "
            f"Всего обработано: {len(_processed_message_ids)}."
        )
    finally:
        state._is_processing = False

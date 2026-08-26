"""
Отправка одобренного B2B-предложения.

ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ

Раньше вся доставка КП жила внутри обработчика кнопки: чтобы отправить
предложение, нужно было нажатие. Пока карточка была одна на ресторан,
это выглядело естественно — но карточек утром до пятнадцати, и владелец
делал пятнадцать одинаковых нажатий, чтобы согласиться с тем, с чем
согласен целиком.

Доставка вынесена сюда, и её зовут два места: кнопка под карточкой и
пакетное «одобрить все» под итоговым сообщением. Логика одна и та же,
поэтому пакетное одобрение не может отправить иначе, чем одиночное.

ПОВТОРНОЕ НАЖАТИЕ БЕЗОПАСНО. Признак «ждёт решения» — сама строка
`b2b_offer_pending` в `interactions`; отправка переводит её в `sent`, и
второй заход просто не находит, что отправлять. Поэтому «одобрить все»
после нескольких одиночных нажатий не отправит письмо дважды.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Tuple

from sqlalchemy import text

from shared import catalog_repo
from shared.config import settings
from shared.database import get_session_ctx
from shared.utils import format_price

logger = logging.getLogger(__name__)

# Сколько позиций каталога вкладываем в PDF предложения.
PRICES_IN_OFFER = 5


async def pending() -> List[Dict[str, Any]]:
    """Кому КП уже подготовлено и ждёт решения владельца."""
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT c.id, COALESCE(c.company_name, c.name), i.channel "
                "FROM customers c "
                "JOIN interactions i ON i.customer_id = c.id "
                "  AND i.interaction_type = 'b2b_offer_pending' "
                "WHERE c.deleted_at IS NULL "
                "ORDER BY i.created_at"
            )
        )
        return [
            {"id": row[0], "company": row[1] or "Заведение", "channel": row[2] or "skip"}
            for row in res.fetchall()
        ]


async def reject(cid: int) -> bool:
    """Отклонить подготовленное КП. False — отклонять уже нечего."""
    async with get_session_ctx() as session:
        # RETURNING, а не `rowcount`: в типах SQLAlchemy `rowcount` есть у
        # курсорного результата, а `execute` объявлен шире — и вопрос
        # «отклонили или отклонять было нечего» отвечается тут же данными.
        res = await session.execute(
            text(
                "UPDATE interactions SET interaction_type = 'b2b_offer_rejected' "
                "WHERE customer_id = :cid AND interaction_type = 'b2b_offer_pending' "
                "RETURNING id"
            ),
            {"cid": cid},
        )
        touched = res.fetchall()
        await session.commit()
        return bool(touched)


async def deliver(cid: int, channel: str) -> Tuple[bool, str]:
    """
    Отправить подготовленное КП. Возвращает (получилось, что произошло).

    `channel` решает КАК: есть почта — письмо с PDF, есть только телефон —
    задача продажам на обзвон. Ни того, ни другого — отправлять нечем.
    """
    from shared.email_sender import send_b2b_offer_email
    from shared.event_bus import event_bus
    from shared.pdf_generator import generate_commercial_offer_pdf

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT c.name, c.company_name, c.email, c.phone, c.address, i.summary "
                "FROM customers c "
                "JOIN interactions i ON i.customer_id = c.id "
                "  AND i.interaction_type = 'b2b_offer_pending' "
                "WHERE c.deleted_at IS NULL AND c.id = :cid LIMIT 1"
            ),
            {"cid": cid},
        )
        row = res.fetchone()
        if not row:
            return False, "Лид не найден или уже обработан"

        name, company, email, phone, address, ai_text = row
        chef_name = name or "Шеф-повар"
        comp_name = company or "Ресторан"

        if channel == "email" and email:
            # Прайс — из каталога-мастера, а не своим SQL.
            products = [
                {"name": item["name"], "price": format_price(item["price"])}
                for item in (await catalog_repo.list_active())[:PRICES_IN_OFFER]
            ]
            pdf_path = generate_commercial_offer_pdf(
                client_name=comp_name,
                ai_text=ai_text,
                prices=products,
                output_filename=f"КП_Microgreen_{cid}.pdf",
            )
            subject = f"Свежая микрозелень для {comp_name} от Microgreen Uzbekistan"
            email_text = (
                f"Здравствуйте, {chef_name}!\n\nНаправляем коммерческое предложение "
                f"с нашими ценами. Будем рады сотрудничеству!\n\n"
                f"С уважением, ИИ-менеджер Microgreen Uzbekistan."
            )
            sent = await send_b2b_offer_email(email, subject, email_text, pdf_path)
            try:
                os.remove(pdf_path)
            except OSError as exc:
                # Временный файл не удалился — письмо от этого не отменяется,
                # но молчать нельзя: так каталог и заполняется мусором.
                logger.warning("КП %s: временный PDF не удалён: %s", cid, exc)

            if not sent:
                return False, "Письмо не ушло"

            await session.execute(
                text(
                    "UPDATE interactions SET interaction_type = 'b2b_offer_sent', "
                    "channel = 'email' "
                    "WHERE customer_id = :cid AND interaction_type = 'b2b_offer_pending'"
                ),
                {"cid": cid},
            )
            await session.commit()
            await event_bus.publish(
                "b2b_outreach_completed",
                {"company": comp_name, "channel": "email", "status": "success"},
                "marketing_bot",
            )
            return True, "📧 КП отправлено на email"

        if channel == "phone" and phone:
            title = f"Обзвонить ресторан: {comp_name}"
            desc = (
                f"Холодный B2B-контакт. Ресторан: {comp_name}. Тел: {phone}. "
                f"Адрес: {address or '—'}. "
                f"Цель: предложить свежую микрозелень/салаты, договориться "
                f"о пробной поставке."
            )
            res_t = await session.execute(
                text(
                    "INSERT INTO tasks (title, description, department, status, "
                    "priority, created_at) "
                    "VALUES (:t, :d, 'sales', 'todo', 'high', NOW()) RETURNING id"
                ),
                {"t": title, "d": desc},
            )
            task_id = res_t.scalar()
            await session.execute(
                text(
                    "UPDATE interactions SET interaction_type = 'b2b_offer_sent', "
                    "channel = 'phone_task', summary = :s "
                    "WHERE customer_id = :cid AND interaction_type = 'b2b_offer_pending'"
                ),
                {"cid": cid, "s": f"Создана задача обзвона #{task_id}"},
            )
            await session.commit()

            admin_id = (
                settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
            )
            await event_bus.publish(
                "TASK_CREATED",
                {
                    "task_id": task_id,
                    "title": title,
                    "description": desc,
                    "department": "sales",
                    "chat_id": admin_id,
                    "priority": "high",
                },
                "marketing_bot",
            )
            return True, "📞 Задача на обзвон создана"

    return False, "Нет ни почты, ни телефона — отправлять нечем"

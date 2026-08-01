import logging
import asyncio
from sqlalchemy import text
from aiogram import Bot, Router, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from shared.config import settings
from shared.database import get_session_ctx

logger = logging.getLogger(__name__)

_B2B_OFFER_ROLE = """
Ты — руководитель B2B-направления Microgreen Uzbekistan. Пишешь коммерческие
предложения шеф-поварам и закупщикам ресторанов, кафе и отелей Самарканда.
Опирайся на то, что важно кухне: стабильность поставок, срок годности после
среза, режем утром — привозим в тот же день, отсутствие пестицидов.
Не выдумывай цифр, скидок и условий: если данных о клиенте мало — пиши общими
выгодами и предложи созвон. Никаких обещаний, которых нет в предложении.
"""

def _b2b_offer_prompt() -> str:
    from shared.prompts import TEAM_CONTEXT
    return TEAM_CONTEXT + _B2B_OFFER_ROLE

B2B_OFFER_SYSTEM_PROMPT = _b2b_offer_prompt()

_SEGMENT_BRIEF = {
    "new_lead": (
        "Это ПЕРВОЕ обращение — ресторан нас ещё не знает. Коротко представь компанию, "
        "покажи пользу микрозелени для подачи и вкуса, предложи бесплатный пробный образец."
    ),
    "churn": (
        "Это ВОЗВРАТ клиента: он уже заказывал у нас, но перестал (больше 30 дней тишины). "
        "Не представляйся заново — тепло напомни о себе, поблагодари за прошлые заказы, "
        "спроси, что изменилось, и предложи выгодные условия для возобновления."
    ),
    "no_reply": (
        "Это ПОВТОРНОЕ касание: КП уже отправляли, ответа не было. НЕ повторяй прошлое письмо. "
        "Зайди с другой стороны — короче, конкретнее, с новым аргументом (сезонность, "
        "экономия на списаниях, свежесть за счёт локальной доставки) и лёгким призывом."
    ),
}

_SEGMENT_LABEL = {
    "new_lead": "🆕 Новый лид",
    "churn": "💤 Перестал заказывать",
    "no_reply": "🔁 Без ответа",
}

async def _fetch_b2b_targets(limit: int) -> list:
    from shared.bot_bus import send_task, get_result

    try:
        tid = await send_task(
            "marketing_bot", "sales_bot", "get_b2b_targets", {"limit": limit}
        )
        res = await get_result(tid, timeout=60)
        if res and res.get("status") == "done":
            result = res.get("result") or {}
            targets = (result.get("data") or {}).get("targets") or []
            if targets:
                logger.info(
                    "b2b_outreach: отдел продаж отобрал %d ресторанов", len(targets)
                )
                return targets
            logger.info("b2b_outreach: отдел продаж не нашёл ресторанов на сегодня")
            return []
    except Exception as e:
        logger.warning(f"b2b_outreach: отдел продаж не ответил ({e}) — беру лидов сам")

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT id, name, company_name, email, phone, review_summary, address "
                "FROM customers "
                "WHERE customer_type = 'b2b' AND status = 'lead' "
                "AND NOT EXISTS (SELECT 1 FROM interactions i "
                "                WHERE i.customer_id = customers.id AND i.interaction_type = 'b2b_offer_sent') "
                "ORDER BY review_score DESC NULLS LAST, created_at ASC "
                "LIMIT :lim"
            ),
            {"lim": limit},
        )
        return [
            {
                "id": r[0],
                "name": r[1],
                "company_name": r[2],
                "email": r[3],
                "phone": r[4],
                "review_summary": r[5],
                "address": r[6],
                "segment": "new_lead",
                "reason": "новый ресторан",
                "touches": 0,
            }
            for r in res.fetchall()
        ]

async def b2b_outreach() -> None:
    try:
        from shared.ai_engine import AIEngine

        limit = settings.b2b_daily_limit
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            logger.warning(
                "b2b_outreach: admin_telegram_ids не задан, некому отправлять на одобрение."
            )
            return

        leads = await _fetch_b2b_targets(limit)
        if not leads:
            logger.info("b2b_outreach: ресторанов на сегодня нет.")
            return

        ai = AIEngine()
        async with get_session_ctx() as session:
            res_prices = await session.execute(
                text(
                    "SELECT name_ru, price FROM products WHERE is_active = true LIMIT 5"
                )
            )
            [{"name": r[0], "price": f"{r[1]} сум"} for r in res_prices.fetchall()]

        by_seg = {}
        for t in leads:
            by_seg[t.get("segment", "new_lead")] = (
                by_seg.get(t.get("segment", "new_lead"), 0) + 1
            )
        breakdown = "\n".join(
            f"   {_SEGMENT_LABEL.get(s, s)}: {n}" for s, n in by_seg.items()
        )

        bot = Bot(
            token=settings.marketing_bot_token,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML),
        )
        try:
            await bot.send_message(
                admin_id,
                f"📣 <b>КП на сегодня: {len(leads)} ресторан(ов)</b>\n"
                f"<i>Список отобрал отдел «Заказы»:</i>\n{breakdown}\n\n"
                f"Ниже — карточки с КП. Нажмите ✅ для отправки или ❌ для пропуска.",
            )

            for lead in leads:
                cid = lead["id"]
                email = lead.get("email")
                phone = lead.get("phone")
                address = lead.get("address")
                review_summary = lead.get("review_summary")
                segment = lead.get("segment", "new_lead")
                touches = lead.get("touches", 0)

                chef_name = lead.get("name") or "Шеф-повар"
                comp_name = lead.get("company_name") or "Ресторан"
                review_hint = (
                    f"\nИзвестное о заведении: {review_summary}."
                    if review_summary
                    else ""
                )

                brief = _SEGMENT_BRIEF.get(segment, _SEGMENT_BRIEF["new_lead"])
                prompt = (
                    f"Напиши текст Коммерческого предложения от Microgreen Uzbekistan.\n"
                    f"Адресат: {chef_name}, ресторан: {comp_name}.{review_hint}\n\n"
                    f"КОНТЕКСТ: {brief}\n\n"
                    f"2-3 абзаца, тёплый деловой tone, без markdown."
                )
                ai_text = await ai.chat_completion(
                    system_prompt=B2B_OFFER_SYSTEM_PROMPT, user_message=prompt
                )

                touch_note = f" · касание №{touches + 1}" if touches else ""
                card = (
                    f"🏪 <b>{comp_name}</b>\n"
                    f"{_SEGMENT_LABEL.get(segment, '')} — {lead.get('reason', '')}{touch_note}\n\n"
                    f"👤 Контакт: {chef_name}\n"
                    f"📧 Email: {email or '—'}\n"
                    f"📞 Телефон: {phone or '—'}\n"
                    f"📍 Адрес: {address or '—'}\n"
                    f"⭐ {review_summary or 'Нет отзывов'}\n"
                    f"\n─── КП (превью) ───\n"
                    f"{ai_text[:800]}{'...' if len(ai_text) > 800 else ''}"
                )

                channel = "email" if email else ("phone" if phone else "skip")
                cb_data_approve = f"b2b_approve:{cid}:{channel}"
                cb_data_reject = f"b2b_reject:{cid}"

                kb = InlineKeyboardMarkup(
                    inline_keyboard=[
                        [
                            InlineKeyboardButton(
                                text="✅ Одобрить отправку",
                                callback_data=cb_data_approve,
                            ),
                            InlineKeyboardButton(
                                text="❌ Отклонить", callback_data=cb_data_reject
                            ),
                        ]
                    ]
                )

                await bot.send_message(admin_id, card, reply_markup=kb)

                async with get_session_ctx() as session:
                    await session.execute(
                        text(
                            "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                            "VALUES (:cid, :ch, 'b2b_offer_pending', 'marketing_bot', :txt, NOW())"
                        ),
                        {"cid": cid, "ch": channel, "txt": ai_text},
                    )
                    await session.commit()

                await asyncio.sleep(1)

            await bot.send_message(
                admin_id,
                "⏳ <b>Все карточки отправлены.</b>\n"
                "Нажимайте ✅ или ❌ под каждой. Бот отправит КП только после вашего одобрения.",
            )
        finally:
            await bot.session.close()

        logger.info(
            "b2b_outreach: %d карточек отправлено админу на одобрение", len(leads)
        )

    except Exception as e:
        logger.error(f"b2b_outreach error: {e}", exc_info=True)

async def handle_b2b_approval(callback_query: CallbackQuery) -> None:
    from shared.pdf_generator import generate_commercial_offer_pdf
    from shared.email_sender import send_b2b_offer_email
    from shared.event_bus import event_bus
    import os

    data = callback_query.data
    parts = data.split(":")
    action = parts[0]
    cid = int(parts[1])

    if action == "b2b_reject":
        async with get_session_ctx() as session:
            await session.execute(
                text(
                    "UPDATE interactions SET interaction_type = 'b2b_offer_rejected' "
                    "WHERE customer_id = :cid AND interaction_type = 'b2b_offer_pending'"
                ),
                {"cid": cid},
            )
            await session.commit()
        await callback_query.message.edit_text(
            callback_query.message.text + "\n\n❌ <b>Отклонено администратором</b>",
            parse_mode="HTML",
        )
        await callback_query.answer("Отклонено ❌")
        return

    channel = parts[2] if len(parts) > 2 else "skip"

    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                "SELECT c.id, c.name, c.company_name, c.email, c.phone, c.address, i.summary "
                "FROM customers c "
                "JOIN interactions i ON i.customer_id = c.id AND i.interaction_type = 'b2b_offer_pending' "
                "WHERE c.id = :cid LIMIT 1"
            ),
            {"cid": cid},
        )
        row = res.fetchone()
        if not row:
            await callback_query.answer("Лид не найден или уже обработан")
            return

        _, name, company, email, phone, address, ai_text = row
        chef_name = name or "Шеф-повар"
        comp_name = company or "Ресторан"

        res_prices = await session.execute(
            text("SELECT name_ru, price FROM products WHERE is_active = true LIMIT 5")
        )
        products = [
            {"name": r[0], "price": f"{r[1]} сум"} for r in res_prices.fetchall()
        ]

        success = False

        if channel == "email" and email:
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
            success = await send_b2b_offer_email(email, subject, email_text, pdf_path)
            try:
                os.remove(pdf_path)
            except Exception:
                pass

            if success:
                await session.execute(
                    text(
                        "UPDATE interactions SET interaction_type = 'b2b_offer_sent', channel = 'email' "
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

        elif channel == "phone" and phone:
            title = f"Обзвонить ресторан: {comp_name}"
            desc = (
                f"Холодный B2B-контакт. Ресторан: {comp_name}. Тел: {phone}. "
                f"Адрес: {address or '—'}. "
                f"Цель: предложить свежую микрозелень/салаты, договориться о пробной поставке."
            )
            res_t = await session.execute(
                text(
                    "INSERT INTO tasks (title, description, department, status, priority, created_at) "
                    "VALUES (:t, :d, 'sales', 'todo', 'high', NOW()) RETURNING id"
                ),
                {"t": title, "d": desc},
            )
            task_id = res_t.scalar()
            await session.execute(
                text(
                    "UPDATE interactions SET interaction_type = 'b2b_offer_sent', channel = 'phone_task', "
                    "summary = :s WHERE customer_id = :cid AND interaction_type = 'b2b_offer_pending'"
                ),
                {"cid": cid, "s": f"Создана задача обзвона #{task_id}"},
            )
            await session.commit()
            success = True

            admin_id = (
                settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
            )
            if admin_id:
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

    if success:
        status_text = (
            "📧 КП отправлено на email!"
            if channel == "email"
            else "📞 Задача на обзвон создана!"
        )
        await callback_query.message.edit_text(
            callback_query.message.text + f"\n\n✅ <b>ОДОБРЕНО</b> — {status_text}",
            parse_mode="HTML",
        )
        await callback_query.answer("Отправлено ✅")
    else:
        await callback_query.message.edit_text(
            callback_query.message.text + "\n\n⚠️ <b>Ошибка при отправке</b>",
            parse_mode="HTML",
        )
        await callback_query.answer("Ошибка ⚠️")

b2b_router = Router()

@b2b_router.callback_query(
    F.data.startswith("b2b_approve:") | F.data.startswith("b2b_reject:")
)
async def _b2b_cb(cq: CallbackQuery) -> None:
    await handle_b2b_approval(cq)

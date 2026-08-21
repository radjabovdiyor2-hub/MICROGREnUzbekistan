"""Marketing Bot — main.py с EventBus интеграцией"""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.enums import ParseMode
from shared import catalog_repo
from shared.utils import format_price
from shared.config import settings
from shared.database import init_db, get_session_ctx
from shared.event_bus import event_bus
from bots.marketing_bot.handlers import all_routers
from shared.group_orchestrator import create_group_router
from shared import group_reply
from shared.scheduler import BotScheduler
from shared.health import start_heartbeat
from sqlalchemy import text

async def get_dynamic_marketing_policy(base_sys: str) -> str:
    try:
        from shared.feedback_loop import feedback_loop
        active = await feedback_loop.get_active_behavior("marketing_bot", "broadcast_conversion")
        directives = [str(v) for v in active.values() if isinstance(v, str)]
        if directives:
            return base_sys + "\\n\\n[ДИРЕКТИВА АНАЛИТИКА: " + " ".join(directives) + "]"
    except Exception as exc:
        # Молчать здесь нельзя — см. тот же приём в content_bot: именно так
        # слой самообучения падал на импорте и не отрабатывал ни разу.
        logger.warning("marketing_bot: директива обучения не получена: %s", exc)
    return base_sys


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Планировщик ──────────────────────────────────────────────────────────
scheduler = BotScheduler("marketing_bot")

# Промпт для коммерческих предложений в HoReCa. Раньше здесь стояла одна строка
# «Ты эксперт по B2B продажам HoReCa.» — а этим текстом уходят КП ресторанам по
# почте, то есть без фирменного голоса и без запрета выдумывать факты.
_B2B_OFFER_ROLE = """
Ты — руководитель B2B-направления Microgreen Uzbekistan. Пишешь коммерческие
предложения шеф-поварам и закупщикам ресторанов, кафе и отелей Самарканда.
Опирайся на то, что важно кухне: стабильность поставок, срок годности после
среза, режем утром — привозим в тот же день, отсутствие пестицидов.
Не выдумывай цифр, скидок и условий: если данных о клиенте мало — пиши общими
выгодами и предложи созвон. Никаких обещаний, которых нет в предложении.
"""


def _b2b_offer_prompt() -> str:
    """Собирается лениво: TEAM_CONTEXT уже включает фирменный голос бренда."""
    from shared.prompts import TEAM_CONTEXT

    return TEAM_CONTEXT + _B2B_OFFER_ROLE


B2B_OFFER_SYSTEM_PROMPT = _b2b_offer_prompt()


async def _get_bot():
    return Bot(
        token=settings.marketing_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


# Функции периодических рассылок и отчетов отключены для минимизации спама


async def bus_send_broadcast(params: dict) -> dict:
    """Реальная рассылка по базе клиентов Telegram."""
    target = params.get("target", "all").lower()
    message_text = params.get("message", "")

    if not message_text:
        return {"status": "error", "message": "Текст рассылки пуст."}

    try:
        async with get_session_ctx() as session:
            query = "SELECT telegram_id FROM customers WHERE telegram_id IS NOT NULL AND COALESCE(status, '') NOT IN ('unsubscribed', 'blocked', 'do_not_contact')"
            if target == "b2b":
                query += " AND customer_type = 'b2b'"
            elif target == "b2c":
                query += " AND customer_type = 'b2c'"
            elif target == "vip":
                query += " AND status = 'vip'"

            res = await session.execute(text(query))
            user_ids = [row[0] for row in res.fetchall()]
    except Exception as e:
        logging.error(f"Error fetching users for broadcast: {e}")
        return {"status": "error", "message": "Ошибка БД при выборке аудитории"}

    if not user_ids:
        return {
            "status": "error",
            "message": f"Не найдено клиентов для таргета: {target}",
        }

    bot = await _get_bot()
    success_count = 0
    fail_count = 0

    # Логирование размера аудитории перед отправкой
    logging.warning("BROADCAST: %d получателей, target=%s", len(user_ids), target)

    # Отправляем в фоне, чтобы не блокировать шину
    async def send_loop():
        nonlocal success_count, fail_count
        for uid in user_ids:
            try:
                await bot.send_message(uid, message_text, parse_mode="HTML")
                success_count += 1
            except Exception:
                fail_count += 1
            await asyncio.sleep(
                0.05
            )  # Защита от спам-лимитов Telegram (не более 30 в сек)

        # Отчет админу по завершении
        admin_id = settings.admin_telegram_ids[0]
        report = (
            f"📢 <b>Рассылка завершена</b>\n"
            f"Аудитория: {target}\n"
            f"Успешно: {success_count}\n"
            f"Ошибок: {fail_count}"
        )
        try:
            await bot.send_message(admin_id, report, parse_mode="HTML")
            # Замыкаем петлю: Маркетинг (замер конверсии/ошибок -> вывод -> изменение таргетинга)
            from shared.feedback_loop import feedback_loop

            await feedback_loop.evaluate_and_adapt(
                bot="marketing_bot",
                metric="broadcast_conversion",
                current_data={
                    "target": target,
                    "success_count": success_count,
                    "fail_count": fail_count,
                },
                benchmark_data={"min_success_rate": 0.90},
            )
        except Exception as fe:
            logging.warning(f"Marketing feedback loop error: {fe}")
        await bot.session.close()

    asyncio.create_task(send_loop())

    return {
        "status": "ok",
        "message": f"Запущена рассылка на {len(user_ids)} человек (Таргет: {target}).",
        "data": {"target": target, "count": len(user_ids)},
    }


async def handle_task_created(payload: dict):
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "marketing":
        return
    # Гарда `if not chat_id: return` здесь больше нет. Она отбрасывала
    # задачу раньше, чем исполнитель успевал её спасти: task_executor
    # сам делает `chat_id or _admin_chat_id()`, а _notify без чата —
    # пустая операция. Из-за гарды задача из офисной панели создавалась,
    # событие уходило, и шесть отделов из десяти молча его выбрасывали.
    # Отдельная переменная не нужна: исполнитель берёт chat_id из data.

    bot = Bot(
        token=settings.marketing_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.task_executor import execute_bot_task
        from shared.prompts import TEAM_CONTEXT

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Директор по Маркетингу (CMO) и Marketing Bot. Твой фокус: CAC, LTV, Churn Rate, омниканальные стратегии."
        
        logging.info("MARKETING BOT passing task to TaskExecutor...")
        await execute_bot_task(
            bot=bot,
            bot_name="marketing_bot",
            department="marketing",
            task_data=data,
            team_context=sys_prompt,
            policy=await get_dynamic_marketing_policy("")
        )
        logging.info("MARKETING BOT successfully handled task.")

    except Exception as e:
        logging.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()


# Как писать КП в зависимости от того, ПОЧЕМУ отдел продаж выбрал этот ресторан
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
    """
    Спрашиваем у отдела «Заказы» (sales), кому сегодня готовить КП.
    Кого атаковать — решают продажи (они владеют клиентами и историей заказов),
    маркетинг только делает материал.
    Если продажи недоступны — работаем по своему запросу, чтобы день не пропал.
    """
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
                logging.info(
                    "b2b_outreach: отдел продаж отобрал %d ресторанов", len(targets)
                )
                return targets
            logging.info("b2b_outreach: отдел продаж не нашёл ресторанов на сегодня")
            return []
    except Exception as e:
        logging.warning(f"b2b_outreach: отдел продаж не ответил ({e}) — беру лидов сам")

    # Запасной вариант: свежие лиды, которым ещё не писали
    async with get_session_ctx() as session:
        res = await session.execute(
            text(
                # Исключаем и уже отправленные, и ЖДУЩИЕ одобрения.
                #
                # Фильтр по одному 'b2b_offer_sent' означал: пока владелец не
                # нажал кнопку, те же 15 ресторанов отбирались заново каждое
                # утро. Модель генерировала им КП по новой (платные токены),
                # в `interactions` копились дубликаты 'b2b_offer_pending', а
                # одно нажатие потом переводило в 'sent' сразу всю пачку.
                # Неделя молчания — семь одинаковых КП на один ресторан.
                "SELECT id, name, company_name, email, phone, review_summary, address, "
                "       company_type, audience "
                "FROM customers "
                "WHERE customer_type = 'b2b' AND status = 'lead' "
                "AND NOT EXISTS (SELECT 1 FROM interactions i "
                "                WHERE i.customer_id = customers.id "
                "                AND i.interaction_type IN ('b2b_offer_sent', 'b2b_offer_pending')) "
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
                "company_type": r[7],
                "audience": r[8],
                "segment": "new_lead",
                "reason": "новый ресторан",
                "touches": 0,
            }
            for r in res.fetchall()
        ]


async def b2b_outreach():
    """Ежедневная B2B-рассылка: готовит КП для ресторанов, но НЕ отправляет.

    1. Отдел «Заказы» (sales) отбирает рестораны на сегодня: новые лиды,
       отвалившиеся клиенты, те, кто не ответил на прошлое КП.
    2. Маркетинг генерирует КП (текст + PDF) — под каждый сегмент свой заход.
    3. Отправляет карточку ВЛАДЕЛЬЦУ в Telegram с кнопками ✅ / ❌.
    4. Только после одобрения КП уходит ресторану.
    """
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.ai_engine import AIEngine
        from shared.lead_gen import venue_label
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode
        from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

        limit = settings.b2b_daily_limit
        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if not admin_id:
            logging.warning(
                "b2b_outreach: admin_telegram_ids не задан, некому отправлять на одобрение."
            )
            return

        leads = await _fetch_b2b_targets(limit)
        if not leads:
            logging.info("b2b_outreach: заведений на сегодня нет.")
            return

        ai = AIEngine()
        # Выборка цен отсюда убрана: её результат никуда не присваивался и не
        # использовался — запрос ходил в базу впустую на каждую рассылку.

        # Сводка по сегментам — чтобы владелец видел, кого и почему сегодня берём
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
                f"📣 <b>КП на сегодня: {len(leads)} заведени(й)</b>\n"
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
                comp_name = lead.get("company_name") or "Заведение"
                # Тип заведения в промпте обязателен. Пока его не было,
                # каждое КП начиналось со слова «ресторан»: фитнес-клуб
                # получал письмо про сервировку блюд, а тойхона — про
                # бизнес-ланчи. Такой контакт сгорает с первой строки.
                venue = venue_label(lead.get("company_type"), lead.get("audience"))
                review_hint = (
                    f"\nИзвестное о заведении: {review_summary}."
                    if review_summary
                    else ""
                )

                # Генерация КП — заход зависит от того, ПОЧЕМУ продажи выбрали заведение
                brief = _SEGMENT_BRIEF.get(segment, _SEGMENT_BRIEF["new_lead"])
                prompt = (
                    f"Напиши текст Коммерческого предложения от Microgreen Uzbekistan.\n"
                    f"Адресат: {chef_name}, {venue}: {comp_name}.{review_hint}\n\n"
                    f"КОНТЕКСТ: {brief}\n\n"
                    f"Доводы подбирай под тип заведения: у фитнес-клуба и "
                    f"тойханы кухня устроена иначе, чем у ресторана, и "
                    f"ресторанные аргументы там звучат мимо.\n\n"
                    f"2-3 абзаца, тёплый деловой тон, без markdown."
                )
                ai_text = await ai.chat_completion(
                    system_prompt=B2B_OFFER_SYSTEM_PROMPT, user_message=prompt
                )

                # Карточка ресторана для владельца
                touch_note = f" · касание №{touches + 1}" if touches else ""
                card = (
                    f"🏪 <b>{comp_name}</b> · {venue}\n"
                    f"{_SEGMENT_LABEL.get(segment, '')} — {lead.get('reason', '')}{touch_note}\n\n"
                    f"👤 Контакт: {chef_name}\n"
                    f"📧 Email: {email or '—'}\n"
                    f"📞 Телефон: {phone or '—'}\n"
                    f"📍 Адрес: {address or '—'}\n"
                    f"⭐ {review_summary or 'Нет отзывов'}\n"
                    f"\n─── КП (превью) ───\n"
                    f"{ai_text[:800]}{'...' if len(ai_text) > 800 else ''}"
                )

                # Данные для callback: channel (email / phone), customer_id
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

                # Сохраняем КП текст в БД (pending), чтобы потом при одобрении не генерировать заново
                async with get_session_ctx() as session:
                    await session.execute(
                        text(
                            "INSERT INTO interactions (customer_id, channel, interaction_type, bot_name, summary, created_at) "
                            "VALUES (:cid, :ch, 'b2b_offer_pending', 'marketing_bot', :txt, NOW())"
                        ),
                        {"cid": cid, "ch": channel, "txt": ai_text},
                    )
                    await session.commit()

                # Не спамим — пауза между карточками
                await asyncio.sleep(1)

            await bot.send_message(
                admin_id,
                "⏳ <b>Все карточки отправлены.</b>\n"
                "Нажимайте ✅ или ❌ под каждой. Бот отправит КП только после вашего одобрения.",
            )
        finally:
            await bot.session.close()

        logging.info(
            "b2b_outreach: %d карточек отправлено админу на одобрение", len(leads)
        )

    except Exception as e:
        logging.error(f"b2b_outreach error: {e}", exc_info=True)


async def handle_b2b_approval(callback_query):
    """Обработчик кнопок Одобрить/Отклонить B2B-рассылку."""
    from shared.pdf_generator import generate_commercial_offer_pdf
    from shared.email_sender import send_b2b_offer_email
    from shared.event_bus import event_bus
    import os

    data = callback_query.data  # "b2b_approve:123:email" или "b2b_reject:123"
    parts = data.split(":")
    action = parts[0]  # b2b_approve или b2b_reject
    cid = int(parts[1])

    if action == "b2b_reject":
        # Помечаем что отклонено
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

    # ── ОДОБРЕНИЕ ──
    channel = parts[2] if len(parts) > 2 else "skip"

    async with get_session_ctx() as session:
        # Получаем данные клиента и сохранённый текст КП
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

        # Продукты для PDF — из каталога-мастера, а не своим SQL.
        products = [
            {"name": item["name"], "price": format_price(item["price"])}
            for item in (await catalog_repo.list_active())[:5]
        ]

        success = False

        if channel == "email" and email:
            # Генерируем PDF и отправляем на почту
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
            # Создаём задачу на обзвон
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


async def collect_leads_nightly():
    """
    Ночной сбор заведений из всех источников (Google, Yandex, 2ГИС).

    За ночь берётся ОДНА категория из VENUE_QUERIES, по всей области.
    Полный обход — это 14 категорий × 15 населённых пунктов × десятки
    запросов на каждый: за один прогон он выжигает суточную квоту
    провайдера, и остаток суток любой сбор возвращает пустоту. Ротация
    по дню года проходит весь справочник за 14 ночей и не требует
    хранить, на чём остановились: номер дня и есть состояние.

    Категорий было 18, пока из справочника не вывели клинику, супермаркет,
    вуз и бизнес-центр: длину ротации задаёт сам VENUE_QUERIES, а не число
    в этой строке.
    """
    try:
        from datetime import date

        from shared.lead_gen import SAMARKAND_PLACES, VENUE_QUERIES, collect_and_import_all

        categories = list(VENUE_QUERIES)
        today = categories[date.today().timetuple().tm_yday % len(categories)]

        result = await collect_and_import_all(
            categories=[today], places=SAMARKAND_PLACES
        )
        logging.info(
            "collect_leads_nightly [%s]: +%d новых лидов, %d дублей",
            today,
            result["inserted"],
            result["skipped"],
        )
    except Exception as e:
        logging.error(f"collect_leads_nightly error: {e}", exc_info=True)


# ── Bot Bus: те же действия, но по требованию (из плана Степана) ──────────
async def bus_b2b_outreach(params: dict) -> dict:
    """Подготовить КП B2B-лидам. Письма уйдут только после одобрения владельцем."""
    try:
        await b2b_outreach()
        limit = settings.b2b_daily_limit
        return {
            "status": "ok",
            "message": f"Подготовлены КП для B2B-лидов (до {limit} шт.) — "
            f"ждут вашего одобрения",
        }
    except Exception as e:
        logging.error(f"bus_b2b_outreach error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def bus_trigger_lead_audit(params: dict) -> dict:
    """Аудит воронки лидов: сколько собрано, обработано и во что превратилось.

    Считаем по customers: лид приходит со status='lead', при квалификации
    статус меняется. Сравнение статусов через LOWER — в базе встречаются и
    'LEAD', и 'lead' (та же болезнь, что с department без .lower()).
    """
    try:
        from sqlalchemy import text
        from shared.database import get_session_ctx

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT LOWER(COALESCE(status, 'unknown')) AS st, COUNT(*) "
                    "FROM customers WHERE customer_type = 'b2b' GROUP BY st"
                )
            )
            by_status = {row[0]: row[1] for row in res.fetchall()}

            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM customers "
                    "WHERE customer_type = 'b2b' AND created_at >= NOW() - INTERVAL '7 days'"
                )
            )
            fresh_week = res.scalar() or 0

            res = await session.execute(
                text(
                    "SELECT COUNT(DISTINCT customer_id) FROM interactions "
                    "WHERE interaction_type = 'b2b_offer_sent' "
                    "AND created_at >= NOW() - INTERVAL '7 days'"
                )
            )
            contacted_week = res.scalar() or 0

        total = sum(by_status.values())
        leads = by_status.get("lead", 0)
        converted = total - leads
        conversion = round(converted / total * 100, 1) if total else 0.0

        lines = [
            "📊 <b>Аудит B2B-воронки</b>",
            f"Всего компаний в базе: {total}",
            f"Из них ещё лиды: {leads}",
            f"Квалифицированы/клиенты: {converted} ({conversion}%)",
            f"Новых за 7 дней: +{fresh_week}",
            f"Контактов за 7 дней: {contacted_week}",
        ]
        summary = "\n".join(lines)

        admin_id = (
            settings.admin_telegram_ids[0] if settings.admin_telegram_ids else None
        )
        if admin_id:
            # В этом модуле нет глобального объекта бота — экземпляр создаётся
            # на вызов и закрывается, иначе сессия aiohttp течёт.
            bot = await _get_bot()
            try:
                await bot.send_message(admin_id, summary, parse_mode="HTML")
            finally:
                await bot.session.close()

        # Замыкаем петлю: результат аудита -> вывод -> правка поведения рассылок.
        try:
            from shared.feedback_loop import feedback_loop

            await feedback_loop.record_measurement(
                bot="marketing_bot",
                metric="lead_conversion",
                value=conversion,
                target=20.0,
                context={"total": total, "leads": leads, "fresh_week": fresh_week},
            )
        except Exception as fe:
            logging.warning(f"lead audit feedback error: {fe}")

        return {
            "status": "ok",
            "message": summary,
            "conversion_pct": conversion,
            "total": total,
            "fresh_week": fresh_week,
        }
    except Exception as e:
        logging.error(f"bus_trigger_lead_audit error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def bus_collect_leads(params: dict) -> dict:
    """Собрать новых B2B-лидов (заведения) из внешних источников."""
    try:
        from shared.lead_gen import collect_and_import_all

        limit = params.get("limit")
        city = str(params.get("city") or "").strip() or None
        # Категория приходит слагом из COMPANY_TYPES («toyxona», «fitness»).
        # Пусто — весь справочник: так «собери лидов» без уточнений работает
        # как работало.
        raw_category = str(params.get("category") or "").strip()
        categories = [raw_category] if raw_category else None

        result = await collect_and_import_all(
            limit=int(limit) if limit else None, city=city, categories=categories
        )
        return {
            "status": "ok",
            "message": f"Собрано лидов: +{result['inserted']} новых, "
            f"{result['skipped']} дублей пропущено"
            + (f" (категория: {raw_category})" if raw_category else "")
            + (f" (город: {city})" if city else ""),
        }
    except Exception as e:
        logging.error(f"bus_collect_leads error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def handle_roll_call(payload: dict):
    from shared.roll_call import handle_roll_call as _shared_roll_call

    await _shared_roll_call("marketing_bot", payload)


async def main():
    if not settings.marketing_bot_token:
        logger.error("FATAL: MARKETING_BOT_TOKEN is missing!")
        import sys

        sys.exit(1)

    await init_db()
    bot = Bot(
        token=settings.marketing_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=RedisStorage.from_url(settings.redis_url))
    from shared.approvals import approvals_router
    from shared.task_ui import task_ui_router

    dp.include_router(task_ui_router)
    # Кнопки ✅/❌ под рискованными действиями отдела. Без этого роутера
    # карточка подтверждения показывается, а нажатие ничего не делает.
    dp.include_router(approvals_router)
    for r in all_routers:
        dp.include_router(r)

    # ── Обработчик отписки (Opt-Out) ──
    from aiogram import Router, F
    from aiogram.types import Message

    unsubscribe_router = Router()

    @unsubscribe_router.message(
        F.text & F.text.lower().in_(["стоп", "stop", "отписаться", "unsubscribe"])
    )
    async def process_unsubscribe(message: Message):
        try:
            from shared.database import get_session_ctx
            from sqlalchemy import text

            tid = message.from_user.id
            async with get_session_ctx() as session:
                await session.execute(
                    text(
                        "UPDATE customers SET status = 'unsubscribed' WHERE telegram_id = :tid"
                    ),
                    {"tid": tid},
                )
                await session.commit()
            await message.reply("Вы отписаны от рассылок.")
        except Exception as e:
            logging.error(f"Error unsubscribing customer: {e}")

    dp.include_router(unsubscribe_router)

    # ── Обработчик кнопок одобрения/отклонения B2B-рассылки ──
    from aiogram import Router, F
    from aiogram.types import CallbackQuery

    b2b_router = Router()

    @b2b_router.callback_query(
        F.data.startswith("b2b_approve:") | F.data.startswith("b2b_reject:")
    )
    async def _b2b_cb(cq: CallbackQuery):
        await handle_b2b_approval(cq)

    dp.include_router(b2b_router)

    bot_info = await bot.me()
    group_router = create_group_router(
        bot_info.username,
        # Инструменты отдела + память чата (shared/group_reply).
        group_reply.group_handler(
            "marketing_bot",
            "marketing",
            "Ты — директор по маркетингу (CMO) Microgreen Uzbekistan: LTV, CAC, "
            "кампании, возврат ушедших клиентов, B2B-предложения.",
        ),
        wake_words=["отдел маркетинг", "маркетинг", "marketing", "реклама"],
    )
    dp.include_router(group_router)

    await event_bus.connect()

    async def handle_magazine_published(payload: dict):
        """Обрабатывает публикацию журнала и делает пост в Telegram-канал."""
        try:
            channel_id = getattr(settings, "telegram_channel_id", None)
            if not channel_id:
                logging.warning(
                    "Telegram channel ID is not set. Cannot auto-post magazine."
                )
                return

            # payload разворачиваем ОДИН раз: publish() сам оборачивает данные
            # в {"event", "data", "source"}. Читая с верхнего уровня, этот
            # обработчик не находил вообще ничего и постил дефолты.
            data = payload.get("data", {})

            # Готовый текст от издателя — предпочтительный путь: в канал уходит
            # ровно то, что собрал автор рубрики.
            post_text = str(data.get("text") or "").strip()
            cover = data.get("cover", "")

            if not post_text:
                issue_id = data.get("issue_id")
                title = data.get("title")
                if not issue_id and not title:
                    # Ни текста, ни номера выпуска — публиковать нечего.
                    # Молчание лучше, чем «FRESH WEEKLY №?» в публичном канале:
                    # именно так этот обработчик и работал каждый понедельник.
                    logging.warning(
                        "MAGAZINE_PUBLISHED без текста и номера выпуска (%s) — "
                        "в канал не публикую",
                        data.get("rubric", "?"),
                    )
                    return
                url = data.get("url", "https://microgreenuzbekistan.com/magazine")
                post_text = (
                    f"🔥 <b>Вышел новый FRESH WEEKLY №{issue_id or '—'}!</b>\n\n"
                    f"В этом выпуске: <b>{title or 'новый выпуск'}</b>\n\n"
                    f"📖 <a href='{url}'>Читать выпуск онлайн</a>"
                )

            if cover and cover.startswith("http"):
                await bot.send_photo(
                    chat_id=channel_id,
                    photo=cover,
                    caption=post_text,
                    parse_mode="HTML",
                )
            else:
                await bot.send_message(
                    chat_id=channel_id, text=post_text, parse_mode="HTML"
                )

            logging.info(
                "Опубликовано в канал %s: %s", channel_id, data.get("rubric", "выпуск")
            )
        except Exception as e:
            logging.error(f"Error auto-posting magazine: {e}")

    event_bus.on("TASK_CREATED", handle_task_created)
    event_bus.on("MAGAZINE_PUBLISHED", handle_magazine_published)
    # Входящие IG DM marketing обрабатывает своим поллингом и публикует 'ig_dm_received'
    # (его слушает Степан). Подписки на несуществующее 'IG_MESSAGE_RECEIVED' больше нет.
    # B2B-лиды идут через TASK_CREATED(dept=sales), отдельного b2b_lead_created нет.
    event_bus.on("ROLL_CALL", handle_roll_call)
    await event_bus.start_listening(8086)

    # Запуск планировщика и heartbeat
    # Ночью собираем новых лидов (2ГИС)
    scheduler.add_cron(
        name="collect_leads_nightly", func=collect_leads_nightly, hour=3, minute=0
    )
    # B2B outreach: подготавливает КП и отправляет карточку на одобрение в 10:00
    scheduler.add_cron(name="b2b_outreach", func=b2b_outreach, hour=10, minute=0)
    await scheduler.start()
    asyncio.create_task(start_heartbeat("marketing_bot"))

    async def followups_worker(bot: Bot):
        """Фоновый воркер для проверки таблицы followups и рассылки уведомлений."""
        while True:
            try:
                async with get_session_ctx() as session:
                    res = await session.execute(
                        text(
                            "SELECT f.id, c.telegram_id, f.message FROM followups f "
                            "JOIN customers c ON f.customer_id = c.id "
                            "WHERE f.status = 'pending' AND f.scheduled_at <= NOW() AND c.telegram_id IS NOT NULL "
                            "AND COALESCE(c.status, '') NOT IN ('unsubscribed', 'blocked', 'do_not_contact')"
                        )
                    )
                    rows = res.fetchall()
                    for row in rows:
                        fid, tid, msg = row
                        try:
                            await bot.send_message(
                                tid,
                                f"🔔 <b>Напоминание от Microgreen Uzbekistan:</b>\n\n{msg}",
                                parse_mode="HTML",
                            )
                            await session.execute(
                                text("UPDATE followups SET status='sent' WHERE id=:id"),
                                {"id": fid},
                            )
                            logging.info(f"Sent followup {fid} to {tid}")
                        except Exception as e:
                            logging.error(f"Failed to send followup {fid}: {e}")
                    if rows:
                        await session.commit()
            except Exception as e:
                logging.error(f"Followups worker error: {e}")
            await asyncio.sleep(60)

    asyncio.create_task(followups_worker(bot))

    # ── Bot Bus: слушаем задачи от Степана ──
    from shared.bot_bus import start_listener as bus_listen
    from shared.event_bus import BotBusActions

    asyncio.create_task(
        bus_listen(
            "marketing_bot",
            {
                "send_broadcast": bus_send_broadcast,
                "b2b_outreach": bus_b2b_outreach,
                "collect_leads": bus_collect_leads,
                # Кнопка «Аудит лидов» в веб-админке.
                "trigger_lead_audit": bus_trigger_lead_audit,
                BotBusActions.PICK_RESTAURANT: _pick_restaurant,
            },
        )
    )

    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await scheduler.stop()
        await event_bus.stop()
        await bot.session.close()


async def _pick_restaurant(params: dict) -> str:
    """Выбор 'Ресторана недели' для журнала."""
    try:
        from sqlalchemy import text
        from shared.database import get_session_ctx

        async with get_session_ctx() as session:
            res = await session.execute(
                text(
                    "SELECT name, review_score, review_summary "
                    "FROM customers "
                    "WHERE customer_type = 'b2b' AND review_score >= 4.5 "
                    "ORDER BY random() LIMIT 1"
                )
            )
            row = res.fetchone()

        if not row:
            return "Не удалось найти подходящий ресторан в базе лидов."

        name, score, summary = row
        return f"Ресторан недели: {name} (Рейтинг {score} ⭐)\n\nОтзывы:\n{summary}"
    except Exception as e:
        logging.error(f"Error picking restaurant: {e}")
        return "Ошибка выбора ресторана"


if __name__ == "__main__":
    asyncio.run(main())

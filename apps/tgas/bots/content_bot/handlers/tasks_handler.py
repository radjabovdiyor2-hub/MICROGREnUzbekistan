import logging
import os
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def handle_task_created(payload: dict) -> None:
    data = payload.get("data", {})
    if str(data.get("department", "")).lower() != "content":
        return
    chat_id = data.get("chat_id")
    task_id = data.get("task_id")
    if not chat_id:
        return

    bot = Bot(
        token=settings.content_bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    try:
        from shared.ai_engine import AIEngine
        ai = AIEngine()

        title = str(data.get("title", "")).lower()
        desc = str(data.get("description", "")).lower()
        combined = f"{title} {desc}"

        inquiry_words = [
            "уточни",
            "уточнение",
            "статус",
            "status",
            "во сколько",
            "расписан",
            "график",
            "опубликова ли",
            "когда опублик",
            "проверь публикац",
        ]
        if any(w in combined for w in inquiry_words):
            schedule = (
                "🗓 <b>Расписание публикаций контента</b>\n"
                "• Рецепт дня — ежедневно в <b>18:00</b>\n"
                "• Утренний сторис — <b>07:15</b> (лето) / <b>08:15</b> (зима)\n"
                "• Пост недели в ленту — <b>суббота, 12:00</b>\n\n"
                "Всё публикуется <b>автоматически</b> по расписанию — отдельная задача на публикацию не нужна."
            )
            await bot.send_message(chat_id, schedule, parse_mode="HTML")
            return

        is_story = any(
            word in title or word in desc
            for word in [
                "сторис",
                "stories",
                "инстаграм",
                "instagram",
                "выложи",
                "опубликуй",
                "мем",
                "рецепт",
                "опрос",
                "poll",
                "викторина",
                "отзыв",
            ]
        )
        is_poll = any(
            word in title or word in desc
            for word in ["опрос", "poll", "викторина", "голосование"]
        )
        needs_photo = is_story or any(
            word in title or word in desc
            for word in ["фото", "картинк", "изображен", "image", "picture"]
        )

        from shared.prompts import TEAM_CONTEXT
        from shared.brand import CONTENT_POLICY

        sys_prompt = f"{TEAM_CONTEXT}\n\nТы — Главный Редактор (Chief Editor) и Brand Manager. Твоя задача — создавать премиальный контент (Tone of Voice: профессиональный, экологичный, ЗОЖ).{CONTENT_POLICY}"
        user_prompt = f"Руководитель поручил задачу:\nНазвание: {data.get('title')}\nОписание: {data.get('description')}\nРазработай готовый контент (текст поста, мема, рецепта или отзыва)."

        if is_poll:
            user_prompt += '\nВНИМАНИЕ: Так как запрошен ОПРОС, верни В КОНЦЕ текста валидный JSON блок (внутри ```json ```) формата: {"question": "...", "options": ["вариант1", "вариант2"]}'

        logger.info("CONTENT_BOT Generating AI answer...")
        answer = await ai.chat_completion(sys_prompt, user_prompt)

        poll_data = None
        clean_answer = answer
        if is_poll and "```json" in answer:
            import json
            try:
                parts = answer.split("```json")
                clean_answer = parts[0].strip()
                json_str = parts[1].split("```")[0].strip()
                poll_data = json.loads(json_str)
            except Exception as e:
                logger.error(f"Error parsing poll JSON: {e}")

        image_url = None
        if needs_photo:
            logger.info("CONTENT_BOT Generating DALL-E image...")
            headline = await ai.chat_completion(
                "Ты крутой копирайтер.",
                f"Придумай ОДИН короткий, броский заголовок (максимум 2-4 слова) на ТОМ ЖЕ ЯЗЫКЕ, что и текст (узбекский или русский). Пиши ТОЛЬКО сам заголовок без кавычек:\n{clean_answer[:500]}",
            )
            dalle_prompt = (
                f"A vibrant, highly detailed vertical (9:16) Instagram Stories image. "
                f"Scene context: {clean_answer[:200]}. "
                f'The image MUST contain the bold typography text "{headline}" placed elegantly. '
                f'DO NOT TRANSLATE THE TEXT. USE THE EXACT CYRILLIC/LATIN CHARACTERS: "{headline}". '
                f"Absolutely no other text or English words on the image."
            )
            image_url = await ai.generate_image(dalle_prompt, size="1024x1792")

        logger.info(f"CONTENT_BOT sending message to {chat_id}")

        if image_url:
            from aiogram.types import FSInputFile
            media = FSInputFile(image_url) if os.path.isfile(image_url) else image_url
            await bot.send_photo(
                chat_id,
                photo=media,
                caption=f"📝 <b>Контент готов:</b>\n\n{clean_answer[:900]}",
                parse_mode="HTML",
            )
            if len(clean_answer) > 900:
                await bot.send_message(
                    chat_id,
                    f"...продолжение:\n\n{clean_answer[900:]}",
                    parse_mode="HTML",
                )
        else:
            from shared.task_ui import get_task_keyboard
            await bot.send_message(
                chat_id,
                f"📝 <b>Контент готов:</b>\n\n{clean_answer}",
                parse_mode="HTML",
                reply_markup=get_task_keyboard(task_id),
            )

        if (
            poll_data
            and isinstance(poll_data, dict)
            and "question" in poll_data
            and "options" in poll_data
        ):
            await bot.send_poll(
                chat_id, question=poll_data["question"], options=poll_data["options"]
            )

        if is_story and image_url:
            from shared.instagram import post_story_with_text
            public_url = getattr(ai, "_last_image_url", image_url) or image_url
            success = await post_story_with_text(public_url, headline, clean_answer)
            if success:
                await bot.send_message(
                    chat_id,
                    "✅ <i>Контент успешно опубликован в Instagram Stories!</i>",
                    parse_mode="HTML",
                )
            else:
                await bot.send_message(
                    chat_id,
                    "⚠️ <i>Не удалось опубликовать в Instagram. Ошибка интеграции.</i>",
                    parse_mode="HTML",
                )

        logger.info("CONTENT_BOT successfully handled task.")

    except Exception as e:
        logger.error(f"Error handling task: {repr(e)}", exc_info=True)
    finally:
        await bot.session.close()

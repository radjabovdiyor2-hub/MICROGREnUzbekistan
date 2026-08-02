import logging
import json
from aiogram import Bot
from sqlalchemy import text
from shared.database import get_session_ctx
from shared.ai_engine import AIEngine
from shared.event_bus import event_bus
from shared.task_ui import get_task_keyboard

logger = logging.getLogger(__name__)

async def get_active_products_text() -> str:
    """Загружает список активных продуктов и формирует текст для промпта."""
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                text("SELECT name_ru, price FROM products WHERE is_active = true")
            )
            products = res.fetchall()
            if not products:
                return "Активных продуктов не найдено."
            return "\n".join([f"- {p[0]}: {p[1]} сум" for p in products])
    except Exception as e:
        logger.error(f"Error fetching products for task: {e}")
        return "Данные о продуктах временно недоступны."

async def execute_bot_task(
    bot: Bot | None, 
    bot_name: str, 
    department: str, 
    task_data: dict, 
    team_context: str, 
    policy: str = ""
):
    """
    Универсальный обработчик задач для любого бота.
    """
    chat_id = task_data.get("chat_id")
    task_id = task_data.get("task_id")
    title = task_data.get("title", "")
    description = task_data.get("description", "")
    
    if not chat_id or not task_id:
        return
        
    ai = AIEngine()
    
    products_text = await get_active_products_text()
        
    sys_prompt = f"""{team_context}
    
Ты — бот отдела {department}.
Тебе поступила задача:
Название: {title}
Описание: {description}

В нашей базе есть следующие активные продукты и цены:
{products_text}

ПРАВИЛА ОБРАБОТКИ ЗАДАЧ:
1. Оцени, относится ли эта задача к твоему отделу ({department}).
   - Marketing (маркетинг, реклама, визуал, соцсети, генерация фото для постов)
   - Content (контент, тексты, статьи, рецепты, прайс-листы)
   - Sales (продажи, B2B заказы, клиенты)
   - Support (поддержка, жалобы, отзывы)
   Если задача явно для другого отдела, ты должен вернуть action="redirect" и указать нужный отдел на английском.
2. Если задача для тебя, ты должен ВЫПОЛНИТЬ её. Верни action="execute".
   - Сгенерируй финальный текстовый ответ (результат задачи) в reply_text.
   - Если задача явно просит создать "фото", "картинку", "визуал", верни подробный image_prompt на АНГЛИЙСКОМ языке для генератора картинок. Иначе null.
   
ФОРМАТ ОТВЕТА - СТРОГИЙ JSON (без markdown блоков, просто голый JSON):
{{
  "action": "execute" | "redirect",
  "redirect_dept": "marketing" | "sales" | "content" | "support" | "hr" | "finance" | null,
  "reply_text": "твой ответ пользователю (если execute - это готовый результат задачи, если redirect - короткое сообщение о передаче)",
  "image_prompt": "prompt for image generation in english or null"
}}
{policy}
"""
    
    try:
        # Уведомляем о начале работы
        await bot.send_message(
            chat_id, 
            f"⏳ <b>Отдел {department} принял задачу в работу.</b>\nАнализирую и выполняю...", 
            parse_mode="HTML"
        )
        
        raw_response = await ai.chat_completion(
            system_prompt=sys_prompt, 
            user_message="Проанализируй задачу и верни JSON.",
            temperature=0.4,
            max_tokens=1000
        )
        
        # Парсим JSON (strict=False позволяет неэкранированные переносы строк внутри строковых значений)
        raw_json = raw_response.strip().strip("`").replace("json\n", "", 1)
        data = json.loads(raw_json, strict=False)
        
        action = data.get("action")
        reply_text = data.get("reply_text", "Задача выполнена.")
        
        if action == "redirect":
            new_dept = data.get("redirect_dept")
            if new_dept and new_dept.lower() != department.lower():
                # Обновляем задачу в БД
                async with get_session_ctx() as session:
                    await session.execute(
                        text("UPDATE tasks SET department = :dept WHERE id = :tid"),
                        {"dept": new_dept.lower(), "tid": task_id}
                    )
                    await session.commit()
                
                # Сообщаем текущему пользователю (или Степану)
                await bot.send_message(
                    chat_id,
                    f"🔄 <b>Перенаправление:</b>\n{reply_text}\n\n<i>Задача передана в отдел {new_dept}</i>",
                    parse_mode="HTML"
                )
                
                # Публикуем новое событие
                task_data["department"] = new_dept.lower()
                await event_bus.publish("TASK_CREATED", {"data": task_data})
                return
                
        # Action is execute
        image_prompt = data.get("image_prompt")
        final_image_url = None
        
        if image_prompt and str(image_prompt).strip().lower() != "null":
            await bot.send_message(chat_id, "🎨 <i>Генерирую изображение...</i>", parse_mode="HTML")
            final_image_url = await ai.generate_image(image_prompt, size="1024x1024")
            
        # Отправляем результат
        from aiogram.types import FSInputFile, URLInputFile
        import os
        
        caption_text = f"✅ <b>Результат ({department}):</b>\n\n{reply_text}"[:1024]
        full_text = f"✅ <b>Результат ({department}):</b>\n\n{reply_text}"
        
        if bot is not None:
            if final_image_url:
                if final_image_url.startswith("http"):
                    photo = URLInputFile(final_image_url)
                elif os.path.isfile(final_image_url):
                    photo = FSInputFile(final_image_url)
                else:
                    photo = None
                    
                if photo:
                    await bot.send_photo(
                        chat_id,
                        photo=photo,
                        caption=caption_text,
                        parse_mode="HTML",
                        reply_markup=get_task_keyboard(task_id)
                    )
                else:
                    await bot.send_message(
                        chat_id,
                        f"{full_text}\n\n[Не удалось загрузить сгенерированное фото]",
                        parse_mode="HTML",
                        reply_markup=get_task_keyboard(task_id)
                    )
            else:
                await bot.send_message(
                    chat_id,
                    full_text,
                    parse_mode="HTML",
                    reply_markup=get_task_keyboard(task_id)
                )
        else:
            # Если нет bot, публикуем TASK_COMPLETED
            await event_bus.publish(
                "TASK_COMPLETED",
                {
                    "task_id": task_id,
                    "completed_by": department,
                    "chat_id": chat_id,
                    "text": full_text,
                },
                bot_name,
            )
            
    except Exception as e:
        logger.error(f"Error executing bot task: {e}", exc_info=True)
        if bot is not None:
            await bot.send_message(
                chat_id,
                f"❌ <b>Ошибка при выполнении задачи ({department}):</b>\n{str(e)}",
                parse_mode="HTML"
            )
        else:
            await event_bus.publish(
                "TASK_COMPLETED",
                {
                    "task_id": task_id,
                    "completed_by": department,
                    "chat_id": chat_id,
                    "text": f"❌ <b>Ошибка при выполнении задачи ({department}):</b>\n{str(e)}",
                },
                bot_name,
            )

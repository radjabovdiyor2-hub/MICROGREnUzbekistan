import logging
from aiogram import Bot
from aiogram.types import FSInputFile
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from shared.config import settings

logger = logging.getLogger(__name__)

async def bus_generate_invoice(params: dict) -> dict:
    """Генерация PDF-счёта и отправка клиенту."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text
        from shared.pdf_generator import generate_invoice_pdf

        order_id = params.get("order_id")
        chat_id = params.get("chat_id")
        
        if not order_id:
            return {"status": "error", "message": "order_id is required"}

        async with get_session_ctx() as session:
            # Получить информацию о заказе
            order_res = await session.execute(
                text("SELECT order_number, total_amount, status FROM orders WHERE id = :oid"),
                {"oid": int(order_id)}
            )
            order = order_res.fetchone()
            
            if not order:
                return {"status": "error", "message": "Order not found"}
                
            order_number, total_amount, status = order
            
            # Получить клиента
            user_res = await session.execute(
                text("SELECT u.first_name, u.last_name, u.phone FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = :oid"),
                {"oid": int(order_id)}
            )
            user = user_res.fetchone()
            client_name = f"{user[0]} {user[1] or ''}".strip() if user else "Клиент"

            # Получить товары
            items_res = await session.execute(
                text(
                    "SELECT p.name_ru, oi.quantity, oi.price "
                    "FROM order_items oi "
                    "JOIN products p ON p.id = oi.product_id "
                    "WHERE oi.order_id = :oid"
                ),
                {"oid": int(order_id)}
            )
            items = [{"name": row[0], "qty": row[1], "price": row[2]} for row in items_res.fetchall()]

        pdf_path = generate_invoice_pdf(
            client_name=client_name,
            invoice_number=str(order_number),
            items=items,
            total=float(total_amount),
            output_filename=f"invoice_{order_number}.pdf"
        )
        
        # Отправляем в Telegram, если указан chat_id
        if chat_id:
            bot = Bot(
                token=settings.finance_bot_token,
                default=DefaultBotProperties(parse_mode=ParseMode.HTML),
            )
            try:
                document = FSInputFile(pdf_path)
                await bot.send_document(
                    chat_id,
                    document=document,
                    caption=f"📄 Ваш счет на оплату заказа <b>{order_number}</b>",
                    parse_mode="HTML"
                )
                logger.info(f"Invoice sent to chat {chat_id}")
            except Exception as e:
                logger.error(f"Failed to send invoice to chat {chat_id}: {e}")
            finally:
                await bot.session.close()

        return {
            "status": "ok",
            "message": f"Invoice generated for order {order_number}",
            "pdf_path": pdf_path
        }
    except Exception as e:
        logger.error(f"bus_generate_invoice error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

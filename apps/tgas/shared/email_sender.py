import asyncio
import os
import smtplib
import logging
from email.message import EmailMessage
from typing import Optional

logger = logging.getLogger(__name__)


def _send_sync(to_email: str, subject: str, text_content: str,
               pdf_path: Optional[str] = None) -> bool:
    """Синхронная отправка письма. PDF — опционально."""
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        logger.error("SMTP_USER или SMTP_PASSWORD не заданы в .env")
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.set_content(text_content)

    if pdf_path:
        if not os.path.exists(pdf_path):
            logger.error(f"PDF файл не найден: {pdf_path}")
            return False
        try:
            with open(pdf_path, "rb") as f:
                msg.add_attachment(f.read(), maintype="application", subtype="pdf",
                                   filename=os.path.basename(pdf_path))
        except Exception as e:
            logger.error(f"Ошибка при чтении PDF {pdf_path}: {e}")
            return False

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
        logger.info(f"Email успешно отправлен на {to_email}")
        return True
    except Exception as e:
        logger.error(f"Ошибка при отправке email на {to_email}: {e}", exc_info=True)
        return False


async def send_email(to_email: str, subject: str, text_content: str,
                     pdf_path: Optional[str] = None) -> bool:
    """
    Простое письмо (без вложения) — второй канал в лестнице связи с клиентом,
    когда Telegram недоступен. smtplib блокирующий, поэтому уводим в поток.
    """
    return await asyncio.to_thread(_send_sync, to_email, subject, text_content, pdf_path)


async def send_b2b_offer_email(to_email: str, subject: str, text_content: str, pdf_path: str) -> bool:
    """
    Отправляет электронное письмо с коммерческим предложением (PDF) клиенту.
    """
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    
    if not smtp_user or not smtp_password:
        logger.error("SMTP_USER или SMTP_PASSWORD не заданы в .env")
        return False
        
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = smtp_user
    msg['To'] = to_email
    
    msg.set_content(text_content)
    
    # Прикрепляем PDF
    if os.path.exists(pdf_path):
        try:
            with open(pdf_path, 'rb') as f:
                pdf_data = f.read()
            msg.add_attachment(
                pdf_data,
                maintype='application',
                subtype='pdf',
                filename=os.path.basename(pdf_path)
            )
        except Exception as e:
            logger.error(f"Ошибка при чтении PDF {pdf_path}: {e}")
            return False
    else:
        logger.error(f"PDF файл не найден по пути: {pdf_path}")
        return False
        
    try:
        # Для порта 465 используем SMTP_SSL, для 587 - SMTP с starttls
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.send_message(msg)
                
        logger.info(f"Email успешно отправлен на {to_email}")
        return True
    except Exception as e:
        logger.error(f"Ошибка при отправке email на {to_email}: {e}", exc_info=True)
        return False

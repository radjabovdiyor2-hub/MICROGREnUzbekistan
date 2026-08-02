import os
import tempfile
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import logging

logger = logging.getLogger(__name__)


def generate_commercial_offer_pdf(
    client_name: str,
    ai_text: str,
    prices: list,
    output_filename: str = "commercial_offer.pdf",
) -> str:
    """
    Генерирует PDF-файл коммерческого предложения.
    Возвращает абсолютный путь к созданному файлу.
    """
    # Регистрируем шрифт с поддержкой кириллицы
    font_path = "C:\\Windows\\Fonts\\arial.ttf"
    if not os.path.exists(font_path):
        # Fallback for Linux Docker with fonts-dejavu-core
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont("DejaVu", font_path))
        font_name = "DejaVu"
    else:
        # Без нормального шрифта русские буквы не отобразятся
        font_name = "Helvetica"

    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, output_filename)

    c = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4

    # Заголовок
    c.setFont(font_name, 24)
    c.drawString(50, height - 80, "Коммерческое предложение")

    c.setFont(font_name, 14)
    c.drawString(50, height - 120, f"Для: {client_name}")

    # Текст от AI (разбиваем на строки)
    c.setFont(font_name, 12)
    text_y = height - 160

    # Простая разбивка текста на строки (reportlab canvas.drawString не делает авто-перенос)
    from reportlab.lib.utils import simpleSplit

    lines = []
    for paragraph in ai_text.split("\n"):
        lines.extend(simpleSplit(paragraph, font_name, 12, width - 100))

    for line in lines:
        if text_y < 100:
            c.showPage()
            c.setFont(font_name, 12)
            text_y = height - 50
        c.drawString(50, text_y, line)
        text_y -= 15

    # Блок с ценами
    text_y -= 20
    c.setFont(font_name, 14)
    c.drawString(50, text_y, "Наши продукты:")
    text_y -= 20

    c.setFont(font_name, 12)
    for product in prices:
        if text_y < 100:
            c.showPage()
            c.setFont(font_name, 12)
            text_y = height - 50
        c.drawString(
            50, text_y, f"• {product.get('name', '')} — {product.get('price', '')}"
        )
        text_y -= 15

    # Подвал
    c.setFont(font_name, 10)
    # Контакты из brand.py — единственного источника фирменных данных.
    # Заглушка «+998 91 123 45 67» уходила в коммерческие предложения клиентам.
    from shared.brand import BRAND

    c.drawString(
        50, 50, f"Microgreen Uzbekistan | {BRAND['phone']} | microgreenuzbekistan.com"
    )

    c.save()
    logger.info(f"PDF Commercial Offer generated: {file_path}")
    return file_path

def generate_invoice_pdf(
    client_name: str,
    invoice_number: str,
    items: list,
    total: float,
    output_filename: str = "invoice.pdf",
) -> str:
    """Генерирует PDF-счет для B2B клиентов."""
    font_path = "C:\\Windows\\Fonts\\arial.ttf"
    if not os.path.exists(font_path):
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

    if os.path.exists(font_path):
        pdfmetrics.registerFont(TTFont("DejaVu", font_path))
        font_name = "DejaVu"
    else:
        font_name = "Helvetica"

    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, output_filename)

    c = canvas.Canvas(file_path, pagesize=A4)
    width, height = A4

    # Заголовок
    c.setFont(font_name, 24)
    c.drawString(50, height - 80, f"Счет на оплату № {invoice_number}")

    c.setFont(font_name, 14)
    c.drawString(50, height - 120, f"Плательщик: {client_name}")

    text_y = height - 160
    c.setFont(font_name, 12)
    c.drawString(50, text_y, "Товары/услуги:")
    text_y -= 20

    for item in items:
        if text_y < 150:
            c.showPage()
            c.setFont(font_name, 12)
            text_y = height - 50
        name = item.get("name", "Товар")
        qty = item.get("qty", 1)
        price = item.get("price", 0)
        sum_price = qty * price
        c.drawString(50, text_y, f"• {name} — {qty} шт x {price:,.0f} = {sum_price:,.0f} UZS")
        text_y -= 15

    text_y -= 20
    c.setFont(font_name, 14)
    c.drawString(50, text_y, f"Итого к оплате: {total:,.0f} UZS")

    # Подвал
    c.setFont(font_name, 10)
    from shared.brand import BRAND
    c.drawString(50, 50, f"Microgreen Uzbekistan | {BRAND['phone']} | microgreenuzbekistan.com")

    c.save()
    logger.info(f"PDF Invoice generated: {file_path}")
    return file_path

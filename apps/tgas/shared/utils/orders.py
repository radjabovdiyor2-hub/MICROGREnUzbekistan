import logging
from typing import Optional

logger = logging.getLogger(__name__)

def generate_order_number(last_number: Optional[str] = None) -> str:
    if last_number is None:
        return "MG-000001"

    try:
        num_part = last_number.split("-", 1)[1]
        next_num = int(num_part) + 1
        return f"MG-{next_num:06d}"
    except (IndexError, ValueError) as e:
        logger.warning(f"Некорректный номер заказа '{last_number}': {e}")
        return "MG-000001"

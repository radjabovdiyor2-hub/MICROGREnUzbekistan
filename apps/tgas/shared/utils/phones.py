import re
import logging

logger = logging.getLogger(__name__)

def is_valid_uz_phone(phone: str) -> bool:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 9 and digits[0] in "97":
        return True
    if len(digits) == 12 and digits.startswith("998"):
        return True
    return False

def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 9 and digits[0] in "97":
        return f"+998{digits}"
    if len(digits) == 12 and digits.startswith("998"):
        return f"+{digits}"

    logger.warning(f"Не удалось нормализовать номер: {phone}")
    return phone

import logging
import aiohttp
from datetime import datetime, timezone
from shared.token_refresh.core import GRAPH_BASE_URL
from shared.token_refresh.credentials import _get_app_credentials

logger = logging.getLogger(__name__)

async def debug_token(token: str) -> dict:
    app_id, app_secret = _get_app_credentials()
    if not app_id:
        return {}

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/debug_token"
            params = {
                "input_token": token,
                "access_token": f"{app_id}|{app_secret}",
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                debug_data = data.get("data", {})
                if debug_data:
                    expires_at = debug_data.get("expires_at", 0)
                    if expires_at:
                        exp_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)
                        days_left = (exp_dt - datetime.now(timezone.utc)).days
                        debug_data["_days_left"] = days_left
                        debug_data["_expires_readable"] = exp_dt.isoformat()
                    logger.info(
                        f"🔍 Token debug: valid={debug_data.get('is_valid')}, "
                        f"type={debug_data.get('type')}, "
                        f"expires={debug_data.get('_expires_readable', 'never')}, "
                        f"days_left={debug_data.get('_days_left', '∞')}"
                    )
                return debug_data
    except Exception as e:
        logger.error(f"Ошибка debug_token: {e}", exc_info=True)
        return {}

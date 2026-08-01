from typing import dict, tuple

CACHE_TTL = 60

_settings_cache: dict[str, object] = {}
_settings_at: float = 0.0

_prompt_cache: dict[tuple[str, str], str] = {}
_prompt_at: float = 0.0

def invalidate() -> None:
    global _settings_at, _prompt_at
    _settings_at = 0.0
    _prompt_at = 0.0

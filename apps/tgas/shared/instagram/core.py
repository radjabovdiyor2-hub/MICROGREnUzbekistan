import os

_DRY_RUN = False

def set_dry_run(value: bool) -> None:
    global _DRY_RUN
    _DRY_RUN = value

def _is_dry_run() -> bool:
    return _DRY_RUN or bool(os.getenv("SMM_DRY_RUN"))

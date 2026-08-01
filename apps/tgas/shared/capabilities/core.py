from dataclasses import dataclass, field
from typing import Callable, Awaitable, Optional
from shared.config import settings

DAILY_OUTREACH_CAP = int(getattr(settings, "outreach_daily_cap", 50) or 50)

@dataclass
class Result:
    ok: bool
    summary: str
    evidence: list = field(default_factory=list)
    human_task: Optional[str] = None


@dataclass
class Capability:
    key: str
    dept: str
    title: str
    description: str
    outward: bool
    run: Callable[[dict], Awaitable[Result]]

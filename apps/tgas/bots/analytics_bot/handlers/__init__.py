from .start import router as start_router
from .dashboard import router as dashboard_router
from .ai_analytics import router as ai_router

all_routers = [start_router, dashboard_router, ai_router]

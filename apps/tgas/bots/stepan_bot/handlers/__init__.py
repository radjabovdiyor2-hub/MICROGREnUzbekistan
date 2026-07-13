from .assistant import router as assistant_router
from .dispatcher import router as dispatcher_router
from .product_card import product_card_router
from .production import router as production_router
from .sale_ui import sale_ui_router
from .standup import router as standup_router
from .tasks import router as tasks_router
from .team_meeting import meeting_router

# meeting_router перед assistant_router — ловит кнопку/реплай совещания
# ДО того, как assistant.brain (F.text) перехватит сообщение.
# product_card_router тоже РАНЬШЕ assistant_router: пока идёт мастер карточки
# товара, его шаги (название, цена, фото) не должны уходить в общий «мозг».
# assistant_router LAST — он ловит все текстовые сообщения
all_routers = [dispatcher_router, production_router, product_card_router, sale_ui_router,
               standup_router, tasks_router, meeting_router, assistant_router]

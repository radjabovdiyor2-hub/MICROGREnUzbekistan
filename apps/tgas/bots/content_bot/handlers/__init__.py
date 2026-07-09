from .start import router as start_router
from .autopost import router as autopost_router

# autopost_router первым — /post и «сделай пост …» с подтверждением публикации
all_routers = [autopost_router, start_router]

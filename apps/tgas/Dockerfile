FROM python:3.12-slim

WORKDIR /app

# System deps (ffmpeg — сборка Reels в shared/video_utils.make_reel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev fonts-dejavu-core postgresql-client ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# ВАЖНО: контекст сборки — КОРЕНЬ репозитория, а не apps/tgas. Так образ
# видит packages/mg_ai — общий AI-движок офиса и витринного бота. Поэтому
# все пути ниже указаны от корня.
#
# Следствие, о котором легко забыть: apps/tgas/.dockerignore больше НЕ
# применяется, работает корневой. Его исключения перенесены туда — включая
# apps/tgas/.env с боевыми токенами ботов. Проверяй корневой .dockerignore,
# прежде чем менять что-то здесь.

# Зависимости отдельным слоем и ДО кода: правка кода не должна пересобирать pip.
COPY apps/tgas/requirements.txt ./requirements.txt
COPY packages/mg_ai/requirements.txt ./mg_ai-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r mg_ai-requirements.txt

# Общий пакет ставим установкой, а не копированием в рабочий каталог: тогда
# `import mg_ai` работает откуда угодно и не зависит от PYTHONPATH.
COPY packages/mg_ai /opt/mg_ai
RUN pip install --no-cache-dir --no-deps /opt/mg_ai

COPY apps/tgas .

# Default: run stepan_bot. Override via docker-compose command.
CMD ["python", "-m", "bots.stepan_bot.main"]

FROM python:3.12-slim

WORKDIR /app

# System deps (ffmpeg — сборка Reels в shared/video_utils.make_reel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev fonts-dejavu-core postgresql-client ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default: run stepan_bot. Override via docker-compose command.
CMD ["python", "-m", "bots.stepan_bot.main"]

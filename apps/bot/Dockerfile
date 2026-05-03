FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY apps/bot/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy bot code
COPY apps/bot ./

CMD ["python", "main.py"]

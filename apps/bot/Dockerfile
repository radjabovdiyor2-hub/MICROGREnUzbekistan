FROM python:3.11-slim

WORKDIR /app

# Зависимости отдельным слоем и ДО кода: правка кода не должна пересобирать pip.
COPY apps/bot/requirements.txt ./
COPY packages/mg_ai/requirements.txt ./mg_ai-requirements.txt
RUN pip install --no-cache-dir -r requirements.txt -r mg_ai-requirements.txt

# Общий AI-движок — тот же, что у офиса. Ставим установкой, а не копированием
# в рабочий каталог: у витринного бота есть собственный каталог shared/, и
# складывать общий пакет рядом значило бы напрашиваться на конфликт имён.
COPY packages/mg_ai /opt/mg_ai
RUN pip install --no-cache-dir --no-deps /opt/mg_ai

# Copy bot code
COPY apps/bot ./

CMD ["python", "main.py"]

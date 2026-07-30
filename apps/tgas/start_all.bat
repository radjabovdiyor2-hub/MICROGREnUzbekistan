@echo off
REM Локальный запуск всего набора (Windows, cmd). Каждый бот в своём окне.
REM
REM Список идёт одним циклом, а не 13 копипастами: раньше был копипаст, и
REM franchise_bot туда просто не дописали — он не запускался, а мониторинг
REM показывал «Franchise — НЕ ЗАПУЩЕН».
REM Реестр сверяется с shared/health.py:ALL_BOTS:
REM   python scripts\check_bot_roster.py
REM Добавили бота — допишите в список ниже и прогоните сверку.
REM
REM pm_bot нет намеренно — Стёпан работает под его токеном.

cd /d "%~dp0"

if not exist ".\venv\Scripts\python.exe" (
    echo Не найден venv: .\venv\Scripts\python.exe
    echo Создайте его: python -m venv venv ^&^& venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

set BOTS=stepan_bot sales_bot support_bot hr_bot finance_bot marketing_bot analytics_bot content_bot qa_bot rnd_bot devops_bot franchise_bot n8n_bridge

echo Starting Web Office...
start "" cmd /k ".\venv\Scripts\python.exe -m uvicorn web_office.main:app --host 0.0.0.0 --port 8050"

for %%B in (%BOTS%) do (
    echo Starting %%B...
    start "" cmd /k ".\venv\Scripts\python.exe -m bots.%%B.main"
)

echo.
echo All systems started. Проверить: python scripts\check_bot_roster.py
pause

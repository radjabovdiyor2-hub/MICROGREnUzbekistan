# Локальный запуск всего набора (Windows). Каждый бот — отдельный фоновый процесс.
#
# Список держим одним массивом, а не 13 копипастами Start-Process: раньше так и
# было, и franchise_bot туда просто не дописали — он не запускался, а мониторинг
# показывал «Franchise — НЕ ЗАПУЩЕН».
# Реестр сверяется с shared/health.py:ALL_BOTS скриптом
#   python scripts/check_bot_roster.py
# Добавили бота — допишите его сюда и прогоните сверку.

$cwd = $PSScriptRoot
$python = "$cwd\venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Host "Не найден venv: $python" -ForegroundColor Red
    Write-Host "Создайте его: python -m venv venv; venv\Scripts\pip install -r requirements.txt"
    exit 1
}

# Порядок как в docker-compose: сначала Стёпан (PM), потом остальные.
# pm_bot нет намеренно — Стёпан работает под его токеном.
$bots = @(
    "stepan_bot",
    "sales_bot",
    "support_bot",
    "hr_bot",
    "finance_bot",
    "marketing_bot",
    "analytics_bot",
    "content_bot",
    "qa_bot",
    "rnd_bot",
    "devops_bot",
    "franchise_bot",
    "n8n_bridge"
)

# Дашборд read-view над той же БД
Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "web_office.main:app", "--host", "0.0.0.0", "--port", "8050" -WorkingDirectory $cwd -WindowStyle Hidden

foreach ($bot in $bots) {
    Start-Process -FilePath $python -ArgumentList "-m", "bots.$bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
    Write-Host "  запущен $bot"
}

Write-Host ""
Write-Host "Запущено ботов: $($bots.Count) + web_office на :8050" -ForegroundColor Green
Write-Host "Проверить живость: python scripts/check_bot_roster.py, затем отчёт Стёпана или /health"

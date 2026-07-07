$commands = @(
    ".\venv\Scripts\python.exe -m uvicorn web_office.main:app --host 0.0.0.0 --port 8050",
    ".\venv\Scripts\python.exe -m bots.stepan_bot.main",
    ".\venv\Scripts\python.exe -m bots.sales_bot.main",
    ".\venv\Scripts\python.exe -m bots.pm_bot.main",
    ".\venv\Scripts\python.exe -m bots.finance_bot.main",
    ".\venv\Scripts\python.exe -m bots.marketing_bot.main",
    ".\venv\Scripts\python.exe -m bots.analytics_bot.main",
    ".\venv\Scripts\python.exe -m bots.support_bot.main",
    ".\venv\Scripts\python.exe -m bots.hr_bot.main",
    ".\venv\Scripts\python.exe -m bots.content_bot.main"
)

foreach ($cmd in $commands) {
    Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $cmd
}
Write-Host "All processes started via WMI!"

$cwd = "c:\Users\TUF GAMING\Desktop\tgas"
$python = "$cwd\venv\Scripts\python.exe"

Start-Process -FilePath $python -ArgumentList "-m", "uvicorn", "web_office.main:app", "--host", "0.0.0.0", "--port", "8050" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.stepan_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.sales_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.pm_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.finance_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.marketing_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.analytics_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.support_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.hr_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.content_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.devops_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.qa_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.rnd_bot.main" -WorkingDirectory $cwd -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "-m", "bots.n8n_bridge.main" -WorkingDirectory $cwd -WindowStyle Hidden

Write-Host "All bots started cleanly in the background!"

import subprocess
import time

commands = [
    [
        r".\venv\Scripts\python.exe",
        "-m",
        "uvicorn",
        "web_office.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8050",
    ],
    [r".\venv\Scripts\python.exe", "-m", "bots.stepan_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.sales_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.finance_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.marketing_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.analytics_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.support_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.hr_bot.main"],
    [r".\venv\Scripts\python.exe", "-m", "bots.content_bot.main"],
]

DETACHED_PROCESS = 0x00000008

for cmd in commands:
    subprocess.Popen(cmd, creationflags=DETACHED_PROCESS, close_fds=True)
    time.sleep(0.5)

print("All processes launched in background!")

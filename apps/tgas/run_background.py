import subprocess
import os

bots = [
    "bots.stepan_bot.main",
    "bots.sales_bot.main",
    "bots.finance_bot.main",
    "bots.marketing_bot.main",
    "bots.analytics_bot.main",
    "bots.support_bot.main",
    "bots.hr_bot.main",
    "bots.content_bot.main",
    "bots.devops_bot.main",
    "bots.rnd_bot.main",
]

python_exe = os.path.join("venv", "Scripts", "python.exe")

print("Starting bots in background...")
for bot in bots:
    print(f"Starting {bot}...")
    subprocess.Popen(
        [python_exe, "-m", bot],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

print("Starting web office...")
subprocess.Popen(
    [
        python_exe,
        "-m",
        "uvicorn",
        "web_office.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8050",
    ],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

print("All processes started in the background successfully.")

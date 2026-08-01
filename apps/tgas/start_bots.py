import subprocess
import time
import sys

bots = [
    "bots.stepan_bot.main",
    "bots.sales_bot.main",
    "bots.finance_bot.main",
    "bots.marketing_bot.main",
    "bots.analytics_bot.main",
    "bots.support_bot.main",
    "bots.hr_bot.main",
    "bots.content_bot.main",
]

print("Starting all bots...")
processes = []
for bot in bots:
    p = subprocess.Popen([r".\venv\Scripts\python.exe", "-m", bot])
    processes.append(p)
    print(f"Started {bot}")

print("Bots are running in the background. Press Ctrl+C to stop all.")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("Stopping bots...")
    for p in processes:
        p.terminate()
    sys.exit(0)

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

procs = []

# Start web office
procs.append(
    subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "web_office.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8050",
        ]
    )
)

# Start all bots
for bot in bots:
    procs.append(subprocess.Popen([sys.executable, "-m", bot]))

print("All bots started. Press Ctrl+C to exit.")

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    for p in procs:
        p.terminate()

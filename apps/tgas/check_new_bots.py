import os
import glob

bots = ['qa_bot', 'rnd_bot', 'devops_bot']
for bot in bots:
    p = os.path.join("apps/tgas/bots", bot, "main.py")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            print(f"--- {bot} ---")
            print(f.read()[:200])
            print("---")

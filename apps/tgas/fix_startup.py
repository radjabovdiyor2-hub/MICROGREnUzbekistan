import os
import glob
import re

bots_dir = r"apps/tgas/bots"
bot_dirs = [d for d in os.listdir(bots_dir) if os.path.isdir(os.path.join(bots_dir, d))]

for bd in bot_dirs:
    main_py = os.path.join(bots_dir, bd, "main.py")
    if not os.path.exists(main_py):
        continue
        
    with open(main_py, "r", encoding="utf-8") as f:
        content = f.read()
        
    # find which token it uses
    m = re.search(r"settings\.([a-zA-Z0-9_]+_token)", content)
    if not m:
        continue
        
    token_var = m.group(1)
    
    # check if already validates
    if f"if not settings.{token_var}:" in content:
        continue
        
    # inject into main()
    main_def = "async def main():"
    if main_def in content:
        validation_code = f'''
    if not settings.{token_var}:
        logger.error(f"FATAL: {token_var.upper()} is missing!")
        import sys
        sys.exit(1)
'''
        content = content.replace(main_def, main_def + validation_code)
        
        with open(main_py, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Patched {bd} with {token_var} validation.")

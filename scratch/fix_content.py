import re

filepath = 'apps/tgas/bots/content_bot/main.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the function definition using regex
func_pattern = r"async def get_dynamic_content_policy\(\) -> str:.*?return \"\"\n"
content = re.sub(func_pattern, "", content, flags=re.DOTALL)

# Find logger = logging.getLogger(__name__) and insert after it
insert_point = "logger = logging.getLogger(__name__)\n"
if insert_point in content:
    func_code = """
async def get_dynamic_content_policy() -> str:
    from shared.feedback_loop import feedback_loop
    try:
        active = await feedback_loop.get_active_behavior("content_bot", "weekly_reach")
        directives = [str(v) for v in active.values() if isinstance(v, str)]
        if directives:
            directive_text = " ".join(directives)
            return f"\\n\\n[ДИРЕКТИВА ИИ-АНАЛИТИКА: {directive_text}]\\n"
    except Exception:
        pass
    return ""
"""
    content = content.replace(insert_point, insert_point + "\n" + func_code)
else:
    print("Could not find logger initialization")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

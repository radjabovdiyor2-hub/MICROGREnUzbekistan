import sys
import re

filepath = 'apps/tgas/web_office/main.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# I will inject the endpoint
endpoint = """
@app.get("/api/workflow/state")
async def get_workflow_state():
    from shared.workflow_manager import workflow_manager
    return {"success": True, "workflows": workflow_manager.workflows}
"""

if "def get_workflow_state(" not in content:
    # find last @app.get or something similar or just append before if __name__ == "__main__":
    if 'if __name__ == "__main__":' in content:
        content = content.replace('if __name__ == "__main__":', endpoint + '\n\nif __name__ == "__main__":')
    else:
        content += "\n" + endpoint

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

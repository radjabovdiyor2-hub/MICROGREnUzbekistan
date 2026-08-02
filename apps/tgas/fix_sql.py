import typing
import re

with open(
    r"c:\Users\TUF GAMING\Desktop\tgas\bots\stepan_bot\handlers\assistant.py",
    "r",
    encoding="utf-8",
) as f:
    content = f.read()


# Replace session.execute("...") with session.execute(text("..."))
def repl(m: re.Match) -> str:
    return m.group(1) + "text(" + m.group(2) + ")" + m.group(3)


# This handles multi-line strings as well
content = re.sub(
    r'(session\.execute\(\s*)(["\'].*?["\'])(\s*\))', repl, content, flags=re.DOTALL
)

with open(
    r"c:\Users\TUF GAMING\Desktop\tgas\bots\stepan_bot\handlers\assistant.py",
    "w",
    encoding="utf-8",
) as f:
    f.write(content)
